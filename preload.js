const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getNativeThemeShouldUseDarkColors: () => ipcRenderer.invoke('native-theme:shouldUseDarkColors'),
  setNativeThemeSource: source => ipcRenderer.invoke('native-theme:setSource', source),
  onNativeThemeUpdated: callback => {
    ipcRenderer.on('native-theme:updated', (_event, shouldUseDarkColors) => callback(shouldUseDarkColors));
  },
  openExternal: url => ipcRenderer.invoke('shell:openExternal', url)
});
