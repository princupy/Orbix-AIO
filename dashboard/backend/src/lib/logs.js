const { getSupabase } = require('../supabase');

// Must match the bot's log type keys (src/supabase/logs.js).
const LOG_TYPES = ['message', 'mute', 'unmute', 'ban', 'kick', 'join', 'leave', 'voice'];
const VALID_LOG_TYPES = new Set(LOG_TYPES);

async function getRecentLogs(guildId, { limit = 50, type = null, beforeId = null } = {}) {
  const supabase = getSupabase();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('activity_logs')
    .select('id, type, title, description, target_id, target_tag, moderator_id, moderator_tag, created_at')
    .eq('guild_id', guildId)
    .order('id', { ascending: false })
    .limit(limit);

  if (type && VALID_LOG_TYPES.has(type)) {
    query = query.eq('type', type);
  }

  if (beforeId) {
    query = query.lt('id', beforeId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[logs] getRecentLogs failed:', error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    targetId: row.target_id,
    targetTag: row.target_tag,
    moderatorId: row.moderator_id,
    moderatorTag: row.moderator_tag,
    at: row.created_at ? new Date(row.created_at).getTime() : null,
  }));
}

module.exports = { LOG_TYPES, VALID_LOG_TYPES, getRecentLogs };
