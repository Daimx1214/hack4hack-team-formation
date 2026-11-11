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
    return res.status(400).json({ error: 'Email is already registered' });
  }

  // Note: the plain password is placed in passwordHash here on purpose —
  // the User model's pre-save hook replaces it with a bcrypt hash.
  const user = await User.create({
    name,
    email,
    passwordHash: password,
    skills: Array.isArray(skills) ? skills : [],
  });

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
