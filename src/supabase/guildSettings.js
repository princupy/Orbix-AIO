const { DEFAULT_PREFIX } = require('../config');
const { getSupabase } = require('./client');

const PREFIX_CACHE_TTL_MS = 60_000;
const prefixCache = new Map();

function getCachedPrefix(guildId) {
  const cached = prefixCache.get(guildId);

  if (!cached || cached.expiresAt <= Date.now()) {
    prefixCache.delete(guildId);
    return null;
  }

  return cached.prefix;
}

function setCachedPrefix(guildId, prefix) {
  prefixCache.set(guildId, {
    prefix,
    expiresAt: Date.now() + PREFIX_CACHE_TTL_MS,
  });
}

async function getGuildPrefix(guildId) {
  if (!guildId) {
    return DEFAULT_PREFIX;
  }

  const cachedPrefix = getCachedPrefix(guildId);

  if (cachedPrefix) {
    return cachedPrefix;
  }

  const supabase = getSupabase();

  if (!supabase) {
    return DEFAULT_PREFIX;
  }

  const { data, error } = await supabase
    .from('guild_settings')
    .select('prefix')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) {
    console.warn(`[supabase] Failed to load prefix for guild ${guildId}: ${error.message}`);
    return DEFAULT_PREFIX;
  }

  const prefix = data?.prefix || DEFAULT_PREFIX;
  setCachedPrefix(guildId, prefix);

  return prefix;
}

async function setGuildPrefix(guildId, prefix) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      reason: 'Supabase is not configured.',
    };
  }

  const { error } = await supabase
    .from('guild_settings')
    .upsert({
      guild_id: guildId,
      prefix,
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

  setCachedPrefix(guildId, prefix);

  return {
    ok: true,
  };
}

async function resetGuildSettings(guildId) {
  clearGuildPrefixCache(guildId);

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      reason: 'Supabase is not configured.',
    };
  }

  const { error } = await supabase
    .from('guild_settings')
    .delete()
    .eq('guild_id', guildId);

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  return {
    ok: true,
  };
}

async function cleanupLeftGuildSettings(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      removed: 0,
      reason: 'Supabase is not configured.',
    };
  }

  const activeGuildSet = new Set(activeGuildIds);
  const { data, error } = await supabase
    .from('guild_settings')
    .select('guild_id');

  if (error) {
    return {
      ok: false,
      removed: 0,
      reason: error.message,
    };
  }

  const staleGuildIds = (data || [])
    .map((row) => row.guild_id)
    .filter((guildId) => !activeGuildSet.has(guildId));

  if (staleGuildIds.length === 0) {
    return {
      ok: true,
      removed: 0,
    };
  }

  const { error: deleteError } = await supabase
    .from('guild_settings')
    .delete()
    .in('guild_id', staleGuildIds);

  if (deleteError) {
    return {
      ok: false,
      removed: 0,
      reason: deleteError.message,
    };
  }

  for (const guildId of staleGuildIds) {
    clearGuildPrefixCache(guildId);
  }

  return {
    ok: true,
    removed: staleGuildIds.length,
  };
}

function clearGuildPrefixCache(guildId) {
  prefixCache.delete(guildId);
}

module.exports = {
  cleanupLeftGuildSettings,
  clearGuildPrefixCache,
  getGuildPrefix,
  resetGuildSettings,
  setGuildPrefix,
};
