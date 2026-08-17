const fs = require('fs');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { loadConfig, getAppDataPath, getRamSettings } = require('./config');

const FABRIC_META = 'https://meta.fabricmc.net/v2/versions/loader';

// Никнейм: только латиница, цифры и "_" (3-16 символов) - как требует
// протокол Minecraft для offline-режима. Проверяем ещё раз здесь на
// случай, если launchGame вызван напрямую, минуя IPC-хендлер в main.js.
const NICK_REGEX = /^[A-Za-z0-9_]{3,16}$/;

// Флаги JVM для оптимизации запуска и работы Minecraft (основаны на
// проверенных "Aikar's flags", широко используемых в клиентских и
// серверных сборках для снижения фризов от сборки мусора G1GC).
const OPTIMIZED_JVM_ARGS = [
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:MaxGCPauseMillis=200',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:G1NewSizePercent=30',
  '-XX:G1MaxNewSizePercent=40',
  '-XX:G1HeapRegionSize=8M',
  '-XX:G1ReservePercent=20',
  '-XX:G1HeapWastePercent=5',
  '-XX:G1MixedGCCountTarget=4',
  '-XX:InitiatingHeapOccupancyPercent=15',
  '-XX:G1MixedGCLiveThresholdPercent=90',
  '-XX:G1RSetUpdatingPauseTimePercent=5',
  '-XX:SurvivorRatio=32',
  '-XX:+PerfDisableSharedMem',
  '-XX:MaxTenuringThreshold=1'
];

async function resolveFabricLoaderVersion(mcVersion, requested) {
  if (requested && requested !== 'latest') return requested;
  const res = await fetch(`${FABRIC_META}/${mcVersion}`);
  const loaders = await res.json();
  if (!loaders.length) throw new Error(`Fabric не поддерживает версию ${mcVersion}`);
  return loaders[0].loader.version;
}

// minecraft-launcher-core НЕ умеет само ставить Fabric - оно лишь запускает уже
// готовую версию, если для неё есть JSON-профиль в папке versions/. Раньше
// код просто угадывал имя версии (fabric-loader-X-Y) и передавал его в custom,
// из-за чего запуск "успешно завершался" (по таймауту/первому логу), хотя
// реального fabric-профиля на диске не существовало, и Minecraft не стартовал.
// Здесь мы реально скачиваем готовый профиль с официального Fabric Meta API
// и кладём его в versions/<id>/<id>.json, как это делает штатный fabric-installer.
async function ensureFabricProfile(mcVersion, loaderVersion, root) {
  const id = `fabric-loader-${loaderVersion}-${mcVersion}`;
  const versionDir = path.join(root, 'versions', id);
  const jsonPath = path.join(versionDir, `${id}.json`);

  if (fs.existsSync(jsonPath)) return id;

  const url = `${FABRIC_META}/${mcVersion}/${loaderVersion}/profile/json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Не удалось получить профиль Fabric (${res.status}) для ${mcVersion}/${loaderVersion}`);
  }
  const profile = await res.json();

  fs.mkdirSync(versionDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(profile, null, 2), 'utf-8');

  return id;
}

async function launchGame(username, onProgress) {
  if (!NICK_REGEX.test(String(username || ''))) {
    throw new Error('Никнейм может содержать только латинские буквы, цифры и "_" (3-16 символов)');
  }

  const cfg = loadConfig();
  const root = getAppDataPath();
  const launcher = new Client();
  const ram = getRamSettings();

  const mcVersion = cfg.minecraft.version;
  const modLoader = cfg.minecraft.modLoader;

  let customVersion;
  if (modLoader === 'fabric') {
    onProgress({ stage: 'launching', text: 'Проверка версии Fabric...' });
    const loaderVersion = await resolveFabricLoaderVersion(
      mcVersion,
      cfg.minecraft.loaderVersion
    );
    onProgress({ stage: 'launching', text: 'Установка профиля Fabric...' });
    customVersion = await ensureFabricProfile(mcVersion, loaderVersion, root);
  }

  const auth = Authenticator.getAuth(username);

  const opts = {
    authorization: auth,
    root,
    version: {
      number: mcVersion,
      type: 'release',
      custom: customVersion
    },
    memory: {
      min: `${ram.min}G`,
      max: `${ram.max}G`
    },
    customArgs: OPTIMIZED_JVM_ARGS,
    server: {
      host: cfg.server.ip,
      port: String(cfg.server.port)
    }
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let closedEarly = false;

    launcher.launch(opts);

    launcher.on('progress', (e) => {
      onProgress({
        stage: 'downloading',
        text: `Загрузка: ${e.type} (${e.task}/${e.total})`
      });
    });

    launcher.on('close', (code) => {
      onProgress({ stage: 'closed', text: `Minecraft закрыт (код ${code})` });
      // Если процесс закрылся ДО того, как мы успели зарезолвить запуск -
      // это провал старта (упал java/креш при инициализации), а не нормальный выход.
      if (!settled) {
        closedEarly = true;
        settled = true;
        reject(new Error(`Minecraft закрылся сразу после запуска (код ${code}). Смотрите лог выше.`));
      }
    });

    launcher.on('data', (line) => {
      onProgress({ stage: 'log', text: String(line) });
    });

    // Раньше debug-события подавлялись, из-за чего реальная причина сбоя
    // запуска (например, не найдена Java, битые файлы и т.п.) была не видна.
    launcher.on('debug', (line) => {
      onProgress({ stage: 'log', text: String(line) });
    });

    // launch() у minecraft-launcher-core не возвращает промис завершения запуска.
    // Считаем, что процесс успешно стартовал, только когда реально пошли данные
    // от java-процесса (не по таймауту "на всякий случай" - это скрывало реальные сбои).
    launcher.once('data', () => {
      if (settled) return;
      settled = true;
      resolve();
    });

    launcher.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });

    // Подстраховка: если вообще ничего не происходит (ни data, ни close, ни error)
    // за 30 секунд - значит процесс завис на старте (например, скачивание файлов).
    setTimeout(() => {
      if (!settled && !closedEarly) {
        settled = true;
        reject(new Error('Minecraft не подал признаков жизни за 30 секунд. Проверьте, установлена ли Java, и посмотрите лог.'));
      }
    }, 30000);
  });
}

module.exports = { launchGame };
