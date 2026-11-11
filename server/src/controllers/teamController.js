const mongoose = require('mongoose');
const Team = require('../models/Team');
const JoinRequest = require('../models/JoinRequest');

/**
 * Team endpoints.
 *
 * The interesting part of this whole project is `joinTeam` below: it is the
 * operation that must stay correct when many requests arrive at the same
 * moment. Everything else is ordinary CRUD. See DESIGN.md §3 for the full
 * explanation of the concurrency strategy.
 */

// POST /api/teams — create a team. The creator becomes owner AND member #1,
// so memberCount starts at 1.
async function createTeam(req, res) {
  const { name, description, capacity, skillsNeeded } = req.body || {};

  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }
  if (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 2 || capacity > 10)) {
    return res.status(400).json({ error: 'Capacity must be an integer between 2 and 10' });
  }

  const team = await Team.create({
    name,
    description: description || '',
    owner: req.user._id,
    capacity: capacity === undefined ? 4 : capacity,
    members: [{ user: req.user._id, role: 'owner', joinedAt: new Date() }],
    memberCount: 1,
    skillsNeeded: Array.isArray(skillsNeeded) ? skillsNeeded : [],
  });

  return res.status(201).json({ team });
}

// GET /api/teams — list all teams, newest first.
async function listTeams(req, res) {
  const teams = await Team.find().sort({ createdAt: -1 });
  return res.status(200).json({ teams });
}

// GET /api/teams/:id — fetch one team.
async function getTeam(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Team not found' });
  }
  const team = await Team.findById(req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }
  return res.status(200).json({ team });
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
 * MongoDB applies an update to a single document atomically — the filter is
 * evaluated against the document as part of the same operation that writes.
 * Racing requests are serialised by the database: only the first one(s) with
 * a genuinely free seat match the filter; the rest get `null` back and we
 * answer 409. No locks, no transactions, no replica set needed.
 */
async function joinTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(teamId)) {
    return res.status(404).json({ error: 'Team not found' });
  }

  // Idempotency: if the client sent an Idempotency-Key and we have already
  // recorded a successful join for it, return that original result instead
  // of attempting the join again (safe retry / double-click protection).
  const idempotencyKey = req.headers['idempotency-key'];
  if (idempotencyKey) {
    const prior = await JoinRequest.findOne({ user: userId, key: idempotencyKey });
    if (prior) {
      const team = await Team.findById(prior.team);
      return res.status(200).json({ team, idempotentReplay: true });
    }
  }

  // We need the team's capacity for the atomic filter below. Reading it here
  // is safe because capacity is IMMUTABLE after creation (DESIGN.md §3.3) —
  // the value we read is always the value that gets enforced.
  const existing = await Team.findById(teamId).select('capacity');
  if (!existing) {
    return res.status(404).json({ error: 'Team not found' });
  }

  // === The atomic join. Conditions and mutation happen together, or not at all. ===
  const team = await Team.findOneAndUpdate(
    {
      _id: teamId,
      memberCount: { $lt: existing.capacity }, // a seat must still be free
      'members.user': { $ne: userId },         // and the user must not already be in
    },
    {
      $push: { members: { user: userId, role: 'member', joinedAt: new Date() } },
      $inc: { memberCount: 1 }, // counter moves in the SAME atomic write
    },
    { new: true } // return the document after the update
  );

  if (!team) {
    // The atomic update matched nothing. No write happened, so correctness
    // is already guaranteed — this re-read only tells the caller WHY.
    const current = await Team.findById(teamId);
    const alreadyMember = current.members.some(
      (m) => m.user.toString() === userId.toString()
    );
    if (alreadyMember) {
      return res.status(409).json({ error: 'You are already a member of this team' });
    }
    return res.status(409).json({ error: 'Team is full' });
  }

  // Record the idempotency key (if any) so a retry returns this result.
  // The unique index on (user, key) means even concurrent retries can only
  // ever create one record — a duplicate-key error here is harmless.
  if (idempotencyKey) {
    try {
      await JoinRequest.create({ user: userId, team: teamId, key: idempotencyKey });
    } catch (err) {
      if (err.code !== 11000) throw err; // 11000 = duplicate key, expected on races
    }
  }

  return res.status(200).json({ team });
}

// POST /api/teams/:id/leave — remove the caller from a team.
// Symmetric to join: the "is a member" condition and the removal + counter
// decrement happen in one atomic update, so a double-submitted leave can
// only decrement the counter once.
async function leaveTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user._id;

  if (!mongoose.isValidObjectId(teamId)) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const existing = await Team.findById(teamId).select('owner');
  if (!existing) {
    return res.status(404).json({ error: 'Team not found' });
  }
  // Product rule: the owner cannot abandon their own team — they delete it.
  if (existing.owner.toString() === userId.toString()) {
    return res.status(400).json({ error: 'The team owner cannot leave; delete the team instead' });
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
    return res.status(409).json({ error: 'You are not a member of this team' });
  }
  return res.status(200).json({ team });
}

// DELETE /api/teams/:id — only the owner may delete a team.
async function deleteTeam(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ error: 'Team not found' });
  }
  const team = await Team.findById(req.params.id);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }
  if (team.owner.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'Only the team owner can delete this team' });
  }
  await team.deleteOne();
  return res.status(200).json({ message: 'Team deleted' });
}

module.exports = { createTeam, listTeams, getTeam, joinTeam, leaveTeam, deleteTeam };
