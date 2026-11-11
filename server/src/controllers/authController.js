const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Sign a JWT for a user. The token carries only the user id — everything
// else is loaded fresh from the database by the auth middleware.
function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register — create an account, return the user + a token.
async function register(req, res) {
  const { name, email, password, skills } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    // 409 Conflict (not 400): the request itself is well-formed, it just
    // collides with an account that already exists.
    return res.status(409).json({ error: 'Email is already registered' });
  }

  // Note: the plain password is placed in passwordHash here on purpose —
  // the User model's pre-save hook replaces it with a bcrypt hash.
  let user;
  try {
    user = await User.create({
      name,
      email,
      passwordHash: password,
      skills: Array.isArray(skills) ? skills : [],
    });
  } catch (err) {
    // Two registrations with the same email can race: both pass the
    // findOne check above, then the unique index rejects the second
    // insert. That is the same 409 the caller would have got sequentially
    // — never a 500.
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email is already registered' });
    }
    throw err;
  }

  return res.status(201).json({ user, token: signToken(user._id) });
}

// POST /api/auth/login — verify credentials, return the user + a token.
async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  return res.status(200).json({ user, token: signToken(user._id) });
}

// GET /api/auth/me — return the currently logged-in user (auth middleware
// has already loaded it onto req.user).
function me(req, res) {
  return res.status(200).json({ user: req.user });
}

module.exports = { register, login, me };
