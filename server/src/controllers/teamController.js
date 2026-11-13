const mongoose = require('mongoose');
const Team = require('../models/Team');
const JoinRequest = require('../models/JoinRequest');
const { fail } = require('../utils/errors');
const { serializeTeam } = require('../utils/serialize');
const {
  createTeamSchema,
  updateTeamSchema,
  listTeamsQuerySchema,
  mineQuerySchema,
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

  const team = await Team.create({
    name: body.name,
    description: body.description,
    owner: req.user._id,
    capacity: body.capacity,
    members: [{ user: req.user._id, role: 'owner', joinedAt: new Date() }],
    memberCount: 1,
    skillsNeeded: body.skillsNeeded,
  });

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
  if (body.skillsNeeded !== undefined) team.skillsNeeded = body.skillsNeeded;
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
    return fail(res, prior.responseStatus || 409, prior.responseCode || 'CONFLICT', 'That join could not be completed');
  }

  // Settle the record with the attempt's outcome before responding.
  async function settle(responseStatus, responseCode) {
    record.status = 'done';
    record.responseStatus = responseStatus;
    record.responseCode = responseCode;
    await record.save();
  }

  // Step 2: the team must exist.
  const existing = await Team.findById(teamId).select('_id');
  if (!existing) {
    await record.deleteOne(); // not an outcome worth replaying
    return fail(res, 404, 'NOT_FOUND', 'Team not found');
  }

  // Step 3: === The atomic join. Conditions and mutation happen together. ===
  // The seat check compares memberCount against the team's OWN capacity
  // field inside the atomic operation ($expr), never against a value read
  // earlier in JS — so even if the owner edits capacity a millisecond
  // before this write, the limit enforced is the document's current one.
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

  if (!team) {
    // The atomic update matched nothing. No write happened, so correctness
    // is already guaranteed — this re-read only tells the caller WHY.
    const current = await Team.findById(teamId);
    if (!current) {
      // The team was deleted between the read above and this re-read.
      await record.deleteOne();
      return fail(res, 404, 'NOT_FOUND', 'Team not found');
    }
    const alreadyMember = current.members.some((m) => m.user.toString() === userId.toString());
    if (alreadyMember) {
      await settle(409, 'ALREADY_MEMBER');
      return fail(res, 409, 'ALREADY_MEMBER', "You're already in this team");
    }
    await settle(409, 'TEAM_FULL');
    return fail(res, 409, 'TEAM_FULL', 'This team is full');
  }

  await settle(201, null);
  return res.status(201).json({ team: await findTeamSerialized(teamId, userId) });
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
  return res.status(204).send();
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
  getStats,
};
