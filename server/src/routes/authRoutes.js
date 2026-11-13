const express = require('express');
const { register, login, me } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { makeLimiters } = require('../middleware/rateLimit');

const router = express.Router();
const { authLimiter } = makeLimiters();

router.post('/register', authLimiter, asyncHandler(register));
router.post('/login', authLimiter, asyncHandler(login));
router.get('/me', requireAuth, me);

module.exports = router;
