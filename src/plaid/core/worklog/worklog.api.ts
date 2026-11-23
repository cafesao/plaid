import { Injectable } from '@angular/core';
import { Worklog } from '../../model/worklog';
import { HttpClient } from '@angular/common/http';
import { SearchResults } from '../../model/search-results';
import { formatDate } from '@angular/common';
import { Observable } from 'rxjs';
import { WorklogWithPagination } from '../../model/worklog-with-pagination';
import { DateRange } from '../../model/date-range';
import { Calendar } from '../../helpers/calendar';

@Injectable({ providedIn: 'root' })
export class WorklogApi {
  private readonly searchUrl = '/rest/api/3/search/jql';
  private readonly getWorklogsUrl = '/rest/api/2/issue/{issueIdOrKey}/worklog';
  private readonly addWorklogUrl = '/rest/api/2/issue/{issueIdOrKey}/worklog';
  private readonly updateWorklogUrl = '/rest/api/2/issue/{issueIdOrKey}/worklog/{id}';
  private readonly deleteWorklogUrl = '/rest/api/2/issue/{issueIdOrKey}/worklog/{id}';
  private readonly searchPageSize = 100;

  constructor(private http: HttpClient) { }

  /**
   * Emits a page of issues with the user's work logs in the date range, directly as fetched from API. Pass the
   * nextPageToken of the previous page to get the next one.
   *
   * The JQL range is widened by one day on each side because worklogDate follows the time zone of the Jira profile,
   * which may differ from this machine's. Work logs outside the visible range are filtered out by the caller.
   */
  getIssuesForWorklogDateRange$(dateRange: DateRange, nextPageToken?: string): Observable<SearchResults> {
    const jqlStart = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), dateRange.start.getDate() - 1);
    const jqlEnd = new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), dateRange.end.getDate() + 1);
    let url = this.searchUrl
      + '?fields=components,issuetype,parent,priority,summary,status'
      + '&maxResults=' + this.searchPageSize
      + '&jql=' + encodeURIComponent(
        'worklogAuthor = currentUser() && worklogDate >= "'
          + formatDate(jqlStart, 'yyyy-MM-dd', 'en-US') + '" && worklogDate <= "'
          + formatDate(jqlEnd, 'yyyy-MM-dd', 'en-US') + '"'
      );
    if (nextPageToken) {
      url += '&nextPageToken=' + encodeURIComponent(nextPageToken);
    }
    return this.http.get<SearchResults>(url);
  }

  /**
   * Emits a page of an issue's work logs started within the date range, directly as fetched from API.
   */
  getWorklogsForIssue$(issueId: string, dateRange: DateRange, startAt = 0): Observable<WorklogWithPagination> {
    let url = this.getWorklogsUrl.replace('{issueIdOrKey}', issueId)
      + '?startedAfter=' + dateRange.start.getTime()
      + '&startedBefore=' + Calendar.dayAfter(dateRange.end).getTime();
    if (startAt > 0) {
      url += '&startAt=' + startAt;
    }
    return this.http.get<WorklogWithPagination>(url);
  }

  /**
   * Adds new work log entry and returns observable emitting added entry
   */
  addWorklog$(issueId: string, started: Date, timeSpentSeconds: number, comment: string): Observable<Worklog> {
    const url: string = this.addWorklogUrl.replace('{issueIdOrKey}', issueId);
    const body = {
      started: started.toISOString().replace(/Z$/, '+0000'),
      timeSpentSeconds,
      comment
    };
    return this.http.post<Worklog>(url, body);
  }

  /**
   * Updates work log entry and returns observable emitting updated entry
   */
  updateWorklog$(issueId: string, worklogId: string, started: Date, timeSpentSeconds: number, comment: string): Observable<Worklog> {
    const url: string = this.updateWorklogUrl.replace('{issueIdOrKey}', issueId).replace('{id}', worklogId);
    const body = {
      started: started.toISOString().replace(/Z$/, '+0000'),
      timeSpentSeconds,
      comment
    };
    return this.http.put<Worklog>(url, body);
  }

  /**
   * Deletes work log entry and returns observable emitting when the deletion finishes.
   */
  deleteWorklog$(issueId: string, worklogId: string): Observable<void> {
    return this.http.delete<void>(this.deleteWorklogUrl.replace('{issueIdOrKey}', issueId).replace('{id}', worklogId));
  }
}
