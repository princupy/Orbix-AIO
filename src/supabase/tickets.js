const { getSupabase } = require('./client');

const CACHE_TTL_MS = 30_000;

const DEFAULT_TICKET_CONFIG = Object.freeze({
  category_id: null,
  log_channel_id: null,
  max_open: 1,
  panel_description: 'Need help? Click the button below to open a private support ticket. Our team will assist you shortly.',
  panel_title: '🎫 Support Tickets',
  support_role_id: null,
  ticket_counter: 0,
});

const configCache = new Map();

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

function clearTicketCache(guildId) {
  if (!guildId) {
    configCache.clear();
    return;
  }

  configCache.delete(String(guildId));
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

function normalizeConfig(row = {}) {
  const merged = { ...DEFAULT_TICKET_CONFIG, ...row };

  return {
    category_id: merged.category_id || null,
    log_channel_id: merged.log_channel_id || null,
    max_open: clampInt(merged.max_open, 1, 1, 20),
    panel_description: String(merged.panel_description || DEFAULT_TICKET_CONFIG.panel_description).slice(0, 2000),
    panel_title: String(merged.panel_title || DEFAULT_TICKET_CONFIG.panel_title).slice(0, 200),
    support_role_id: merged.support_role_id || null,
    ticket_counter: clampInt(merged.ticket_counter, 0, 0, 100_000_000),
  };
}

async function getTicketConfig(guildId) {
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
    .from('ticket_settings')
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

async function updateTicketConfig(guildId, patch) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const current = await getTicketConfig(guildId);
  const nextConfig = normalizeConfig({ ...(current.config || DEFAULT_TICKET_CONFIG), ...patch });

  const { error } = await supabase
    .from('ticket_settings')
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

async function nextTicketNumber(guildId) {
  const current = await getTicketConfig(guildId);
  const nextNumber = (current.config?.ticket_counter || 0) + 1;
  const result = await updateTicketConfig(guildId, { ticket_counter: nextNumber });

  if (!result.ok) {
    return { number: nextNumber, ok: false, reason: result.reason };
  }

  return { number: nextNumber, ok: true };
}

async function countOpenTicketsByUser(guildId, userId) {
  const supabase = getSupabase();

  if (!supabase) {
    return { count: 0, ...getStorageError() };
  }

  const { count, error } = await supabase
    .from('tickets')
    .select('channel_id', { count: 'exact', head: true })
    .eq('guild_id', String(guildId))
    .eq('opener_id', String(userId));

  if (error) {
    return { count: 0, ok: false, reason: error.message };
  }

  return { count: count || 0, ok: true };
}

async function getTicket(channelId) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ...getStorageError(), ticket: null };
  }

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('channel_id', String(channelId))
    .maybeSingle();

  if (error) {
    return { ok: false, reason: error.message, ticket: null };
  }

  return { ok: true, ticket: data || null };
}

async function createTicketRecord({
  channelId, guildId, openerId, ticketNumber,
}) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('tickets')
    .insert({
      channel_id: String(channelId),
      guild_id: String(guildId),
      opener_id: String(openerId),
      ticket_number: ticketNumber,
    });

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

async function setTicketClaimedBy(channelId, userId) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('tickets')
    .update({ claimed_by: userId ? String(userId) : null })
    .eq('channel_id', String(channelId));

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

async function deleteTicketRecord(channelId) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('tickets')
    .delete()
    .eq('channel_id', String(channelId));

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

async function resetTicketData(guildId) {
  const supabase = getSupabase();
  clearTicketCache(guildId);

  if (!supabase) {
    return getStorageError();
  }

  for (const table of ['ticket_settings', 'tickets']) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('guild_id', String(guildId));

    if (error) {
      return { ok: false, reason: error.message };
    }
  }

  return { ok: true };
}

async function cleanupLeftTicketData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ...getStorageError(), removed: 0 };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));
  const tables = ['ticket_settings', 'tickets'];
  const staleGuildIds = new Set();

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('guild_id');

    if (error) {
      return { ok: false, reason: error.message, removed: 0 };
    }

    for (const row of data || []) {
      if (!activeGuildSet.has(String(row.guild_id))) {
        staleGuildIds.add(String(row.guild_id));
      }
    }
  }

  if (staleGuildIds.size === 0) {
    return { ok: true, removed: 0 };
  }

  const staleIds = [...staleGuildIds];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .in('guild_id', staleIds);

    if (error) {
      return { ok: false, reason: error.message, removed: 0 };
    }
  }

  for (const guildId of staleIds) {
    clearTicketCache(guildId);
  }

  return { ok: true, removed: staleIds.length };
}

module.exports = {
  DEFAULT_TICKET_CONFIG,
  cleanupLeftTicketData,
  clearTicketCache,
  countOpenTicketsByUser,
  createTicketRecord,
  deleteTicketRecord,
  getTicket,
  getTicketConfig,
  nextTicketNumber,
  resetTicketData,
  setTicketClaimedBy,
  updateTicketConfig,
};
