import {TestBed} from '@angular/core/testing';
import {
  EnvironmentInjector,
  getPlatform,
  ɵprovideZonelessChangeDetectionInternal,
  ɵRender3NgModuleRef,
  ɵZONELESS_ENABLED
} from '@angular/core';
import {HTTP_INTERCEPTORS, HttpInterceptor} from '@angular/common/http';
import {PlaidModule} from './plaid.module';
import {AuthInterceptor} from './core/auth/auth.interceptor';
import {RateLimitRetryInterceptor} from './core/http/rate-limit-retry.interceptor';

describe('PlaidModule', () => {
  /**
   * Recreates the module injector that PlatformRef.bootstrapModuleFactory builds in Angular 21: the module is created
   * with provideZonelessChangeDetectionInternal() as additional providers, so it runs zoneless unless the module's own
   * providers turn zone-based change detection back on.
   */
  function bootstrapModuleInjector() {
    TestBed.inject(EnvironmentInjector); // initializes the test platform
    const platformInjector = getPlatform().injector as EnvironmentInjector;
    return new ɵRender3NgModuleRef(PlaidModule, platformInjector, [ɵprovideZonelessChangeDetectionInternal()], false).injector;
  }

  it('uses zone-based change detection when bootstrapped', () => {
    expect(bootstrapModuleInjector().get(ɵZONELESS_ENABLED)).toBe(false);
  });

  it('runs the rate limit retry inside the auth interceptor', () => {
    const interceptors: readonly HttpInterceptor[] = bootstrapModuleInjector().get(HTTP_INTERCEPTORS);
    const authIndex = interceptors.findIndex(interceptor => interceptor instanceof AuthInterceptor);
    const retryIndex = interceptors.findIndex(interceptor => interceptor instanceof RateLimitRetryInterceptor);
    expect(authIndex).toBeGreaterThan(-1);
    expect(retryIndex).toBeGreaterThan(authIndex);
  });
});
