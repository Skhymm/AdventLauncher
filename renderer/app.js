const appEl = document.getElementById('app');
const steve = document.getElementById('steve');
const onlineRow = document.getElementById('onlineRow');
const onlineCount = document.getElementById('onlineCount');
const topbarRight = document.getElementById('topbarRight');
const playBtn = document.getElementById('playBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backBtn = document.getElementById('backBtn');
const settingsPanel = document.getElementById('settingsPanel');
const nickInput = document.getElementById('nickInput');
const appDataField = document.getElementById('appDataField');
const openFolderBtn = document.getElementById('openFolderBtn');
const chooseFolderBtn = document.getElementById('chooseFolderBtn');
const modLoaderInfo = document.getElementById('modLoaderInfo');
const syncModsBtn = document.getElementById('syncModsBtn');
const ramMinInput = document.getElementById('ramMinInput');
const ramMaxInput = document.getElementById('ramMaxInput');
const ramMinLabel = document.getElementById('ramMinLabel');
const ramMaxLabel = document.getElementById('ramMaxLabel');
const versionText = document.getElementById('versionText');
const progressLog = document.getElementById('progressLog');
const launchToast = document.getElementById('launchToast');
const storiesRow = document.getElementById('storiesRow');
const modsLink = document.getElementById('modsLink');
const modsPanel = document.getElementById('modsPanel');
const modsBackBtn = document.getElementById('modsBackBtn');
const modsGrid = document.getElementById('modsGrid');

// ---------- Истории (карточки под "Общий онлайн") ----------
// Ссылка на stories.json в вашем GitHub-репозитории.
// Формат "raw": https://raw.githubusercontent.com/ПОЛЬЗОВАТЕЛЬ/РЕПОЗИТОРИЙ/ВЕТКА/stories.json
// Замените на свою ссылку.
const STORIES_URL = 'https://raw.githubusercontent.com/Skhymm/Advent-MMO/main/stories.json';

// ---------- Заглушка window.api для запуска в обычном браузере ----------
// В Electron-версии window.api подставляется preload-скриптом.
// Если открыть index.html прямо в браузере ("играть в браузере"),
// этого объекта нет — подставляем безопасный мок, чтобы UI не падал.
if (!window.api) {
  window.api = {
    getConfig: async () => ({ minecraft: { version: '1.21.1', modLoader: 'fabric' } }),
    getAppDataPath: async () => 'Недоступно в браузере',
    openAppDataFolder: async () => {},
    selectAppDataFolder: async () => null,
    pingServer: async () => ({ online: false, players: 0, max: 0 }),
    validateNickname: async (name) => NICK_REGEX.test(name),
    getRamSettings: async () => ({ min: 2, max: 6 }),
    setRamSettings: async (min, max) => ({ min, max }),
    getSystemRamGb: async () => 8,
    syncAndLaunch: async () => ({ success: false, error: 'Запуск игры доступен только в приложении-лаунчере' }),
    onLaunchProgress: () => {},
    listOptionalMods: async () => ({ success: true, mods: [] }),
    installOptionalMod: async () => ({ success: false, error: 'Доступно только в приложении-лаунчере' }),
    uninstallOptionalMod: async () => ({ success: false, error: 'Доступно только в приложении-лаунчере' }),
  };
}

let config = null;
let settingsOpen = false;

// ---------- Никнейм ----------
// Только латиница, цифры и "_", 3-16 символов - как требует Minecraft.
const NICK_REGEX = /^[A-Za-z0-9_]{3,16}$/;
const DEFAULT_NICK = 'Player';

function loadNick() {
  const saved = localStorage.getItem('nickname');
  return saved && NICK_REGEX.test(saved) ? saved : DEFAULT_NICK;
}
function saveNick(name) {
  localStorage.setItem('nickname', name);
}

function validateNick() {
  const valid = NICK_REGEX.test(nickInput.value.trim());
  nickInput.classList.toggle('invalid', !valid);
  playBtn.disabled = !valid;
  playBtn.title = valid ? '' : 'Ник: латиница, цифры и "_", от 3 до 16 символов';
  return valid;
}

nickInput.value = loadNick();

// Отфильтровываем недопустимые символы прямо во время ввода,
// чтобы пользователь физически не мог напечатать кириллицу/пробелы/спецсимволы.
nickInput.addEventListener('input', () => {
  const filtered = nickInput.value.replace(/[^A-Za-z0-9_]/g, '');
  if (filtered !== nickInput.value) {
    const pos = nickInput.selectionStart - (nickInput.value.length - filtered.length);
    nickInput.value = filtered;
    nickInput.setSelectionRange(pos, pos);
  }
  validateNick();
});

nickInput.addEventListener('change', () => {
  const clean = nickInput.value.trim();
  if (NICK_REGEX.test(clean)) {
    saveNick(clean);
  } else {
    nickInput.value = loadNick();
  }
  validateNick();
});

// ---------- Настройки: плавное открытие/закрытие ----------
function openSettings() {
  if (modsOpen) closeMods();
  if (settingsOpen) return;
  settingsOpen = true;

  settingsPanel.classList.add('open');
  appEl.classList.add('settings-open');
  const panelWidth = settingsPanel.getBoundingClientRect().width;
  steve.style.transform = `translateX(-${panelWidth}px) scale(0.94)`;
  onlineRow.classList.add('hidden');
  playBtn.classList.add('hidden');
  topbarRight.classList.add('hidden');
  modsLink.classList.add('hidden');

  settingsBtn.classList.add('spinning');
  setTimeout(() => settingsBtn.classList.remove('spinning'), 900);
}

function closeSettings() {
  if (!settingsOpen) return;
  settingsOpen = false;

  settingsPanel.classList.remove('open');
  appEl.classList.remove('settings-open');
  steve.style.transform = '';
  onlineRow.classList.remove('hidden');
  playBtn.classList.remove('hidden');
  topbarRight.classList.remove('hidden');
  modsLink.classList.remove('hidden');
}

settingsBtn.addEventListener('click', openSettings);
backBtn.addEventListener('click', closeSettings);

// ---------- Вкладка "Моды": плавное открытие/закрытие ----------
let modsOpen = false;
let modsLoaded = false;

function openMods() {
  if (settingsOpen) closeSettings();
  if (modsOpen) return;
  modsOpen = true;

  modsPanel.classList.add('open');
  appEl.classList.add('settings-open');
  const panelWidth = modsPanel.getBoundingClientRect().width;
  steve.style.transform = `translateX(-${panelWidth}px) scale(0.94)`;
  onlineRow.classList.add('hidden');
  playBtn.classList.add('hidden');
  topbarRight.classList.add('hidden');
  modsLink.classList.add('hidden');

  if (!modsLoaded) {
    modsLoaded = true;
    loadOptionalMods();
  }
}

function closeMods() {
  if (!modsOpen) return;
  modsOpen = false;

  modsPanel.classList.remove('open');
  appEl.classList.remove('settings-open');
  steve.style.transform = '';
  onlineRow.classList.remove('hidden');
  playBtn.classList.remove('hidden');
  topbarRight.classList.remove('hidden');
  modsLink.classList.remove('hidden');
}

modsLink.addEventListener('click', openMods);
modsBackBtn.addEventListener('click', closeMods);

// ---------- Загрузка и отрисовка списка опциональных модов ----------
// ВАЖНО: эти моды НИКОГДА не скачиваются автоматически. Они не участвуют
// в синхронизации основного модпака (которая идёт с GitHub при нажатии
// "Играть") - игрок сам решает, какой мод скачать, нажимая кнопку в этой
// вкладке. Только тогда мод устанавливается и попадает в белый список.
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

async function loadOptionalMods() {
  modsGrid.innerHTML = '<div class="mods-empty">Загрузка...</div>';
  try {
    const res = await window.api.listOptionalMods();
    if (!res.success) {
      modsGrid.innerHTML = `<div class="mods-empty">Ошибка: ${res.error}</div>`;
      return;
    }
    renderModsGrid(res.mods);
  } catch (err) {
    modsGrid.innerHTML = `<div class="mods-empty">Ошибка: ${err.message}</div>`;
  }
}

function renderModsGrid(mods) {
  modsGrid.innerHTML = '';

  if (!mods.length) {
    modsGrid.innerHTML = '<div class="mods-empty">Пока нет доступных модов</div>';
    return;
  }

  mods.forEach((mod) => {
    const card = document.createElement('div');
    card.className = 'mod-card';
    if (mod.description) card.title = mod.description;

    const icon = document.createElement('div');
    icon.className = 'mod-card-icon';
    if (mod.icon) {
      const img = document.createElement('img');
      img.className = 'mod-card-icon-img';
      img.src = mod.icon;
      img.alt = mod.name;
      icon.appendChild(img);
    } else {
      icon.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="white" d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2zm0 2.3L6 7.6v7.8l6 3.3 6-3.3V7.6l-6-3.3z"/></svg>';
    }

    const name = document.createElement('div');
    name.className = 'mod-card-name';
    name.textContent = mod.name;

    let desc = null;
    if (mod.description) {
      desc = document.createElement('div');
      desc.className = 'mod-card-desc';
      desc.textContent = mod.description;
    }

    const size = document.createElement('div');
    size.className = 'mod-card-size';
    size.textContent = formatSize(mod.sizeBytes);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mod-card-btn ${mod.installed ? 'installed' : 'install'}`;
    btn.textContent = mod.installed ? 'Установлен ✓' : 'Скачать';
    btn.disabled = mod.installed;

    // Скачивание начинается ТОЛЬКО по этому клику - никакой автоматики.
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = 'Установка...';
      try {
        const result = await window.api.installOptionalMod(mod.id);
        if (result.success) {
          btn.textContent = 'Установлен ✓';
          btn.classList.remove('install');
          btn.classList.add('installed');
          showToast(`Мод «${mod.name}» установлен`);
        } else {
          btn.textContent = 'Скачать';
          btn.disabled = false;
          showToast(`Ошибка: ${result.error}`);
        }
      } catch (err) {
        btn.textContent = 'Скачать';
        btn.disabled = false;
        showToast(`Ошибка: ${err.message}`);
      }
    });

    card.appendChild(icon);
    card.appendChild(name);
    if (desc) card.appendChild(desc);
    card.appendChild(size);
    card.appendChild(btn);
    modsGrid.appendChild(card);
  });
}

async function loadStories() {
  let list = [];
  try {
    const res = await fetch(STORIES_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    list = await res.json();
  } catch (err) {
    console.warn('Не удалось загрузить stories.json с GitHub, пробуем локальный файл:', err);
    try {
      const res2 = await fetch('stories.json', { cache: 'no-store' });
      list = await res2.json();
    } catch (err2) {
      console.warn('Локальный stories.json тоже не найден:', err2);
      return;
    }
  }
  renderStories(Array.isArray(list) ? list : []);
}

function renderStories(list) {
  storiesRow.innerHTML = '';
  list.forEach((item) => {
    if (!item || !item.image || !item.title) return;
    const card = document.createElement('button');
    card.className = 'story-card';
    card.type = 'button';
    card.title = item.title;

    const img = document.createElement('img');
    img.className = 'story-thumb';
    img.src = item.image;
    img.alt = item.title;
    img.loading = 'lazy';

    const title = document.createElement('span');
    title.className = 'story-title';
    title.textContent = item.title;

    card.appendChild(img);
    card.appendChild(title);

    if (item.url) {
      card.addEventListener('click', () => {
        window.open(item.url, '_blank', 'noopener');
      });
    }

    storiesRow.appendChild(card);
  });
}

// ---------- Конфиг / папка игры ----------
async function init() {
  config = await window.api.getConfig();
  versionText.textContent = config.minecraft.version;
  modLoaderInfo.textContent = `${capitalize(config.minecraft.modLoader)} · ${config.minecraft.version}`;

  const realPath = await window.api.getAppDataPath();
  appDataField.textContent = realPath;
  appDataField.title = realPath;

  refreshOnline();
  setInterval(refreshOnline, 30000);

  loadStories();
  validateNick();
  await initRamSettings();
}

// ---------- Настройки ОЗУ ----------
let systemRamGb = 8;

async function initRamSettings() {
  systemRamGb = await window.api.getSystemRamGb();
  const ram = await window.api.getRamSettings();

  const maxCap = Math.max(2, systemRamGb - 1); // оставляем 1 ГБ системе

  ramMinInput.max = maxCap;
  ramMaxInput.max = maxCap;
  ramMinInput.value = Math.min(ram.min, maxCap);
  ramMaxInput.value = Math.min(ram.max, maxCap);

  renderRamLabels();
}

function renderRamLabels() {
  ramMinLabel.textContent = `${ramMinInput.value} ГБ`;
  ramMaxLabel.textContent = `${ramMaxInput.value} ГБ`;
}

async function persistRamSettings() {
  let min = parseInt(ramMinInput.value, 10);
  let max = parseInt(ramMaxInput.value, 10);
  if (min > max) {
    max = min;
    ramMaxInput.value = max;
  }
  renderRamLabels();
  await window.api.setRamSettings(min, max);
}

ramMinInput.addEventListener('input', renderRamLabels);
ramMaxInput.addEventListener('input', renderRamLabels);
ramMinInput.addEventListener('change', persistRamSettings);
ramMaxInput.addEventListener('change', persistRamSettings);

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

openFolderBtn.addEventListener('click', () => {
  window.api.openAppDataFolder();
});

chooseFolderBtn.addEventListener('click', async () => {
  chooseFolderBtn.classList.add('spinning');
  try {
    const newPath = await window.api.selectAppDataFolder();
    if (newPath) {
      appDataField.textContent = newPath;
      appDataField.title = newPath;
      logLine(`Папка игры изменена: ${newPath}`);
    }
  } finally {
    setTimeout(() => chooseFolderBtn.classList.remove('spinning'), 400);
  }
});

// ---------- Мониторинг сервера ----------
async function refreshOnline() {
  onlineCount.textContent = '...';
  try {
    const res = await window.api.pingServer();
    if (res.online) {
      onlineCount.textContent = `${res.players} / ${res.max}`;
    } else {
      onlineCount.textContent = 'офлайн';
    }
  } catch (err) {
    onlineCount.textContent = 'офлайн';
  }
}

// ---------- Обновление модов вручную из настроек ----------
syncModsBtn.addEventListener('click', async () => {
  syncModsBtn.classList.add('spinning');
  logLine('Проверка обновлений модов на GitHub...');
  try {
    // отдельного IPC для "только моды" не заводим - используем общий цикл запуска
    // без реального запуска игры пользователь может просто нажать "Играть"
    logLine('Список модов будет обновлён при следующем запуске игры.');
  } finally {
    setTimeout(() => syncModsBtn.classList.remove('spinning'), 800);
  }
});

// ---------- Запуск игры ----------
function logLine(text) {
  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  progressLog.textContent = `[${time}] ${text}`;
  progressLog.scrollTop = progressLog.scrollHeight;
}

function showToast(text) {
  launchToast.textContent = text;
  launchToast.classList.add('visible');
}
function hideToast() {
  launchToast.classList.remove('visible');
}

window.api.onLaunchProgress((data) => {
  logLine(data.text);
  // Поток сырых debug/data-строк от Java идёт только в лог-панель,
  // иначе тост превращается в бесконечно мигающую простыню текста.
  if (data.stage !== 'log') {
    showToast(data.text);
  }
  if (data.stage === 'done' || data.stage === 'error' || data.stage === 'closed') {
    setTimeout(hideToast, 3500);
  }
});

playBtn.addEventListener('click', async () => {
  if (!validateNick()) {
    showToast('Ник может содержать только латиницу, цифры и "_" (3-16 символов)');
    return;
  }

  const username = nickInput.value.trim();
  playBtn.disabled = true;
  playBtn.textContent = 'ЗАПУСК...';
  showToast('Синхронизация модов с GitHub...');

  try {
    const result = await window.api.syncAndLaunch(username);
    if (!result.success) {
      showToast(`Ошибка: ${result.error}`);
    }
  } finally {
    playBtn.disabled = false;
    playBtn.textContent = 'ИГРАТЬ';
  }
});

init();
