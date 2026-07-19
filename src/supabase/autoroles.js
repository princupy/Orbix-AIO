const { getSupabase } = require('./client');

const CACHE_TTL_MS = 30_000;

// Maps a user-facing category to its DB column / config key.
const CATEGORY_COLUMNS = {
  all: 'all_role_ids',
  bots: 'bot_role_ids',
  humans: 'human_role_ids',
};

const ROLE_COLUMNS = Object.values(CATEGORY_COLUMNS);

const DEFAULT_AUTOROLE_CONFIG = Object.freeze({
  all_role_ids: [],
  bot_role_ids: [],
  enabled: true,
  human_role_ids: [],
});

const configCache = new Map();

function getCached(guildId) {
  const cached = configCache.get(String(guildId));

  if (!cached || cached.expiresAt <= Date.now()) {
    configCache.delete(String(guildId));
    return null;
  }

  return cached.value;
}

function setCached(guildId, value) {
  configCache.set(String(guildId), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

function clearAutoroleCache(guildId) {
  if (!guildId) {
    configCache.clear();
    return;
  }

  configCache.delete(String(guildId));
}

function getStorageError() {
  return { ok: false, reason: 'Supabase is not configured.' };
}

function toIdArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((id) => String(id)).filter(Boolean))];
}

function normalizeConfig(row = {}) {
  return {
    all_role_ids: toIdArray(row.all_role_ids),
    bot_role_ids: toIdArray(row.bot_role_ids),
    enabled: row.enabled === undefined || row.enabled === null ? true : Boolean(row.enabled),
    human_role_ids: toIdArray(row.human_role_ids),
  };
}

async function getAutoroleConfig(guildId) {
  const key = String(guildId);
  const cached = getCached(key);

  if (cached) {
    return { config: cached, ok: true };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return { ...getStorageError(), config: normalizeConfig() };
  }

  const { data, error } = await supabase
    .from('autorole_settings')
    .select('*')
    .eq('guild_id', key)
    .maybeSingle();

  if (error) {
    return { config: normalizeConfig(), ok: false, reason: error.message };
  }

  const config = normalizeConfig(data || {});
  setCached(key, config);

  return { config, ok: true };
}

async function updateAutoroleConfig(guildId, patch) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const current = await getAutoroleConfig(guildId);
  const nextConfig = normalizeConfig({ ...(current.config || DEFAULT_AUTOROLE_CONFIG), ...patch });

  const { error } = await supabase
    .from('autorole_settings')
    .upsert({
      guild_id: String(guildId),
      ...nextConfig,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });

  if (error) {
    return { ok: false, reason: error.message };
  }

  setCached(String(guildId), nextConfig);

  return { config: nextConfig, ok: true };
}

async function resetAutoroleData(guildId) {
  clearAutoroleCache(guildId);

  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('autorole_settings')
    .delete()
    .eq('guild_id', String(guildId));

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

async function cleanupLeftAutoroleData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ...getStorageError(), removed: 0 };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));

  const { data, error } = await supabase
    .from('autorole_settings')
    .select('guild_id');

  if (error) {
    return { ok: false, reason: error.message, removed: 0 };
  }

  const staleGuildIds = (data || [])
    .map((row) => String(row.guild_id))
    .filter((guildId) => !activeGuildSet.has(guildId));

  if (staleGuildIds.length === 0) {
    return { ok: true, removed: 0 };
  }

  const { error: deleteError } = await supabase
    .from('autorole_settings')
    .delete()
    .in('guild_id', staleGuildIds);

  if (deleteError) {
    return { ok: false, reason: deleteError.message, removed: 0 };
  }

  for (const guildId of staleGuildIds) {
    clearAutoroleCache(guildId);
  }

  return { ok: true, removed: staleGuildIds.length };
}

module.exports = {
  CATEGORY_COLUMNS,
  DEFAULT_AUTOROLE_CONFIG,
  ROLE_COLUMNS,
  cleanupLeftAutoroleData,
  clearAutoroleCache,
  getAutoroleConfig,
  resetAutoroleData,
  updateAutoroleConfig,
};
