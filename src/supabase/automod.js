const { getSupabase } = require('./client');

const CACHE_TTL_MS = 30_000;
const VALID_ACTIONS = ['delete', 'warn', 'mute', 'kick', 'ban'];

const DEFAULT_AUTOMOD_CONFIG = Object.freeze({
  enabled: false,
  log_channel_id: null,
  mute_duration_seconds: 600,

  invite_enabled: false,
  invite_action: 'delete',

  link_enabled: false,
  link_action: 'delete',

  spam_enabled: false,
  spam_action: 'mute',
  spam_message_count: 5,
  spam_interval_seconds: 5,

  mention_enabled: false,
  mention_action: 'delete',
  mention_limit: 5,

  caps_enabled: false,
  caps_action: 'delete',
  caps_percentage: 70,
  caps_min_length: 10,

  emoji_enabled: false,
  emoji_action: 'delete',
  emoji_limit: 8,

  duplicate_enabled: false,
  duplicate_action: 'delete',
  duplicate_limit: 3,

  badword_enabled: false,
  badword_action: 'delete',
});

const configCache = new Map();
const badWordCache = new Map();
const exemptCache = new Map();

function getCached(map, key) {
  const cached = map.get(String(key));

  if (!cached || cached.expiresAt <= Date.now()) {
    map.delete(String(key));
    return null;
  }

  return cached.value;
}

function setCached(map, key, value) {
  map.set(String(key), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function clearAutomodCache(guildId) {
  if (!guildId) {
    configCache.clear();
    badWordCache.clear();
    exemptCache.clear();
    return;
  }

  configCache.delete(String(guildId));
  badWordCache.delete(String(guildId));
  exemptCache.delete(String(guildId));
}

function getStorageError() {
  return {
    ok: false,
    reason: 'Supabase is not configured.',
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Math.floor(Number(value));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function normalizeAction(value, fallback = 'delete') {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_ACTIONS.includes(normalized) ? normalized : fallback;
}

function normalizeConfig(row = {}) {
  const merged = {
    ...DEFAULT_AUTOMOD_CONFIG,
    ...row,
  };

  return {
    enabled: Boolean(merged.enabled),
    log_channel_id: merged.log_channel_id || null,
    mute_duration_seconds: clampInt(merged.mute_duration_seconds, 600, 10, 2419200),

    invite_enabled: Boolean(merged.invite_enabled),
    invite_action: normalizeAction(merged.invite_action),

    link_enabled: Boolean(merged.link_enabled),
    link_action: normalizeAction(merged.link_action),

    spam_enabled: Boolean(merged.spam_enabled),
    spam_action: normalizeAction(merged.spam_action, 'mute'),
    spam_message_count: clampInt(merged.spam_message_count, 5, 2, 30),
    spam_interval_seconds: clampInt(merged.spam_interval_seconds, 5, 1, 60),

    mention_enabled: Boolean(merged.mention_enabled),
    mention_action: normalizeAction(merged.mention_action),
    mention_limit: clampInt(merged.mention_limit, 5, 2, 50),

    caps_enabled: Boolean(merged.caps_enabled),
    caps_action: normalizeAction(merged.caps_action),
    caps_percentage: clampInt(merged.caps_percentage, 70, 40, 100),
    caps_min_length: clampInt(merged.caps_min_length, 10, 5, 500),

    emoji_enabled: Boolean(merged.emoji_enabled),
    emoji_action: normalizeAction(merged.emoji_action),
    emoji_limit: clampInt(merged.emoji_limit, 8, 3, 50),

    duplicate_enabled: Boolean(merged.duplicate_enabled),
    duplicate_action: normalizeAction(merged.duplicate_action),
    duplicate_limit: clampInt(merged.duplicate_limit, 3, 2, 20),

    badword_enabled: Boolean(merged.badword_enabled),
    badword_action: normalizeAction(merged.badword_action),
  };
}

async function getAutomodConfig(guildId) {
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
    .from('automod_settings')
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

async function updateAutomodConfig(guildId, patch) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const current = await getAutomodConfig(guildId);
  const nextConfig = normalizeConfig({
    ...(current.config || DEFAULT_AUTOMOD_CONFIG),
    ...patch,
  });

  const { error } = await supabase
    .from('automod_settings')
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

async function listBadWords(guildId) {
  const key = String(guildId);
  const cached = getCached(badWordCache, key);

  if (cached) {
    return {
      ok: true,
      words: cached,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      words: [],
    };
  }

  const { data, error } = await supabase
    .from('automod_badwords')
    .select('word, created_at')
    .eq('guild_id', key)
    .order('word', { ascending: true });

  if (error) {
    return {
      ok: false,
      reason: error.message,
      words: [],
    };
  }

  const words = (data || []).map((row) => String(row.word));
  setCached(badWordCache, key, words);

  return {
    ok: true,
    words,
  };
}

async function addBadWords({ guildId, words, addedBy }) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      added: [],
    };
  }

  const uniqueWords = [...new Set(
    words
      .map((word) => String(word || '').trim().toLowerCase())
      .filter((word) => word.length >= 1 && word.length <= 64),
  )];

  if (uniqueWords.length === 0) {
    return {
      ok: false,
      added: [],
      reason: 'No valid words provided.',
    };
  }

  const rows = uniqueWords.map((word) => ({
    guild_id: String(guildId),
    word,
    added_by: String(addedBy),
  }));

  const { error } = await supabase
    .from('automod_badwords')
    .upsert(rows, {
      onConflict: 'guild_id,word',
    });

  if (error) {
    return {
      ok: false,
      added: [],
      reason: error.message,
    };
  }

  badWordCache.delete(String(guildId));

  return {
    ok: true,
    added: uniqueWords,
  };
}

async function removeBadWords({ guildId, words }) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      removed: [],
    };
  }

  const uniqueWords = [...new Set(
    words.map((word) => String(word || '').trim().toLowerCase()).filter(Boolean),
  )];

  if (uniqueWords.length === 0) {
    return {
      ok: false,
      removed: [],
      reason: 'No valid words provided.',
    };
  }

  const { error } = await supabase
    .from('automod_badwords')
    .delete()
    .eq('guild_id', String(guildId))
    .in('word', uniqueWords);

  if (error) {
    return {
      ok: false,
      removed: [],
      reason: error.message,
    };
  }

  badWordCache.delete(String(guildId));

  return {
    ok: true,
    removed: uniqueWords,
  };
}

async function clearBadWords(guildId) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('automod_badwords')
    .delete()
    .eq('guild_id', String(guildId));

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  badWordCache.delete(String(guildId));

  return {
    ok: true,
  };
}

async function listExemptions(guildId) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      channels: [],
      roles: [],
    };
  }

  const { data, error } = await supabase
    .from('automod_exempt')
    .select('type, target_id, created_at')
    .eq('guild_id', String(guildId))
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      channels: [],
      reason: error.message,
      roles: [],
    };
  }

  const rows = data || [];

  return {
    ok: true,
    channels: rows.filter((row) => row.type === 'channel').map((row) => String(row.target_id)),
    roles: rows.filter((row) => row.type === 'role').map((row) => String(row.target_id)),
  };
}

async function getAutomodExemptions(guildId) {
  const key = String(guildId);
  const cached = getCached(exemptCache, key);

  if (cached) {
    return cached;
  }

  const result = await listExemptions(guildId);
  const exemptions = {
    channelIds: new Set(result.channels || []),
    roleIds: new Set(result.roles || []),
  };

  if (result.ok) {
    setCached(exemptCache, key, exemptions);
  }

  return exemptions;
}

async function addExemption({ guildId, type, targetId, addedBy }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('automod_exempt')
    .upsert({
      guild_id: String(guildId),
      type: String(type),
      target_id: String(targetId),
      added_by: String(addedBy),
    }, {
      onConflict: 'guild_id,type,target_id',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  exemptCache.delete(String(guildId));

  return {
    ok: true,
  };
}

async function removeExemption({ guildId, type, targetId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('automod_exempt')
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

  exemptCache.delete(String(guildId));

  return {
    ok: true,
  };
}

async function resetAutomodData(guildId) {
  const supabase = getSupabase();
  clearAutomodCache(guildId);

  if (!supabase) {
    return getStorageError();
  }

  for (const table of ['automod_settings', 'automod_badwords', 'automod_exempt']) {
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

async function cleanupLeftAutomodData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      removed: 0,
    };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));
  const tables = ['automod_settings', 'automod_badwords', 'automod_exempt'];
  const staleGuildIds = new Set();

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('guild_id');

    if (error) {
      return {
        ok: false,
        reason: error.message,
        removed: 0,
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
        reason: error.message,
        removed: 0,
      };
    }
  }

  for (const guildId of staleIds) {
    clearAutomodCache(guildId);
  }

  return {
    ok: true,
    removed: staleIds.length,
  };
}

module.exports = {
  DEFAULT_AUTOMOD_CONFIG,
  VALID_ACTIONS,
  addBadWords,
  addExemption,
  cleanupLeftAutomodData,
  clearAutomodCache,
  clearBadWords,
  getAutomodConfig,
  getAutomodExemptions,
  listBadWords,
  listExemptions,
  removeBadWords,
  removeExemption,
  resetAutomodData,
  updateAutomodConfig,
};
