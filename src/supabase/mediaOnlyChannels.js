const { getSupabase } = require('./client');

const CACHE_TTL_MS = 30_000;
const mediaOnlyCache = new Map();

function getCachedChannels(guildId) {
  const cached = mediaOnlyCache.get(String(guildId));

  if (!cached || cached.expiresAt <= Date.now()) {
    mediaOnlyCache.delete(String(guildId));
    return null;
  }

  return cached.channelIds;
}

function setCachedChannels(guildId, channelIds) {
  mediaOnlyCache.set(String(guildId), {
    channelIds: new Set(channelIds.map(String)),
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function clearMediaOnlyCache(guildId) {
  if (guildId) {
    mediaOnlyCache.delete(String(guildId));
    return;
  }

  mediaOnlyCache.clear();
}

async function listMediaOnlyChannels(guildId) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      channels: [],
      reason: 'Supabase is not configured.',
    };
  }

  const { data, error } = await supabase
    .from('media_only_channels')
    .select('channel_id, added_by, created_at')
    .eq('guild_id', String(guildId))
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      channels: [],
      reason: error.message,
    };
  }

  const channels = data || [];
  setCachedChannels(guildId, channels.map((row) => row.channel_id));

  return {
    ok: true,
    channels,
  };
}

async function getMediaOnlyChannelIds(guildId) {
  const cached = getCachedChannels(guildId);

  if (cached) {
    return cached;
  }

  const result = await listMediaOnlyChannels(guildId);

  if (!result.ok) {
    return new Set();
  }

  return new Set(result.channels.map((row) => row.channel_id));
}

async function isMediaOnlyChannel(guildId, channelId) {
  const channelIds = await getMediaOnlyChannelIds(guildId);
  return channelIds.has(String(channelId));
}

async function addMediaOnlyChannels({ guildId, channelIds, addedBy }) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      added: [],
      reason: 'Supabase is not configured.',
    };
  }

  const uniqueChannelIds = [...new Set(channelIds.map(String))];
  const rows = uniqueChannelIds.map((channelId) => ({
    guild_id: String(guildId),
    channel_id: channelId,
    added_by: String(addedBy),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('media_only_channels')
    .upsert(rows, {
      onConflict: 'guild_id,channel_id',
    });

  if (error) {
    return {
      ok: false,
      added: [],
      reason: error.message,
    };
  }

  clearMediaOnlyCache(guildId);

  return {
    ok: true,
    added: uniqueChannelIds,
  };
}

async function removeMediaOnlyChannels({ guildId, channelIds }) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      removed: [],
      reason: 'Supabase is not configured.',
    };
  }

  const uniqueChannelIds = [...new Set(channelIds.map(String))];
  const { error } = await supabase
    .from('media_only_channels')
    .delete()
    .eq('guild_id', String(guildId))
    .in('channel_id', uniqueChannelIds);

  if (error) {
    return {
      ok: false,
      removed: [],
      reason: error.message,
    };
  }

  clearMediaOnlyCache(guildId);

  return {
    ok: true,
    removed: uniqueChannelIds,
  };
}

async function resetMediaOnlyChannels(guildId) {
  const supabase = getSupabase();
  clearMediaOnlyCache(guildId);

  if (!supabase) {
    return {
      ok: false,
      reason: 'Supabase is not configured.',
    };
  }

  const { error } = await supabase
    .from('media_only_channels')
    .delete()
    .eq('guild_id', String(guildId));

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

async function cleanupLeftMediaOnlyChannels(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      removed: 0,
      reason: 'Supabase is not configured.',
    };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));
  const { data, error } = await supabase
    .from('media_only_channels')
    .select('guild_id');

  if (error) {
    return {
      ok: false,
      removed: 0,
      reason: error.message,
    };
  }

  const staleGuildIds = [
    ...new Set((data || [])
      .map((row) => row.guild_id)
      .filter((guildId) => !activeGuildSet.has(guildId))),
  ];

  if (staleGuildIds.length === 0) {
    return {
      ok: true,
      removed: 0,
    };
  }

  const { error: deleteError } = await supabase
    .from('media_only_channels')
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
    clearMediaOnlyCache(guildId);
  }

  return {
    ok: true,
    removed: staleGuildIds.length,
  };
}

module.exports = {
  addMediaOnlyChannels,
  cleanupLeftMediaOnlyChannels,
  clearMediaOnlyCache,
  getMediaOnlyChannelIds,
  isMediaOnlyChannel,
  listMediaOnlyChannels,
  removeMediaOnlyChannels,
  resetMediaOnlyChannels,
};
