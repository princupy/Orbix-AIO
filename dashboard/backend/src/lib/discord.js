const { env } = require('../env');

const DISCORD_API = 'https://discord.com/api/v10';

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: env.discord.clientId,
    redirect_uri: env.discord.redirectUri,
    response_type: 'code',
    scope: 'identify guilds',
    state,
  });

  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: env.discord.clientId,
    client_secret: env.discord.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.discord.redirectUri,
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  });

  if (!res.ok) {
    throw new Error(`Discord token exchange failed (${res.status})`);
  }

  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed (${res.status})`);
  }

  return res.json();
}

async function fetchUserGuilds(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord guilds fetch failed (${res.status})`);
  }

  return res.json();
}

module.exports = {
  DISCORD_API,
  buildAuthorizeUrl,
  exchangeCode,
  fetchDiscordUser,
  fetchUserGuilds,
};
