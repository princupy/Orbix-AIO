const path = require('node:path');

// Load this package's own .env explicitly so it works both when started
// standalone (cwd = dashboard/backend) and when forked by the bot (cwd differs).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function stripTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function parseIdList(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
}

const env = {
  backendUrl: stripTrailingSlash(process.env.BACKEND_URL || 'http://localhost:4000'),
  botBridgeSecret: process.env.BOT_BRIDGE_SECRET || 'dev-bridge-secret',
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: process.env.DISCORD_REDIRECT_URI || 'http://localhost:4000/auth/callback',
  },
  frontendUrl: stripTrailingSlash(process.env.FRONTEND_URL || 'http://localhost:3000'),
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  nodeEnv: process.env.NODE_ENV || 'development',
  ownerIds: parseIdList(process.env.BOT_OWNER_IDS || process.env.BOT_OWNER_ID),
  port: Number(process.env.PORT) || 4000,
  supabase: {
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    url: process.env.SUPABASE_URL || '',
  },
};

// Returns a list of missing critical config keys (for a startup warning).
function getMissingConfig() {
  const missing = [];

  if (!env.discord.clientId) missing.push('DISCORD_CLIENT_ID');
  if (!env.discord.clientSecret) missing.push('DISCORD_CLIENT_SECRET');
  if (!env.discord.botToken) missing.push('DISCORD_BOT_TOKEN');
  if (!env.supabase.url || !env.supabase.key) missing.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  if (env.nodeEnv === 'production' && env.jwtSecret === 'dev-insecure-secret-change-me') {
    missing.push('JWT_SECRET');
  }

  return missing;
}

module.exports = { env, getMissingConfig };
