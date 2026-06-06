const { getSupabase } = require('./client');

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 30_000;
const activeCache = new Map();

const DURATION_OPTIONS = Object.freeze([
  {
    key: '1d',
    label: '1 Day',
    description: 'Expires after 24 hours.',
    apply(date) {
      date.setDate(date.getDate() + 1);
    },
  },
  {
    key: '1w',
    label: '1 Week',
    description: 'Expires after 7 days.',
    apply(date) {
      date.setDate(date.getDate() + 7);
    },
  },
  {
    key: '1m',
    label: '1 Month',
    description: 'Expires after 1 month.',
    apply(date) {
      date.setMonth(date.getMonth() + 1);
    },
  },
  {
    key: '3m',
    label: '3 Months',
    description: 'Expires after 3 months.',
    apply(date) {
      date.setMonth(date.getMonth() + 3);
    },
  },
  {
    key: '6m',
    label: '6 Months',
    description: 'Expires after 6 months.',
    apply(date) {
      date.setMonth(date.getMonth() + 6);
    },
  },
  {
    key: '1y',
    label: '1 Year',
    description: 'Expires after 1 year.',
    apply(date) {
      date.setFullYear(date.getFullYear() + 1);
    },
  },
  {
    key: '3y',
    label: '3 Years',
    description: 'Expires after 3 years.',
    apply(date) {
      date.setFullYear(date.getFullYear() + 3);
    },
  },
  {
    key: 'permanent',
    label: 'Permanent',
    description: 'Never expires.',
    apply() {
      return null;
    },
  },
]);

function getDurationOption(durationKey) {
  return DURATION_OPTIONS.find((option) => option.key === durationKey) || null;
}

function calculateExpiresAt(durationKey, startedAt = new Date()) {
  const option = getDurationOption(durationKey);

  if (!option || option.key === 'permanent') {
    return null;
  }

  const expiresAt = new Date(startedAt.getTime());
  option.apply(expiresAt);
  return expiresAt.toISOString();
}

function isExpired(expiresAt, now = Date.now()) {
  return Boolean(expiresAt && Date.parse(expiresAt) <= now);
}

function formatRemaining(expiresAt, now = Date.now()) {
  if (!expiresAt) {
    return 'Permanent';
  }

  const remainingMs = Date.parse(expiresAt) - now;

  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return 'Expired';
  }

  const days = Math.floor(remainingMs / DAY_MS);
  const hours = Math.floor((remainingMs % DAY_MS) / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }

  return `${Math.max(1, minutes)}m remaining`;
}

function setCachedActive(userId, active, expiresAt = null) {
  const ttlExpiresAt = Date.now() + CACHE_TTL_MS;
  const userExpiresAt = expiresAt ? Date.parse(expiresAt) : null;
  const cacheExpiresAt = userExpiresAt
    ? Math.min(ttlExpiresAt, userExpiresAt)
    : ttlExpiresAt;

  activeCache.set(String(userId), {
    active,
    expiresAt: cacheExpiresAt,
  });
}

function getCachedActive(userId) {
  const cached = activeCache.get(String(userId));

  if (!cached || cached.expiresAt <= Date.now()) {
    activeCache.delete(String(userId));
    return null;
  }

  return cached.active;
}

function clearNoPrefixCache(userId) {
  if (userId) {
    activeCache.delete(String(userId));
    return;
  }

  activeCache.clear();
}

async function addNoPrefixUser({ userId, addedBy, durationKey }) {
  const option = getDurationOption(durationKey);

  if (!option) {
    return {
      ok: false,
      reason: 'Invalid duration selected.',
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      reason: 'Supabase is not configured.',
    };
  }

  const expiresAt = calculateExpiresAt(option.key);
  const { error } = await supabase
    .from('noprefix_users')
    .upsert({
      user_id: String(userId),
      added_by: String(addedBy),
      duration_key: option.key,
      duration_label: option.label,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  setCachedActive(userId, true, expiresAt);

  return {
    ok: true,
    duration: option,
    expiresAt,
  };
}

async function removeNoPrefixUser(userId) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      removed: false,
      reason: 'Supabase is not configured.',
    };
  }

  const { data: existingRow, error: lookupError } = await supabase
    .from('noprefix_users')
    .select('user_id')
    .eq('user_id', String(userId))
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      removed: false,
      reason: lookupError.message,
    };
  }

  if (!existingRow) {
    clearNoPrefixCache(userId);
    return {
      ok: true,
      removed: false,
    };
  }

  const { error } = await supabase
    .from('noprefix_users')
    .delete()
    .eq('user_id', String(userId));

  if (error) {
    return {
      ok: false,
      removed: false,
      reason: error.message,
    };
  }

  clearNoPrefixCache(userId);

  return {
    ok: true,
    removed: true,
  };
}

async function isNoPrefixUser(userId) {
  const cached = getCachedActive(userId);

  if (cached !== null) {
    return cached;
  }

  const supabase = getSupabase();

  if (!supabase) {
    return false;
  }

  const { data, error } = await supabase
    .from('noprefix_users')
    .select('user_id, expires_at')
    .eq('user_id', String(userId))
    .maybeSingle();

  if (error) {
    console.warn(`[supabase] Failed to load noprefix user ${userId}: ${error.message}`);
    return false;
  }

  if (!data) {
    setCachedActive(userId, false);
    return false;
  }

  if (isExpired(data.expires_at)) {
    await removeNoPrefixUser(userId);
    setCachedActive(userId, false);
    return false;
  }

  setCachedActive(userId, true, data.expires_at);
  return true;
}

async function listNoPrefixUsers() {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ok: false,
      users: [],
      reason: 'Supabase is not configured.',
    };
  }

  const { data, error } = await supabase
    .from('noprefix_users')
    .select('user_id, added_by, duration_key, duration_label, expires_at, created_at, updated_at')
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      users: [],
      reason: error.message,
    };
  }

  const now = Date.now();
  const activeUsers = [];
  const expiredUserIds = [];

  for (const row of data || []) {
    if (isExpired(row.expires_at, now)) {
      expiredUserIds.push(row.user_id);
      continue;
    }

    activeUsers.push(row);
  }

  if (expiredUserIds.length > 0) {
    await supabase
      .from('noprefix_users')
      .delete()
      .in('user_id', expiredUserIds);

    for (const userId of expiredUserIds) {
      clearNoPrefixCache(userId);
    }
  }

  return {
    ok: true,
    users: activeUsers,
  };
}

module.exports = {
  DURATION_OPTIONS,
  addNoPrefixUser,
  calculateExpiresAt,
  clearNoPrefixCache,
  formatRemaining,
  getDurationOption,
  isNoPrefixUser,
  listNoPrefixUsers,
  removeNoPrefixUser,
};
