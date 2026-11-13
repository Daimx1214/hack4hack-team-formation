const express = require('express');
const {
  register,
  login,
  refresh,
  logout,
  me,
  updateMe,
  logoutAll,
} = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// The router is built by createApp with the limiters createApp made, so
// rate-limit caps are read when the app is built — never at require
// time, where env (or test setup) may not have run yet.
function createAuthRouter({ authLimiter }) {
  const router = express.Router();

  router.post('/register', authLimiter, asyncHandler(register));
  router.post('/login', authLimiter, asyncHandler(login));
  // Cookie-based session endpoints: deliberately NOT behind the auth
  // rate limiter (refresh is routine session traffic) and NOT behind
  // requireAuth (their credential is the cookie itself).
  router.post('/refresh', asyncHandler(refresh));
  router.post('/logout', asyncHandler(logout));
  router.get('/me', requireAuth, me);
  router.patch('/me', requireAuth, asyncHandler(updateMe));
  router.post('/logout-all', requireAuth, asyncHandler(logoutAll));

  return router;
}

module.exports = createAuthRouter;
