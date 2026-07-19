const { getSupabase } = require('../supabase');

const DAY_MS = 86_400_000;

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function startOfTodayIso() {
  return `${todayUtc()}T00:00:00.000Z`;
}

// Ordered list of the last `days` UTC dates (oldest -> today), 'YYYY-MM-DD'.
function dayRange(days) {
  const now = Date.now();
  const out = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(new Date(now - i * DAY_MS).toISOString().slice(0, 10));
  }

  return out;
}

// Live-ish counters for the Overview cards (member/online come via socket).
async function getOverview(guildId) {
  const empty = { messagesToday: 0, commandsToday: 0, messages7d: 0, commands7d: 0 };
  const supabase = getSupabase();

  if (!supabase) {
    return empty;
  }

  const today = todayUtc();
  const weekStart = dayRange(7)[0];
  const since7Iso = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const [messageToday, messageWeek, commandToday, commandWeek] = await Promise.all([
    supabase.from('message_activity').select('count').eq('guild_id', guildId).eq('day', today).maybeSingle(),
    supabase.from('message_activity').select('count').eq('guild_id', guildId).gte('day', weekStart),
    supabase.from('command_usage').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).gte('created_at', startOfTodayIso()),
    supabase.from('command_usage').select('*', { count: 'exact', head: true }).eq('guild_id', guildId).gte('created_at', since7Iso),
  ]);

  return {
    messagesToday: Number(messageToday.data?.count || 0),
    messages7d: (messageWeek.data || []).reduce((sum, row) => sum + Number(row.count || 0), 0),
    commandsToday: Number(commandToday.count || 0),
    commands7d: Number(commandWeek.count || 0),
  };
}

// Daily message counts, zero-filled across the full window for a clean chart.
async function getMessageSeries(guildId, days = 14) {
  const range = dayRange(days);
  const supabase = getSupabase();

  if (!supabase) {
    return range.map((day) => ({ day, count: 0 }));
  }

  const { data, error } = await supabase
    .from('message_activity')
    .select('day, count')
    .eq('guild_id', guildId)
    .gte('day', range[0])
    .order('day', { ascending: true });

  const byDay = new Map();

  if (!error) {
    for (const row of data || []) {
      byDay.set(String(row.day), Number(row.count || 0));
    }
  }

  return range.map((day) => ({ day, count: byDay.get(day) || 0 }));
}

// Member growth: one point per day (latest snapshot of each day) via RPC.
async function getMemberSeries(guildId, days = 14) {
  const supabase = getSupabase();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('member_snapshots_daily', {
    p_guild_id: guildId,
    p_days: days,
  });

  if (error) {
    console.warn('[analytics] member series rpc failed:', error.message);
    return [];
  }

  return (data || []).map((row) => ({
    day: String(row.day),
    memberCount: Number(row.member_count || 0),
    onlineCount: row.online_count == null ? null : Number(row.online_count),
  }));
}

// Top commands over the window via RPC.
async function getTopCommands(guildId, days = 7, limit = 8) {
  const supabase = getSupabase();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc('command_usage_top', {
    p_guild_id: guildId,
    p_days: days,
    p_limit: limit,
  });

  if (error) {
    console.warn('[analytics] top commands rpc failed:', error.message);
    return [];
  }

  return (data || []).map((row) => ({ command: row.command, uses: Number(row.uses || 0) }));
}

// Daily command counts, zero-filled across the window via RPC.
async function getCommandSeries(guildId, days = 14) {
  const range = dayRange(days);
  const supabase = getSupabase();

  if (!supabase) {
    return range.map((day) => ({ day, count: 0 }));
  }

  const { data, error } = await supabase.rpc('command_usage_daily', {
    p_guild_id: guildId,
    p_days: days,
  });

  const byDay = new Map();

  if (!error) {
    for (const row of data || []) {
      byDay.set(String(row.day), Number(row.count || 0));
    }
  }

  return range.map((day) => ({ day, count: byDay.get(day) || 0 }));
}

module.exports = {
  getCommandSeries,
  getMemberSeries,
  getMessageSeries,
  getOverview,
  getTopCommands,
};
