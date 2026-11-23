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

const USER: User = {self: 'https://jira.test/rest/api/2/user?accountId=u1'};
const OTHER_USER: User = {self: 'https://jira.test/rest/api/2/user?accountId=u2'};
const WEEK_A: DateRange = {start: new Date(2026, 10, 23), end: new Date(2026, 10, 29)};

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
    userPreferencesService as unknown as UserPreferencesService
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
  });
});
