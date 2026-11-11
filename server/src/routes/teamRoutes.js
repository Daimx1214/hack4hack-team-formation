const express = require('express');
const {
  createTeam,
  listTeams,
  getTeam,
  joinTeam,
  leaveTeam,
  deleteTeam,
} = require('../controllers/teamController');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(listTeams));
router.get('/:id', asyncHandler(getTeam));
router.post('/', requireAuth, asyncHandler(createTeam));
router.post('/:id/join', requireAuth, asyncHandler(joinTeam));
router.post('/:id/leave', requireAuth, asyncHandler(leaveTeam));
router.delete('/:id', requireAuth, asyncHandler(deleteTeam));

module.exports = router;
