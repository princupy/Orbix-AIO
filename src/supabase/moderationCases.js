const { getSupabase } = require('./client');

// Records a moderation case (ban/unban/kick/mute/unmute). Best-effort and
// fire-and-forget: never throws, no-op when Supabase is not configured.
// Returns { ok, id } so callers can attach the id to a live push.
async function recordModerationCase(entry) {
  if (!entry || !entry.guildId || !entry.caseType) {
    return { ok: false };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return { ok: false };
  }

  try {
    const { data, error } = await supabase
      .from('moderation_cases')
      .insert({
        guild_id: String(entry.guildId),
        case_type: String(entry.caseType).slice(0, 32),
        target_id: entry.targetId ? String(entry.targetId) : null,
        target_tag: entry.targetTag ? String(entry.targetTag).slice(0, 100) : null,
        moderator_id: entry.moderatorId ? String(entry.moderatorId) : null,
        moderator_tag: entry.moderatorTag ? String(entry.moderatorTag).slice(0, 100) : null,
        reason: entry.reason ? String(entry.reason).slice(0, 500) : null,
        duration_ms: Number.isFinite(entry.durationMs) ? Math.max(0, Math.floor(entry.durationMs)) : null,
        expires_at: entry.expiresAt || null,
        active: entry.active === true,
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.warn(`[mod-cases] insert failed for ${entry.guildId}: ${error.message}`);
      return { ok: false };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    console.warn('[mod-cases] insert threw:', error?.message || error);
    return { ok: false };
  }
}

// Marks matching active cases inactive (e.g. clear the active ban on unban).
async function deactivateActiveCases(guildId, targetId, caseTypes) {
  if (!guildId || !targetId || !Array.isArray(caseTypes) || caseTypes.length === 0) {
    return { ok: false };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return { ok: false };
  }

  try {
    const { error } = await supabase
      .from('moderation_cases')
      .update({ active: false })
      .eq('guild_id', String(guildId))
      .eq('target_id', String(targetId))
      .in('case_type', caseTypes)
      .eq('active', true);

    if (error) {
      console.warn(`[mod-cases] deactivate failed for ${guildId}: ${error.message}`);
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.warn('[mod-cases] deactivate threw:', error?.message || error);
    return { ok: false };
  }
}

module.exports = { deactivateActiveCases, recordModerationCase };
