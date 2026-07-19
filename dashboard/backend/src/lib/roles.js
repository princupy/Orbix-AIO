const { env } = require('../env');

// Discord permission bits (as BigInt).
const PERMISSIONS = {
  ADMINISTRATOR: 1n << 3n,
  BAN_MEMBERS: 1n << 2n,
  KICK_MEMBERS: 1n << 1n,
  MANAGE_GUILD: 1n << 5n,
  MANAGE_MESSAGES: 1n << 13n,
  MODERATE_MEMBERS: 1n << 40n,
};

const ROLE_RANK = { admin: 3, moderator: 2, viewer: 1 };

function has(permissions, bit) {
  return (permissions & bit) === bit;
}

/**
 * Resolve a dashboard role for a user in a guild, from the partial guild object
 * returned by the Discord OAuth `guilds` endpoint (has `permissions`, `owner`).
 */
function resolveGuildRole(guild, userId) {
  if (env.ownerIds.includes(String(userId))) {
    return 'admin';
  }

  let permissions = 0n;
  try {
    permissions = BigInt(guild.permissions || '0');
  } catch {
    permissions = 0n;
  }

  if (guild.owner || has(permissions, PERMISSIONS.ADMINISTRATOR) || has(permissions, PERMISSIONS.MANAGE_GUILD)) {
    return 'admin';
  }

  if (
    has(permissions, PERMISSIONS.KICK_MEMBERS)
    || has(permissions, PERMISSIONS.BAN_MEMBERS)
    || has(permissions, PERMISSIONS.MODERATE_MEMBERS)
    || has(permissions, PERMISSIONS.MANAGE_MESSAGES)
  ) {
    return 'moderator';
  }

  return 'viewer';
}

// The server selector shows guilds where the user is at least a moderator.
function isStaffRole(role) {
  return role === 'admin' || role === 'moderator';
}

function meetsRole(role, minRole) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}

module.exports = {
  PERMISSIONS,
  ROLE_RANK,
  isStaffRole,
  meetsRole,
  resolveGuildRole,
};
