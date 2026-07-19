const { getSupabase } = require('../supabase');

// Must match the bot's recorded case_type values.
const CASE_TYPES = ['ban', 'unban', 'kick', 'mute', 'unmute'];
const VALID_CASE_TYPES = new Set(CASE_TYPES);

const CASE_COLUMNS =
  'id, case_type, target_id, target_tag, moderator_id, moderator_tag, reason, duration_ms, expires_at, active, created_at';

function mapRow(row) {
  return {
    id: row.id,
    type: row.case_type,
    targetId: row.target_id,
    targetTag: row.target_tag,
    moderatorId: row.moderator_id,
    moderatorTag: row.moderator_tag,
    reason: row.reason,
    durationMs: row.duration_ms,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    active: row.active,
    at: row.created_at ? new Date(row.created_at).getTime() : null,
  };
}

async function listCases(guildId, {
  limit = 50, type = null, active = null, search = null, beforeId = null,
} = {}) {
  const supabase = getSupabase();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from('moderation_cases')
    .select(CASE_COLUMNS)
    .eq('guild_id', guildId)
    .order('id', { ascending: false })
    .limit(limit);

  if (type && VALID_CASE_TYPES.has(type)) {
    query = query.eq('case_type', type);
  }

  if (active === true) {
    query = query.eq('active', true);
  } else if (active === false) {
    query = query.eq('active', false);
  }

  if (beforeId) {
    query = query.lt('id', beforeId);
  }

  if (search) {
    // Strip PostgREST filter meta-characters so user input can't break the or().
    const term = String(search).replace(/[,()%*"']/g, ' ').trim();

    if (term) {
      query = query.or(
        `target_tag.ilike.%${term}%,target_id.ilike.%${term}%,moderator_tag.ilike.%${term}%,reason.ilike.%${term}%`,
      );
    }
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[moderation] listCases failed:', error.message);
    return [];
  }

  return (data || []).map(mapRow);
}

async function getStats(guildId) {
  const empty = {
    total: 0, ban: 0, kick: 0, mute: 0, activeBans: 0, activeMutes: 0,
  };
  const supabase = getSupabase();

  if (!supabase) {
    return empty;
  }

  const countOf = async (build) => {
    const base = supabase.from('moderation_cases').select('*', { count: 'exact', head: true }).eq('guild_id', guildId);
    const { count, error } = await build(base);
    return error ? 0 : Number(count || 0);
  };

  const [total, ban, kick, mute, activeBans, activeMutes] = await Promise.all([
    countOf((q) => q),
    countOf((q) => q.eq('case_type', 'ban')),
    countOf((q) => q.eq('case_type', 'kick')),
    countOf((q) => q.eq('case_type', 'mute')),
    countOf((q) => q.eq('case_type', 'ban').eq('active', true)),
    countOf((q) => q.eq('case_type', 'mute').eq('active', true)),
  ]);

  return {
    total, ban, kick, mute, activeBans, activeMutes,
  };
}

async function getCase(guildId, caseId) {
  const supabase = getSupabase();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('moderation_cases')
    .select(CASE_COLUMNS)
    .eq('guild_id', guildId)
    .eq('id', caseId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapRow(data);
}

module.exports = {
  CASE_TYPES, VALID_CASE_TYPES, getCase, getStats, listCases,
};
