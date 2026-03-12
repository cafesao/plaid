import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {UserPreferencesService} from './user-preferences.service';

declare global {
  interface Window {
    electronAPI?: {
      getNativeThemeShouldUseDarkColors: () => Promise<boolean>;
      setNativeThemeSource: (source: string) => Promise<void>;
      onNativeThemeUpdated: (callback: (shouldUseDarkColors: boolean) => void) => void;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

@Injectable({ providedIn: 'root' })
export class SystemPreferencesService {
  private darkModeSubject = new BehaviorSubject<boolean>(false);

  constructor(private userPreferencesService: UserPreferencesService) {
    if (window.electronAPI) {
      window.electronAPI.getNativeThemeShouldUseDarkColors().then((value: boolean) => {
        this.darkModeSubject.next(value);
      });

      window.electronAPI.onNativeThemeUpdated((shouldUseDarkColors: boolean) => {
        this.darkModeSubject.next(shouldUseDarkColors);
      });

      userPreferencesService.getTheme$().subscribe(theme => {
        window.electronAPI.setNativeThemeSource(theme);
      });
    }
  }

  getDarkMode$(): Observable<boolean> {
    return this.darkModeSubject.asObservable();
  }
}
