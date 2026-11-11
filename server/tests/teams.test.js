const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

function joinAs(token, teamId, extraHeaders = {}) {
  return request(app)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set(extraHeaders)
    .send({});
}

describe('POST /api/teams', () => {
  it('creates a team with the creator as owner and member #1', async () => {
    const { user, token } = await registerUser(app);
    const team = await createTeam(app, token, { capacity: 4 });

    expect(team.memberCount).toBe(1);
    expect(team.members).toHaveLength(1);
    expect(team.members[0].user).toBe(user.id);
    expect(team.members[0].role).toBe('owner');
    expect(team.owner).toBe(user.id);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/teams').send({ name: 'No Auth' });
    expect(res.status).toBe(401);
  });

  it('rejects an out-of-range capacity', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Big', capacity: 99 });

    expect(res.status).toBe(400);
  });

  it('rejects a missing team name', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ capacity: 3 });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/teams', () => {
  it('lists created teams', async () => {
    const { token } = await registerUser(app);
    await createTeam(app, token, { name: 'Listed Team' });

    const res = await request(app).get('/api/teams');

    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(1);
    expect(res.body.teams[0].name).toBe('Listed Team');
  });

  it('gets one team by id', async () => {
    const { token } = await registerUser(app);
    const team = await createTeam(app, token);

    const res = await request(app).get(`/api/teams/${team.id}`);

    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(team.id);
  });

  it('returns member NAMES (populated users), not raw ids, in the team detail', async () => {
    const owner = await registerUser(app, { name: 'Alice Owner' });
    const joiner = await registerUser(app, { name: 'Bob Joiner' });
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinAs(joiner.token, team.id);

    const res = await request(app).get(`/api/teams/${team.id}`);

    expect(res.status).toBe(200);
    // Membership semantics are unchanged — same people, same count — but
    // each member's `user` is now the populated user (id + name + email).
    expect(res.body.team.memberCount).toBe(2);
    expect(res.body.team.members).toHaveLength(2);
    const byRole = Object.fromEntries(res.body.team.members.map((m) => [m.role, m.user]));
    expect(byRole.owner.id).toBe(owner.user.id);
    expect(byRole.owner.name).toBe('Alice Owner');
    expect(byRole.member.id).toBe(joiner.user.id);
    expect(byRole.member.name).toBe('Bob Joiner');
    expect(byRole.member.email).toBe(joiner.user.email);
  });

  it('returns 404 for a team that does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/teams/${fakeId}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/teams/:id/join', () => {
  it('joins a team with a free seat (happy path)', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 3 });

    const res = await joinAs(joiner.token, team.id);

    expect(res.status).toBe(200);
    expect(res.body.team.memberCount).toBe(2);
    const memberIds = res.body.team.members.map((m) => m.user);
    expect(memberIds).toContain(joiner.user.id);
  });

  it('rejects joining a full team with 409', async () => {
    const owner = await registerUser(app);
    const second = await registerUser(app);
    const third = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 2 });

    const fillRes = await joinAs(second.token, team.id);
    expect(fillRes.status).toBe(200); // team is now full: owner + second

    const res = await joinAs(third.token, team.id);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/full/i);
  });

  it('rejects a duplicate join with 409 and does not add the member twice', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });

    await joinAs(joiner.token, team.id);
    const res = await joinAs(joiner.token, team.id);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already a member/i);

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
    const headers = { 'Idempotency-Key': 'join-attempt-1' };

    const first = await joinAs(joiner.token, team.id, headers);
    expect(first.status).toBe(200);

    const replay = await joinAs(joiner.token, team.id, headers);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotentReplay).toBe(true);
    expect(replay.body.team.memberCount).toBe(2);
  });
});

describe('POST /api/teams/:id/leave', () => {
  it('lets a member leave and decrements the count', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinAs(joiner.token, team.id);

    const res = await request(app)
      .post(`/api/teams/${team.id}/leave`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.team.memberCount).toBe(1);
  });

  it('rejects leaving a team you are not a member of', async () => {
    const owner = await registerUser(app);
    const outsider = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app)
      .post(`/api/teams/${team.id}/leave`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('does not let the owner leave their own team', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app)
      .post(`/api/teams/${team.id}/leave`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/teams/:id', () => {
  it('lets the owner delete the team', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
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
  });
});
