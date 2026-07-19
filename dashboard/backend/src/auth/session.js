const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../env');

const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_TIME_TTL_MS = 60 * 1000;

// In-memory stores (single backend process). Sessions are lost on restart,
// which just forces users to log in again — acceptable for now.
const sessions = new Map();
const oneTimeCodes = new Map();

function createSession(data) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, { ...data, createdAt: Date.now() });
  return sessionId;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function destroySession(sessionId) {
  sessions.delete(sessionId);
}

function signToken(sessionId, userId) {
  return jwt.sign({ sid: sessionId, uid: userId }, env.jwtSecret, { expiresIn: ACCESS_TTL_SECONDS });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}

function createOneTimeCode(sessionId) {
  const code = crypto.randomBytes(24).toString('hex');
  oneTimeCodes.set(code, { expiresAt: Date.now() + ONE_TIME_TTL_MS, sessionId });
  return code;
}

function consumeOneTimeCode(code) {
  const entry = oneTimeCodes.get(code);
  oneTimeCodes.delete(code);

  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }

  return entry.sessionId;
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();

  for (const [code, entry] of oneTimeCodes) {
    if (entry.expiresAt < now) {
      oneTimeCodes.delete(code);
    }
  }

  for (const [id, session] of sessions) {
    if (now - (session.createdAt || 0) > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();

module.exports = {
  ACCESS_TTL_SECONDS,
  consumeOneTimeCode,
  createOneTimeCode,
  createSession,
  destroySession,
  getSession,
  signToken,
  verifyToken,
};
