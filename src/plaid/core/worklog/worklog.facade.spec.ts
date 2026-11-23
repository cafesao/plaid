import {BehaviorSubject, Observable, of, Subject} from 'rxjs';
import {WORKLOG_REQUEST_CONCURRENCY, WorklogFacade} from './worklog.facade';
import {WorklogState} from './worklog.state';
import {WorklogApi} from './worklog.api';
import {AuthFacade} from '../auth/auth.facade';
import {AppStateService} from '../app-state.service';
import {UserPreferencesService} from '../user-preferences.service';
import {DateRange} from '../../model/date-range';
import {User} from '../../model/user';
import {Issue} from '../../model/issue';
import {Worklog} from '../../model/worklog';
import {SearchResults} from '../../model/search-results';
import {WorklogWithPagination} from '../../model/worklog-with-pagination';
import {WorklogCache} from './worklog-cache';

const USER: User = {self: 'https://jira.test/rest/api/2/user?accountId=u1'};
const OTHER_USER: User = {self: 'https://jira.test/rest/api/2/user?accountId=u2'};
const WEEK_A: DateRange = {start: new Date(2026, 10, 23), end: new Date(2026, 10, 29)};
const WEEK_B: DateRange = {start: new Date(2026, 10, 30), end: new Date(2026, 11, 6)};

type ApiMock = { [K in keyof WorklogApi]: jest.Mock };

function createFacade(initialRange: DateRange = WEEK_A) {
  const api = {
    getIssuesForWorklogDateRange$: jest.fn(),
    getWorklogsForIssue$: jest.fn(),
    addWorklog$: jest.fn(),
    updateWorklog$: jest.fn(),
    deleteWorklog$: jest.fn()
  } as unknown as ApiMock;
  const state = new WorklogState();
  const user$ = new BehaviorSubject<User>(null);
  const range$ = new BehaviorSubject<DateRange>(initialRange);
  const authFacade = {getAuthenticatedUser$: () => user$.asObservable(), reconnect: jest.fn()};
  const appStateService = {getVisibleDateRange$: () => range$.asObservable()};
  const userPreferencesService = {getRefreshIntervalMinutes$: () => of(0)};
  const facade = new WorklogFacade(
    state,
    api as unknown as WorklogApi,
    authFacade as unknown as AuthFacade,
    appStateService as unknown as AppStateService,
    userPreferencesService as unknown as UserPreferencesService,
    new WorklogCache()
  );
  return {facade, api, state, user$, range$};
}

function issue(n: number): Issue {
  return {id: String(n), key: 'T-' + n};
}

function issues(from: number, count: number): Issue[] {
  return Array.from({length: count}, (_, i) => issue(from + i));
}

function worklog(id: string, started: Date, author: User = USER): Worklog {
  return {id, issueId: id, author, started: started.toISOString(), timeSpentSeconds: 900};
}

function searchPage(pageIssues: Issue[], nextPageToken?: string, isLast?: boolean): Observable<SearchResults> {
  return of({issues: pageIssues, nextPageToken, isLast});
}

function worklogPage(worklogs: Worklog[], startAt = 0, total = worklogs.length): Observable<WorklogWithPagination> {
  return of({startAt, maxResults: worklogs.length, total, worklogs});
}

/** Every issue gets a single worklog of the user on the first day of week A. */
function oneWorklogPerIssue(issueId: string): Observable<WorklogWithPagination> {
  return worklogPage([worklog(issueId, new Date(2026, 10, 23, 10, 0))]);
}

function currentWorklogs(state: WorklogState): Worklog[] {
  let value: Worklog[] = [];
  state.getWorklogs$().subscribe(worklogs => value = worklogs).unsubscribe();
  return value;
}

function currentFetching(state: WorklogState): boolean {
  let value = false;
  state.getFetching$().subscribe(fetching => value = fetching).unsubscribe();
  return value;
}

function ids(state: WorklogState): string[] {
  return currentWorklogs(state).map(wl => wl.id).sort();
}

/** Serves each range's worklogs (one issue per worklog, issue id = worklog issueId) from a map keyed by range start. */
function serveRanges(api: ApiMock, data: Map<number, Worklog[]>): void {
  const forRange = (range: DateRange) => data.get(range.start.getTime()) || [];
  api.getIssuesForWorklogDateRange$.mockImplementation((range: DateRange) =>
    searchPage(forRange(range).map(wl => issue(Number(wl.issueId))), undefined, true));
  api.getWorklogsForIssue$.mockImplementation((id: string, range: DateRange) =>
    worklogPage(forRange(range).filter(wl => wl.issueId === id)));
}

/** Makes every new search wait until the returned subject emits; worklog requests keep being served. */
function holdSearches(api: ApiMock): Subject<SearchResults> {
  const search = new Subject<SearchResults>();
  api.getIssuesForWorklogDateRange$.mockImplementation(() => search);
  return search;
}

function releaseSearch(search: Subject<SearchResults>, worklogs: Worklog[]): void {
  search.next({issues: worklogs.map(wl => issue(Number(wl.issueId))), isLast: true});
  search.complete();
}

describe('WorklogFacade', () => {
  describe('loading a period', () => {
    it('reads every search page until isLast', () => {
      const {api, state, user$} = createFacade();
      api.getIssuesForWorklogDateRange$.mockImplementation((range: DateRange, token?: string) =>
        token === 'p2' ? searchPage(issues(101, 5), undefined, true) : searchPage(issues(1, 100), 'p2', false));
      api.getWorklogsForIssue$.mockImplementation(oneWorklogPerIssue);

      user$.next(USER);

      const calls = api.getIssuesForWorklogDateRange$.mock.calls;
      expect(calls.map(call => call[1])).toEqual([undefined, 'p2']);
      calls.forEach(call => expect(call[0]).toEqual(WEEK_A));
      expect(currentWorklogs(state)).toHaveLength(105);
    });

    it('stops paging when nextPageToken is missing', () => {
      const {api, state, user$} = createFacade();
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage(issues(1, 3)));
      api.getWorklogsForIssue$.mockImplementation(oneWorklogPerIssue);

      user$.next(USER);

      expect(api.getIssuesForWorklogDateRange$).toHaveBeenCalledTimes(1);
      expect(currentWorklogs(state)).toHaveLength(3);
    });

    it('keeps at most 4 worklog requests open', () => {
      const {api, user$} = createFacade();
      const pending: Subject<WorklogWithPagination>[] = [];
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage(issues(1, 10), undefined, true));
      api.getWorklogsForIssue$.mockImplementation(() => {
        const subject = new Subject<WorklogWithPagination>();
        pending.push(subject);
        return subject;
      });

      user$.next(USER);
      expect(WORKLOG_REQUEST_CONCURRENCY).toBe(4);
      expect(api.getWorklogsForIssue$).toHaveBeenCalledTimes(4);

      pending[0].next({startAt: 0, total: 0, worklogs: []});
      pending[0].complete();
      expect(api.getWorklogsForIssue$).toHaveBeenCalledTimes(5);
    });

    it('includes a worklog at 23:30 on the last visible day and excludes one at 00:00 the next day', () => {
      const {api, state, user$} = createFacade();
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage([issue(1)], undefined, true));
      api.getWorklogsForIssue$.mockReturnValue(worklogPage([
        worklog('late', new Date(2026, 10, 29, 23, 30)),
        worklog('next-day', new Date(2026, 10, 30, 0, 0))
      ]));

      user$.next(USER);

      expect(currentWorklogs(state).map(wl => wl.id)).toEqual(['late']);
    });

    it('ignores worklogs from other authors on the same issue', () => {
      const {api, state, user$} = createFacade();
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage([issue(1)], undefined, true));
      api.getWorklogsForIssue$.mockReturnValue(worklogPage([
        worklog('mine', new Date(2026, 10, 24, 9, 0)),
        worklog('theirs', new Date(2026, 10, 24, 10, 0), OTHER_USER)
      ]));

      user$.next(USER);

      expect(currentWorklogs(state).map(wl => wl.id)).toEqual(['mine']);
    });

    it('requests later worklog pages of an issue with the same period', () => {
      const {api, state, user$} = createFacade();
      const firstPage = Array.from({length: 50}, (_, i) => worklog('a' + i, new Date(2026, 10, 24, 8, i)));
      const secondPage = Array.from({length: 10}, (_, i) => worklog('b' + i, new Date(2026, 10, 25, 8, i)));
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage([issue(7)], undefined, true));
      api.getWorklogsForIssue$.mockImplementation((id: string, range: DateRange, startAt = 0) =>
        startAt === 50 ? worklogPage(secondPage, 50, 60) : worklogPage(firstPage, 0, 60));

      user$.next(USER);

      const calls = api.getWorklogsForIssue$.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toBe('7');
      expect(calls[1][1]).toEqual(WEEK_A);
      expect(calls[1][2]).toBe(50);
      expect(currentWorklogs(state)).toHaveLength(60);
    });
    it('stops paging an issue when Jira returns an empty worklog page', () => {
      const {api, user$} = createFacade();
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage([issue(7)], undefined, true));
      // total still counts worklogs the period filter left out; a second request would ask for the same page again
      api.getWorklogsForIssue$.mockReturnValueOnce(worklogPage([], 0, 60)).mockReturnValue(worklogPage([], 0, 0));

      user$.next(USER);

      expect(api.getWorklogsForIssue$).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache of visited periods', () => {
    const A1 = worklog('1', new Date(2026, 10, 24, 9, 0));
    const A2 = worklog('2', new Date(2026, 10, 25, 9, 0));
    const B1 = worklog('3', new Date(2026, 11, 1, 9, 0));

    /** Logs in on week A, then visits week B; both load from Jira and end up cached. */
    function visitAThenB() {
      const setup = createFacade(WEEK_A);
      const data = new Map<number, Worklog[]>([[WEEK_A.start.getTime(), [A1, A2]], [WEEK_B.start.getTime(), [B1]]]);
      serveRanges(setup.api, data);
      setup.user$.next(USER);
      setup.range$.next(WEEK_B);
      return {...setup, data};
    }

    it('shows a cached range at once, without the fetching flag, when returning to it', () => {
      const {api, state, range$} = visitAThenB();
      holdSearches(api);
      api.getIssuesForWorklogDateRange$.mockClear();

      range$.next(WEEK_A);

      expect(ids(state)).toEqual(['1', '2']);
      expect(currentFetching(state)).toBe(false);
      expect(api.getIssuesForWorklogDateRange$).toHaveBeenCalledTimes(1);
      expect(api.getIssuesForWorklogDateRange$.mock.calls[0][0]).toEqual(WEEK_A);
    });

    it('replaces cached data when the background refresh completes', () => {
      const {api, state, range$, data} = visitAThenB();
      const search = holdSearches(api);
      range$.next(WEEK_A);

      const A3 = worklog('4', new Date(2026, 10, 26, 9, 0));
      api.getWorklogsForIssue$.mockImplementation((id: string) => worklogPage([A1, A3].filter(wl => wl.issueId === id)));
      releaseSearch(search, [A1, A3]);
      expect(ids(state)).toEqual(['1', '4']);
      expect(currentFetching(state)).toBe(false);

      serveRanges(api, data);
      range$.next(WEEK_B);
      expect(ids(state)).toEqual(['3']);
      holdSearches(api);
      range$.next(WEEK_A);
      expect(ids(state)).toEqual(['1', '4']);
    });

    it('empties a revisited range whose worklogs were all removed in Jira', () => {
      const {api, state, range$} = visitAThenB();
      const search = holdSearches(api);
      range$.next(WEEK_A);

      releaseSearch(search, []);

      expect(currentWorklogs(state)).toEqual([]);
    });

    it('keeps an edit made while a background refresh was running', () => {
      const {api, facade, state, range$, data} = visitAThenB();
      const search = holdSearches(api);
      range$.next(WEEK_A);

      const added = worklog('9', new Date(2026, 10, 27, 14, 0));
      api.addWorklog$.mockReturnValue(of(added));
      facade.addWorklog$({issueId: '9'}, new Date(2026, 10, 27, 14, 0), 900, '').subscribe();
      data.set(WEEK_A.start.getTime(), [A1, A2, added]); // Jira has the new worklog from now on
      serveRanges(api, data);
      releaseSearch(search, [A1, A2]); // the refresh started before the save answers without it

      expect(ids(state)).toEqual(['1', '2', '9']);
    });

    it('checks the period again when an edit was saved during the background refresh', () => {
      const {api, facade, state, range$, data} = visitAThenB();
      const search = holdSearches(api);
      range$.next(WEEK_A);

      const added = worklog('9', new Date(2026, 10, 27, 14, 0));
      api.addWorklog$.mockReturnValue(of(added));
      facade.addWorklog$({issueId: '9'}, new Date(2026, 10, 27, 14, 0), 900, '').subscribe();
      data.set(WEEK_A.start.getTime(), [A1, added]); // meanwhile A2 was deleted in Jira by someone else
      serveRanges(api, data);
      releaseSearch(search, [A1, A2]);

      expect(ids(state)).toEqual(['1', '9']);
    });

    it('does not cache a first load during which an edit was saved, and checks it again', () => {
      const {api, facade, state, user$, range$} = createFacade(WEEK_A);
      const search = holdSearches(api);
      user$.next(USER);

      const added = worklog('9', new Date(2026, 10, 27, 14, 0));
      api.addWorklog$.mockReturnValue(of(added));
      facade.addWorklog$({issueId: '9'}, new Date(2026, 10, 27, 14, 0), 900, '').subscribe();
      const data = new Map<number, Worklog[]>([[WEEK_A.start.getTime(), [A1, added]], [WEEK_B.start.getTime(), [B1]]]);
      serveRanges(api, data);
      releaseSearch(search, [A1]); // the first load started before the save answers without it
      expect(ids(state)).toEqual(['1', '9']);

      range$.next(WEEK_B);
      holdSearches(api);
      range$.next(WEEK_A);
      expect(ids(state)).toEqual(['1', '9']);
    });

    it('updates the cache on add, update and delete', () => {
      const {api, facade, state, range$} = visitAThenB();
      range$.next(WEEK_A);

      const added = worklog('9', new Date(2026, 10, 27, 14, 0));
      api.addWorklog$.mockReturnValue(of(added));
      api.updateWorklog$.mockReturnValue(of({...A1, timeSpentSeconds: 3600}));
      api.deleteWorklog$.mockReturnValue(of(undefined));
      facade.addWorklog$({issueId: '9'}, new Date(2026, 10, 27, 14, 0), 900, '').subscribe();
      facade.updateWorklog$(A1, new Date(2026, 10, 24, 9, 0), 3600, '').subscribe();
      facade.deleteWorklog(A2);

      range$.next(WEEK_B);
      expect(ids(state)).toEqual(['3']);
      holdSearches(api);
      range$.next(WEEK_A);

      expect(ids(state)).toEqual(['1', '9']);
      expect(currentWorklogs(state).find(wl => wl.id === '1').timeSpentSeconds).toBe(3600);
    });

    it('clears the cache when the user logs out', () => {
      const {api, state, user$, range$} = visitAThenB();
      user$.next(null);
      user$.next(USER);
      holdSearches(api);

      range$.next(WEEK_A);

      expect(currentFetching(state)).toBe(true);
    });

    it('does not cache a range whose first load was interrupted', () => {
      const {api, state, user$, range$} = createFacade(WEEK_A);
      // Week A: issue 1 answers, issue 2 never does, so A is only partially loaded when the user moves on.
      api.getIssuesForWorklogDateRange$.mockReturnValue(searchPage([issue(1), issue(2)], undefined, true));
      api.getWorklogsForIssue$.mockImplementation((id: string) =>
        id === '1' ? worklogPage([A1]) : new Subject<WorklogWithPagination>());
      user$.next(USER);
      expect(ids(state)).toEqual(['1']);

      serveRanges(api, new Map<number, Worklog[]>([[WEEK_B.start.getTime(), [B1]]]));
      range$.next(WEEK_B);
      expect(ids(state)).toEqual(['3']);

      holdSearches(api);
      range$.next(WEEK_A);
      expect(currentFetching(state)).toBe(true);
    });

    it('keeps the spinner on manual refresh even when the range is cached', () => {
      const {api, facade, state, range$} = visitAThenB();
      range$.next(WEEK_A);
      holdSearches(api);

      facade.fetchWorklogsVerbose();

      expect(currentFetching(state)).toBe(true);
    });
  });
});
