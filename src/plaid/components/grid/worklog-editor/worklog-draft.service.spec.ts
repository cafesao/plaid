import {BehaviorSubject} from 'rxjs';
import type {AuthFacade} from '../../../core/auth/auth.facade';
import type {AuthInfo} from '../../../model/auth-info';
import type {Issue} from '../../../model/issue';
import type {User} from '../../../model/user';
import {WorklogDraftService} from './worklog-draft.service';

const ACCOUNT_A: User = {self: 'https://jira.test/rest/api/2/user?accountId=a'};
const ACCOUNT_B: User = {self: 'https://jira.test/rest/api/2/user?accountId=b'};
const ISSUE: Issue = {id: '10002', key: 'E2E-2', fields: {summary: 'Fake issue 2'}};

describe('WorklogDraftService', () => {
  let authInfo$: BehaviorSubject<AuthInfo>;
  let user$: BehaviorSubject<User>;
  let service: WorklogDraftService;

  beforeEach(() => {
    authInfo$ = new BehaviorSubject<AuthInfo>({jiraUrl: 'https://jira.test', username: 'a', password: 'a'});
    user$ = new BehaviorSubject<User>(ACCOUNT_A);
    const authFacade = {getAuthInfo$: () => authInfo$.asObservable(), getAuthenticatedUser$: () => user$.asObservable()};
    service = new WorklogDraftService(authFacade as unknown as AuthFacade);
  });

  it('returns nothing before anything is kept', () => {
    expect(service.get()).toBeNull();
  });

  it('returns the kept issue and comment', () => {
    service.keep({issue: ISSUE, comment: 'Draft'});
    expect(service.get()).toEqual({issue: ISSUE, comment: 'Draft'});
  });

  it('keeps a comment without an issue', () => {
    service.keep({issue: null, comment: 'Draft'});
    expect(service.get()).toEqual({issue: null, comment: 'Draft'});
  });

  it('treats no issue and a blank comment as no draft', () => {
    service.keep({issue: ISSUE, comment: 'Draft'});
    service.keep({issue: null, comment: '  '});
    expect(service.get()).toBeNull();
  });

  it('clear() removes the draft', () => {
    service.keep({issue: ISSUE, comment: 'Draft'});
    service.clear();
    expect(service.get()).toBeNull();
  });

  it('drops the draft on logout even if the editor keeps it while closing', () => {
    user$.next(null); // logout() clears the user first: the editor closes and keeps its draft
    service.keep({issue: ISSUE, comment: 'Draft'});
    authInfo$.next(null); // then the credentials go away
    expect(service.get()).toBeNull();
  });

  it('drops the draft when another account logs in', () => {
    service.keep({issue: ISSUE, comment: 'Draft'});
    user$.next(ACCOUNT_B);
    expect(service.get()).toBeNull();
  });

  it('keeps the draft when the same account logs in again after an authentication error', () => {
    service.keep({issue: ISSUE, comment: 'Draft'});
    user$.next(null);
    user$.next({...ACCOUNT_A});
    expect(service.get()).toEqual({issue: ISSUE, comment: 'Draft'});
  });
});
