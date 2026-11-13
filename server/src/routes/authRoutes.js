const express = require('express');
const { register, login, refresh, logout, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { makeLimiters } = require('../middleware/rateLimit');

const router = express.Router();
const { authLimiter } = makeLimiters();

router.post('/register', authLimiter, asyncHandler(register));
router.post('/login', authLimiter, asyncHandler(login));
// Cookie-based session endpoints: deliberately NOT behind the auth
// rate limiter (refresh is routine session traffic) and NOT behind
// requireAuth (their credential is the cookie itself).
router.post('/refresh', asyncHandler(refresh));
router.post('/logout', asyncHandler(logout));
router.get('/me', requireAuth, me);

module.exports = router;
