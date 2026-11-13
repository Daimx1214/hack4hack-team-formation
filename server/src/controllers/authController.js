const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { fail } = require('../utils/errors');
const { isAllowedOrigin } = require('../utils/origins');
const {
  REFRESH_COOKIE,
  signAccessToken,
  hashToken,
  issueRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
} = require('../utils/tokens');
const { registerSchema, loginSchema, parseOr400 } = require('../validators/schemas');

/**
 * Auth endpoints (Build Spec §10). register/login return the user and a
 * short-lived access token, and set the rotating refresh token as an
 * httpOnly cookie. See utils/tokens.js for the session design.
 */

// Start a fresh session: new refresh record + cookie + access token.
async function startSession(res, user, status) {
  const { raw } = await issueRefreshToken(user._id);
  setRefreshCookie(res, raw);
  return res.status(status).json({ user, accessToken: signAccessToken(user._id) });
}

// POST /api/auth/register — create an account and sign the user in.
async function register(req, res) {
  const body = parseOr400(res, registerSchema, req.body ?? {});
  if (!body) return;

  const { name, email, password, skills } = body;

  const existing = await User.findOne({ email });
  if (existing) {
    // 409 Conflict (not 400): the request itself is well-formed, it just
    // collides with an account that already exists.
    return fail(res, 409, 'EMAIL_TAKEN', 'Email is already registered');
  }

  // Note: the plain password is placed in passwordHash here on purpose —
  // the User model's pre-save hook replaces it with a bcrypt hash.
  let user;
  try {
    user = await User.create({ name, email, passwordHash: password, skills });
  } catch (err) {
    // Two registrations with the same email can race: both pass the
    // findOne check above, then the unique index rejects the second
    // insert. That is the same 409 the caller would have got sequentially
    // — never a 500.
    if (err.code === 11000) {
      return fail(res, 409, 'EMAIL_TAKEN', 'Email is already registered');
    }
    throw err;
  }

  return startSession(res, user, 201);
}

// POST /api/auth/login — verify credentials and start a session.
// The failure message is deliberately generic ("Email or password is
// incorrect") for BOTH unknown email and wrong password, so the endpoint
// cannot be used to probe which accounts exist.
async function login(req, res) {
  const body = parseOr400(res, loginSchema, req.body ?? {});
  if (!body) return;

  const { email, password } = body;

  // passwordHash is select:false on the model — login is the one place
  // that genuinely needs it, so it opts in explicitly.
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  return startSession(res, user, 200);
}

// Read the presented refresh token's record, or null when it is missing,
// unknown, revoked or expired.
async function presentedRefreshRecord(req) {
  const raw = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
  if (!raw) return null;
  const record = await RefreshToken.findOne({ tokenHash: hashToken(raw) });
  if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) return null;
  return record;
}

// Cookie-based endpoints are the one place a browser sends a credential
// automatically, so they get the CSRF guard from Spec §11: when an Origin
// header is present it must be on the allowlist.
function originRejected(req, res) {
  if (isAllowedOrigin(req.headers.origin)) return false;
  fail(res, 403, 'FORBIDDEN', "You don't have permission to do that");
  return true;
}

// POST /api/auth/refresh — rotate: the presented refresh token is revoked
// and replaced; the response carries a fresh access token (and cookie).
async function refresh(req, res) {
  if (originRejected(req, res)) return;

  const record = await presentedRefreshRecord(req);
  if (!record) {
    clearRefreshCookie(res);
    return fail(res, 401, 'INVALID_REFRESH', 'Your session has expired. Log in again.');
  }

  const user = await User.findById(record.user);
  if (!user) {
    clearRefreshCookie(res);
    return fail(res, 401, 'INVALID_REFRESH', 'Your session has expired. Log in again.');
  }

  const { raw, record: next } = await issueRefreshToken(user._id);
  record.revokedAt = new Date();
  record.replacedBy = next._id;
  await record.save();

  setRefreshCookie(res, raw);
  return res.status(200).json({ accessToken: signAccessToken(user._id) });
}

// POST /api/auth/logout — revoke the presented refresh token and clear
// the cookie. Always 204: logging out must not leak whether a session
// existed.
async function logout(req, res) {
  if (originRejected(req, res)) return;

  const raw = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
  if (raw) {
    await RefreshToken.updateOne(
      { tokenHash: hashToken(raw), revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
  }
  clearRefreshCookie(res);
  return res.status(204).send();
}

// GET /api/auth/me — return the currently logged-in user (auth middleware
// has already loaded it onto req.user).
function me(req, res) {
  return res.status(200).json({ user: req.user });
}

module.exports = { register, login, refresh, logout, me };
