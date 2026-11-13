const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const RefreshToken = require('../models/RefreshToken');

/**
 * Session tokens (Build Spec §9/§11):
 *
 * - Access token: short-lived JWT (15 min by default, ACCESS_TTL),
 *   signed with JWT_ACCESS_SECRET (falling back to JWT_SECRET so older
 *   deployments keep working). Sent as Authorization: Bearer — browsers
 *   never attach it automatically, which is what makes the API
 *   CSRF-resistant for access-token endpoints.
 *
 * - Refresh token: opaque 48-byte random string, 7-day lifetime,
 *   delivered ONLY as an httpOnly cookie and stored SHA-256-hashed.
 *   Rotated on every use; logout revokes. (The spec's env list mentions
 *   a JWT_REFRESH_SECRET — unnecessary here precisely because the
 *   refresh token is opaque and server-side revocable, not a JWT.)
 */

const REFRESH_COOKIE = 'tf_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function accessSecret() {
  return process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
}

function signAccessToken(userId) {
  return jwt.sign({ userId }, accessSecret(), {
    expiresIn: process.env.ACCESS_TTL || '15m',
  });
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const record = await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return { raw, record };
}

function refreshCookieOptions() {
  const crossSite = (process.env.COOKIE_SAMESITE || '').toLowerCase();
  const sameSite =
    crossSite === 'none' || crossSite === 'lax' || crossSite === 'strict'
      ? crossSite
      : process.env.NODE_ENV === 'production'
        ? 'none' // web and API live on different vercel.app subdomains
        : 'lax';
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    sameSite,
    path: '/api/auth',
    maxAge: REFRESH_TTL_MS,
  };
}

function setRefreshCookie(res, raw) {
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  const { maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

module.exports = {
  REFRESH_COOKIE,
  accessSecret,
  signAccessToken,
  hashToken,
  issueRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
};
