const request = require('supertest');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

// Join through the real API. The contract REQUIRES an Idempotency-Key
// (UUID) per join intent, so this helper mints a fresh one per call —
// pass `key` explicitly to test replays of the same intent.
function joinAs(token, teamId, key = randomUUID()) {
  return request(app)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({});
}

function leaveAs(token, teamId) {
  return request(app)
    .delete(`/api/teams/${teamId}/leave`)
    .set('Authorization', `Bearer ${token}`);
}

describe('POST /api/teams', () => {
  it('creates a team with the creator as owner and member #1', async () => {
    const { user, token } = await registerUser(app);
    const team = await createTeam(app, token, { capacity: 4 });

    expect(team.memberCount).toBe(1);
    expect(team.members).toHaveLength(1);
    expect(team.members[0].id).toBe(user.id);
    expect(team.members[0].role).toBe('owner');
    expect(team.owner.id).toBe(user.id);
    expect(team.seatsLeft).toBe(3);
    expect(team.isFull).toBe(false);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/teams').send({ name: 'No Auth Team', capacity: 4 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an out-of-range capacity', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Big', capacity: 99 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('rejects a missing team name', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ capacity: 3 });

    expect(res.status).toBe(400);
  });

  it('rejects unknown fields in the body', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sneaky Team', capacity: 3, isAdmin: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('GET /api/teams', () => {
  it('lists created teams in the data + meta envelope', async () => {
    const { token } = await registerUser(app);
    await createTeam(app, token, { name: 'Listed Team' });

    const res = await request(app).get('/api/teams');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Listed Team');
    expect(res.body.meta.total).toBe(1);
  });

  it('gets one team by id', async () => {
    const { token } = await registerUser(app);
    const team = await createTeam(app, token);

    const res = await request(app).get(`/api/teams/${team.id}`);

    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(team.id);
  });

  it('returns member NAMES, not raw ids or emails, in the team detail', async () => {
    const owner = await registerUser(app, { name: 'Alice Owner' });
    const joiner = await registerUser(app, { name: 'Bob Joiner' });
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinAs(joiner.token, team.id);

    const res = await request(app).get(`/api/teams/${team.id}`);

    expect(res.status).toBe(200);
    // Membership semantics are unchanged — same people, same count — but
    // the serialized member is { id, name, role, joinedAt }: no ObjectId
    // wrappers and no email addresses (the contract does not expose them).
    expect(res.body.team.memberCount).toBe(2);
    expect(res.body.team.members).toHaveLength(2);
    const byRole = Object.fromEntries(res.body.team.members.map((m) => [m.role, m]));
    expect(byRole.owner.id).toBe(owner.user.id);
    expect(byRole.owner.name).toBe('Alice Owner');
    expect(byRole.member.id).toBe(joiner.user.id);
    expect(byRole.member.name).toBe('Bob Joiner');
    expect(byRole.member.email).toBeUndefined();
    expect(res.body.team.owner).toEqual({ id: owner.user.id, name: 'Alice Owner' });
  });

  it('returns 404 for a team that does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/teams/${fakeId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 INVALID_ID for a malformed team id', async () => {
    const res = await request(app).get('/api/teams/not-a-real-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_ID');
  });
});

describe('POST /api/teams/:id/join', () => {
  it('joins a team with a free seat (happy path, 201)', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 3 });

    const res = await joinAs(joiner.token, team.id);

    expect(res.status).toBe(201);
    expect(res.body.team.memberCount).toBe(2);
    const memberIds = res.body.team.members.map((m) => m.id);
    expect(memberIds).toContain(joiner.user.id);
    expect(res.body.team.isMember).toBe(true);
  });

  it('rejects a join without an Idempotency-Key with 400', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 3 });

    const res = await request(app)
      .post(`/api/teams/${team.id}/join`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('rejects a join with a non-UUID Idempotency-Key with 400', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 3 });

    const res = await joinAs(joiner.token, team.id, 'not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('rejects joining a full team with 409 TEAM_FULL', async () => {
    const owner = await registerUser(app);
    const second = await registerUser(app);
    const third = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 2 });

    const fillRes = await joinAs(second.token, team.id);
    expect(fillRes.status).toBe(201); // team is now full: owner + second

    const res = await joinAs(third.token, team.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_FULL');
    expect(res.body.error.message).toMatch(/full/i);
  });

  it('rejects a duplicate join with 409 ALREADY_MEMBER and does not add the member twice', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });

    await joinAs(joiner.token, team.id);
    const res = await joinAs(joiner.token, team.id); // new key, same user

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(2);
  });

  it('returns 404 when joining a team that does not exist', async () => {
    const { token } = await registerUser(app);
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await joinAs(token, fakeId);
    expect(res.status).toBe(404);
  });

  it('treats a replayed Idempotency-Key as the original result, not a new join', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    const key = randomUUID();

    const first = await joinAs(joiner.token, team.id, key);
    expect(first.status).toBe(201);

    const replay = await joinAs(joiner.token, team.id, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.team.memberCount).toBe(2);
  });
});

describe('DELETE /api/teams/:id/leave', () => {
  it('lets a member leave and decrements the count', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinAs(joiner.token, team.id);

    const res = await leaveAs(joiner.token, team.id);

    expect(res.status).toBe(200);
    expect(res.body.team.memberCount).toBe(1);
  });

  it('rejects leaving a team you are not a member of with 409 NOT_A_MEMBER', async () => {
    const owner = await registerUser(app);
    const outsider = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await leaveAs(outsider.token, team.id);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  it('does not let the owner leave their own team (403 OWNER_CANNOT_LEAVE)', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await leaveAs(owner.token, team.id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('OWNER_CANNOT_LEAVE');
  });
});

describe('DELETE /api/teams/:id', () => {
  it('lets the owner delete the team (204)', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(204);
    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.status).toBe(404);
  });

  it('forbids a non-owner from deleting the team', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});
