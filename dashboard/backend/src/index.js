const http = require('node:http');
const cors = require('cors');
const express = require('express');
const { env, getMissingConfig } = require('./env');
const authRoutes = require('./auth/routes');
const guildRoutes = require('./routes/guilds');
const settingsRoutes = require('./routes/settings');
const analyticsRoutes = require('./routes/analytics');
const logsRoutes = require('./routes/logs');
const moderationRoutes = require('./routes/moderation');
const { initRealtime } = require('./realtime/io');

const app = express();

app.use(cors({ credentials: false, origin: env.frontendUrl }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'orbix-dashboard-backend', uptime: process.uptime() });
});

app.use('/auth', authRoutes);
app.use('/api/guilds', guildRoutes);
app.use('/api/guilds', settingsRoutes);
app.use('/api/guilds', analyticsRoutes);
app.use('/api/guilds', logsRoutes);
app.use('/api/guilds', moderationRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  console.error('[api] unhandled error:', error);
  res.status(500).json({ error: 'internal_error' });
});

const server = http.createServer(app);
initRealtime(server);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[dashboard] port ${env.port} is already in use — is the backend already running?`);
  } else {
    console.error('[dashboard] server error:', error);
  }

  process.exit(1);
});

server.listen(env.port, () => {
  console.log(`[dashboard] backend listening on :${env.port}`);

  const missing = getMissingConfig();

  if (missing.length) {
    console.warn(`[dashboard] missing config: ${missing.join(', ')} — auth/DB features are limited until these are set.`);
  }
});

module.exports = { app, server };
