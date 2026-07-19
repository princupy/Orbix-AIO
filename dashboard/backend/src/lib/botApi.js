const { env } = require('../env');
const { DISCORD_API } = require('./discord');

const CACHE_TTL_MS = 60_000;
let guildCache = { expiresAt: 0, ids: null };

async function botFetch(path) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { Authorization: `Bot ${env.discord.botToken}` },
  });

  if (!res.ok) {
    throw new Error(`Bot API ${path} failed (${res.status})`);
  }

  return res.json();
}

// Set of guild IDs the bot is in (cached). Note: /users/@me/guilds returns up
// to 200 guilds; add pagination here if the bot ever exceeds that.
async function getBotGuildIds() {
  if (guildCache.ids && guildCache.expiresAt > Date.now()) {
    return guildCache.ids;
  }

  const guilds = await botFetch('/users/@me/guilds');
  guildCache = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    ids: new Set(guilds.map((guild) => guild.id)),
  };

  return guildCache.ids;
}

module.exports = { botFetch, getBotGuildIds };
