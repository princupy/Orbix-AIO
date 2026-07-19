const express = require('express');
const { requireAuth, requireGuildAccess } = require('../middleware/auth');
const {
  getCommandSeries,
  getMemberSeries,
  getMessageSeries,
  getOverview,
  getTopCommands,
} = require('../lib/analytics');

const router = express.Router();

// Analytics are read-only stats — any staff member (viewer+) may view them.
const guard = [requireAuth, requireGuildAccess];

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

router.get('/:guildId/analytics/overview', ...guard, async (req, res) => {
  try {
    return res.json(await getOverview(req.params.guildId));
  } catch (error) {
    console.error('[analytics] overview failed:', error);
    return res.status(500).json({ error: 'analytics_failed' });
  }
});

router.get('/:guildId/analytics/messages', ...guard, async (req, res) => {
  const days = clampInt(req.query.days, 14, 1, 90);

  try {
    return res.json({ days, series: await getMessageSeries(req.params.guildId, days) });
  } catch (error) {
    console.error('[analytics] messages failed:', error);
    return res.status(500).json({ error: 'analytics_failed' });
  }
});

router.get('/:guildId/analytics/members', ...guard, async (req, res) => {
  const days = clampInt(req.query.days, 14, 1, 90);

  try {
    return res.json({ days, series: await getMemberSeries(req.params.guildId, days) });
  } catch (error) {
    console.error('[analytics] members failed:', error);
    return res.status(500).json({ error: 'analytics_failed' });
  }
});

router.get('/:guildId/analytics/commands', ...guard, async (req, res) => {
  const days = clampInt(req.query.days, 7, 1, 90);
  const limit = clampInt(req.query.limit, 8, 1, 25);

  try {
    const [top, series] = await Promise.all([
      getTopCommands(req.params.guildId, days, limit),
      getCommandSeries(req.params.guildId, Math.max(days, 14)),
    ]);

    return res.json({ days, top, series });
  } catch (error) {
    console.error('[analytics] commands failed:', error);
    return res.status(500).json({ error: 'analytics_failed' });
  }
});

module.exports = router;
