/** API exposed by preload.js through contextBridge. Absent outside Electron (browser dev server, tests). */
export interface ElectronAPI {
  getNativeThemeShouldUseDarkColors: () => Promise<boolean>;
  setNativeThemeSource: (source: string) => Promise<void>;
  onNativeThemeUpdated: (callback: (shouldUseDarkColors: boolean) => void) => void;
  openExternal: (url: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
