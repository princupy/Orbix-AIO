const crypto = require('node:crypto');
const express = require('express');
const { env } = require('../env');
const {
  buildAuthorizeUrl, exchangeCode, fetchDiscordUser, fetchUserGuilds,
} = require('../lib/discord');
const { getBotGuildIds } = require('../lib/botApi');
const { isStaffRole, resolveGuildRole } = require('../lib/roles');
const {
  ACCESS_TTL_SECONDS,
  consumeOneTimeCode,
  createOneTimeCode,
  createSession,
  destroySession,
  getSession,
  signToken,
} = require('./session');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const states = new Map();

function newState() {
  const state = crypto.randomBytes(16).toString('hex');
  states.set(state, Date.now() + 5 * 60 * 1000);
  return state;
}

function consumeState(state) {
  const expiresAt = states.get(state);
  states.delete(state);
  return Boolean(expiresAt) && expiresAt > Date.now();
}

function avatarUrl(user) {
  if (user.avatar) {
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
  }

  return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

router.get('/login', (req, res) => {
  if (!env.discord.clientId) {
    return res.status(500).send('Discord OAuth is not configured.');
  }

  return res.redirect(buildAuthorizeUrl(newState()));
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const fail = (reason) => res.redirect(`${env.frontendUrl}/auth/callback?error=${encodeURIComponent(reason)}`);

  if (!code || !state || !consumeState(String(state))) {
    return fail('invalid_state');
  }

  try {
    const tokens = await exchangeCode(String(code));
    const user = await fetchDiscordUser(tokens.access_token);
    const userGuilds = await fetchUserGuilds(tokens.access_token);
    const botGuildIds = await getBotGuildIds().catch(() => new Set());

    const guilds = userGuilds
      .map((guild) => ({ guild, role: resolveGuildRole(guild, user.id) }))
      .filter(({ guild, role }) => botGuildIds.has(guild.id) && isStaffRole(role))
      .map(({ guild, role }) => ({
        icon: guild.icon || null,
        id: guild.id,
        name: guild.name,
        role,
      }));

    const profile = {
      avatar: avatarUrl(user),
      id: user.id,
      tag: user.global_name || user.username,
      username: user.username,
    };

    const sessionId = createSession({
      discord: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token },
      guilds,
      user: profile,
    });

    return res.redirect(`${env.frontendUrl}/auth/callback?code=${createOneTimeCode(sessionId)}`);
  } catch (error) {
    console.error('[auth] callback failed:', error.message);
    return fail('auth_failed');
  }
});

router.post('/exchange', (req, res) => {
  const { code } = req.body || {};

  if (!code) {
    return res.status(400).json({ error: 'missing_code' });
  }

  const sessionId = consumeOneTimeCode(String(code));
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    return res.status(400).json({ error: 'invalid_code' });
  }

  return res.json({
    expiresIn: ACCESS_TTL_SECONDS,
    token: signToken(sessionId, session.user.id),
    user: session.user,
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/refresh', requireAuth, (req, res) => {
  res.json({ expiresIn: ACCESS_TTL_SECONDS, token: signToken(req.sessionId, req.user.id) });
});

router.post('/logout', requireAuth, (req, res) => {
  destroySession(req.sessionId);
  res.json({ ok: true });
});

const stateCleanup = setInterval(() => {
  const now = Date.now();
  for (const [state, expiresAt] of states) {
    if (expiresAt < now) {
      states.delete(state);
    }
  }
}, 5 * 60 * 1000);
stateCleanup.unref?.();

module.exports = router;
