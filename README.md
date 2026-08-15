# Royal MMORPG Launcher

Офлайн-лаунчер на Electron: моды и версия игры подтягиваются с GitHub, онлайн сервера — через ping (`minecraft-server-util`).

## 1. Установка (нужен Node.js 18+)

```bash
npm install
npm start
```

## 2. Сборка в .exe

```bash
npm run dist:win
```
Файлы появятся в папке `dist/` — установщик (`.exe` nsis) и портативная версия.

## 3. Настройка под свой сервер — файл `config.json`

```jsonc
{
  "server": { "ip": "play.вашсервер.ru", "port": 25565 }, // для счётчика онлайна
  "minecraft": { "version": "1.21.1", "modLoader": "fabric", "loaderVersion": "latest" },
  "github": {
    "modpackRepo": { "owner": "ваш-ник", "repo": "названиерепо" }
  }
}
```

## 4. Как класть моды на GitHub — два варианта

**Вариант А (просто):** заливайте `.jar` файлы модов в Releases репозитория `modpackRepo` (последний релиз = "latest"). Лаунчер сам их скачает в `mods/`, а лишние (удалённые из релиза) — удалит на клиенте.

**Вариант Б (гибко):** добавьте в репозиторий файл `modpack.json`:
```json
{
  "version": "1.21.1",
  "modLoader": "fabric",
  "loaderVersion": "0.15.11",
  "mods": [
    { "name": "fabric-api.jar", "url": "https://github.com/.../fabric-api.jar" },
    { "name": "sodium.jar", "url": "https://github.com/.../sodium.jar" }
  ]
}
```
Так вы управляете версией игры/лоадера и точным списком модов без релизов.

## 5. Структура проекта

```
main.js          — Electron main-процесс, IPC
preload.js        — безопасный мост в renderer
config.json        — сервер, GitHub, папка данных
src/config.js       — путь %Appdata%/.royalmmorpg
src/mods.js         — скачивание/синхронизация модов с GitHub
src/minecraft.js      — установка Fabric + запуск игры (minecraft-launcher-core)
src/monitor.js       — пинг сервера (онлайн игроков)
renderer/           — интерфейс (index.html, style.css, app.js)
```

## 6. Важно про офлайн-режим

Игра запускается через встроенный офлайн-режим Minecraft (фейковый UUID/токен) — это штатная возможность самого клиента для локальной игры, взлома не требует. Если нужен полноценный вход через купленные лицензии — можно добавить авторизацию Microsoft OAuth (спросите отдельно, это дополнительный модуль).

## 7. Дальнейшие улучшения (по желанию)
- Автообновление самого лаунчера через `electron-updater`
- Отдельная кнопка "Обновить моды" без запуска игры
- Прогресс-бар скачивания вместо текстового лога
- Кастомная иконка окна/трея (`renderer/assets/icon.ico`)
