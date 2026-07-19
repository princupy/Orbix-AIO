const { getSupabase } = require('../supabase');

// Fallback prefix — mirrors the bot's src/config.js DEFAULT_PREFIX ('LR!').
const DEFAULT_PREFIX = 'LR!';
const PREFIX_MAX_LENGTH = 8;

// Keys MUST stay in sync with the bot's src/supabase/modules.js MODULES.
// `description` is dashboard-only copy for the settings UI.
const MODULE_DEFS = [
  { key: 'moderation', label: 'Moderation', description: 'Ban, kick, mute, purge, lock and other moderation commands.' },
  { key: 'automod', label: 'AutoMod', description: 'Automatic filtering of spam, invites, links, bad words and caps.' },
  { key: 'leveling', label: 'Leveling', description: 'XP gain, ranks, level-up rewards and the leaderboard.' },
  { key: 'tickets', label: 'Tickets', description: 'Support ticket panels and ticket management.' },
  { key: 'music', label: 'Music', description: 'Voice music playback and queue commands.' },
  { key: 'fun', label: 'Fun', description: 'Fun and social commands like ship and mini-games.' },
  { key: 'voice', label: 'Voice', description: 'Voice channel moderation and management tools.' },
  { key: 'media', label: 'Media-Only Channels', description: 'Enforce media-only posting in configured channels.' },
  { key: 'autoroles', label: 'Auto Roles', description: 'Automatically assign roles when members join.' },
  { key: 'welcome', label: 'Welcome', description: 'Send a welcome message when new members join.' },
  { key: 'logs', label: 'Server Logs', description: 'Message, member, moderation and voice event logging.' },
];

const VALID_MODULE_KEYS = new Set(MODULE_DEFS.map((module) => module.key));

/**
 * Turn the raw jsonb map ({ moderation: false, ... }) into a stable ordered
 * array for the UI. A missing key means the module is enabled.
 */
function normalizeModules(raw) {
  const map = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};

  return MODULE_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    enabled: map[def.key] !== false,
  }));
}

async function getGuildSettings(guildId) {
  const supabase = getSupabase();

  if (!supabase) {
    return { prefix: DEFAULT_PREFIX, modules: normalizeModules({}), configured: false };
  }

  const [prefixResult, modulesResult] = await Promise.all([
    supabase.from('guild_settings').select('prefix').eq('guild_id', guildId).maybeSingle(),
    supabase.from('guild_modules').select('modules').eq('guild_id', guildId).maybeSingle(),
  ]);

  const prefix = (!prefixResult.error && prefixResult.data?.prefix)
    ? prefixResult.data.prefix
    : DEFAULT_PREFIX;
  const rawModules = (!modulesResult.error && modulesResult.data?.modules)
    ? modulesResult.data.modules
    : {};

  return { prefix, modules: normalizeModules(rawModules), configured: true };
}

async function setPrefix(guildId, prefix) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ok: false, reason: 'Supabase is not configured.' };
  }

  const { error } = await supabase
    .from('guild_settings')
    .upsert({
      guild_id: guildId,
      prefix,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true, prefix };
}

async function setModule(guildId, key, enabled) {
  const supabase = getSupabase();

  if (!supabase) {
    return { ok: false, reason: 'Supabase is not configured.' };
  }

  // Read-modify-write the single jsonb map so unrelated keys are preserved.
  const { data, error } = await supabase
    .from('guild_modules')
    .select('modules')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: error.message };
  }

  const current = (data?.modules && typeof data.modules === 'object' && !Array.isArray(data.modules))
    ? data.modules
    : {};
  const nextModules = { ...current, [key]: Boolean(enabled) };

  const { error: upsertError } = await supabase
    .from('guild_modules')
    .upsert({
      guild_id: guildId,
      modules: nextModules,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'guild_id' });

  if (upsertError) {
    return { ok: false, reason: upsertError.message };
  }

  return { ok: true, modules: normalizeModules(nextModules) };
}

module.exports = {
  DEFAULT_PREFIX,
  MODULE_DEFS,
  PREFIX_MAX_LENGTH,
  VALID_MODULE_KEYS,
  getGuildSettings,
  normalizeModules,
  setModule,
  setPrefix,
};
