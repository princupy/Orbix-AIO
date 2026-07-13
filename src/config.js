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

function parseIdList(value) {
  return String(value)
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

function isBotOwner(userId) {
  return BOT_OWNER_IDS.includes(String(userId));
}

module.exports = {
  BOT_PRESENCE,
  BOT_OWNER_IDS,
  DEFAULT_PREFIX,
  LEVELING_ADMIN_ROLE_IDS,
  isBotOwner,
};
