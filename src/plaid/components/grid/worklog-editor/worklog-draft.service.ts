import {Injectable} from '@angular/core';
import {AuthFacade} from '../../../core/auth/auth.facade';
import {Issue} from '../../../model/issue';
import {User} from '../../../model/user';

/** What the user entered for a new worklog that was not added yet: the issue they picked by hand and the comment. */
export interface WorklogDraft {
  issue: Issue | null;
  comment: string;
}

/**
 * Keeps the draft of a new worklog in memory while the editor is closed, so closing it without adding (clicking
 * outside, Esc) does not lose what the user entered. Belongs to the account that wrote it: dropped on logout and when
 * another account logs in, kept when the same account logs in again after an authentication error.
 */
@Injectable({providedIn: 'root'})
export class WorklogDraftService {
  private draft: WorklogDraft | null = null;
  private owner: string | undefined;
  private lastUserSelf: string | undefined;

  constructor(authFacade: AuthFacade) {
    // Singleton service, no need to unsubscribe
    authFacade.getAuthInfo$().subscribe(authInfo => {
      if (!authInfo) {
        this.clear();
      }
    });
    authFacade.getAuthenticatedUser$().subscribe((user: User) => {
      if (user) {
        this.lastUserSelf = user.self;
        if (this.draft && this.owner !== user.self) {
          this.clear();
        }
      }
    });
  }

  get(): WorklogDraft | null {
    return this.draft;
  }

  /** Stores the draft; with no issue and a blank comment there is nothing to keep, so the draft is cleared. */
  keep(draft: WorklogDraft): void {
    if (!draft.issue && !draft.comment?.trim()) {
      this.clear();
      return;
    }
    this.draft = {issue: draft.issue, comment: draft.comment};
    this.owner = this.lastUserSelf;
  }

  clear(): void {
    this.draft = null;
    this.owner = undefined;
  }
}
