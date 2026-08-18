const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getAppDataPath: () => ipcRenderer.invoke('get-appdata-path'),
  openAppDataFolder: () => ipcRenderer.invoke('open-appdata-folder'),
  selectAppDataFolder: () => ipcRenderer.invoke('select-appdata-folder'),
  pingServer: () => ipcRenderer.invoke('ping-server'),
  validateNickname: (username) => ipcRenderer.invoke('validate-nickname', username),
  getRamSettings: () => ipcRenderer.invoke('get-ram-settings'),
  setRamSettings: (min, max) => ipcRenderer.invoke('set-ram-settings', { min, max }),
  getSystemRamGb: () => ipcRenderer.invoke('get-system-ram-gb'),
  syncAndLaunch: (username) => ipcRenderer.invoke('sync-and-launch', { username }),
  listOptionalMods: () => ipcRenderer.invoke('list-optional-mods'),
  installOptionalMod: (id) => ipcRenderer.invoke('install-optional-mod', id),
  uninstallOptionalMod: (id) => ipcRenderer.invoke('uninstall-optional-mod', id),
  onLaunchProgress: (callback) => {
    ipcRenderer.on('launch-progress', (_event, data) => callback(data));
  }
});
