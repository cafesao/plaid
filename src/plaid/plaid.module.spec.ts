import {TestBed} from '@angular/core/testing';
import {
  EnvironmentInjector,
  getPlatform,
  ɵprovideZonelessChangeDetectionInternal,
  ɵRender3NgModuleRef,
  ɵZONELESS_ENABLED
} from '@angular/core';
import {PlaidModule} from './plaid.module';

describe('PlaidModule', () => {
  it('uses zone-based change detection when bootstrapped', () => {
    TestBed.inject(EnvironmentInjector); // initializes the test platform
    // Recreates the module injector that PlatformRef.bootstrapModuleFactory builds in Angular 21: the module is created
    // with provideZonelessChangeDetectionInternal() as additional providers, so it runs zoneless unless the module's own
    // providers turn zone-based change detection back on.
    const platformInjector = getPlatform().injector as EnvironmentInjector;
    const moduleRef = new ɵRender3NgModuleRef(PlaidModule, platformInjector, [ɵprovideZonelessChangeDetectionInternal()], false);
    expect(moduleRef.injector.get(ɵZONELESS_ENABLED)).toBe(false);
  });
});
