require('dotenv').config({ quiet: true });

const DEFAULT_PREFIX = process.env.DEFAULT_PREFIX?.trim() || 'LR!';
const BOT_OWNER_IDS = parseIdList(
  process.env.BOT_OWNER_IDS
    || process.env.BOT_OWNER_ID
    || process.env.OWNER_IDS
    || process.env.OWNER_ID
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
  BOT_OWNER_IDS,
  DEFAULT_PREFIX,
  isBotOwner,
};
