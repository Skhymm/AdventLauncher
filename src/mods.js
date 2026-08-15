const fs = require('fs');
const path = require('path');
const { loadConfig, getAppDataPath } = require('./config');

// Node 18+/Electron имеет встроенный fetch
async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'royal-mmorpg-launcher' }
  });
  if (!res.ok) throw new Error(`GitHub API ошибка ${res.status} на ${url}`);
  return res.json();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': 'royal-mmorpg-launcher' } });
  if (!res.ok) throw new Error(`Не удалось скачать ${url} (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

// Узнаёт размер файла на сервере без скачивания (HEAD-запрос, Content-Length).
// Если сервер не отдаёт Content-Length (бывает у некоторых CDN) - возвращает null,
// и тогда мы просто не будем переустанавливать мод "по размеру" (но по имени - будем).
async function getRemoteSize(url) {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'royal-mmorpg-launcher' }
    });
    if (!res.ok) return null;
    const len = res.headers.get('content-length');
    return len ? parseInt(len, 10) : null;
  } catch (err) {
    return null;
  }
}

function getLocalSize(destPath) {
  try {
    return fs.statSync(destPath).size;
  } catch (err) {
    return null;
  }
}

// Пытается получить modpack.json из репозитория (список модов + версия/лоадер).
// Если файла нет — просто берёт .jar файлы из latest release.
async function getManifest(cfg) {
  const { owner, repo } = cfg.github.modpackRepo;
  const manifestFile = cfg.github.manifestFile;

  try {
    const raw = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/contents/${manifestFile}`
    );
    const content = Buffer.from(raw.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (err) {
    return null; // манифеста нет — работаем по релизам
  }
}

async function syncModpack(onProgress) {
  const cfg = loadConfig();
  const { owner, repo } = cfg.github.modpackRepo;
  const modsDir = path.join(getAppDataPath(), 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  onProgress({ stage: 'mods', text: 'Получение списка модов...' });

  const manifest = await getManifest(cfg);

  let modsToDownload = [];

  if (manifest && Array.isArray(manifest.mods)) {
    // Список модов задан явно: [{ name, url, size? }]
    // Поле size опционально - если задано в modpack.json, не придётся делать
    // лишний HEAD-запрос на каждый мод.
    modsToDownload = manifest.mods;
  } else {
    // Fallback: берём все .jar из последнего релиза репозитория.
    // GitHub API сразу отдаёт размер каждого asset - используем его.
    const release = await fetchJson(
      `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    );
    modsToDownload = (release.assets || [])
      .filter((a) => a.name.endsWith('.jar'))
      .map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size }));
  }

  // Удаляем моды, которых больше нет в списке (чтобы не копились старые версии)
  const wanted = new Set(modsToDownload.map((m) => m.name));
  for (const existing of fs.readdirSync(modsDir)) {
    if (!wanted.has(existing)) {
      fs.unlinkSync(path.join(modsDir, existing));
    }
  }

  let done = 0;
  for (const mod of modsToDownload) {
    const dest = path.join(modsDir, mod.name);
    const total = modsToDownload.length;

    if (!fs.existsSync(dest)) {
      // Мода ещё нет локально - обычная установка
      onProgress({
        stage: 'mods',
        text: `Скачивание мода: ${mod.name} (${done + 1}/${total})`
      });
      await downloadFile(mod.url, dest);
    } else {
      // Мод уже есть - проверяем, не отличается ли он от версии на GitHub.
      // Размер берём из манифеста/API, если он там есть, иначе делаем HEAD-запрос.
      onProgress({
        stage: 'mods',
        text: `Проверка мода: ${mod.name} (${done + 1}/${total})`
      });

      const remoteSize = typeof mod.size === 'number' ? mod.size : await getRemoteSize(mod.url);
      const localSize = getLocalSize(dest);

      if (remoteSize !== null && localSize !== remoteSize) {
        onProgress({
          stage: 'mods',
          text: `Обновление мода: ${mod.name} (${done + 1}/${total})`
        });
        fs.unlinkSync(dest);
        await downloadFile(mod.url, dest);
      }
      // Если remoteSize === null (сервер не отдал Content-Length) - оставляем
      // локальный файл как есть, чтобы не перекачивать моды впустую.
    }

    done++;
  }

  onProgress({ stage: 'mods', text: 'Моды обновлены' });

  return {
    version: manifest?.version || cfg.minecraft.version,
    modLoader: manifest?.modLoader || cfg.minecraft.modLoader,
    loaderVersion: manifest?.loaderVersion || cfg.minecraft.loaderVersion
  };
}

module.exports = { syncModpack, getManifest };
