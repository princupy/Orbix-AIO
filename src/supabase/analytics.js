const { getSupabase } = require('./client');

// Lightweight analytics recording for the dashboard. Everything here is
// best-effort and fire-and-forget: it never throws and is a no-op when Supabase
// is not configured, so the bot runs exactly as before if analytics is off.
//
// Message activity is the hot path (every message), so counts are buffered in
// memory and flushed to the DB on an interval with a single atomic increment
// per (guild, day) — never one write per message.

const FLUSH_INTERVAL_MS = 60_000; // flush buffered message counts every minute
const SNAPSHOT_INTERVAL_MS = 30 * 60_000; // member snapshot every 30 minutes
const SNAPSHOT_CHUNK = 500;
const COMMAND_NAME_MAX = 64;

const messageBuffer = new Map(); // `${guildId}|${day}` -> count
let flushTimer = null;
let snapshotTimer = null;

function todayUtc() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Buffer one message for today's activity count (in-memory, no DB call). */
function recordMessageActivity(guildId) {
  if (!guildId) {
    return;
  }

  const key = `${guildId}|${todayUtc()}`;
  messageBuffer.set(key, (messageBuffer.get(key) || 0) + 1);
}

/** Flush all buffered message counts via the atomic increment RPC. */
async function flushMessageActivity() {
  if (messageBuffer.size === 0) {
    return;
  }

  const supabase = getSupabase();

  if (!supabase) {
    messageBuffer.clear();
    return;
  }

  // Snapshot + clear first so new messages during the flush are not lost.
  const pending = [...messageBuffer.entries()];
  messageBuffer.clear();

  for (const [key, amount] of pending) {
    const [guildId, day] = key.split('|');

    try {
      const { error } = await supabase.rpc('increment_message_activity', {
        p_guild_id: guildId,
        p_day: day,
        p_amount: amount,
      });

      if (error) {
        console.warn(`[analytics] message flush failed for ${guildId}: ${error.message}`);
      }
    } catch (error) {
      console.warn(`[analytics] message flush threw for ${guildId}:`, error?.message || error);
    }
  }
}

/** Record a single command invocation. */
async function recordCommandUsage(guildId, command, userId) {
  if (!guildId || !command) {
    return;
  }

  const supabase = getSupabase();

  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase.from('command_usage').insert({
      guild_id: String(guildId),
      command: String(command).slice(0, COMMAND_NAME_MAX),
      user_id: userId ? String(userId) : null,
    });

    if (error) {
      console.warn(`[analytics] command usage insert failed: ${error.message}`);
    }
  } catch (error) {
    console.warn('[analytics] command usage insert threw:', error?.message || error);
  }
}

/** Insert a single member snapshot (online count is null — no presence intent). */
async function captureMemberSnapshot(guildId, memberCount, onlineCount = null) {
  if (!guildId) {
    return;
  }

  const supabase = getSupabase();

  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase.from('member_snapshots').insert({
      guild_id: String(guildId),
      member_count: Number(memberCount) || 0,
      online_count: onlineCount == null ? null : Number(onlineCount),
    });

    if (error) {
      console.warn(`[analytics] snapshot insert failed for ${guildId}: ${error.message}`);
    }
  } catch (error) {
    console.warn(`[analytics] snapshot insert threw for ${guildId}:`, error?.message || error);
  }
}

/** Snapshot every guild the bot is in (batched insert). */
async function snapshotAllGuilds(client) {
  const supabase = getSupabase();

  if (!supabase) {
    return;
  }

  const rows = [...client.guilds.cache.values()].map((guild) => ({
    guild_id: guild.id,
    member_count: guild.memberCount || 0,
    online_count: null,
  }));

  if (rows.length === 0) {
    return;
  }

  for (let i = 0; i < rows.length; i += SNAPSHOT_CHUNK) {
    try {
      const { error } = await supabase
        .from('member_snapshots')
        .insert(rows.slice(i, i + SNAPSHOT_CHUNK));

      if (error) {
        console.warn(`[analytics] snapshot batch failed: ${error.message}`);
      }
    } catch (error) {
      console.warn('[analytics] snapshot batch threw:', error?.message || error);
    }
  }
}

/** Start the flush + snapshot intervals. No-op if Supabase is not configured. */
function startAnalyticsTasks(client) {
  if (!getSupabase()) {
    console.log('[analytics] disabled (Supabase not configured).');
    return;
  }

  if (!flushTimer) {
    flushTimer = setInterval(() => {
      flushMessageActivity().catch(() => {});
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  }

  if (!snapshotTimer) {
    // Take an initial snapshot shortly after start, then on the interval.
    snapshotAllGuilds(client).catch(() => {});
    snapshotTimer = setInterval(() => {
      snapshotAllGuilds(client).catch(() => {});
    }, SNAPSHOT_INTERVAL_MS);
    snapshotTimer.unref?.();
  }

  console.log('[analytics] recording tasks started.');
}

/** Stop timers and flush any remaining buffered counts. */
function stopAnalyticsTasks() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (snapshotTimer) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }

  return flushMessageActivity();
}

module.exports = {
  captureMemberSnapshot,
  flushMessageActivity,
  recordCommandUsage,
  recordMessageActivity,
  snapshotAllGuilds,
  startAnalyticsTasks,
  stopAnalyticsTasks,
};
