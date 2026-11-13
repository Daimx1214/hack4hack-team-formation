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
  joinByCode,
  regenerateInviteCode,
  listApplications,
  approveApplication,
  rejectApplication,
} = require('../controllers/teamController');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

// The router is built by createApp with the limiters createApp made, so
// rate-limit caps are read when the app is built — never at require
// time, where env (or test setup) may not have run yet.
function createTeamRouter({ writeLimiter }) {
  const router = express.Router();

  // Order matters: /mine must be registered before /:id, or Express would
  // try to parse the literal word "mine" as a team id.
  router.get('/', optionalAuth, asyncHandler(listTeams));
  router.get('/mine', requireAuth, asyncHandler(listMyTeams));
  router.post('/', requireAuth, writeLimiter, asyncHandler(createTeam));
  router.post('/join-by-code', requireAuth, writeLimiter, asyncHandler(joinByCode));
  router.get('/:id', optionalAuth, asyncHandler(getTeam));
  router.post('/:id/invite-code', requireAuth, asyncHandler(regenerateInviteCode));
  router.get('/:id/applications', requireAuth, asyncHandler(listApplications));
  router.post(
    '/:id/applications/:applicationId/approve',
    requireAuth,
    asyncHandler(approveApplication)
  );
  router.post(
    '/:id/applications/:applicationId/reject',
    requireAuth,
    asyncHandler(rejectApplication)
  );
  router.patch('/:id', requireAuth, asyncHandler(updateTeam));
  router.delete('/:id', requireAuth, asyncHandler(deleteTeam));
  router.post('/:id/join', requireAuth, writeLimiter, asyncHandler(joinTeam));
  router.delete('/:id/leave', requireAuth, asyncHandler(leaveTeam));

  return router;
}

module.exports = createTeamRouter;
