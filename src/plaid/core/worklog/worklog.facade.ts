import {Injectable} from '@angular/core';
import {EMPTY, Observable, Subscription} from 'rxjs';
import {DateRange} from '../../model/date-range';
import {User} from '../../model/user';
import {Worklog} from '../../model/worklog';
import {WorklogState} from './worklog.state';
import {WorklogApi} from './worklog.api';
import {AuthFacade} from '../auth/auth.facade';
import {AppStateService} from '../app-state.service';
import {expand, map, mergeAll, mergeMap, scan, takeLast, tap} from 'rxjs/operators';
import {Calendar} from '../../helpers/calendar';
import {UserPreferencesService} from '../user-preferences.service';
import Timeout = NodeJS.Timeout;
import {Issue} from '../../model/issue';
import {WorklogWithPagination} from '../../model/worklog-with-pagination';
import {SearchResults} from '../../model/search-results';

/** Maximum number of issues whose work logs are fetched at the same time. */
export const WORKLOG_REQUEST_CONCURRENCY = 4;

/**
 * Business logic facade for work logs.
 */
@Injectable({ providedIn: 'root' })
export class WorklogFacade {
  private fetchWorklogsSubscription: Subscription;
  visibleDateRange: DateRange;
  currentUser: User;
  refreshIntervalTimeoutMinutes: number;
  refreshIntervalHandle: Timeout;

  constructor(
    private worklogState: WorklogState,
    private worklogApi: WorklogApi,
    private authFacade: AuthFacade,
    private appStateService: AppStateService,
    private userPreferencesService: UserPreferencesService
  ) {
    // Fetch work logs after visible date range change
    this.appStateService.getVisibleDateRange$().subscribe(dateRange => {
      const oldVisibleDateRange: DateRange = this.visibleDateRange;
      this.visibleDateRange = Calendar.copyDateRange(dateRange);
      if (this.currentUser) {
        // Fetching worklogs is omitted when the new date range is a sub-interval of the old date range.
        if (oldVisibleDateRange.start.getTime() > dateRange.start.getTime() ||
          oldVisibleDateRange.end.getTime() < dateRange.end.getTime()) {
          this.fetchWorklogsVerbose();
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
        (results: WorklogWithPagination) => (results.startAt + results.worklogs.length) < results.total
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
   * Emits the complete list of work logs.
   */
  private getWorklogsForDateRangeQuiet$(dateRange: DateRange, user: User): Observable<Worklog[]> {
    return this.getWorklogsForDateRangeVerbose$(dateRange, user).pipe(takeLast<Worklog[]>(1));
  }

  /**
   * Refreshes work logs by emitting the updated list on every stage of the refreshing process and emits 'fetching'.
   */
  fetchWorklogsVerbose(): void {
    this.worklogState.setFetching(true);

    if (this.fetchWorklogsSubscription) {
      this.fetchWorklogsSubscription.unsubscribe();
    }

    this.fetchWorklogsSubscription = this.getWorklogsForDateRangeVerbose$(this.visibleDateRange, this.currentUser)
      .subscribe({
        next: (worklogs: Worklog[]) => this.worklogState.setWorklogs(worklogs),
        complete: () => this.worklogState.setFetching(false)
      });

    this.reschedulePeriodicRefreshing();
  }

  /**
   * Refreshes work logs by emitting the updated list only once and doesn't emit 'fetching' afterwards.
   */
  fetchWorklogsQuiet(): void {
    if (this.fetchWorklogsSubscription) {
      this.fetchWorklogsSubscription.unsubscribe();
    }

    this.fetchWorklogsSubscription = this.getWorklogsForDateRangeQuiet$(this.visibleDateRange, this.currentUser)
      .subscribe((worklogs: Worklog[]) => {
        this.worklogState.setWorklogs(worklogs);
        this.worklogState.setFetching(false);
      });
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
      tap((added: Worklog) => this.worklogState.addOrUpdateWorklog({...worklog, ...added}))
    );
  }

  /**
   * Upon subscription updates work log entry, emits response from the server after it acknowledged the update
   */
  updateWorklog$(worklog: Worklog, started: Date, timeSpentSeconds: number, comment: string): Observable<Worklog> {
    return this.worklogApi.updateWorklog$(worklog.issueId, worklog.id, started, timeSpentSeconds, comment).pipe(
      tap((updated: Worklog) => this.worklogState.addOrUpdateWorklog({...worklog, ...updated}))
    );
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
      this.worklogState.deleteWorklog(worklog.id);
    });
  }
}
