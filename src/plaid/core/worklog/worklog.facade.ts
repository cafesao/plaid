import {Injectable} from '@angular/core';
import {EMPTY, Observable, Observer, Subscription} from 'rxjs';
import {DateRange} from '../../model/date-range';
import {User} from '../../model/user';
import {Worklog} from '../../model/worklog';
import {WorklogState} from './worklog.state';
import {WorklogApi} from './worklog.api';
import {AuthFacade} from '../auth/auth.facade';
import {AppStateService} from '../app-state.service';
import {expand, map, mergeAll, mergeMap, scan, tap} from 'rxjs/operators';
import {Calendar} from '../../helpers/calendar';
import {UserPreferencesService} from '../user-preferences.service';
import Timeout = NodeJS.Timeout;
import {Issue} from '../../model/issue';
import {WorklogWithPagination} from '../../model/worklog-with-pagination';
import {SearchResults} from '../../model/search-results';
import {WorklogCache} from './worklog-cache';

/** Maximum number of issues whose work logs are fetched at the same time. */
export const WORKLOG_REQUEST_CONCURRENCY = 4;

/**
 * Business logic facade for work logs.
 */
@Injectable({ providedIn: 'root' })
export class WorklogFacade {
  private fetchWorklogsSubscription: Subscription;
  /**
   * Counts successful add/update/delete calls. A fetch that saw the count change answers with data from before the
   * edit, so its result is not cached (nor shown, if quiet) and the period is fetched again quietly.
   */
  private mutationCount = 0;
  visibleDateRange: DateRange;
  currentUser: User;
  refreshIntervalTimeoutMinutes: number;
  refreshIntervalHandle: Timeout;

  constructor(
    private worklogState: WorklogState,
    private worklogApi: WorklogApi,
    private authFacade: AuthFacade,
    private appStateService: AppStateService,
    private userPreferencesService: UserPreferencesService,
    private worklogCache: WorklogCache
  ) {
    // Fetch work logs after visible date range change
    this.appStateService.getVisibleDateRange$().subscribe(dateRange => {
      const oldVisibleDateRange: DateRange = this.visibleDateRange;
      this.visibleDateRange = Calendar.copyDateRange(dateRange);
      if (this.currentUser) {
        // Fetching worklogs is omitted when the new date range is a sub-interval of the old date range.
        if (oldVisibleDateRange.start.getTime() > dateRange.start.getTime() ||
          oldVisibleDateRange.end.getTime() < dateRange.end.getTime()) {
          const cached: Worklog[] = this.worklogCache.get(this.visibleDateRange);
          if (cached) {
            // Show the period seen before at once, then check it against Jira in the background.
            this.worklogState.setWorklogs(cached);
            this.worklogState.setFetching(false);
            this.fetchWorklogsQuiet();
          } else {
            this.fetchWorklogsVerbose();
          }
        }
      } else {
        // When application launches, authentication data may be present, but the application is in a state of lack of
        // authentication, hence the attempt to reconnect. This is the initial kick to load remote data.
        this.authFacade.reconnect();
      }
    });

    // Fetch work logs after user change
    this.authFacade.getAuthenticatedUser$().subscribe(user => {
      this.currentUser = user;
      // Login, logout and reconnection may mean another account or another Jira: never show its cached work logs.
      this.worklogCache.clear();
      if (user) {
        this.fetchWorklogsVerbose();
      } else {
        this.worklogState.setWorklogs([]);
      }
    });

    this.userPreferencesService.getRefreshIntervalMinutes$().subscribe(interval => {
      this.refreshIntervalTimeoutMinutes = interval;
      this.reschedulePeriodicRefreshing();
    });
  }

  /**
   * Emits work log issues page by page.
   */
  private streamAllIssuesForWorklogDateRange$(dateRange: DateRange): Observable<Issue[]> {
    return this.worklogApi.getIssuesForWorklogDateRange$(dateRange).pipe(
      expand(
        (results: SearchResults) => results.isLast !== true && results.nextPageToken
          ? this.worklogApi.getIssuesForWorklogDateRange$(dateRange, results.nextPageToken)
          : EMPTY
      ),
      map((results: SearchResults) => results.issues || [])
    );
  }

  /**
   * Emits work logs of an issue started within the date range, page by page.
   */
  private streamAllWorklogsForIssue$(issue: Issue, dateRange: DateRange): Observable<Worklog[]> {
    return this.worklogApi.getWorklogsForIssue$(issue.id, dateRange).pipe(
      expand(
        // An empty page ends paging too: total may count worklogs the period filter left out.
        (results: WorklogWithPagination) => results.worklogs.length > 0
          && (results.startAt + results.worklogs.length) < results.total
          ? this.worklogApi.getWorklogsForIssue$(issue.id, dateRange, results.startAt + results.worklogs.length)
          : EMPTY
      ),
      map((results: WorklogWithPagination) => results.worklogs.map(wl => ({...wl, issue})))
    );
  }

  /**
   * Emits all fetched work logs every time any additional data is retrieved and finishes once the emitted list is
   * complete.
   */
  private getWorklogsForDateRangeVerbose$(dateRange: DateRange, user: User): Observable<Worklog[]> {
    const rangeEnd: number = Calendar.dayAfter(dateRange.end).getTime();
    return this.streamAllIssuesForWorklogDateRange$(dateRange).pipe(
      mergeAll(),
      mergeMap((issue: Issue) => this.streamAllWorklogsForIssue$(issue, dateRange), WORKLOG_REQUEST_CONCURRENCY),
      // The API already filters by date; this is a safety net, plus the author filter the API does not offer.
      map((worklogs: Worklog[]) => worklogs.filter(worklog =>
        decodeURIComponent(worklog.author.self) === decodeURIComponent(user.self)
        && new Date(worklog.started).valueOf() >= dateRange.start.valueOf()
        && new Date(worklog.started).valueOf() < rangeEnd
      )),
      scan((acc: Worklog[], val: Worklog[]) => acc.concat(val), [] as Worklog[])
    );
  }

  /**
   * Refreshes work logs by emitting the updated list on every stage of the refreshing process and emits 'fetching'.
   * Once complete, the result is cached; a fetch cut short (e.g. by a period change) caches nothing.
   */
  fetchWorklogsVerbose(): void {
    this.worklogState.setFetching(true);
    const dateRange: DateRange = Calendar.copyDateRange(this.visibleDateRange);
    const mutationCountAtStart: number = this.mutationCount;
    let worklogs: Worklog[] = [];

    this.replaceFetch(this.getWorklogsForDateRangeVerbose$(dateRange, this.currentUser), {
      next: (fetched: Worklog[]) => {
        worklogs = fetched;
        this.worklogState.setWorklogs(fetched);
      },
      complete: () => {
        this.worklogState.setWorklogs(worklogs);
        this.worklogState.setFetching(false);
        if (this.mutationCount === mutationCountAtStart) {
          this.worklogCache.set(dateRange, worklogs);
        } else {
          this.fetchWorklogsQuiet();
        }
      }
    });

    this.reschedulePeriodicRefreshing();
  }

  /**
   * Refreshes work logs by emitting the updated list only once and doesn't emit 'fetching' afterwards. If a work log was
   * added, updated or deleted meanwhile, the result is dropped (it would undo the user's edit) and the fetch runs again.
   */
  fetchWorklogsQuiet(): void {
    const dateRange: DateRange = Calendar.copyDateRange(this.visibleDateRange);
    const mutationCountAtStart: number = this.mutationCount;
    let worklogs: Worklog[] = [];

    this.replaceFetch(this.getWorklogsForDateRangeVerbose$(dateRange, this.currentUser), {
      next: (fetched: Worklog[]) => worklogs = fetched,
      complete: () => {
        this.worklogState.setFetching(false);
        if (this.mutationCount === mutationCountAtStart) {
          this.worklogState.setWorklogs(worklogs);
          this.worklogCache.set(dateRange, worklogs);
        } else {
          this.fetchWorklogsQuiet();
        }
      }
    });
  }

  /**
   * Cancels the running fetch and starts the given one. The new subscription is stored before subscribing, so a fetch
   * started from inside the observer (e.g. on complete) is not overwritten when subscribe() returns.
   */
  private replaceFetch(worklogs$: Observable<Worklog[]>, observer: Partial<Observer<Worklog[]>>): void {
    if (this.fetchWorklogsSubscription) {
      this.fetchWorklogsSubscription.unsubscribe();
    }
    const subscription = new Subscription();
    this.fetchWorklogsSubscription = subscription;
    subscription.add(worklogs$.subscribe(observer));
  }

  getWorklogsFetching$(): Observable<boolean> {
    return this.worklogState.getFetching$();
  }

  getWorklogs$(): Observable<Worklog[]> {
    return this.worklogState.getWorklogs$();
  }

  /**
   * Upon subscription adds work log entry, emits response from the server after it successfully performs insertion
   */
  addWorklog$(worklog: Worklog, started: Date, timeSpentSeconds: number, comment: string): Observable<Worklog> {
    return this.worklogApi.addWorklog$(worklog.issueId, started, timeSpentSeconds, comment).pipe(
      tap((added: Worklog) => this.applyAddedOrUpdated({...worklog, ...added}))
    );
  }

  /**
   * Upon subscription updates work log entry, emits response from the server after it acknowledged the update
   */
  updateWorklog$(worklog: Worklog, started: Date, timeSpentSeconds: number, comment: string): Observable<Worklog> {
    return this.worklogApi.updateWorklog$(worklog.issueId, worklog.id, started, timeSpentSeconds, comment).pipe(
      tap((updated: Worklog) => this.applyAddedOrUpdated({...worklog, ...updated}))
    );
  }

  private applyAddedOrUpdated(worklog: Worklog): void {
    this.mutationCount++;
    this.worklogState.addOrUpdateWorklog(worklog);
    this.worklogCache.upsert(worklog);
  }

  reschedulePeriodicRefreshing(): void {
    if (this.refreshIntervalHandle != null) {
      clearInterval(this.refreshIntervalHandle);
      this.refreshIntervalHandle = null;
    }

    if (this.refreshIntervalTimeoutMinutes > 0) {
      this.refreshIntervalHandle =
        setInterval(() => this.fetchWorklogsQuiet(), this.refreshIntervalTimeoutMinutes * 60000);
    }
  }

  deleteWorklog(worklog: Worklog): void {
    this.worklogApi.deleteWorklog$(worklog.issueId, worklog.id).subscribe(() => {
      this.mutationCount++;
      this.worklogState.deleteWorklog(worklog.id);
      this.worklogCache.remove(worklog.id);
    });
  }
}
