const { getSupabase } = require('./client');

// Per-guild feature toggles, stored as a single jsonb map in guild_modules.
// A missing key means the module is ENABLED, so guilds without a row (or with
// an empty map) keep every feature on — no regression for existing servers.
// Only an explicit `false` disables a module.

const MODULES_CACHE_TTL_MS = 60_000;
const modulesCache = new Map();

/**
 * Toggleable modules exposed on the dashboard.
 * `category` maps a bot command category to a module (null = event-only feature
 * with no owning command category). Core categories (utility, config, owner,
 * setup-roles) are intentionally absent so they can never be turned off.
 */
const MODULES = [
  { key: 'moderation', label: 'Moderation', category: 'moderation' },
  { key: 'automod', label: 'AutoMod', category: 'automod' },
  { key: 'leveling', label: 'Leveling', category: 'leveling' },
  { key: 'tickets', label: 'Tickets', category: 'ticket' },
  { key: 'music', label: 'Music', category: 'music' },
  { key: 'fun', label: 'Fun', category: 'fun' },
  { key: 'voice', label: 'Voice', category: 'voice' },
  { key: 'media', label: 'Media-Only Channels', category: 'media' },
  { key: 'autoroles', label: 'Auto Roles', category: 'auto-roles' },
  { key: 'welcome', label: 'Welcome', category: 'welcome' },
  { key: 'logs', label: 'Server Logs', category: 'logs' },
];

const CATEGORY_TO_MODULE = MODULES.reduce((map, module) => {
  if (module.category) {
    map[module.category] = module.key;
  }

  return map;
}, {});

const VALID_MODULE_KEYS = new Set(MODULES.map((module) => module.key));

function getCachedModules(guildId) {
  const cached = modulesCache.get(guildId);

  if (!cached || cached.expiresAt <= Date.now()) {
    modulesCache.delete(guildId);
    return null;
  }

  return cached.modules;
}

function setCachedModules(guildId, modules) {
  modulesCache.set(guildId, {
    modules,
    expiresAt: Date.now() + MODULES_CACHE_TTL_MS,
  });
}

/**
 * Returns the raw module map for a guild ({ moderation: false, ... }).
 * Defaults to an empty object (everything enabled) when Supabase is not
 * configured, no row exists, or a read fails — never throws.
 */
async function getGuildModules(guildId) {
  if (!guildId) {
    return {};
  }

  const cached = getCachedModules(guildId);

  if (cached) {
    return cached;
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {};
  }

  const { data, error } = await supabase
    .from('guild_modules')
    .select('modules')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) {
    console.warn(`[supabase] Failed to load modules for guild ${guildId}: ${error.message}`);
    return {};
  }

  const modules = (data?.modules && typeof data.modules === 'object' && !Array.isArray(data.modules))
    ? data.modules
    : {};

  setCachedModules(guildId, modules);

  return modules;
}

/**
 * Whether a module is enabled for a guild. Missing key -> enabled (true).
 * Unknown/blank arguments resolve to enabled so callers never accidentally
 * gate a feature because of a bad lookup.
 */
async function isModuleEnabled(guildId, moduleKey) {
  if (!guildId || !moduleKey) {
    return true;
  }

  const modules = await getGuildModules(guildId);

  return modules[moduleKey] !== false;
}

/**
 * Map a command category to its owning module key (or null if the category is
 * a core one that is never gated).
 */
function moduleForCategory(category) {
  return CATEGORY_TO_MODULE[category] || null;
}

function clearModulesCache(guildId) {
  if (guildId) {
    modulesCache.delete(guildId);
  } else {
    modulesCache.clear();
  }
}

module.exports = {
  CATEGORY_TO_MODULE,
  MODULES,
  VALID_MODULE_KEYS,
  clearModulesCache,
  getGuildModules,
  isModuleEnabled,
  moduleForCategory,
};
