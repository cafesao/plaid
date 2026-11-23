import type {Mock} from 'vitest';
import {BehaviorSubject, type Observable, of, Subject, throwError} from 'rxjs';
import type {ChangeDetectorRef} from '@angular/core';
import {HttpErrorResponse} from '@angular/common/http';
import type {AuthFacade} from '../../../core/auth/auth.facade';
import type {AppStateService} from '../../../core/app-state.service';
import type {WorklogFacade} from '../../../core/worklog/worklog.facade';
import type {AuthInfo} from '../../../model/auth-info';
import type {Issue} from '../../../model/issue';
import type {User} from '../../../model/user';
import type {Worklog} from '../../../model/worklog';
import {WorklogDraftService} from './worklog-draft.service';
import {WorklogEditorComponent} from './worklog-editor.component';

const issue = (n: number): Issue => ({id: String(10000 + n), key: `E2E-${n}`, fields: {summary: `Fake issue ${n}`}});
const ISSUE_1 = issue(1); // automatic suggestion
const ISSUE_2 = issue(2); // picked by hand
const ISSUE_3 = issue(3); // of an existing worklog

type WorklogFacadeMock = {
  addWorklog$: Mock<(...args: unknown[]) => Observable<Worklog>>;
  updateWorklog$: Mock<(...args: unknown[]) => Observable<Worklog>>;
};

/**
 * Builds the editor class directly (no TestBed): the date range lies outside the edited day, so the panel is never
 * measured.
 */
function createEditor(): {editor: WorklogEditorComponent; worklogDraft: WorklogDraftService; worklogFacade: WorklogFacadeMock} {
  const authFacade = {
    getAuthInfo$: () => new BehaviorSubject<AuthInfo>({jiraUrl: 'https://jira.test', username: 'a', password: 'a'}),
    getAuthenticatedUser$: () => new BehaviorSubject<User>({self: 'https://jira.test/rest/api/2/user?accountId=a'})
  };
  const worklogDraft = new WorklogDraftService(authFacade as unknown as AuthFacade);
  const worklogFacade: WorklogFacadeMock = {addWorklog$: vi.fn(() => of({id: '30001'})), updateWorklog$: vi.fn(() => of({}))};
  const editor = new WorklogEditorComponent(
    {detectChanges: vi.fn()} as unknown as ChangeDetectorRef,
    authFacade as unknown as AuthFacade,
    worklogFacade as unknown as WorklogFacade,
    {} as AppStateService,
    worklogDraft
  );
  editor.dateRange = {start: new Date(2020, 0, 6), end: new Date(2020, 0, 12)};
  editor.visibleDaysStart = 0;
  editor.visibleDaysEnd = 6;
  return {editor, worklogDraft, worklogFacade};
}

/** Opens the editor for adding, the way the top bar "+" and the grid gaps do. */
function openAddIn(editor: WorklogEditorComponent, hour = 9): void {
  editor.worklog = {started: new Date(2026, 10, 24, hour).getTime(), timeSpentSeconds: 3600};
}

describe('WorklogEditorComponent draft', () => {
  let editor: WorklogEditorComponent;
  let worklogDraft: WorklogDraftService;
  let worklogFacade: WorklogFacadeMock;
  const openAdd = (hour = 9) => openAddIn(editor, hour);

  beforeEach(() => {
    ({editor, worklogDraft, worklogFacade} = createEditor());
  });

  afterEach(() => {
    editor.worklog = null; // removes the keydown listener
  });

  it('keeps the hand-picked issue and the comment when closed without saving', () => {
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.commentString = 'Draft';
    editor.close();

    openAdd(14);
    expect(editor.worklog.issue).toBe(ISSUE_2);
    expect(editor.worklog.issueId).toBe('10002');
    expect(editor.issueString).toBe('E2E-2 - Fake issue 2');
    expect(editor.commentString).toBe('Draft');
  });

  it('does not keep an issue that only came from the suggestion', () => {
    openAdd();
    editor.applySuggestedIssue(ISSUE_1);
    editor.commentString = 'Draft';
    editor.close();
    expect(worklogDraft.get()).toEqual({issue: null, comment: 'Draft'});
  });

  it('a suggestion does not replace an issue picked by hand', () => {
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.applySuggestedIssue(ISSUE_1);
    expect(editor.worklog.issue).toBe(ISSUE_2);
    expect(editor.issueString).toBe('E2E-2 - Fake issue 2');
  });

  it('a suggestion does not replace the draft issue when reopening', () => {
    worklogDraft.keep({issue: ISSUE_2, comment: 'Draft'});
    openAdd();
    editor.applySuggestedIssue(ISSUE_1);
    expect(editor.worklog.issue).toBe(ISSUE_2);
  });

  it('Cancel discards the draft', () => {
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.commentString = 'Draft';
    editor.cancel();
    expect(worklogDraft.get()).toBeNull();

    openAdd();
    expect(editor.worklog.issueId).toBeUndefined();
    expect(editor.commentString).toBeUndefined();
  });

  it('keeps the draft when the day leaves the visible days', () => {
    openAdd(); // Tuesday 24 November 2026
    editor.selectIssue(ISSUE_2);
    editor.commentString = 'Draft';
    editor.visibleDaysStart = 3; // from Wednesday on
    expect(editor.worklog).toBeNull();
    expect(worklogDraft.get()).toEqual({issue: ISSUE_2, comment: 'Draft'});
  });

  it('drops the draft only once the entry is added', () => {
    const response = new Subject<Worklog>();
    worklogFacade.addWorklog$.mockReturnValue(response);
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.commentString = 'Draft';
    editor.close();
    openAdd(); // the draft comes back
    editor.save();
    expect(worklogDraft.get()).not.toBeNull();

    response.next({id: '30001'});
    response.complete();
    expect(worklogDraft.get()).toBeNull();
    expect(editor.worklog).toBeNull();
  });

  it('editing an existing entry neither uses nor erases the draft', () => {
    worklogDraft.keep({issue: ISSUE_2, comment: 'Draft'});
    editor.worklog = {
      id: '5',
      issueId: '10003',
      issue: ISSUE_3,
      comment: 'Old',
      started: new Date(2026, 10, 24, 9).getTime(),
      timeSpentSeconds: 3600
    };
    expect(editor.worklog.issue).toBe(ISSUE_3);
    expect(editor.commentString).toBe('Old');

    editor.applySuggestedIssue(ISSUE_1);
    expect(editor.worklog.issue).toBe(ISSUE_3);

    editor.cancel();
    expect(worklogDraft.get()).toEqual({issue: ISSUE_2, comment: 'Draft'});
  });
});

describe('WorklogEditorComponent saving', () => {
  let editor: WorklogEditorComponent;
  let worklogFacade: WorklogFacadeMock;
  const openAdd = () => openAddIn(editor);
  const key = (k: string) => editor.onKeydown(new KeyboardEvent('keydown', {key: k}));
  const rejected = () => throwError(() => new HttpErrorResponse({status: 500}));

  beforeEach(() => {
    ({editor, worklogFacade} = createEditor());
    // Enter compares the focused element with these two
    editor.cancelButton = {nativeElement: document.createElement('button')};
    editor.commentTextArea = {nativeElement: document.createElement('textarea')};
  });

  afterEach(() => {
    editor.worklog = null; // removes the keydown listener
  });

  it('leaves saving and stays open when Jira rejects a new entry', () => {
    worklogFacade.addWorklog$.mockReturnValue(rejected());
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.commentString = 'Draft';
    editor.save();
    expect(editor.saving).toBe(false);
    expect(editor.worklog).not.toBeNull();
    expect(editor.commentString).toBe('Draft');
  });

  it('leaves saving and stays open when Jira rejects an edited entry', () => {
    worklogFacade.updateWorklog$.mockReturnValue(rejected());
    editor.worklog = {
      id: '5',
      issueId: '10003',
      issue: ISSUE_3,
      comment: 'Old',
      started: new Date(2026, 10, 24, 9).getTime(),
      timeSpentSeconds: 3600
    };
    editor.save();
    expect(editor.saving).toBe(false);
    expect(editor.worklog).not.toBeNull();
  });

  it('does not send twice when saving is triggered again', () => {
    worklogFacade.addWorklog$.mockReturnValue(new Subject<Worklog>());
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.save();
    editor.save();
    key('Enter');
    expect(worklogFacade.addWorklog$).toHaveBeenCalledTimes(1);
  });

  it('Enter does nothing without an issue', () => {
    openAdd();
    key('Enter');
    expect(worklogFacade.addWorklog$).not.toHaveBeenCalled();
    expect(editor.saving).toBe(false);
  });

  it('Escape does nothing while saving', () => {
    worklogFacade.addWorklog$.mockReturnValue(new Subject<Worklog>());
    openAdd();
    editor.selectIssue(ISSUE_2);
    editor.save();
    key('Escape');
    expect(editor.worklog).not.toBeNull();
  });

  it('Escape still closes when not saving', () => {
    openAdd();
    key('Escape');
    expect(editor.worklog).toBeNull();
  });
});
