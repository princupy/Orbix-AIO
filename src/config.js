require('dotenv').config({ quiet: true });

const DEFAULT_PREFIX = process.env.DEFAULT_PREFIX?.trim() || 'LR!';
const BOT_PRESENCE = {
  activityText: 'discord.gg/thelastridee',
  activityType: 'Watching',
  status: 'online',
};
const BOT_OWNER_IDS = parseIdList(
  process.env.BOT_OWNER_IDS
    || process.env.BOT_OWNER_ID
    || process.env.OWNER_IDS
    || process.env.OWNER_ID
    || '',
);
const LEVELING_ADMIN_ROLE_IDS = parseIdList(
  process.env.LEVELING_ADMIN_ROLE_IDS
    || process.env.LEVEL_ADMIN_ROLE_IDS
    || '',
);
const LAVALINK = Object.freeze({
  host: process.env.LAVALINK_HOST?.trim() || 'lavalinkv4.serenetia.com',
  name: process.env.LAVALINK_NODE_NAME?.trim() || 'Orbix Public Lavalink',
  password: process.env.LAVALINK_PASSWORD?.trim() || 'https://seretia.link/discord',
  port: parsePort(process.env.LAVALINK_PORT, 443),
  secure: parseBoolean(process.env.LAVALINK_SECURE, true, 'LAVALINK_SECURE'),
});

function parseIdList(value) {
  return String(value)
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback, name = 'boolean setting') {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid ${name}: expected true/false, received "${value}".`);
}

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : fallback;
}

function isBotOwner(userId) {
  return BOT_OWNER_IDS.includes(String(userId));
}

module.exports = {
  BOT_PRESENCE,
  BOT_OWNER_IDS,
  DEFAULT_PREFIX,
  LAVALINK,
  LEVELING_ADMIN_ROLE_IDS,
  isBotOwner,
};
