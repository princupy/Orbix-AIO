const crypto = require('node:crypto');
const { Server } = require('socket.io');
const { env } = require('../env');
const { getSession, verifyToken } = require('../auth/session');

// Events the bot pushes that we relay to dashboard clients in the guild room.
const RELAYED_BOT_EVENTS = ['guildStats', 'commandUsed', 'modAction', 'memberUpdate', 'logEvent'];

let io = null;
let botSocket = null;

// Pending dashboard-initiated actions awaiting the bot's ack (requestId -> {resolve, timer}).
const pendingActions = new Map();

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { methods: ['GET', 'POST'], origin: env.frontendUrl },
  });

  // ── Dashboard clients (default namespace) ──
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const decoded = token ? verifyToken(token) : null;
    const session = decoded?.sid ? getSession(decoded.sid) : null;

    if (!session) {
      next(new Error('unauthorized'));
      return;
    }

    socket.data.session = session;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('subscribe', (guildId) => {
      const id = String(guildId);
      const hasAccess = (socket.data.session.guilds || []).some((guild) => guild.id === id);

      if (!hasAccess) {
        return;
      }

      socket.join(`guild:${id}`);
      // Ask the bot to push fresh stats for this guild right away.
      emitToBot('requestStats', { guildId: id });
    });

    socket.on('unsubscribe', (guildId) => {
      socket.leave(`guild:${String(guildId)}`);
    });
  });

  // ── Bot bridge (private namespace, shared-secret auth) ──
  const botNamespace = io.of('/bot');

  botNamespace.use((socket, next) => {
    if (socket.handshake.auth?.secret === env.botBridgeSecret) {
      next();
      return;
    }

    next(new Error('unauthorized'));
  });

  botNamespace.on('connection', (socket) => {
    botSocket = socket;
    console.log('[realtime] bot bridge connected');

    for (const event of RELAYED_BOT_EVENTS) {
      socket.on(event, (payload) => {
        const guildId = payload?.guildId;

        if (guildId) {
          io.to(`guild:${String(guildId)}`).emit(event, payload);
        }
      });
    }

    // Ack for a dashboard-initiated moderation action.
    socket.on('modActionResult', ({ requestId, ok, error } = {}) => {
      const pending = requestId && pendingActions.get(requestId);

      if (pending) {
        clearTimeout(pending.timer);
        pendingActions.delete(requestId);
        pending.resolve({ ok: Boolean(ok), error: error || null });
      }
    });

    socket.on('disconnect', () => {
      if (botSocket === socket) {
        botSocket = null;
      }
      console.log('[realtime] bot bridge disconnected');
    });
  });

  return io;
}

function getIo() {
  return io;
}

// backend → bot (request stats, request a mod action, notify config change, ...)
function emitToBot(event, payload) {
  if (botSocket && botSocket.connected) {
    botSocket.emit(event, payload);
    return true;
  }

  return false;
}

// Send an action to the bot and resolve with its ack ({ ok, error }).
// Resolves { ok:false, error:'bot_offline' } when no bot is connected, or
// { ok:false, error:'timeout' } if the bot does not answer in time.
function requestBotAction(payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!botSocket || !botSocket.connected) {
      resolve({ ok: false, error: 'bot_offline' });
      return;
    }

    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      if (pendingActions.has(requestId)) {
        pendingActions.delete(requestId);
        resolve({ ok: false, error: 'timeout' });
      }
    }, timeoutMs);
    timer.unref?.();

    pendingActions.set(requestId, { resolve, timer });
    botSocket.emit('modActionRequest', { ...payload, requestId });
  });
}

module.exports = {
  emitToBot, getIo, initRealtime, requestBotAction,
};
