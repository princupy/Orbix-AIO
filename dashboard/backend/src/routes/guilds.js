const express = require('express');
const { requireAuth, requireGuildAccess } = require('../middleware/auth');

const router = express.Router();

// All mutual servers the logged-in user can manage (admin/moderator).
router.get('/', requireAuth, (req, res) => {
  res.json({ guilds: req.session.guilds || [] });
});

// A single guild the user has access to, with their resolved role.
router.get('/:guildId', requireAuth, requireGuildAccess, (req, res) => {
  res.json({ guild: req.guild, role: req.guildRole });
});

module.exports = router;
