import {Injectable} from '@angular/core';

@Injectable({providedIn: 'root'})
export class ElectronService {
  get isElectronApp(): boolean {
    return !!(window && window.electronAPI);
  }

  openExternal(url: string): void {
    if (window.electronAPI) {
      window.electronAPI.openExternal(url);
    }
  }
}
