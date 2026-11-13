const express = require('express');
const {
  createTeam,
  listTeams,
  listMyTeams,
  getTeam,
  updateTeam,
  joinTeam,
  leaveTeam,
  deleteTeam,
} = require('../controllers/teamController');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { makeLimiters } = require('../middleware/rateLimit');

const router = express.Router();
const { writeLimiter } = makeLimiters();

// Order matters: /mine must be registered before /:id, or Express would
// try to parse the literal word "mine" as a team id.
router.get('/', optionalAuth, asyncHandler(listTeams));
router.get('/mine', requireAuth, asyncHandler(listMyTeams));
router.post('/', requireAuth, writeLimiter, asyncHandler(createTeam));
router.get('/:id', optionalAuth, asyncHandler(getTeam));
router.patch('/:id', requireAuth, asyncHandler(updateTeam));
router.delete('/:id', requireAuth, asyncHandler(deleteTeam));
router.post('/:id/join', requireAuth, writeLimiter, asyncHandler(joinTeam));
router.delete('/:id/leave', requireAuth, asyncHandler(leaveTeam));

module.exports = router;
