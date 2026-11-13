const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { fail } = require('../utils/errors');
const { accessSecret } = require('../utils/tokens');

/**
 * Auth middleware, two flavours:
 *
 * requireAuth — a valid Bearer token is mandatory. On success the user is
 * attached to req.user; any problem is a 401 in the standard error
 * envelope (code UNAUTHORIZED).
 *
 * optionalAuth — for public read endpoints whose response shape depends on
 * the viewer (isMember / isOwner on team objects). A valid token attaches
 * req.user; a missing or invalid token simply continues anonymously and
 * never rejects the request.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return fail(res, 401, 'UNAUTHORIZED', 'Authentication required');
  }

  try {
    const payload = jwt.verify(token, accessSecret());
    const user = await User.findById(payload.userId);
    if (!user) {
      return fail(res, 401, 'UNAUTHORIZED', 'User no longer exists');
    }
    req.user = user;
    return next();
  } catch (err) {
    return fail(res, 401, 'UNAUTHORIZED', 'Invalid or expired token');
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, accessSecret());
    const user = await User.findById(payload.userId);
    if (user) req.user = user;
  } catch (err) {
    // Invalid token on a public route: proceed anonymously.
  }
  return next();
}

module.exports = { requireAuth, optionalAuth };
