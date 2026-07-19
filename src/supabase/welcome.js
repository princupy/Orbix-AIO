const { getSupabase } = require('./client');

const CACHE_TTL_MS = 30_000;

const DEFAULT_WELCOME_CONFIG = Object.freeze({
  channel_id: null,
  enabled: true,
  message: null,
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

function clearWelcomeCache(guildId) {
  if (!guildId) {
    configCache.clear();
    return;
  }

  configCache.delete(String(guildId));
}

function getStorageError() {
  return { ok: false, reason: 'Supabase is not configured.' };
}

function normalizeConfig(row = {}) {
  return {
    channel_id: row.channel_id || null,
    enabled: row.enabled === undefined || row.enabled === null ? true : Boolean(row.enabled),
    message: row.message || null,
  };
}

async function getWelcomeConfig(guildId) {
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
    .from('welcome_settings')
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

async function updateWelcomeConfig(guildId, patch) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const current = await getWelcomeConfig(guildId);
  const nextConfig = normalizeConfig({ ...(current.config || DEFAULT_WELCOME_CONFIG), ...patch });

  const { error } = await supabase
    .from('welcome_settings')
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

async function resetWelcomeData(guildId) {
  clearWelcomeCache(guildId);

  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('welcome_settings')
    .delete()
    .eq('guild_id', String(guildId));

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

async function cleanupLeftWelcomeData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ...getStorageError(), removed: 0 };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));

  const { data, error } = await supabase
    .from('welcome_settings')
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
    .from('welcome_settings')
    .delete()
    .in('guild_id', staleGuildIds);

  if (deleteError) {
    return { ok: false, reason: deleteError.message, removed: 0 };
  }

  for (const guildId of staleGuildIds) {
    clearWelcomeCache(guildId);
  }

  return { ok: true, removed: staleGuildIds.length };
}

module.exports = {
  DEFAULT_WELCOME_CONFIG,
  cleanupLeftWelcomeData,
  clearWelcomeCache,
  getWelcomeConfig,
  resetWelcomeData,
  updateWelcomeConfig,
};
