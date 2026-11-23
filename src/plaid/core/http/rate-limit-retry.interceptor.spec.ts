import {TestBed} from '@angular/core/testing';
import {HTTP_INTERCEPTORS, HttpClient, HttpErrorResponse, provideHttpClient, withInterceptorsFromDi} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {AuthInterceptor} from '../auth/auth.interceptor';
import {AuthState} from '../auth/auth.state';
import {RATE_LIMIT_DEFAULT_DELAY_MS, RATE_LIMIT_MAX_RETRIES, RateLimitRetryInterceptor} from './rate-limit-retry.interceptor';

describe('RateLimitRetryInterceptor', () => {
  const url = 'https://jira.test/rest/api/2/issue/1/worklog';
  let http: HttpClient;
  let controller: HttpTestingController;
  let authState: AuthState;

  function tooManyRequests(retryAfter?: string) {
    return {status: 429, statusText: 'Too Many Requests', headers: retryAfter ? {'Retry-After': retryAfter} : {}};
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.setItem('AUTH_INFO', JSON.stringify({jiraUrl: 'https://jira.test', username: 'u', password: 'p'}));
    localStorage.setItem('AUTH_HEADER', 'Basic dTpw');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        // Same order as PlaidModule: the retry interceptor sits inside the auth interceptor.
        {provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true},
        {provide: HTTP_INTERCEPTORS, useClass: RateLimitRetryInterceptor, multi: true}
      ]
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    authState = TestBed.inject(AuthState);
  });

  afterEach(() => {
    controller.verify();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('retries after Retry-After seconds on 429 and returns the later success', () => {
    let value: unknown;
    http.get('/rest/api/2/issue/1/worklog').subscribe(response => (value = response));

    controller.expectOne(url).flush(null, tooManyRequests('1'));
    vi.advanceTimersByTime(999);
    controller.expectNone(url);
    vi.advanceTimersByTime(1);
    controller.expectOne(url).flush({ok: true});

    expect(value).toEqual({ok: true});
  });

  it('waits 2000 ms when Retry-After is missing', () => {
    let value: unknown;
    http.get('/rest/api/2/issue/1/worklog').subscribe(response => (value = response));

    controller.expectOne(url).flush(null, tooManyRequests());
    vi.advanceTimersByTime(RATE_LIMIT_DEFAULT_DELAY_MS - 1);
    controller.expectNone(url);
    vi.advanceTimersByTime(1);
    controller.expectOne(url).flush({ok: true});

    expect(RATE_LIMIT_DEFAULT_DELAY_MS).toBe(2000);
    expect(value).toEqual({ok: true});
  });

  it('gives up after 3 retries and propagates the 429', () => {
    let error: HttpErrorResponse;
    http.get('/rest/api/2/issue/1/worklog').subscribe({error: e => (error = e)});

    let requests = 0;
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
      controller.expectOne(url).flush(null, tooManyRequests('1'));
      requests++;
      vi.advanceTimersByTime(1000);
    }
    controller.expectNone(url);

    expect(RATE_LIMIT_MAX_RETRIES).toBe(3);
    expect(requests).toBe(4);
    expect(error.status).toBe(429);
  });

  it('does not retry other errors', () => {
    let error: HttpErrorResponse;
    http.get('/rest/api/2/issue/1/worklog').subscribe({error: e => (error = e)});

    controller.expectOne(url).flush(null, {status: 500, statusText: 'Server Error'});
    vi.advanceTimersByTime(10000);
    controller.expectNone(url);

    expect(error.status).toBe(500);
  });

  it('does not report an error to AuthState while retries succeed', () => {
    const setError = vi.spyOn(authState, 'setError');
    http.get('/rest/api/2/issue/1/worklog').subscribe();

    controller.expectOne(url).flush(null, tooManyRequests('1'));
    vi.advanceTimersByTime(1000);
    controller.expectOne(url).flush({ok: true});

    expect(setError).not.toHaveBeenCalled();
  });
});
