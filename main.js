const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  loadConfig,
  getAppDataPath,
  setCustomDataPath,
  defaultAppDataPath,
  getRamSettings,
  setRamSettings,
  isInstalled,
  markInstalled,
  getTermsText
} = require('./src/config');
const { launchGame } = require('./src/minecraft');
const { syncModpack } = require('./src/mods');
const { pingServer } = require('./src/monitor');
const {
  listOptionalMods,
  installOptionalMod,
  uninstallOptionalMod
} = require('./src/optionalMods');

// Ник: только латиница, цифры и подчёркивание, 3-16 символов (как в Minecraft).
const NICK_REGEX = /^[A-Za-z0-9_]{3,16}$/;

let mainWindow = null;
let installerWindow = null;

// ---------- Единственный экземпляр приложения (без "песочницы" из нескольких окон) ----------
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  // Уже запущен другой экземпляр лаунчера - этот просто закрывается.
  app.quit();
} else {
  app.on('second-instance', () => {
    // Кто-то попытался запустить второй экземпляр - просто фокусируем существующее окно.
    const existing = mainWindow || installerWindow;
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
    }
  });

  app.whenReady().then(() => {
    if (isInstalled()) {
      createMainWindow();
    } else {
      createInstallerWindow();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        if (isInstalled()) createMainWindow();
        else createInstallerWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ---------- Окна ----------

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 576,
    minWidth: 760,
    minHeight: 460,
    resizable: true,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createInstallerWindow() {
  installerWindow = new BrowserWindow({
    width: 640,
    height: 480,
    resizable: false,
    frame: true,
    autoHideMenuBar: true,
    backgroundColor: '#101226',
    webPreferences: {
      preload: path.join(__dirname, 'preload-installer.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  installerWindow.loadFile(path.join(__dirname, 'installer', 'installer.html'));

  installerWindow.on('closed', () => {
    installerWindow = null;
  });
}

// ---------- IPC: основной лаунчер ----------

ipcMain.handle('get-config', async () => {
  return loadConfig();
});

ipcMain.handle('get-appdata-path', async () => {
  return getAppDataPath();
});

ipcMain.handle('open-appdata-folder', async () => {
  const dir = getAppDataPath();
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return true;
});

ipcMain.handle('select-appdata-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Выберите папку для игры',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || !result.filePaths.length) return null;

  const newPath = result.filePaths[0];
  setCustomDataPath(newPath);
  fs.mkdirSync(newPath, { recursive: true });
  return newPath;
});

ipcMain.handle('ping-server', async () => {
  try {
    return await pingServer();
  } catch (err) {
    return { online: false, players: 0, max: 0, error: err.message };
  }
});

ipcMain.handle('validate-nickname', async (event, username) => {
  return NICK_REGEX.test(String(username || ''));
});

ipcMain.handle('get-ram-settings', async () => {
  return getRamSettings();
});

ipcMain.handle('set-ram-settings', async (event, { min, max }) => {
  return setRamSettings(min, max);
});

ipcMain.handle('get-system-ram-gb', async () => {
  return Math.max(2, Math.floor(os.totalmem() / (1024 * 1024 * 1024)));
});

ipcMain.handle('sync-and-launch', async (event, { username }) => {
  const send = (channel, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  };

  if (!NICK_REGEX.test(String(username || ''))) {
    send('launch-progress', {
      stage: 'error',
      text: 'Никнейм может содержать только латинские буквы, цифры и "_" (3-16 символов)'
    });
    return { success: false, error: 'invalid-nickname' };
  }

  try {
    send('launch-progress', { stage: 'mods', text: 'Проверка модов на GitHub...' });
    await syncModpack((progress) => send('launch-progress', progress));

    send('launch-progress', { stage: 'launching', text: 'Запуск Minecraft...' });
    await launchGame(username, (progress) => send('launch-progress', progress));

    send('launch-progress', { stage: 'done', text: 'Игра запущена' });
    return { success: true };
  } catch (err) {
    send('launch-progress', { stage: 'error', text: err.message });
    return { success: false, error: err.message };
  }
});

// ---------- IPC: опциональные моды (вкладка "Моды", папка mod/) ----------

ipcMain.handle('list-optional-mods', async () => {
  try {
    return { success: true, mods: listOptionalMods() };
  } catch (err) {
    return { success: false, error: err.message, mods: [] };
  }
});

ipcMain.handle('install-optional-mod', async (event, id) => {
  try {
    const result = installOptionalMod(id);
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('uninstall-optional-mod', async (event, id) => {
  try {
    uninstallOptionalMod(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ---------- IPC: мастер установки (первый запуск) ----------

ipcMain.handle('installer-get-default-path', async () => {
  return defaultAppDataPath();
});

ipcMain.handle('installer-get-terms', async () => {
  return getTermsText();
});

ipcMain.handle('installer-choose-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    title: 'Выберите папку установки',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('installer-run-setup', async (event, { dataPath }) => {
  const send = (payload) => {
    if (installerWindow && !installerWindow.isDestroyed()) {
      installerWindow.webContents.send('installer-progress', payload);
    }
  };

  try {
    if (dataPath) {
      setCustomDataPath(dataPath);
    }
    const targetDir = getAppDataPath();
    fs.mkdirSync(targetDir, { recursive: true });

    send({ text: 'Создание папки игры...' });
    send({ text: 'Загрузка списка модов с GitHub...' });
    await syncModpack((progress) => send({ text: progress.text }));

    send({ text: 'Установка завершена' });
    return { success: true };
  } catch (err) {
    send({ text: `Ошибка установки: ${err.message}` });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('installer-finish', async () => {
  markInstalled();
  if (installerWindow && !installerWindow.isDestroyed()) {
    installerWindow.close();
  }
  createMainWindow();
  return true;
});
