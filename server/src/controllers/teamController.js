const mongoose = require('mongoose');
const Team = require('../models/Team');
const JoinRequest = require('../models/JoinRequest');
const JoinApplication = require('../models/JoinApplication');
const AuditLog = require('../models/AuditLog');
const { fail } = require('../utils/errors');
const { serializeTeam } = require('../utils/serialize');
const { generateInviteCode } = require('../utils/codes');
const {
  createTeamSchema,
  updateTeamSchema,
  listTeamsQuerySchema,
  mineQuerySchema,
  joinByCodeSchema,
  parseOr400,
} = require('../validators/schemas');

/**
 * Team endpoints (API contract: Build Spec §10).
 *
 * The interesting part of this project is `joinTeam` below: it is the
 * operation that must stay correct when many requests arrive at the same
 * moment. Everything else is ordinary CRUD. See DESIGN.md §3 for the full
 * explanation of the concurrency strategy.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Escape user input before putting it in a RegExp (regex-DoS / injection
// guard for the ?q= search parameter).
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Populate the fields the serializer needs (names, not raw ids or emails).
function populateNames(query) {
  return query.populate('members.user', 'name').populate('owner', 'name');
}

// Audit log (Spec §11, NICE): fire-and-forget — recording history must
// never fail the action it describes.
function audit(actor, action, team) {
  AuditLog.create({ actor, action, team }).catch(() => {});
}

// One-team-per-user rule (Spec §2, NICE): an environment flag, off by
// default. When on, a user who already belongs to a team cannot create
// or join another one until they leave (or delete) the first.
const oneTeamPerUser = () => process.env.ONE_TEAM_PER_USER === 'true';

async function userInOtherTeam(userId, teamId) {
  const filter = { 'members.user': userId };
  if (teamId) filter._id = { $ne: teamId };
  return Team.exists(filter);
}

const ONE_TEAM_MESSAGE =
  'You are already in a team. Leave it before creating or joining another.';

async function findTeamSerialized(id, viewerId) {
  const team = await populateNames(Team.findById(id));
  return team ? serializeTeam(team, viewerId) : null;
}

function invalidId(res) {
  return fail(res, 400, 'INVALID_ID', 'That team id is not valid');
}

// POST /api/teams — create a team. The creator becomes owner AND member #1,
// so memberCount starts at 1.
async function createTeam(req, res) {
  const body = parseOr400(res, createTeamSchema, req.body ?? {});
  if (!body) return;

  if (oneTeamPerUser() && (await userInOtherTeam(req.user._id))) {
    return fail(res, 409, 'ONE_TEAM_LIMIT', ONE_TEAM_MESSAGE);
  }

  const team = await Team.create({
    name: body.name,
    description: body.description,
    owner: req.user._id,
    capacity: body.capacity,
    members: [{ user: req.user._id, role: 'owner', joinedAt: new Date() }],
    memberCount: 1,
    inviteCode: generateInviteCode(),
    requireApproval: body.requireApproval,
  });

  audit(req.user._id, 'create', team._id);
  return res.status(201).json({ team: await findTeamSerialized(team._id, req.user._id) });
}

// GET /api/teams — browse with search (?q=), status filter (?status=open|
// full), sorting (?sort=newest|seats) and pagination (?page=&limit=).
// Response: { data: [Team], meta: { page, limit, total, totalPages } }.
async function listTeams(req, res) {
  const query = parseOr400(res, listTeamsQuerySchema, req.query ?? {});
  if (!query) return;

  const filter = {};
  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: pattern }, { description: pattern }];
  }
  if (query.status === 'open') filter.$expr = { $lt: ['$memberCount', '$capacity'] };
  if (query.status === 'full') filter.$expr = { $gte: ['$memberCount', '$capacity'] };

  const total = await Team.countDocuments(filter);
  let teams;
  if (query.sort === 'seats') {
    // "Most seats left" needs a computed ordering; the data set is small,
    // so sort the filtered set in memory and then take the page.
    const all = await populateNames(Team.find(filter).sort({ createdAt: -1 }));
    all.sort((a, b) => b.capacity - b.memberCount - (a.capacity - a.memberCount));
    teams = all.slice((query.page - 1) * query.limit, query.page * query.limit);
  } else {
    teams = await populateNames(
      Team.find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
    );
  }

  const viewerId = req.user ? req.user._id : null;
  return res.status(200).json({
    data: teams.map((t) => serializeTeam(t, viewerId)),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  });
}

// GET /api/teams/mine?role=joined|created — the caller's own teams.
// Registered BEFORE /:id in the router so "mine" is never parsed as an id.
async function listMyTeams(req, res) {
  const query = parseOr400(res, mineQuerySchema, req.query ?? {});
  if (!query) return;

  const filter =
    query.role === 'created' ? { owner: req.user._id } : { 'members.user': req.user._id };
  const teams = await populateNames(Team.find(filter).sort({ createdAt: -1 }));
  return res.status(200).json({ data: teams.map((t) => serializeTeam(t, req.user._id)) });
}

// GET /api/teams/:id — fetch one team.
async function getTeam(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
  const team = await findTeamSerialized(req.params.id, req.user ? req.user._id : null);
  if (!team) return fail(res, 404, 'NOT_FOUND', 'Team not found');
  if (req.user) {
    // The viewer's own join-application state (approval teams): the
    // detail page shows "Request sent" instead of a Join button.
    const application = await JoinApplication.findOne({
      team: team.id,
      user: req.user._id,
    }).sort({ createdAt: -1 });
    team.viewerApplication =
      application && application.status !== 'approved' ? application.status : null;
  }
  return res.status(200).json({ team });
}

// PATCH /api/teams/:id — owner-only edit. Capacity may move within 2–12
// but never below the current member count (409 CAPACITY_BELOW_MEMBERS).
async function updateTeam(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
  const body = parseOr400(res, updateTeamSchema, req.body ?? {});
  if (!body) return;

  const team = await Team.findById(req.params.id);
  if (!team) return fail(res, 404, 'NOT_FOUND', 'Team not found');
  if (team.owner.toString() !== req.user._id.toString()) {
    return fail(res, 403, 'FORBIDDEN', "You don't have permission to do that");
  }
  if (body.capacity !== undefined && body.capacity < team.memberCount) {
    return fail(
      res,
      409,
      'CAPACITY_BELOW_MEMBERS',
      `Capacity cannot be below the current member count (${team.memberCount})`
    );
  }

  if (body.name !== undefined) team.name = body.name;
  if (body.description !== undefined) team.description = body.description;
  if (body.capacity !== undefined) team.capacity = body.capacity;
  if (body.requireApproval !== undefined) team.requireApproval = body.requireApproval;
  await team.save();

  return res.status(200).json({ team: await findTeamSerialized(team._id, req.user._id) });
}

/**
 * POST /api/teams/:id/join — THE race-proof operation.
 *
 * A naive implementation reads the team, checks the seat count in JS, then
 * pushes and saves. Two requests running concurrently both pass the check
 * and the team ends up over capacity. That is the bug this challenge is
 * about, and it is why this function does NOT do that.
 *
 * Instead, the check and the write are ONE atomic database operation:
 *
 *   findOneAndUpdate(
 *     { _id, memberCount: { $lt: capacity }, 'members.user': { $ne: userId } },
 *     { $push: { members: ... }, $inc: { memberCount: 1 } }
 *   )
 *
 * MongoDB applies an update to a single document atomically — the filter
 * is evaluated against the document as part of the same operation that
 * writes. Racing requests are serialised by the database: only the ones
 * with a genuinely free seat match the filter; the rest get `null` back
 * and we answer 409. No locks, no transactions, no replica set needed.
 *
 * Idempotency (Spec §10.2): the Idempotency-Key header is REQUIRED and
 * must be a UUID. Before attempting the join we insert a 'processing'
 * record; when the attempt settles we store its outcome on the record. A
 * retry with the same key replays the stored outcome (with an
 * `Idempotent-Replay: true` header) instead of joining a second time,
 * and a retry that arrives mid-flight gets 409 REQUEST_IN_PROGRESS.
 */
async function joinTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(teamId)) return invalidId(res);

  const idempotencyKey = req.headers['idempotency-key'];
  if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
    return fail(
      res,
      400,
      'MISSING_IDEMPOTENCY_KEY',
      'An Idempotency-Key header (UUID) is required to join a team'
    );
  }

  // Step 1: claim the key. Only one record per (user, key, team) can exist.
  let record;
  try {
    record = await JoinRequest.create({ user: userId, team: teamId, key: idempotencyKey });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const prior = await JoinRequest.findOne({ user: userId, key: idempotencyKey, team: teamId });
    if (!prior) throw err; // index raced in an unexpected way — surface it
    if (prior.status === 'processing') {
      return fail(
        res,
        409,
        'REQUEST_IN_PROGRESS',
        'That join is still being processed — retry in a moment with the same key'
      );
    }
    // Replay the stored outcome of the original attempt.
    res.set('Idempotent-Replay', 'true');
    if (prior.responseStatus === 201) {
      const team = await findTeamSerialized(teamId, userId);
      if (team) return res.status(200).json({ team });
      return fail(res, 404, 'NOT_FOUND', 'Team not found');
    }
    if (prior.responseCode === 'ALREADY_MEMBER') {
      return fail(res, 409, 'ALREADY_MEMBER', "You're already in this team");
    }
    if (prior.responseCode === 'TEAM_FULL') {
      return fail(res, 409, 'TEAM_FULL', 'This team is full');
    }
    if (prior.responseCode === 'ONE_TEAM_LIMIT') {
      return fail(res, 409, 'ONE_TEAM_LIMIT', ONE_TEAM_MESSAGE);
    }
    if (prior.responseCode === 'APPLICATION_PENDING') {
      // The original attempt filed a join application. Report its
      // current state: approved meanwhile means the user is a member
      // now and gets the team; still pending says so.
      const team = await findTeamSerialized(teamId, userId);
      if (!team) return fail(res, 404, 'NOT_FOUND', 'Team not found');
      if (team.isMember) return res.status(200).json({ team });
      const pending = await JoinApplication.findOne({
        team: teamId,
        user: userId,
        status: 'pending',
      });
      return res
        .status(200)
        .json({ application: { status: pending ? 'pending' : 'none' }, team });
    }
    return fail(res, prior.responseStatus || 409, prior.responseCode || 'CONFLICT', 'That join could not be completed');
  }

  // Settle the record with the attempt's outcome before responding.
  async function settle(responseStatus, responseCode) {
    record.status = 'done';
    record.responseStatus = responseStatus;
    record.responseCode = responseCode;
    await record.save();
  }

  // Step 2: the team must exist. The approval branch below also needs
  // the team's owner, its approval flag and its member ids.
  const existing = await Team.findById(teamId).select('requireApproval owner members.user');
  if (!existing) {
    await record.deleteOne(); // not an outcome worth replaying
    return fail(res, 404, 'NOT_FOUND', 'Team not found');
  }

  // One-team-per-user (Spec §2, NICE; env flag, off by default): a user
  // who already belongs to a DIFFERENT team cannot take a seat here.
  // Checked inside the idempotent execution so the verdict is stored
  // and replayed like any other join outcome.
  if (oneTeamPerUser() && (await userInOtherTeam(userId, teamId))) {
    await settle(409, 'ONE_TEAM_LIMIT');
    return fail(res, 409, 'ONE_TEAM_LIMIT', ONE_TEAM_MESSAGE);
  }

  // Step 3: join approvals (Spec §2, NICE). On an approval team, a
  // non-member's join becomes a pending application instead of a seat;
  // the atomic join itself only runs when the owner approves.
  if (existing.requireApproval && existing.owner.toString() !== userId.toString()) {
    const isMember = existing.members.some((m) => m.user.toString() === userId.toString());
    if (!isMember) {
      let application = await JoinApplication.findOne({
        team: teamId,
        user: userId,
        status: 'pending',
      });
      const alreadyPending = Boolean(application);
      if (!application) {
        try {
          application = await JoinApplication.create({ team: teamId, user: userId });
        } catch (err) {
          if (err.code !== 11000) throw err;
          // A parallel request created the pending application first.
          application = await JoinApplication.findOne({
            team: teamId,
            user: userId,
            status: 'pending',
          });
        }
      }
      await settle(202, 'APPLICATION_PENDING');
      return res.status(alreadyPending ? 200 : 202).json({
        application: { id: application._id.toString(), status: 'pending' },
        team: await findTeamSerialized(teamId, userId),
      });
    }
  }

  // Step 4: === The atomic join. Conditions and mutation happen together. ===
  const outcome = await atomicJoin(teamId, userId);
  if (outcome === 'gone') {
    // The team was deleted between the read above and the atomic write.
    await record.deleteOne();
    return fail(res, 404, 'NOT_FOUND', 'Team not found');
  }
  if (outcome === 'already') {
    await settle(409, 'ALREADY_MEMBER');
    return fail(res, 409, 'ALREADY_MEMBER', "You're already in this team");
  }
  if (outcome === 'full') {
    await settle(409, 'TEAM_FULL');
    return fail(res, 409, 'TEAM_FULL', 'This team is full');
  }

  await settle(201, null);
  audit(userId, 'join', teamId);
  return res.status(201).json({ team: await findTeamSerialized(teamId, userId) });
}

// The atomic join itself, shared by the join endpoint and by approval
// of a join application. The seat check compares memberCount against
// the team's OWN capacity field inside the atomic operation ($expr),
// never against a value read earlier in JS — so even if the owner edits
// capacity a millisecond before this write, the limit enforced is the
// document's current one.
// Returns 'joined' | 'full' | 'already' | 'gone'.
async function atomicJoin(teamId, userId) {
  const team = await Team.findOneAndUpdate(
    {
      _id: teamId,
      $expr: { $lt: ['$memberCount', '$capacity'] }, // a seat must still be free
      'members.user': { $ne: userId }, // and the user must not already be in
    },
    {
      $push: { members: { user: userId, role: 'member', joinedAt: new Date() } },
      $inc: { memberCount: 1 }, // counter moves in the SAME atomic write
    },
    { new: true }
  );
  if (team) return 'joined';
  // The atomic update matched nothing. No write happened, so correctness
  // is already guaranteed — this re-read only tells the caller WHY.
  const current = await Team.findById(teamId);
  if (!current) return 'gone';
  return current.members.some((m) => m.user.toString() === userId.toString())
    ? 'already'
    : 'full';
}

// DELETE /api/teams/:id/leave — remove the caller from a team.
// Symmetric to join: the "is a member" condition and the removal +
// counter decrement happen in one atomic update, so a double-submitted
// leave can only decrement the counter once.
async function leaveTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(teamId)) return invalidId(res);

  const existing = await Team.findById(teamId).select('owner');
  if (!existing) return fail(res, 404, 'NOT_FOUND', 'Team not found');
  // Product rule: the owner cannot abandon their own team — they delete it.
  if (existing.owner.toString() === userId.toString()) {
    return fail(res, 403, 'OWNER_CANNOT_LEAVE', 'The team owner cannot leave; delete the team instead');
  }

  const team = await Team.findOneAndUpdate(
    { _id: teamId, 'members.user': userId }, // only matches if actually a member
    {
      $pull: { members: { user: userId } },
      $inc: { memberCount: -1 },
    },
    { new: true }
  );

  if (!team) {
    return fail(res, 409, 'NOT_A_MEMBER', "You're not in this team");
  }
  audit(userId, 'leave', teamId);
  return res.status(200).json({ team: await findTeamSerialized(teamId, userId) });
}

// DELETE /api/teams/:id — only the owner may delete a team. 204 on success.
async function deleteTeam(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
  const team = await Team.findById(req.params.id);
  if (!team) return fail(res, 404, 'NOT_FOUND', 'Team not found');
  if (team.owner.toString() !== req.user._id.toString()) {
    return fail(res, 403, 'FORBIDDEN', "You don't have permission to do that");
  }
  await team.deleteOne();
  audit(req.user._id, 'delete', team._id);
  return res.status(204).send();
}

// POST /api/teams/join-by-code — join via an invite code (Spec §2,
// NICE). Resolves the code to a team, then runs the EXACT join pipeline
// (idempotency key required, one-team rule, approval flow, atomic join)
// by delegating to joinTeam with the resolved id.
async function joinByCode(req, res) {
  const body = parseOr400(res, joinByCodeSchema, req.body ?? {});
  if (!body) return;
  const team = await Team.findOne({ inviteCode: body.code }).select('_id');
  if (!team) return fail(res, 404, 'NOT_FOUND', 'That invite code does not match a team');
  req.params.id = team._id.toString();
  return joinTeam(req, res);
}

// POST /api/teams/:id/invite-code — owner regenerates the invite code;
// the old code stops working immediately.
async function regenerateInviteCode(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return invalidId(res);
  const team = await Team.findById(req.params.id);
  if (!team) return fail(res, 404, 'NOT_FOUND', 'Team not found');
  if (team.owner.toString() !== req.user._id.toString()) {
    return fail(res, 403, 'FORBIDDEN', "You don't have permission to do that");
  }
  team.inviteCode = generateInviteCode();
  await team.save();
  return res.status(200).json({ inviteCode: team.inviteCode });
}

function serializeApplication(application) {
  const user = application.user;
  return {
    id: application._id.toString(),
    status: application.status,
    createdAt: application.createdAt,
    user: {
      id: (user._id || user).toString(),
      name: user.name || (user._id || user).toString(),
    },
  };
}

async function loadOwnedTeam(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    invalidId(res);
    return null;
  }
  const team = await Team.findById(req.params.id);
  if (!team) {
    fail(res, 404, 'NOT_FOUND', 'Team not found');
    return null;
  }
  if (team.owner.toString() !== req.user._id.toString()) {
    fail(res, 403, 'FORBIDDEN', "You don't have permission to do that");
    return null;
  }
  return team;
}

// GET /api/teams/:id/applications — the owner reviews join requests,
// pending first, then newest.
async function listApplications(req, res) {
  const team = await loadOwnedTeam(req, res);
  if (!team) return;
  const applications = await JoinApplication.find({ team: team._id })
    .populate('user', 'name')
    .sort({ createdAt: -1 });
  applications.sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1));
  return res.status(200).json({ data: applications.map(serializeApplication) });
}

async function loadPendingApplication(req, res) {
  const team = await loadOwnedTeam(req, res);
  if (!team) return null;
  if (!mongoose.isValidObjectId(req.params.applicationId)) {
    fail(res, 404, 'NOT_FOUND', 'Application not found');
    return null;
  }
  const application = await JoinApplication.findOne({
    _id: req.params.applicationId,
    team: team._id,
  });
  if (!application) {
    fail(res, 404, 'NOT_FOUND', 'Application not found');
    return null;
  }
  if (application.status !== 'pending') {
    fail(res, 409, 'APPLICATION_DECIDED', 'That request was already decided');
    return null;
  }
  return { team, application };
}

// POST /api/teams/:id/applications/:applicationId/approve — the owner
// accepts a request: NOW the atomic join runs for the applicant. If the
// team filled up in the meantime the request stays pending and the
// owner gets the honest 409.
async function approveApplication(req, res) {
  const loaded = await loadPendingApplication(req, res);
  if (!loaded) return;
  const { team, application } = loaded;

  const outcome = await atomicJoin(team._id, application.user);
  if (outcome === 'gone') return fail(res, 404, 'NOT_FOUND', 'Team not found');
  if (outcome === 'full') return fail(res, 409, 'TEAM_FULL', 'This team is full');

  application.status = 'approved';
  application.decidedAt = new Date();
  application.decidedBy = req.user._id;
  await application.save();
  if (outcome === 'joined') audit(application.user, 'join', team._id);
  return res.status(200).json({ team: await findTeamSerialized(team._id, req.user._id) });
}

// POST /api/teams/:id/applications/:applicationId/reject — the owner
// declines a request. The applicant may apply again later.
async function rejectApplication(req, res) {
  const loaded = await loadPendingApplication(req, res);
  if (!loaded) return;
  const { application } = loaded;
  application.status = 'rejected';
  application.decidedAt = new Date();
  application.decidedBy = req.user._id;
  await application.save();
  return res.status(200).json({ application: serializeApplication(application) });
}

// GET /api/stats — real totals for the landing page stats strip.
// Never faked: these are computed from the teams collection on request.
async function getStats(req, res) {
  const [row] = await Team.aggregate([
    {
      $group: {
        _id: null,
        teams: { $sum: 1 },
        members: { $sum: '$memberCount' },
        openSeats: { $sum: { $subtract: ['$capacity', '$memberCount'] } },
      },
    },
  ]);
  return res.status(200).json({
    teams: row ? row.teams : 0,
    members: row ? row.members : 0,
    openSeats: row ? row.openSeats : 0,
  });
}

module.exports = {
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
  getStats,
};
