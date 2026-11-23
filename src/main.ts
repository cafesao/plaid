import { enableProdMode } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';

import { PlaidModule } from './plaid/plaid.module';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

platformBrowser().bootstrapModule(PlaidModule)
  .catch(err => console.error(err));
