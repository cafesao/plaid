import {Issue} from './issue';

export interface SearchResults {
  expand?: string;
  startAt?: number;
  maxResults?: number;
  total?: number;
  issues?: Issue[];
  /** Token of the next page (Jira Cloud /rest/api/3/search/jql). Absent on the last page. */
  nextPageToken?: string;
  isLast?: boolean;
  warningMessages?: string[];
  names?: Record<string, unknown>;
  schema?: Record<string, unknown>;
}
