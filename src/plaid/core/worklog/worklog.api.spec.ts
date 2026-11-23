import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting, TestRequest} from '@angular/common/http/testing';
import {WorklogApi} from './worklog.api';
import {DateRange} from '../../model/date-range';

describe('WorklogApi', () => {
  const range: DateRange = {start: new Date(2026, 10, 23), end: new Date(2026, 10, 29)};
  let api: WorklogApi;
  let http: HttpTestingController;

  function requestUrl(request: TestRequest): URL {
    return new URL(request.request.urlWithParams, 'https://jira.test');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    api = TestBed.inject(WorklogApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('getIssuesForWorklogDateRange$', () => {
    it('requests the first search page with maxResults=100 and a JQL range widened by one day', () => {
      api.getIssuesForWorklogDateRange$(range).subscribe();

      const request = http.expectOne(req => req.urlWithParams.startsWith('/rest/api/3/search/jql'));
      const url = requestUrl(request);
      expect(request.request.method).toBe('GET');
      expect(url.searchParams.get('maxResults')).toBe('100');
      expect(url.searchParams.has('startAt')).toBe(false);
      expect(url.searchParams.has('nextPageToken')).toBe(false);
      const jql = url.searchParams.get('jql');
      expect(jql).toContain('worklogAuthor = currentUser()');
      expect(jql).toContain('worklogDate >= "2026-11-22"');
      expect(jql).toContain('worklogDate <= "2026-11-30"');
      request.flush({issues: [], isLast: true});
    });

    it('passes nextPageToken on later pages', () => {
      api.getIssuesForWorklogDateRange$(range, 'p2').subscribe();

      const request = http.expectOne(req => req.urlWithParams.startsWith('/rest/api/3/search/jql'));
      expect(requestUrl(request).searchParams.get('nextPageToken')).toBe('p2');
      request.flush({issues: [], isLast: true});
    });
  });

  describe('getWorklogsForIssue$', () => {
    it('limits issue worklogs to the visible period', () => {
      api.getWorklogsForIssue$('10', range).subscribe();

      const request = http.expectOne(req => req.url.startsWith('/rest/api/2/issue/10/worklog'));
      const url = requestUrl(request);
      expect(url.pathname).toBe('/rest/api/2/issue/10/worklog');
      expect(url.searchParams.get('startedAfter')).toBe(String(new Date(2026, 10, 23).getTime()));
      expect(url.searchParams.get('startedBefore')).toBe(String(new Date(2026, 10, 30).getTime()));
      expect(url.searchParams.has('startAt')).toBe(false);
      request.flush({startAt: 0, total: 0, worklogs: []});
    });

    it('keeps the period filter on later worklog pages', () => {
      api.getWorklogsForIssue$('10', range, 50).subscribe();

      const request = http.expectOne(req => req.url.startsWith('/rest/api/2/issue/10/worklog'));
      const url = requestUrl(request);
      expect(url.searchParams.get('startAt')).toBe('50');
      expect(url.searchParams.get('startedAfter')).toBe(String(new Date(2026, 10, 23).getTime()));
      expect(url.searchParams.get('startedBefore')).toBe(String(new Date(2026, 10, 30).getTime()));
      request.flush({startAt: 50, total: 60, worklogs: []});
    });
  });
});
