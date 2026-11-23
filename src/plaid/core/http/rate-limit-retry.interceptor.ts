import {Injectable} from '@angular/core';
import {HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest} from '@angular/common/http';
import {Observable, throwError, timer} from 'rxjs';
import {retry} from 'rxjs/operators';

/** How many times a request answered with HTTP 429 is sent again before the error is reported. */
export const RATE_LIMIT_MAX_RETRIES = 3;
/** Wait before sending again when the 429 response has no usable Retry-After header. */
export const RATE_LIMIT_DEFAULT_DELAY_MS = 2000;

/**
 * Sends a request again when Jira answers HTTP 429 (Too Many Requests), after the delay given by Retry-After.
 *
 * Registered after AuthInterceptor so it sits inside it: AuthInterceptor (and the error modal it triggers) only sees
 * the 429 once all retries are used up.
 */
@Injectable()
export class RateLimitRetryInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(request).pipe(
      retry({
        count: RATE_LIMIT_MAX_RETRIES,
        delay: (error: unknown) =>
          error instanceof HttpErrorResponse && error.status === 429
            ? timer(RateLimitRetryInterceptor.retryDelayMs(error))
            : throwError(() => error)
      })
    );
  }

  private static retryDelayMs(error: HttpErrorResponse): number {
    const retryAfter: string = error.headers?.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return seconds * 1000;
      }
      const date: number = Date.parse(retryAfter);
      if (!Number.isNaN(date)) {
        return Math.max(0, date - Date.now());
      }
    }
    return RATE_LIMIT_DEFAULT_DELAY_MS;
  }
}
