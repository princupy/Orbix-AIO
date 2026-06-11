// ─── In-memory AFK store ───────────────────────────────────────────
// Key: `${guildId}:${userId}` → { userId, guildId, reason, timestamp }

const afkUsers = new Map();

function buildKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Set a user as AFK.
 * @param {string} guildId
 * @param {string} userId
 * @param {string} reason
 */
function setAfk(guildId, userId, reason = 'AFK') {
  afkUsers.set(buildKey(guildId, userId), {
    userId,
    guildId,
    reason,
    timestamp: Date.now(),
  });
}

/**
 * Get AFK entry for a user in a guild, or null if not AFK.
 * @param {string} guildId
 * @param {string} userId
 * @returns {{ userId: string, guildId: string, reason: string, timestamp: number } | null}
 */
function getAfk(guildId, userId) {
  return afkUsers.get(buildKey(guildId, userId)) || null;
}

/**
 * Remove AFK status for a user in a guild.
 * Returns the old entry if they were AFK, or null.
 * @param {string} guildId
 * @param {string} userId
 * @returns {{ userId: string, guildId: string, reason: string, timestamp: number } | null}
 */
function removeAfk(guildId, userId) {
  const key = buildKey(guildId, userId);
  const entry = afkUsers.get(key) || null;

  if (entry) {
    afkUsers.delete(key);
  }

  return entry;
}

/**
 * Check if a user is AFK in a guild.
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean}
 */
function isAfk(guildId, userId) {
  return afkUsers.has(buildKey(guildId, userId));
}

module.exports = {
  getAfk,
  isAfk,
  removeAfk,
  setAfk,
};
