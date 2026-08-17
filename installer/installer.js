// ---------- Заглушка для запуска installer.html вне Electron (просмотр в браузере) ----------
if (!window.installerApi) {
  window.installerApi = {
    getDefaultPath: async () => 'C:\\Users\\Player\\AppData\\Roaming\\.adventmc',
    getTerms: async () => 'Условия использования доступны только в приложении-лаунчере.',
    chooseDirectory: async () => null,
    runSetup: async () => ({ success: true }),
    finish: async () => true,
    onProgress: () => {},
  };
}

const screens = Array.from(document.querySelectorAll('.screen'));
const stepDots = Array.from(document.querySelectorAll('.wizard-step'));
const backBtn = document.getElementById('backBtn');
const nextBtn = document.getElementById('nextBtn');
const finishBtn = document.getElementById('finishBtn');

const termsBox = document.getElementById('termsBox');
const agreeCheckbox = document.getElementById('agreeCheckbox');

const dirDefaultRadio = document.getElementById('dirDefaultRadio');
const dirCustomRadio = document.getElementById('dirCustomRadio');
const defaultPathText = document.getElementById('defaultPathText');
const customPathText = document.getElementById('customPathText');
const browseBtn = document.getElementById('browseBtn');

const installBar = document.getElementById('installBar');
const installLog = document.getElementById('installLog');

let current = 0;
let defaultPath = '';
let customPath = null;
let installStarted = false;

function showStep(index) {
  current = index;
  screens.forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === index));
  stepDots.forEach((el) => {
    const n = Number(el.dataset.stepDot);
    el.classList.toggle('active', n === index);
    el.classList.toggle('done', n < index);
  });

  // Навигация: на шагах установки (3) и финала (4) обычная панель прячется/адаптируется
  backBtn.classList.toggle('hidden', index === 0 || index === 3 || index === 4);
  nextBtn.classList.toggle('hidden', index === 3 || index === 4);
  finishBtn.classList.toggle('hidden', index !== 4);

  updateNextEnabled();

  if (index === 3 && !installStarted) {
    installStarted = true;
    runInstall();
  }
}

function updateNextEnabled() {
  if (current === 1) {
    nextBtn.disabled = !agreeCheckbox.checked;
  } else {
    nextBtn.disabled = false;
  }
}

agreeCheckbox.addEventListener('change', updateNextEnabled);

backBtn.addEventListener('click', () => {
  if (current > 0) showStep(current - 1);
});

nextBtn.addEventListener('click', () => {
  if (current < 2) {
    showStep(current + 1);
  } else if (current === 2) {
    showStep(3); // переходим к установке
  }
});

finishBtn.addEventListener('click', async () => {
  finishBtn.disabled = true;
  await window.installerApi.finish();
});

// ---------- Шаг 1: условия ----------
async function loadTerms() {
  const text = await window.installerApi.getTerms();
  termsBox.textContent = text;
}

// ---------- Шаг 2: папка установки ----------
async function initDirectoryStep() {
  defaultPath = await window.installerApi.getDefaultPath();
  defaultPathText.textContent = defaultPath;
}

dirCustomRadio.addEventListener('change', () => {
  if (dirCustomRadio.checked && !customPath) {
    browseBtn.click();
  }
});

browseBtn.addEventListener('click', async () => {
  const chosen = await window.installerApi.chooseDirectory();
  if (chosen) {
    customPath = chosen;
    customPathText.textContent = chosen;
    dirCustomRadio.checked = true;
  } else if (!customPath) {
    dirDefaultRadio.checked = true;
  }
});

// ---------- Шаг 3: установка ----------
window.installerApi.onProgress((data) => {
  installLog.textContent = data.text;
});

async function runInstall() {
  const chosenPath = dirCustomRadio.checked && customPath ? customPath : null;
  const result = await window.installerApi.runSetup(chosenPath);

  installBar.classList.add('done');
  if (result.success) {
    installLog.textContent = 'Установка завершена';
    setTimeout(() => showStep(4), 500);
  } else {
    installLog.textContent = `Ошибка: ${result.error || 'неизвестная ошибка'}. Повторите позже.`;
    // Разрешаем вернуться назад, чтобы попробовать снова
    backBtn.classList.remove('hidden');
  }
}

// ---------- Инициализация ----------
(async () => {
  await Promise.all([loadTerms(), initDirectoryStep()]);
  showStep(0);
})();
