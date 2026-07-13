const { getSupabase } = require('./client');

const CACHE_TTL_MS = 60_000;
const LEADERBOARD_PAGE_SIZE = 10;

const DEFAULT_LEVEL_CONFIG = Object.freeze({
  leveling_enabled: true,
  xp_min: 15,
  xp_max: 25,
  cooldown_seconds: 60,
  levelup_channel_id: null,
  levelup_message: '{mention} reached level {level}!',
  levelup_enabled: true,
  stack_roles: true,
});

const configCache = new Map();
const blacklistCache = new Map();
const multiplierCache = new Map();
const levelRoleCache = new Map();

function cacheKey(...parts) {
  return parts.map(String).join(':');
}

function getCached(map, key) {
  const cached = map.get(key);

  if (!cached || cached.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(map, key, value) {
  map.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function clearLevelingCache(guildId) {
  if (!guildId) {
    configCache.clear();
    blacklistCache.clear();
    multiplierCache.clear();
    levelRoleCache.clear();
    return;
  }

  configCache.delete(String(guildId));
  multiplierCache.delete(String(guildId));
  levelRoleCache.delete(String(guildId));
  blacklistCache.delete(cacheKey(guildId, 'channel'));
  blacklistCache.delete(cacheKey(guildId, 'role'));
}

function getStorageError() {
  return {
    ok: false,
    reason: 'Supabase is not configured.',
  };
}

function normalizeConfig(row = {}) {
  const config = {
    ...DEFAULT_LEVEL_CONFIG,
    ...row,
  };
  const xpMin = Math.max(1, Number(config.xp_min) || DEFAULT_LEVEL_CONFIG.xp_min);
  const xpMax = Math.max(xpMin, Number(config.xp_max) || DEFAULT_LEVEL_CONFIG.xp_max);

  return {
    ...config,
    xp_min: xpMin,
    xp_max: xpMax,
    cooldown_seconds: Math.max(0, Number(config.cooldown_seconds) || 0),
    stack_roles: Boolean(config.stack_roles),
    leveling_enabled: Boolean(config.leveling_enabled),
    levelup_enabled: Boolean(config.levelup_enabled),
    levelup_channel_id: config.levelup_channel_id || null,
    levelup_message: config.levelup_message || DEFAULT_LEVEL_CONFIG.levelup_message,
  };
}

function defaultUserLevel(guildId, userId) {
  return {
    guild_id: String(guildId),
    user_id: String(userId),
    xp: 0,
    level: 0,
    total_messages: 0,
    last_xp_timestamp: null,
  };
}

function xpNeededForNextLevel(level) {
  const safeLevel = Math.max(0, Number(level) || 0);
  return (5 * (safeLevel ** 2)) + (50 * safeLevel) + 100;
}

function totalXpForLevel(level) {
  const safeLevel = Math.max(0, Math.floor(Number(level) || 0));
  let total = 0;

  for (let currentLevel = 0; currentLevel < safeLevel; currentLevel += 1) {
    total += xpNeededForNextLevel(currentLevel);
  }

  return total;
}

function calculateLevelFromXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 0;
  let remaining = safeXp;

  while (remaining >= xpNeededForNextLevel(level)) {
    remaining -= xpNeededForNextLevel(level);
    level += 1;
  }

  return level;
}

function getLevelProgress(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  const level = calculateLevelFromXp(safeXp);
  const levelStartXp = totalXpForLevel(level);
  const currentXp = safeXp - levelStartXp;
  const neededXp = xpNeededForNextLevel(level);

  return {
    currentXp,
    level,
    levelStartXp,
    neededXp,
    percent: neededXp > 0 ? currentXp / neededXp : 0,
    remainingXp: Math.max(0, neededXp - currentXp),
  };
}

async function getLevelConfig(guildId) {
  const key = String(guildId);
  const cached = getCached(configCache, key);

  if (cached) {
    return {
      ok: true,
      config: cached,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      config: normalizeConfig(),
    };
  }

  const { data, error } = await supabase
    .from('level_config')
    .select('*')
    .eq('guild_id', key)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      config: normalizeConfig(),
      reason: error.message,
    };
  }

  const config = normalizeConfig(data || {});
  setCached(configCache, key, config);

  return {
    ok: true,
    config,
  };
}

async function updateLevelConfig(guildId, patch) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const current = await getLevelConfig(guildId);
  const nextConfig = normalizeConfig({
    ...(current.config || DEFAULT_LEVEL_CONFIG),
    ...patch,
  });

  const { error } = await supabase
    .from('level_config')
    .upsert({
      guild_id: String(guildId),
      ...nextConfig,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'guild_id',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  setCached(configCache, String(guildId), nextConfig);

  return {
    ok: true,
    config: nextConfig,
  };
}

async function getUserLevel(guildId, userId) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      user: defaultUserLevel(guildId, userId),
    };
  }

  const { data, error } = await supabase
    .from('levels')
    .select('*')
    .eq('guild_id', String(guildId))
    .eq('user_id', String(userId))
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      reason: error.message,
      user: defaultUserLevel(guildId, userId),
    };
  }

  return {
    ok: true,
    user: data || defaultUserLevel(guildId, userId),
  };
}

async function saveUserLevel(user) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const xp = Math.max(0, Math.floor(Number(user.xp) || 0));
  const level = calculateLevelFromXp(xp);
  const row = {
    guild_id: String(user.guild_id),
    user_id: String(user.user_id),
    xp,
    level,
    total_messages: Math.max(0, Math.floor(Number(user.total_messages) || 0)),
    last_xp_timestamp: user.last_xp_timestamp || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('levels')
    .upsert(row, {
      onConflict: 'guild_id,user_id',
    })
    .select('*')
    .single();

  if (error) {
    return {
      ok: false,
      reason: error.message,
      user: row,
    };
  }

  return {
    ok: true,
    user: data || row,
  };
}

async function addXpToUser({
  guildId,
  userId,
  amount,
  countMessage = false,
  touchCooldown = false,
}) {
  const current = await getUserLevel(guildId, userId);

  if (!current.ok) {
    return current;
  }

  const before = current.user;
  const xpAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const afterXp = Math.max(0, Number(before.xp || 0) + xpAmount);
  const saved = await saveUserLevel({
    ...before,
    xp: afterXp,
    total_messages: Number(before.total_messages || 0) + (countMessage ? 1 : 0),
    last_xp_timestamp: touchCooldown ? new Date().toISOString() : before.last_xp_timestamp,
  });

  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    addedXp: xpAmount,
    after: saved.user,
    before,
    leveledUp: Number(saved.user.level || 0) > Number(before.level || 0),
  };
}

async function removeXpFromUser({ guildId, userId, amount }) {
  const current = await getUserLevel(guildId, userId);

  if (!current.ok) {
    return current;
  }

  const before = current.user;
  const xpAmount = Math.max(0, Math.floor(Number(amount) || 0));
  const saved = await saveUserLevel({
    ...before,
    xp: Math.max(0, Number(before.xp || 0) - xpAmount),
  });

  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    removedXp: xpAmount,
    after: saved.user,
    before,
  };
}

async function setUserLevel({ guildId, userId, level }) {
  const current = await getUserLevel(guildId, userId);

  if (!current.ok) {
    return current;
  }

  const targetLevel = Math.max(0, Math.floor(Number(level) || 0));
  const saved = await saveUserLevel({
    ...current.user,
    xp: totalXpForLevel(targetLevel),
  });

  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    after: saved.user,
    before: current.user,
  };
}

async function resetUserLevel(guildId, userId) {
  const current = await getUserLevel(guildId, userId);

  if (!current.ok) {
    return current;
  }

  const saved = await saveUserLevel({
    ...defaultUserLevel(guildId, userId),
    last_xp_timestamp: null,
  });

  if (!saved.ok) {
    return saved;
  }

  return {
    ok: true,
    after: saved.user,
    before: current.user,
  };
}

async function resetGuildLevels(guildId) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('levels')
    .delete()
    .eq('guild_id', String(guildId));

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  const { error: notificationError } = await supabase
    .from('level_notifications')
    .delete()
    .eq('guild_id', String(guildId));

  if (notificationError && !['42P01', 'PGRST205'].includes(notificationError.code)) {
    return {
      ok: false,
      reason: notificationError.message,
    };
  }

  return {
    ok: true,
  };
}

async function markLevelUpNotified({ guildId, level, userId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      notified: true,
      reason: 'Supabase is not configured.',
    };
  }

  const targetLevel = Math.max(1, Math.floor(Number(level) || 0));
  const { error } = await supabase
    .from('level_notifications')
    .insert({
      guild_id: String(guildId),
      user_id: String(userId),
      level: targetLevel,
    });

  if (!error) {
    return {
      ok: true,
      notified: true,
    };
  }

  if (error.code === '23505') {
    return {
      ok: true,
      notified: false,
    };
  }

  return {
    ok: false,
    notified: true,
    reason: error.message,
  };
}

async function getLeaderboard(guildId, page = 1, pageSize = LEADERBOARD_PAGE_SIZE) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      rows: [],
      total: 0,
    };
  }

  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeSize = Math.max(1, Math.min(25, Math.floor(Number(pageSize) || LEADERBOARD_PAGE_SIZE)));
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;
  const { data, error, count } = await supabase
    .from('levels')
    .select('user_id, xp, level, total_messages', { count: 'exact' })
    .eq('guild_id', String(guildId))
    .gt('xp', 0)
    .order('xp', { ascending: false })
    .order('total_messages', { ascending: false })
    .range(from, to);

  if (error) {
    return {
      ok: false,
      reason: error.message,
      rows: [],
      total: 0,
    };
  }

  return {
    ok: true,
    page: safePage,
    pageSize: safeSize,
    rows: data || [],
    total: count || 0,
    totalPages: Math.max(1, Math.ceil((count || 0) / safeSize)),
  };
}

async function getRankPosition(guildId, userId) {
  const userResult = await getUserLevel(guildId, userId);

  if (!userResult.ok) {
    return {
      ok: false,
      position: null,
      reason: userResult.reason,
    };
  }

  if (Number(userResult.user.xp || 0) <= 0) {
    return {
      ok: true,
      position: null,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      position: null,
    };
  }

  const { error, count } = await supabase
    .from('levels')
    .select('user_id', { count: 'exact', head: true })
    .eq('guild_id', String(guildId))
    .gt('xp', Number(userResult.user.xp || 0));

  if (error) {
    return {
      ok: false,
      position: null,
      reason: error.message,
    };
  }

  return {
    ok: true,
    position: (count || 0) + 1,
  };
}

async function listBlacklist(guildId, type) {
  const key = cacheKey(guildId, type);
  const cached = getCached(blacklistCache, key);

  if (cached) {
    return {
      ok: true,
      targets: cached,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      targets: [],
    };
  }

  const { data, error } = await supabase
    .from('blacklist')
    .select('target_id, created_at')
    .eq('guild_id', String(guildId))
    .eq('type', String(type))
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      reason: error.message,
      targets: [],
    };
  }

  const targets = data || [];
  setCached(blacklistCache, key, targets);

  return {
    ok: true,
    targets,
  };
}

async function addBlacklistTarget({ guildId, type, targetId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('blacklist')
    .upsert({
      guild_id: String(guildId),
      type: String(type),
      target_id: String(targetId),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'guild_id,type,target_id',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  blacklistCache.delete(cacheKey(guildId, type));

  return {
    ok: true,
  };
}

async function removeBlacklistTarget({ guildId, type, targetId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('blacklist')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('type', String(type))
    .eq('target_id', String(targetId));

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  blacklistCache.delete(cacheKey(guildId, type));

  return {
    ok: true,
  };
}

async function listMultipliers(guildId) {
  const key = String(guildId);
  const cached = getCached(multiplierCache, key);

  if (cached) {
    return {
      ok: true,
      multipliers: cached,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      multipliers: [],
    };
  }

  const { data, error } = await supabase
    .from('multipliers')
    .select('role_id, multiplier, created_at')
    .eq('guild_id', key)
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      reason: error.message,
      multipliers: [],
    };
  }

  const multipliers = data || [];
  setCached(multiplierCache, key, multipliers);

  return {
    ok: true,
    multipliers,
  };
}

async function setMultiplier({ guildId, roleId, multiplier }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const value = Math.max(0.01, Math.min(100, Number(multiplier) || 1));
  const { error } = await supabase
    .from('multipliers')
    .upsert({
      guild_id: String(guildId),
      role_id: String(roleId),
      multiplier: value,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'guild_id,role_id',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  multiplierCache.delete(String(guildId));

  return {
    ok: true,
    multiplier: value,
  };
}

async function removeMultiplier({ guildId, roleId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('multipliers')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('role_id', String(roleId));

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  multiplierCache.delete(String(guildId));

  return {
    ok: true,
  };
}

async function listLevelRoles(guildId) {
  const key = String(guildId);
  const cached = getCached(levelRoleCache, key);

  if (cached) {
    return {
      ok: true,
      roles: cached,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      roles: [],
    };
  }

  const { data, error } = await supabase
    .from('level_roles')
    .select('level, role_id, created_at')
    .eq('guild_id', key)
    .order('level', { ascending: true });

  if (error) {
    return {
      ok: false,
      reason: error.message,
      roles: [],
    };
  }

  const roles = data || [];
  setCached(levelRoleCache, key, roles);

  return {
    ok: true,
    roles,
  };
}

async function setLevelRole({ guildId, level, roleId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const targetLevel = Math.max(1, Math.floor(Number(level) || 0));
  const { error } = await supabase
    .from('level_roles')
    .upsert({
      guild_id: String(guildId),
      level: targetLevel,
      role_id: String(roleId),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'guild_id,level',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  levelRoleCache.delete(String(guildId));

  return {
    ok: true,
    level: targetLevel,
  };
}

async function removeLevelRole({ guildId, level }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const targetLevel = Math.max(1, Math.floor(Number(level) || 0));
  const { error } = await supabase
    .from('level_roles')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('level', targetLevel);

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  levelRoleCache.delete(String(guildId));

  return {
    ok: true,
    level: targetLevel,
  };
}

async function resetLevelingData(guildId) {
  const supabase = getSupabase();
  clearLevelingCache(guildId);

  if (!supabase) {
    return getStorageError();
  }

  const tables = ['levels', 'level_config', 'level_notifications', 'level_roles', 'blacklist', 'multipliers'];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('guild_id', String(guildId));

    if (error) {
      return {
        ok: false,
        reason: error.message,
      };
    }
  }

  return {
    ok: true,
  };
}

async function cleanupLeftLevelingData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      removed: 0,
    };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));
  const tables = ['levels', 'level_config', 'level_notifications', 'level_roles', 'blacklist', 'multipliers'];
  const staleGuildIds = new Set();

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('guild_id');

    if (error) {
      return {
        ok: false,
        removed: 0,
        reason: error.message,
      };
    }

    for (const row of data || []) {
      if (!activeGuildSet.has(String(row.guild_id))) {
        staleGuildIds.add(String(row.guild_id));
      }
    }
  }

  if (staleGuildIds.size === 0) {
    return {
      ok: true,
      removed: 0,
    };
  }

  const staleIds = [...staleGuildIds];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .in('guild_id', staleIds);

    if (error) {
      return {
        ok: false,
        removed: 0,
        reason: error.message,
      };
    }
  }

  for (const guildId of staleIds) {
    clearLevelingCache(guildId);
  }

  return {
    ok: true,
    removed: staleIds.length,
  };
}

module.exports = {
  DEFAULT_LEVEL_CONFIG,
  LEADERBOARD_PAGE_SIZE,
  addBlacklistTarget,
  addXpToUser,
  calculateLevelFromXp,
  cleanupLeftLevelingData,
  clearLevelingCache,
  getLeaderboard,
  getLevelConfig,
  getLevelProgress,
  getRankPosition,
  getUserLevel,
  listBlacklist,
  listLevelRoles,
  listMultipliers,
  markLevelUpNotified,
  removeBlacklistTarget,
  removeLevelRole,
  removeMultiplier,
  removeXpFromUser,
  resetGuildLevels,
  resetLevelingData,
  resetUserLevel,
  saveUserLevel,
  setLevelRole,
  setMultiplier,
  setUserLevel,
  totalXpForLevel,
  updateLevelConfig,
  xpNeededForNextLevel,
};
