const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { fail } = require('../utils/errors');

/**
 * Rate limits (Build Spec §11). Three layers:
 *  - global: every request, per IP (300 / 15 min)
 *  - auth: login + register, per IP (10 / 15 min) — counts FAILED
 *    attempts only (skipSuccessfulRequests), because brute-force
 *    protection is about failures, and legitimate demo/test traffic
 *    should not lock itself out by succeeding.
 *  - write: team create + join, per authenticated user (60 / min)
 *
 * Caps are env-overridable (RATE_LIMIT_GLOBAL_MAX etc.) so deployments
 * can be tuned without code changes; defaults are the spec values.
 * Every rejection uses the standard error envelope with code
 * RATE_LIMITED — the client shows "Too many attempts. Try again in a
 * minute." (Spec §5.8).
 */
function tooMany(req, res) {
  return fail(res, 429, 'RATE_LIMITED', 'Too many attempts. Try again in a minute.');
}

function makeLimiters() {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false,
    handler: tooMany,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_AUTH_MAX || 10),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: tooMany,
  });

  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_WRITE_MAX || 60),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `user:${req.user._id}` : ipKeyGenerator(req)),
    handler: tooMany,
  });

  return { globalLimiter, authLimiter, writeLimiter };
}

module.exports = { makeLimiters };
