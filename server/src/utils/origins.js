/**
 * The CORS allowlist, shared by the CORS middleware in app.js and the
 * Origin check that guards the cookie-based auth endpoints (refresh /
 * logout, Spec §11 CSRF row). Exact origins only — never '*', because
 * these origins are trusted with credentials.
 */
const DEFAULT_ORIGINS = 'http://localhost:5173,https://hack4hack-web.vercel.app';

function allowedOrigins() {
  return (process.env.CORS_ORIGINS || DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin) return true; // not a browser CORS request — nothing to check
  return allowedOrigins().includes(origin);
}

module.exports = { allowedOrigins, isAllowedOrigin };
