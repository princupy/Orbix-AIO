const { getSession, verifyToken } = require('../auth/session');
const { meetsRole } = require('../lib/roles');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const decoded = verifyToken(token);

  if (!decoded?.sid) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const session = getSession(decoded.sid);

  if (!session) {
    return res.status(401).json({ error: 'session_expired' });
  }

  req.sessionId = decoded.sid;
  req.session = session;
  req.user = session.user;
  return next();
}

function requireGuildAccess(req, res, next) {
  const { guildId } = req.params;
  const guild = (req.session.guilds || []).find((entry) => entry.id === guildId);

  if (!guild) {
    return res.status(403).json({ error: 'no_guild_access' });
  }

  req.guild = guild;
  req.guildRole = guild.role;
  return next();
}

function requireRole(minRole) {
  return (req, res, next) => {
    if (!req.guildRole || !meetsRole(req.guildRole, minRole)) {
      return res.status(403).json({ error: 'insufficient_role', required: minRole });
    }

    return next();
  };
}

module.exports = { requireAuth, requireGuildAccess, requireRole };
