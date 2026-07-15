const { getSupabase } = require('./client');

const CACHE_TTL_MS = 60_000;
const accessRoleCache = new Map();
const commandCache = new Map();

function getCached(cache, guildId) {
  const key = String(guildId);
  const cached = cache.get(key);

  if (!cached || cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(cache, guildId, value) {
  cache.set(String(guildId), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function clearSetupRoleCache(guildId) {
  if (!guildId) {
    accessRoleCache.clear();
    commandCache.clear();
    return;
  }

  const key = String(guildId);
  accessRoleCache.delete(key);
  commandCache.delete(key);
}

function getStorageError() {
  return {
    ok: false,
    reason: 'Supabase is not configured.',
  };
}

async function listSetupAccessRoles(guildId) {
  const cached = getCached(accessRoleCache, guildId);

  if (cached) {
    return {
      ok: true,
      roles: cached,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      roles: [],
    };
  }

  const { data, error } = await supabase
    .from('setup_role_access')
    .select('role_id, added_by, created_at')
    .eq('guild_id', String(guildId))
    .order('created_at', { ascending: true });

  if (error) {
    return {
      ok: false,
      reason: error.message,
      roles: [],
    };
  }

  const roles = data || [];
  setCached(accessRoleCache, guildId, roles);

  return {
    ok: true,
    roles,
  };
}

async function getSetupAccessRoleIds(guildId) {
  const result = await listSetupAccessRoles(guildId);

  return {
    ...result,
    roleIds: new Set(result.roles.map((row) => String(row.role_id))),
  };
}

async function addSetupAccessRole({ guildId, roleId, addedBy }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('setup_role_access')
    .upsert({
      guild_id: String(guildId),
      role_id: String(roleId),
      added_by: String(addedBy),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'guild_id,role_id',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  accessRoleCache.delete(String(guildId));

  return {
    ok: true,
    roleId: String(roleId),
  };
}

async function removeSetupAccessRole({ guildId, roleId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('setup_role_access')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('role_id', String(roleId));

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  accessRoleCache.delete(String(guildId));

  return {
    ok: true,
    roleId: String(roleId),
  };
}

async function listSetupRoleCommands(guildId) {
  const cached = getCached(commandCache, guildId);

  if (cached) {
    return {
      commands: cached,
      ok: true,
    };
  }

  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      commands: [],
    };
  }

  const { data, error } = await supabase
    .from('setup_role_commands')
    .select('command_name, role_id, created_by, created_at, updated_at')
    .eq('guild_id', String(guildId))
    .order('command_name', { ascending: true });

  if (error) {
    return {
      commands: [],
      ok: false,
      reason: error.message,
    };
  }

  const commands = data || [];
  setCached(commandCache, guildId, commands);

  return {
    commands,
    ok: true,
  };
}

async function getSetupRoleCommand(guildId, commandName) {
  const result = await listSetupRoleCommands(guildId);

  if (!result.ok) {
    return {
      ...result,
      command: null,
    };
  }

  return {
    command: result.commands.find((row) => row.command_name === String(commandName)) || null,
    ok: true,
  };
}

async function setSetupRoleCommand({
  commandName,
  createdBy,
  guildId,
  roleId,
}) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('setup_role_commands')
    .upsert({
      guild_id: String(guildId),
      command_name: String(commandName),
      role_id: String(roleId),
      created_by: String(createdBy),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'guild_id,command_name',
    });

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  commandCache.delete(String(guildId));

  return {
    commandName: String(commandName),
    ok: true,
    roleId: String(roleId),
  };
}

async function removeSetupRoleCommand({ commandName, guildId }) {
  const supabase = getSupabase();

  if (!supabase) {
    return getStorageError();
  }

  const { error } = await supabase
    .from('setup_role_commands')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('command_name', String(commandName));

  if (error) {
    return {
      ok: false,
      reason: error.message,
    };
  }

  commandCache.delete(String(guildId));

  return {
    commandName: String(commandName),
    ok: true,
  };
}

async function resetSetupRoleData(guildId) {
  const supabase = getSupabase();
  clearSetupRoleCache(guildId);

  if (!supabase) {
    return getStorageError();
  }

  for (const table of ['setup_role_access', 'setup_role_commands']) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('guild_id', String(guildId));

    if (error) {
      return {
        ok: false,
        reason: error.message,
      };
    }
  }

  return {
    ok: true,
  };
}

async function cleanupLeftSetupRoleData(activeGuildIds) {
  const supabase = getSupabase();

  if (!supabase) {
    return {
      ...getStorageError(),
      removed: 0,
    };
  }

  const activeGuildSet = new Set(activeGuildIds.map(String));
  const staleGuildIds = new Set();

  for (const table of ['setup_role_access', 'setup_role_commands']) {
    const { data, error } = await supabase
      .from(table)
      .select('guild_id');

    if (error) {
      return {
        ok: false,
        reason: error.message,
        removed: 0,
      };
    }

    for (const row of data || []) {
      if (!activeGuildSet.has(String(row.guild_id))) {
        staleGuildIds.add(String(row.guild_id));
      }
    }
  }

  if (staleGuildIds.size === 0) {
    return {
      ok: true,
      removed: 0,
    };
  }

  const staleIds = [...staleGuildIds];

  for (const table of ['setup_role_access', 'setup_role_commands']) {
    const { error } = await supabase
      .from(table)
      .delete()
      .in('guild_id', staleIds);

    if (error) {
      return {
        ok: false,
        reason: error.message,
        removed: 0,
      };
    }
  }

  for (const guildId of staleIds) {
    clearSetupRoleCache(guildId);
  }

  return {
    ok: true,
    removed: staleIds.length,
  };
}

module.exports = {
  addSetupAccessRole,
  cleanupLeftSetupRoleData,
  clearSetupRoleCache,
  getSetupAccessRoleIds,
  getSetupRoleCommand,
  listSetupAccessRoles,
  listSetupRoleCommands,
  removeSetupAccessRole,
  removeSetupRoleCommand,
  resetSetupRoleData,
  setSetupRoleCommand,
};
