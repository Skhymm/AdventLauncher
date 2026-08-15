const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerApi', {
  getDefaultPath: () => ipcRenderer.invoke('installer-get-default-path'),
  getTerms: () => ipcRenderer.invoke('installer-get-terms'),
  chooseDirectory: () => ipcRenderer.invoke('installer-choose-directory'),
  runSetup: (dataPath) => ipcRenderer.invoke('installer-run-setup', { dataPath }),
  finish: () => ipcRenderer.invoke('installer-finish'),
  onProgress: (callback) => {
    ipcRenderer.on('installer-progress', (_event, data) => callback(data));
  }
});
