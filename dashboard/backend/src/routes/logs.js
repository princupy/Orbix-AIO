const express = require('express');
const { requireAuth, requireGuildAccess, requireRole } = require('../middleware/auth');
const { LOG_TYPES, VALID_LOG_TYPES, getRecentLogs } = require('../lib/logs');

const router = express.Router();

// The activity feed is staff-only (moderator or admin), matching the nav.
const guard = [requireAuth, requireGuildAccess, requireRole('moderator')];

router.get('/:guildId/logs', ...guard, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const type = VALID_LOG_TYPES.has(req.query.type) ? req.query.type : null;
  const beforeId = Number(req.query.before) > 0 ? Math.floor(Number(req.query.before)) : null;

  try {
    const logs = await getRecentLogs(req.params.guildId, { limit, type, beforeId });
    return res.json({ logs, types: LOG_TYPES });
  } catch (error) {
    console.error('[logs] read failed:', error);
    return res.status(500).json({ error: 'logs_failed' });
  }
});

module.exports = router;
