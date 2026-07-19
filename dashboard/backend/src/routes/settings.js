const express = require('express');
const { requireAuth, requireGuildAccess, requireRole } = require('../middleware/auth');
const { emitToBot } = require('../realtime/io');
const {
  PREFIX_MAX_LENGTH,
  VALID_MODULE_KEYS,
  getGuildSettings,
  setModule,
  setPrefix,
} = require('../lib/settings');

const router = express.Router();

// Bot configuration is admin-only. Each route resolves the caller's role on the
// target guild and requires "admin" (owner / Manage Server / Administrator).
const adminGuard = [requireAuth, requireGuildAccess, requireRole('admin')];

// GET current prefix + module states for a guild.
router.get('/:guildId/settings', ...adminGuard, async (req, res) => {
  try {
    const settings = await getGuildSettings(req.params.guildId);
    return res.json(settings);
  } catch (error) {
    console.error('[settings] read failed:', error);
    return res.status(500).json({ error: 'settings_read_failed' });
  }
});

// PUT a new command prefix.
router.put('/:guildId/settings/prefix', ...adminGuard, async (req, res) => {
  const raw = typeof req.body?.prefix === 'string' ? req.body.prefix.trim() : '';

  if (!raw || raw.length > PREFIX_MAX_LENGTH || /\s/.test(raw)) {
    return res.status(400).json({ error: 'invalid_prefix', maxLength: PREFIX_MAX_LENGTH });
  }

  const result = await setPrefix(req.params.guildId, raw);

  if (!result.ok) {
    return res.status(500).json({ error: 'prefix_update_failed', reason: result.reason });
  }

  // Tell the bot to drop its cached prefix so the change takes effect at once.
  emitToBot('configChanged', { guildId: req.params.guildId, type: 'prefix' });

  return res.json({ prefix: result.prefix });
});

// PUT a single module toggle { key, enabled }.
router.put('/:guildId/settings/modules', ...adminGuard, async (req, res) => {
  const key = typeof req.body?.key === 'string' ? req.body.key : '';
  const { enabled } = req.body || {};

  if (!VALID_MODULE_KEYS.has(key) || typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'invalid_module', validKeys: [...VALID_MODULE_KEYS] });
  }

  const result = await setModule(req.params.guildId, key, enabled);

  if (!result.ok) {
    return res.status(500).json({ error: 'module_update_failed', reason: result.reason });
  }

  // Tell the bot to drop its cached module map for this guild.
  emitToBot('configChanged', { guildId: req.params.guildId, type: 'module', key });

  return res.json({ modules: result.modules });
});

module.exports = router;
