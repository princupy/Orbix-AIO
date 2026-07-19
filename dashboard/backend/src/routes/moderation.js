const express = require('express');
const { requireAuth, requireGuildAccess, requireRole } = require('../middleware/auth');
const { meetsRole } = require('../lib/roles');
const { requestBotAction } = require('../realtime/io');
const {
  CASE_TYPES, VALID_CASE_TYPES, getCase, getStats, listCases,
} = require('../lib/moderation');

const router = express.Router();

// Viewing the case log is staff-only (moderator or admin).
const viewGuard = [requireAuth, requireGuildAccess, requireRole('moderator')];

// Which revoke action a case type maps to, and the role it requires.
const REVOKE = {
  ban: { action: 'unban', role: 'admin' },
  mute: { action: 'unmute', role: 'moderator' },
};

router.get('/:guildId/moderation/cases', ...viewGuard, async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const type = VALID_CASE_TYPES.has(req.query.type) ? req.query.type : null;
  const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : null;
  const search = typeof req.query.search === 'string' && req.query.search.trim()
    ? req.query.search.trim().slice(0, 100)
    : null;
  const beforeId = Number(req.query.before) > 0 ? Math.floor(Number(req.query.before)) : null;

  try {
    const cases = await listCases(req.params.guildId, {
      limit, type, active, search, beforeId,
    });
    return res.json({ cases, types: CASE_TYPES });
  } catch (error) {
    console.error('[moderation] cases failed:', error);
    return res.status(500).json({ error: 'moderation_failed' });
  }
});

router.get('/:guildId/moderation/stats', ...viewGuard, async (req, res) => {
  try {
    return res.json(await getStats(req.params.guildId));
  } catch (error) {
    console.error('[moderation] stats failed:', error);
    return res.status(500).json({ error: 'moderation_failed' });
  }
});

// Revoke an active case (unban -> admin, unmute -> moderator). The bot performs
// the Discord action; the resulting event records the unban/unmute case.
router.post('/:guildId/moderation/cases/:caseId/revoke', requireAuth, requireGuildAccess, async (req, res) => {
  const caseId = Number(req.params.caseId);

  if (!Number.isInteger(caseId) || caseId <= 0) {
    return res.status(400).json({ error: 'invalid_case' });
  }

  const target = await getCase(req.params.guildId, caseId);

  if (!target) {
    return res.status(404).json({ error: 'case_not_found' });
  }

  const revoke = REVOKE[target.type];

  if (!revoke) {
    return res.status(400).json({ error: 'not_revocable' });
  }

  if (!target.active) {
    return res.status(400).json({ error: 'already_inactive' });
  }

  if (!meetsRole(req.guildRole, revoke.role)) {
    return res.status(403).json({ error: 'insufficient_role', required: revoke.role });
  }

  const result = await requestBotAction({
    guildId: req.params.guildId,
    action: revoke.action,
    targetId: target.targetId,
    reason: `Revoked from dashboard by ${req.user?.username || 'staff'}`,
  });

  if (!result.ok) {
    const status = result.error === 'bot_offline' ? 503 : result.error === 'timeout' ? 504 : 502;
    return res.status(status).json({ error: result.error || 'action_failed' });
  }

  return res.json({ ok: true, action: revoke.action, caseId });
});

module.exports = router;
