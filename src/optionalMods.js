const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { getAppDataPath, getInstalledOptionalMods, setInstalledOptionalMods } = require('./config');

// Папка с опциональными модами, которая идёт прямо в поставке лаунчера
// (не с GitHub, как основной модпак). Эти моды - в белом списке сервера,
// точно так же, как и моды, синхронизируемые из GitHub-репозитория.
function getOptionalModsDir() {
  return path.join(__dirname, '..', 'mod');
}

function loadManifest(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

// "cool_shaders-v2.zip" -> "Cool Shaders V2" (человекочитаемое имя по умолчанию,
// если для файла не задано имя в manifest.json)
function prettyName(fileName) {
  return fileName
    .replace(/\.zip$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function jarEntriesOf(zip) {
  return zip
    .getEntries()
    .filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.jar'));
}

function findEntry(zip, fileName) {
  return zip
    .getEntries()
    .find((e) => !e.isDirectory && path.basename(e.entryName).toLowerCase() === fileName);
}

// Читает description.txt из корня архива мода (если есть)
function readDescription(zip) {
  const entry = findEntry(zip, 'description.txt');
  if (!entry) return '';
  return entry.getData().toString('utf-8').trim();
}

// Читает mod.png/jpg/jpeg из архива и превращает в data URI для показа в карточке
function readIcon(zip) {
  for (const fileName of ['mod.png', 'mod.jpg', 'mod.jpeg']) {
    const entry = findEntry(zip, fileName);
    if (!entry) continue;
    const ext = path.extname(fileName).slice(1);
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${entry.getData().toString('base64')}`;
  }
  return null;
}

// Список .jar файлов, которые лежат внутри конкретного опционального мода.
// Используется извне (src/mods.js), чтобы не удалять эти файлы при
// синхронизации основного модпака с GitHub.
function getOptionalModJarNames(id) {
  try {
    const zipPath = path.join(getOptionalModsDir(), id);
    if (!fs.existsSync(zipPath)) return [];
    const zip = new AdmZip(zipPath);
    return jarEntriesOf(zip).map((e) => path.basename(e.entryName));
  } catch (err) {
    return [];
  }
}

// Список всех доступных опциональных модов для вкладки "Моды" в UI.
// Описание и иконка берутся прямо из архива мода (description.txt и mod.png
// в корне zip) - manifest.json нужен, только если хочется переопределить
// красивое имя вручную, отдельно заводить его не обязательно.
function listOptionalMods() {
  const dir = getOptionalModsDir();
  if (!fs.existsSync(dir)) return [];

  const manifest = loadManifest(dir);
  const installed = new Set(getInstalledOptionalMods());

  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.zip'))
    .map((file) => {
      const info = manifest[file] || {};
      const zipPath = path.join(dir, file);
      const stat = fs.statSync(zipPath);

      let description = info.description || '';
      let icon = null;
      try {
        const zip = new AdmZip(zipPath);
        if (!description) description = readDescription(zip);
        icon = readIcon(zip);
      } catch (err) {
        // Битый/нечитаемый архив - просто покажем карточку без описания и иконки
      }

      return {
        id: file,
        name: info.name || prettyName(file),
        description,
        icon,
        sizeBytes: stat.size,
        installed: installed.has(file)
      };
    });
}

// Распаковывает .jar файлы мода в папку модов игры и помечает мод как
// установленный (чтобы он не удалялся при следующей синхронизации с GitHub).
function installOptionalMod(id) {
  const dir = getOptionalModsDir();
  const zipPath = path.join(dir, id);
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Мод "${id}" не найден в поставке лаунчера`);
  }

  const modsDir = path.join(getAppDataPath(), 'mods');
  fs.mkdirSync(modsDir, { recursive: true });

  const zip = new AdmZip(zipPath);
  const jarEntries = jarEntriesOf(zip);

  if (!jarEntries.length) {
    throw new Error(`В архиве "${id}" не найдено ни одного .jar файла`);
  }

  for (const entry of jarEntries) {
    const dest = path.join(modsDir, path.basename(entry.entryName));
    fs.writeFileSync(dest, entry.getData());
  }

  const installed = getInstalledOptionalMods();
  if (!installed.includes(id)) {
    installed.push(id);
    setInstalledOptionalMods(installed);
  }

  return { jarFiles: jarEntries.map((e) => path.basename(e.entryName)) };
}

// Удаляет jar-файлы мода из папки игры и убирает его из списка установленных.
function uninstallOptionalMod(id) {
  const modsDir = path.join(getAppDataPath(), 'mods');

  for (const jarName of getOptionalModJarNames(id)) {
    const p = path.join(modsDir, jarName);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const installed = getInstalledOptionalMods().filter((x) => x !== id);
  setInstalledOptionalMods(installed);
}

module.exports = {
  getOptionalModsDir,
  listOptionalMods,
  installOptionalMod,
  uninstallOptionalMod,
  getOptionalModJarNames
};
