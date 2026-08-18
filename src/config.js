const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let cached = null;

function loadConfig() {
  if (cached) return cached;
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  cached = JSON.parse(raw);
  return cached;
}

// ---------- Пользовательские настройки (в т.ч. кастомная папка игры) ----------
// Хранятся отдельно от config.json (который лежит внутри установленного приложения
// и может быть недоступен для записи после упаковки в .asar).
function getUserSettingsPath() {
  // require('electron') делаем лениво - этот модуль используется только в main-процессе.
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'launcher-settings.json');
}

function loadUserSettings() {
  try {
    const raw = fs.readFileSync(getUserSettingsPath(), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function saveUserSettings(settings) {
  const p = getUserSettingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
}

function defaultAppDataPath() {
  const cfg = loadConfig();
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA
      : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : path.join(os.homedir(), '.local', 'share');

  return path.join(base, cfg.appData.folderName);
}

// Реальный путь вместо плейсхолдера %Appdata%, показанного в UI.
// Если пользователь выбрал свою папку в настройках - используем её.
function getAppDataPath() {
  const settings = loadUserSettings();
  if (settings.customDataPath) return settings.customDataPath;
  return defaultAppDataPath();
}

function setCustomDataPath(newPath) {
  const settings = loadUserSettings();
  settings.customDataPath = newPath;
  saveUserSettings(settings);
}

function resetCustomDataPath() {
  const settings = loadUserSettings();
  delete settings.customDataPath;
  saveUserSettings(settings);
}

// ---------- ОЗУ ----------
// Хранится в гигабайтах (целые числа). Если пользователь ничего не менял -
// берём значения по умолчанию из config.json (там они как строки "2G"/"6g").
function parseGb(value, fallback) {
  if (typeof value === 'number') return value;
  const m = String(value || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : fallback;
}

function getRamSettings() {
  const settings = loadUserSettings();
  const cfg = loadConfig();
  return {
    min: settings.ramMin || parseGb(cfg.memory.min, 2),
    max: settings.ramMax || parseGb(cfg.memory.max, 6)
  };
}

function setRamSettings(min, max) {
  const settings = loadUserSettings();
  settings.ramMin = Math.max(1, Math.round(min));
  settings.ramMax = Math.max(settings.ramMin, Math.round(max));
  saveUserSettings(settings);
  return getRamSettings();
}

// ---------- Мастер установки (первый запуск) ----------
function isInstalled() {
  const settings = loadUserSettings();
  return !!settings.installed;
}

function markInstalled() {
  const settings = loadUserSettings();
  settings.installed = true;
  saveUserSettings(settings);
}

// ---------- Текст условий использования (reg.txt) ----------
function getTermsText() {
  const p = path.join(__dirname, '..', 'reg.txt');
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch (err) {
    return 'Файл условий использования (reg.txt) не найден рядом с лаунчером.';
  }
}

// ---------- Опциональные моды (вкладка "Моды", папка mod/ в поставке) ----------
// Храним только список ID (имён .zip-файлов) уже установленных модов,
// чтобы: 1) не удалять их jar-файлы при синхронизации модпака с GitHub,
// 2) показывать в UI кнопку "Установлен" вместо "Скачать".
function getInstalledOptionalMods() {
  const settings = loadUserSettings();
  return Array.isArray(settings.optionalMods) ? settings.optionalMods : [];
}

function setInstalledOptionalMods(list) {
  const settings = loadUserSettings();
  settings.optionalMods = list;
  saveUserSettings(settings);
}

module.exports = {
  loadConfig,
  getAppDataPath,
  setCustomDataPath,
  resetCustomDataPath,
  defaultAppDataPath,
  getRamSettings,
  setRamSettings,
  isInstalled,
  markInstalled,
  getTermsText,
  getInstalledOptionalMods,
  setInstalledOptionalMods
};
