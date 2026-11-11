const express = require('express');
const { register, login, me } = require('../controllers/authController');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.get('/me', requireAuth, me);

module.exports = router;
