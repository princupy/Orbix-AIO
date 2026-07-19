const { getSupabase } = require('./client');

// Persist a single dashboard activity-feed entry. Best-effort and fire-and-forget:
// never throws, and a no-op when Supabase is not configured.
async function recordActivityLog(entry) {
  if (!entry || !entry.guildId || !entry.type) {
    return;
  }

  const supabase = getSupabase();

  if (!supabase) {
    return;
  }

  try {
    const { error } = await supabase.from('activity_logs').insert({
      guild_id: String(entry.guildId),
      type: String(entry.type).slice(0, 32),
      title: entry.title ? String(entry.title).slice(0, 200) : null,
      description: entry.description ? String(entry.description).slice(0, 500) : null,
      target_id: entry.targetId ? String(entry.targetId) : null,
      target_tag: entry.targetTag ? String(entry.targetTag).slice(0, 100) : null,
      moderator_id: entry.moderatorId ? String(entry.moderatorId) : null,
      moderator_tag: entry.moderatorTag ? String(entry.moderatorTag).slice(0, 100) : null,
    });

    if (error) {
      console.warn(`[activity-logs] insert failed for ${entry.guildId}: ${error.message}`);
    }
  } catch (error) {
    console.warn('[activity-logs] insert threw:', error?.message || error);
  }
}

module.exports = { recordActivityLog };
