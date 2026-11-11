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
// directly with the Team model stubbed to replay the exact sequence:
// capacity read succeeds → atomic update matches nothing → re-read
// returns null.

const mongoose = require('mongoose');

jest.mock('../src/models/Team', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../src/models/JoinRequest', () => ({
  findOne: jest.fn(),
}));

const Team = require('../src/models/Team');
const { joinTeam } = require('../src/controllers/teamController');

// Minimal stand-ins for the Express req/res the controller touches.
function fakeRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function fakeReq(teamId, userId) {
  return { params: { id: teamId.toString() }, headers: {}, user: { _id: userId } };
}

// The first findById in joinTeam is `.findById(id).select('capacity')` —
// hand it a fake query object whose select() resolves to the capacity.
function capacityRead(capacity) {
  return { select: () => Promise.resolve({ capacity }) };
}

beforeEach(() => jest.clearAllMocks());

describe('joinTeam error path — team deleted mid-flight', () => {
  it('answers 404 (not 500) when the team disappears before the error-path re-read', async () => {
    const teamId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();

    Team.findById
      .mockReturnValueOnce(capacityRead(4)) // team exists at the capacity read
      .mockResolvedValueOnce(null); // ...but is gone at the re-read
    Team.findOneAndUpdate.mockResolvedValue(null); // atomic update matched nothing

    const res = fakeRes();
    await joinTeam(fakeReq(teamId, userId), res); // must not throw

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Team not found' });
  });

  it('still answers 409 "Team is full" when the re-read finds the team full', async () => {
    const teamId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const someoneElse = new mongoose.Types.ObjectId();

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
    expect(res.json).toHaveBeenCalledWith({ error: 'Team is full' });
  });
});
