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
    // minecraft-launcher-core умеет ставить fabric сам через customArgs ниже,
    // но для наглядности формируем custom id так же, как fabric-installer
    customVersion = `fabric-loader-${loaderVersion}-${mcVersion}`;
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
    launcher.launch(opts);

    launcher.on('progress', (e) => {
      onProgress({
        stage: 'downloading',
        text: `Загрузка: ${e.type} (${e.task}/${e.total})`
      });
    });

    launcher.on('close', (code) => {
      onProgress({ stage: 'closed', text: `Minecraft закрыт (код ${code})` });
    });

    launcher.on('data', (line) => {
      onProgress({ stage: 'log', text: String(line) });
    });

    launcher.on('debug', () => {}); // подавляем спам в консоль

    // launch() у minecraft-launcher-core не возвращает промис завершения запуска,
    // считаем что процесс успешно стартовал, когда пошёл первый вывод данных
    let started = false;
    const startTimeout = setTimeout(() => {
      if (!started) resolve();
    }, 8000);

    launcher.once('data', () => {
      started = true;
      clearTimeout(startTimeout);
      resolve();
    });

    launcher.once('error', (err) => {
      clearTimeout(startTimeout);
      reject(err);
    });
  });
}

module.exports = { launchGame };
