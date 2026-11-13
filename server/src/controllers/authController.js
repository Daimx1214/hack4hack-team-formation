const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { fail } = require('../utils/errors');
const { registerSchema, loginSchema, parseOr400 } = require('../validators/schemas');

// Sign an access token for a user. The token carries only the user id —
// everything else is loaded fresh from the database by the auth middleware.
// (Refresh-token rotation arrives with the session work; this JWT is the
// access token of the API contract.)
function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register — create an account, return the user + token.
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

  return res.status(201).json({ user, accessToken: signToken(user._id) });
}

// POST /api/auth/login — verify credentials, return the user + token.
// The failure message is deliberately generic ("Email or password is
// incorrect") for BOTH unknown email and wrong password, so the endpoint
// cannot be used to probe which accounts exist.
async function login(req, res) {
  const body = parseOr400(res, loginSchema, req.body ?? {});
  if (!body) return;

  const { email, password } = body;

  const user = await User.findOne({ email });
  if (!user) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  return res.status(200).json({ user, accessToken: signToken(user._id) });
}

// GET /api/auth/me — return the currently logged-in user (auth middleware
// has already loaded it onto req.user).
function me(req, res) {
  return res.status(200).json({ user: req.user });
}

module.exports = { register, login, me };
