// Mock for ngx-electron module used in tests
export class ElectronService {
  isElectronApp = false;
  ipcRenderer = null;
  desktopApp = null;
  shell = null;
  remote = null;
}

export const NgxElectronModule = {
  ngModule: class {},
  providers: []
};
