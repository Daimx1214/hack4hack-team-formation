// NICE-tier rules from the Build Spec, verified:
//  - §2 one-team-per-user environment flag (ONE_TEAM_PER_USER)
//  - §11 audit log: { actor, action, team, at } rows for create, join,
//    leave and delete
const request = require('supertest');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(() => {
  delete process.env.ONE_TEAM_PER_USER;
  return clearTestDB();
});
afterAll(closeTestDB);

const Team = mongoose.model('Team');
const AuditLog = mongoose.model('AuditLog');

function join(appRef, teamId, token) {
  return request(appRef)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', randomUUID())
    .send({});
}

describe('ONE_TEAM_PER_USER flag (§2)', () => {
  it('blocks creating or joining a second team while the flag is on, and allows both while off', async () => {
    const owner = await registerUser(app);
    const mine = await createTeam(app, owner.token, { name: 'First Team' });
    const other = await registerUser(app);
    const theirs = await createTeam(app, other.token, { name: 'Other Team' });

    process.env.ONE_TEAM_PER_USER = 'true';

    const create = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Second Team', capacity: 3 });
    expect(create.status).toBe(409);
    expect(create.body.error.code).toBe('ONE_TEAM_LIMIT');

    const joinRes = await join(app, theirs.id, owner.token);
    expect(joinRes.status).toBe(409);
    expect(joinRes.body.error.code).toBe('ONE_TEAM_LIMIT');

    // Joining a team you are not in is blocked, but the flag does not
    // stop a fresh user from joining.
    const fresh = await registerUser(app);
    const freshJoin = await join(app, mine.id, fresh.token);
    expect(freshJoin.status).toBe(201);

    delete process.env.ONE_TEAM_PER_USER;
    const nowAllowed = await join(app, theirs.id, owner.token);
    expect(nowAllowed.status).toBe(201);
  });
});

describe('Audit log (§11)', () => {
  it('records create, join, leave and delete with actor, team and timestamp', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token, { name: 'Audited Team' });
    const member = await registerUser(app);

    const joinRes = await join(app, team.id, member.token);
    expect(joinRes.status).toBe(201);

    const leave = await request(app)
      .delete(`/api/teams/${team.id}/leave`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(leave.status).toBe(200);

    const del = await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(del.status).toBe(204);

    const rows = await AuditLog.find({ team: team.id }).sort({ at: 1, _id: 1 }).lean();
    expect(rows.map((r) => r.action)).toEqual(['create', 'join', 'leave', 'delete']);
    expect(rows[0].actor.toString()).toBe(owner.user.id);
    expect(rows[1].actor.toString()).toBe(member.user.id);
    expect(rows.every((r) => r.at instanceof Date)).toBe(true);
    void Team;
  });
});
