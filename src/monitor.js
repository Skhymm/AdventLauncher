const { status } = require('minecraft-server-util');
const { loadConfig } = require('./config');

async function pingServer() {
  const cfg = loadConfig();
  const result = await status(cfg.server.ip, cfg.server.port, { timeout: 4000 });

  return {
    online: true,
    players: result.players.online,
    max: result.players.max
  };
}

module.exports = { pingServer };
