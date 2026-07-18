const { getSupabase } = require('./client');

const CACHE_TTL_MS = 30_000;

// Single source of truth for every log type. `column` maps to the DB column
// and the in-memory config key. `aliases` let users type friendlier names.
const LOG_TYPES = [
  {
    aliases: ['msg', 'messages', 'msglog'], color: 0x5865F2, column: 'message_log_channel_id', emoji: '📝', key: 'message', label: 'Message Logs',
  },
  {
    aliases: ['timeout'], color: 0xF59E0B, column: 'mute_log_channel_id', emoji: '🔇', key: 'mute', label: 'Mute Logs',
  },
  {
    aliases: ['untimeout'], color: 0x22C55E, column: 'unmute_log_channel_id', emoji: '🔊', key: 'unmute', label: 'Unmute Logs',
  },
  {
    aliases: ['bans'], color: 0xEF4444, column: 'ban_log_channel_id', emoji: '🔨', key: 'ban', label: 'Ban Logs',
  },
  {
    aliases: ['kicks'], color: 0xF97316, column: 'kick_log_channel_id', emoji: '👢', key: 'kick', label: 'Kick Logs',
  },
  {
    aliases: ['memberjoin', 'svjoin', 'welcome'], color: 0x22C55E, column: 'join_log_channel_id', emoji: '📥', key: 'join', label: 'Join Logs',
  },
  {
    aliases: ['memberleave', 'goodbye'], color: 0xE11D48, column: 'leave_log_channel_id', emoji: '📤', key: 'leave', label: 'Leave Logs',
  },
  {
    aliases: ['vc', 'voicelog'], color: 0xA855F7, column: 'voice_log_channel_id', emoji: '🎙️', key: 'voice', label: 'Voice Logs',
  },
];

const LOG_TYPE_BY_KEY = new Map(LOG_TYPES.map((type) => [type.key, type]));
const LOG_TYPE_BY_ALIAS = new Map();

for (const type of LOG_TYPES) {
  LOG_TYPE_BY_ALIAS.set(type.key, type);
  for (const alias of type.aliases) {
    LOG_TYPE_BY_ALIAS.set(alias, type);
  }
}

const DEFAULT_LOG_CONFIG = Object.freeze(
  LOG_TYPES.reduce((config, type) => ({ ...config, [type.column]: null }), {}),
);

const configCache = new Map();

function resolveLogType(input) {
  return LOG_TYPE_BY_ALIAS.get(String(input || '').trim().toLowerCase()) || null;
}

function getCached(key) {
  const cached = configCache.get(String(key));

  if (!cached || cached.expiresAt <= Date.now()) {
    configCache.delete(String(key));
    return null;
  }

  return cached.value;
}

function setCached(key, value) {
  configCache.set(String(key), {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

function clearLogCache(guildId) {
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
  const config = {};

  for (const type of LOG_TYPES) {
    config[type.column] = row[type.column] || null;
  }

  return config;
}

async function getLogConfig(guildId) {
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
    .from('log_settings')
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

async function updateLogConfig(guildId, patch) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const current = await getLogConfig(guildId);
  const nextConfig = normalizeConfig({ ...(current.config || DEFAULT_LOG_CONFIG), ...patch });

  const { error } = await supabase
    .from('log_settings')
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

async function resetLogData(guildId) {
  clearLogCache(guildId);

  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('log_settings')
    .delete()
    .eq('guild_id', String(guildId));

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

async function cleanupLeftLogData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ...getStorageError(), removed: 0 };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));

  const { data, error } = await supabase
    .from('log_settings')
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
    .from('log_settings')
    .delete()
    .in('guild_id', staleGuildIds);

  if (deleteError) {
    return { ok: false, reason: deleteError.message, removed: 0 };
  }

  for (const guildId of staleGuildIds) {
    clearLogCache(guildId);
  }

  return { ok: true, removed: staleGuildIds.length };
}

module.exports = {
  DEFAULT_LOG_CONFIG,
  LOG_TYPES,
  LOG_TYPE_BY_KEY,
  cleanupLeftLogData,
  clearLogCache,
  getLogConfig,
  resolveLogType,
  resetLogData,
  updateLogConfig,
};
