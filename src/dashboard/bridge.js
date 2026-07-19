// Bot-side bridge to the dashboard backend.
// Connects to the backend's private Socket.io "/bot" namespace over localhost
// (bot + backend run on the same VPS) using a shared secret, then pushes live
// events and answers stat/action requests. Disabled unless env is configured.

let bridge = null;

function initDashboardBridge(client) {
  const url = (process.env.DASHBOARD_BRIDGE_URL || '').replace(/\/+$/, '');
  const secret = process.env.BOT_BRIDGE_SECRET;

  if (!url || !secret) {
    console.log('[dashboard-bridge] disabled (set DASHBOARD_BRIDGE_URL + BOT_BRIDGE_SECRET to enable).');
    return null;
  }

  let io;
  try {
    ({ io } = require('socket.io-client'));
  } catch (error) {
    console.warn('[dashboard-bridge] socket.io-client is not installed; bridge disabled.', error.message);
    return null;
  }

  const socket = io(`${url}/bot`, {
    auth: { secret },
    reconnection: true,
    reconnectionDelay: 5000,
    transports: ['websocket'],
  });

  socket.on('connect', () => console.log('[dashboard-bridge] connected to dashboard backend'));
  socket.on('connect_error', (error) => console.warn('[dashboard-bridge] connect error:', error.message));
  socket.on('disconnect', () => console.log('[dashboard-bridge] disconnected'));

  // backend → bot: push fresh stats for a guild on demand.
  socket.on('requestStats', ({ guildId } = {}) => {
    const guild = guildId && client.guilds.cache.get(String(guildId));

    if (guild) {
      socket.emit('guildStats', {
        at: Date.now(),
        guildId: guild.id,
        memberCount: guild.memberCount,
      });
    }
  });

  // backend → bot: settings changed on the dashboard. Drop cached config so the
  // next command/message reads fresh values immediately (no bot restart needed).
  socket.on('configChanged', ({ guildId } = {}) => {
    if (!guildId) {
      return;
    }

    const id = String(guildId);

    try {
      require('../supabase/modules').clearModulesCache(id);
    } catch (error) {
      console.warn('[dashboard-bridge] failed to clear modules cache:', error.message);
    }

    try {
      require('../supabase/guildSettings').clearGuildPrefixCache(id);
    } catch (error) {
      console.warn('[dashboard-bridge] failed to clear prefix cache:', error.message);
    }
  });

  // backend → bot: perform a dashboard-initiated moderation action, then ack.
  // The resulting Discord event (ban remove / timeout clear) is picked up by the
  // log handlers, which record the unban/unmute case — so we don't record here.
  socket.on('modActionRequest', async (payload = {}) => {
    const {
      requestId, guildId, action, targetId, reason,
    } = payload;
    const respond = (ok, error) => socket.emit('modActionResult', { requestId, ok, error: error || null });

    try {
      const guild = guildId && client.guilds.cache.get(String(guildId));

      if (!guild) {
        respond(false, 'Guild not found');
        return;
      }

      if (!targetId) {
        respond(false, 'Missing target');
        return;
      }

      const auditReason = `Dashboard action by staff: ${reason || action}`.slice(0, 400);

      if (action === 'unban') {
        await guild.bans.remove(String(targetId), auditReason);
        respond(true);
        return;
      }

      if (action === 'unmute') {
        const member = await guild.members.fetch(String(targetId)).catch(() => null);

        if (!member) {
          respond(false, 'Member is not in the server');
          return;
        }

        await member.timeout(null, auditReason);
        respond(true);
        return;
      }

      respond(false, `Unknown action: ${action}`);
    } catch (error) {
      respond(false, error?.message || 'Action failed');
    }
  });

  bridge = {
    emit: (event, payload) => {
      if (socket.connected) {
        socket.emit(event, payload);
      }
    },
    socket,
  };

  return bridge;
}

function getDashboardBridge() {
  return bridge;
}

// Push live guild stats to the dashboard (used on member join/leave so the
// live member counter updates immediately). No-op if the bridge is disabled.
function pushGuildStats(guild) {
  if (!bridge || !guild) {
    return;
  }

  bridge.emit('guildStats', {
    at: Date.now(),
    guildId: guild.id,
    memberCount: guild.memberCount,
  });
}

// Push a log event to the dashboard's live activity feed. No-op if disabled.
function pushLogEvent(payload) {
  if (!bridge || !payload) {
    return;
  }

  bridge.emit('logEvent', payload);
}

// Push a moderation case to the dashboard's live moderation table. No-op if disabled.
function pushModAction(payload) {
  if (!bridge || !payload) {
    return;
  }

  bridge.emit('modAction', payload);
}

module.exports = {
  getDashboardBridge,
  initDashboardBridge,
  pushGuildStats,
  pushLogEvent,
  pushModAction,
};
