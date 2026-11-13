// Regression tests for a narrow race in joinTeam's ERROR path.
//
// The interleaving: a join's atomic update matches nothing (team full or
// already a member), and in the small window before the controller
// re-reads the team to explain why, somebody DELETES the team. The
// re-read then returns null — the old code dereferenced it
// (`current.members.some(...)`) and the request died as a 500 instead of
// answering a clean 404.
//
// This cannot be reproduced deterministically through the public API:
// via HTTP you can only delete the team BEFORE a join starts, and that
// case is already covered in edge-cases.test.js ("returns 404 when
// joining a team that was deleted"). So these tests call the controller
// directly with the models stubbed to replay the exact sequence:
// key claim succeeds → capacity read succeeds → atomic update matches
// nothing → re-read returns null.

const mongoose = require('mongoose');

jest.mock('../src/models/Team', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/models/JoinRequest', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
}));

const Team = require('../src/models/Team');
const JoinRequest = require('../src/models/JoinRequest');
const { joinTeam } = require('../src/controllers/teamController');

const VALID_KEY = '123e4567-e89b-42d3-a456-426614174000';

// Minimal stand-ins for the Express req/res the controller touches.
function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.set = jest.fn(() => res);
  return res;
}

function fakeReq(teamId, userId) {
  return {
    params: { id: teamId.toString() },
    headers: { 'idempotency-key': VALID_KEY },
    user: { _id: userId },
  };
}

// The capacity read in joinTeam is `.findById(id).select('capacity')` —
// hand it a fake query object whose select() resolves to the capacity.
function capacityRead(capacity) {
  return { select: () => Promise.resolve({ capacity }) };
}

// A fresh idempotency record as the controller's key-claim creates it.
function freshRecord() {
  return { status: 'processing', save: jest.fn(async () => {}), deleteOne: jest.fn(async () => {}) };
}

beforeEach(() => jest.clearAllMocks());

describe('joinTeam error path — team deleted mid-flight', () => {
  it('answers 404 (not 500) when the team disappears before the error-path re-read', async () => {
    const teamId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const record = freshRecord();

    JoinRequest.create.mockResolvedValue(record);
    Team.findById
      .mockReturnValueOnce(capacityRead(4)) // team exists at the capacity read
      .mockResolvedValueOnce(null); // ...but is gone at the re-read
    Team.findOneAndUpdate.mockResolvedValue(null); // atomic update matched nothing

    const res = fakeRes();
    await joinTeam(fakeReq(teamId, userId), res); // must not throw

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'Team not found' },
    });
    // A 404 is not a membership outcome — the key claim is released so a
    // later retry against a real team is not treated as a replay.
    expect(record.deleteOne).toHaveBeenCalled();
  });

  it('still answers 409 TEAM_FULL when the re-read finds the team full', async () => {
    const teamId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const someoneElse = new mongoose.Types.ObjectId();
    const record = freshRecord();

    JoinRequest.create.mockResolvedValue(record);
    Team.findById
      .mockReturnValueOnce(capacityRead(2))
      .mockResolvedValueOnce({
        memberCount: 2,
        members: [{ user: someoneElse }, { user: someoneElse }],
      });
    Team.findOneAndUpdate.mockResolvedValue(null);

    const res = fakeRes();
    await joinTeam(fakeReq(teamId, userId), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'TEAM_FULL', message: 'This team is full' },
    });
    // The outcome is settled on the record so a retry replays it.
    expect(record.status).toBe('done');
    expect(record.responseCode).toBe('TEAM_FULL');
    expect(record.save).toHaveBeenCalled();
  });
});
