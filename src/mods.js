const fs = require('fs');
const path = require('path');
const { loadConfig, getAppDataPath, getInstalledOptionalMods } = require('./config');
const { getOptionalModJarNames } = require('./optionalMods');

// Node 18+/Electron имеет встроенный fetch
async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'adventmc-launcher' }
  });
  if (!res.ok) throw new Error(`GitHub API ошибка ${res.status} на ${url}`);
  return res.json();
}

async function downloadFile(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': 'adventmc-launcher' } });
  if (!res.ok) throw new Error(`Не удалось скачать ${url} (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

function getLocalSize(destPath) {
  try {
    return fs.statSync(destPath).size;
  } catch (err) {
    return null;
  }
}

// Берёт список файлов из папки репозитория (GitHub Contents API) и отбирает
// только .jar. GitHub сразу отдаёт download_url и size для каждого файла,
// так что отдельный HEAD-запрос на каждый мод не нужен.
async function listJarsFromRepo(cfg) {
  const { owner, repo, branch } = cfg.github.modpackRepo;
  const folder = cfg.github.modsFolder || '';

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${folder}` +
    (branch ? `?ref=${encodeURIComponent(branch)}` : '');

  const items = await fetchJson(url);

  if (!Array.isArray(items)) {
    throw new Error(
      `Ожидался список файлов из GitHub, но пришло что-то другое. Проверь owner/repo/modsFolder в config.json`
    );
  }

  return items
    .filter((item) => item.type === 'file' && item.name.endsWith('.jar'))
    .map((item) => ({ name: item.name, url: item.download_url, size: item.size }));
}

async function syncModpack(onProgress) {
  const cfg = loadConfig();
  const modsDir = path.join(getAppDataPath(), 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  onProgress({ stage: 'mods', text: 'Получение списка модов...' });

  const modsToDownload = await listJarsFromRepo(cfg);

  // Удаляем моды, которых больше нет в репозитории (чтобы не копились старые версии).
  // Файлы модов, установленных вручную из вкладки "Моды" (папка mod/ в поставке
  // лаунчера, не GitHub) - не трогаем, иначе они пропадали бы при каждом запуске.
  const wanted = new Set(modsToDownload.map((m) => m.name));
  for (const optionalId of getInstalledOptionalMods()) {
    for (const jarName of getOptionalModJarNames(optionalId)) {
      wanted.add(jarName);
    }
  }
  for (const existing of fs.readdirSync(modsDir)) {
    if (!wanted.has(existing)) {
      fs.unlinkSync(path.join(modsDir, existing));
    }
  }

  let done = 0;
  const total = modsToDownload.length;

  for (const mod of modsToDownload) {
    const dest = path.join(modsDir, mod.name);

    if (!fs.existsSync(dest)) {
      // Мода ещё нет локально - обычная установка
      onProgress({
        stage: 'mods',
        text: `Скачивание мода: ${mod.name} (${done + 1}/${total})`
      });
      await downloadFile(mod.url, dest);
    } else {
      // Мод уже есть - сверяем размер с тем, что отдал GitHub API.
      const localSize = getLocalSize(dest);

      if (typeof mod.size === 'number' && localSize !== mod.size) {
        onProgress({
          stage: 'mods',
          text: `Обновление мода: ${mod.name} (${done + 1}/${total})`
        });
        fs.unlinkSync(dest);
        await downloadFile(mod.url, dest);
      }
    }

    done++;
  }

  onProgress({ stage: 'mods', text: 'Моды обновлены' });

  return {
    version: cfg.minecraft.version,
    modLoader: cfg.minecraft.modLoader,
    loaderVersion: cfg.minecraft.loaderVersion
  };
}

module.exports = { syncModpack };
