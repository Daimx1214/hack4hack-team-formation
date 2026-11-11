const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam, uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

/**
 * Edge cases beyond the happy-path suites: wrong/missing credentials,
 * teams that vanish before you act on them, malformed ids, and the
 * capacity boundaries from DESIGN.md §2/§4 (capacity is 2–10 and the
 * owner always occupies seat #1).
 */

function joinAs(token, teamId, extraHeaders = {}) {
  return request(app)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set(extraHeaders)
    .send({});
}

function leaveAs(token, teamId) {
  return request(app)
    .post(`/api/teams/${teamId}/leave`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
}

describe('Auth edge cases', () => {
  it('rejects a duplicate email with 409 even when the case differs', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'First', email: email.toUpperCase(), password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Second', email, password: 'password123' });

    expect(res.status).toBe(409);
  });

  it('rejects a login with a missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(400);
  });

  it('returns 401 for a garbage (unparseable) token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this-is-not-a-jwt');

    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    // A well-formed JWT, but signed by an attacker with their own secret —
    // signature verification must reject it.
    const forged = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString() },
      'attacker-secret'
    );

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${forged}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 when joining without any token', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app).post(`/api/teams/${team.id}/join`).send({});

    expect(res.status).toBe(401);
  });

  it('returns 401 when deleting without any token', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app).delete(`/api/teams/${team.id}`);

    expect(res.status).toBe(401);
  });

  it('returns 401 when a protected route gets an invalid token', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', 'Bearer nope')
      .send({ name: 'Forged Team' });

    expect(res.status).toBe(401);
  });
});

describe('Teams that no longer exist', () => {
  it('returns 404 when joining a team that was deleted', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token);

    await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    const res = await joinAs(joiner.token, team.id);
    expect(res.status).toBe(404);
  });

  it('returns 404 when leaving a team that was deleted', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const team = await createTeam(app, owner.token);
    await joinAs(member.token, team.id);

    await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    const res = await leaveAs(member.token, team.id);
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting a team that does not exist', async () => {
    const { token } = await registerUser(app);
    const fakeId = new mongoose.Types.ObjectId().toString();

    const res = await request(app)
      .delete(`/api/teams/${fakeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 (not 500) for malformed team ids on join, leave and delete', async () => {
    const { token } = await registerUser(app);

    const joinRes = await joinAs(token, 'not-a-real-id');
    expect(joinRes.status).toBe(404);

    const leaveRes = await leaveAs(token, 'not-a-real-id');
    expect(leaveRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete('/api/teams/not-a-real-id')
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(404);
  });

  it('forbids a non-owner MEMBER from deleting the team (403)', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const team = await createTeam(app, owner.token);
    await joinAs(member.token, team.id);

    const res = await request(app)
      .delete(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${member.token}`);

    expect(res.status).toBe(403);

    // And the team is still there, untouched.
    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.status).toBe(200);
    expect(check.body.team.memberCount).toBe(2);
  });
});

describe('Capacity edges (DESIGN.md: capacity 2–10, owner is seat #1)', () => {
  it('rejects capacity 1 — a team needs room for at least the owner + 1', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Too Small', capacity: 1 });

    expect(res.status).toBe(400);
  });

  it('rejects capacity 0 and non-integer capacities', async () => {
    const { token } = await registerUser(app);

    const zero = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Zero', capacity: 0 });
    expect(zero.status).toBe(400);

    const fractional = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Fractional', capacity: 2.5 });
    expect(fractional.status).toBe(400);
  });

  it('a capacity-2 team has exactly ONE free seat, because the owner holds seat #1', async () => {
    const owner = await registerUser(app);
    const first = await registerUser(app);
    const second = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 2 });

    expect(team.memberCount).toBe(1); // the owner already occupies a seat

    const joinRes = await joinAs(first.token, team.id);
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.team.memberCount).toBe(2);

    const fullRes = await joinAs(second.token, team.id);
    expect(fullRes.status).toBe(409);
    expect(fullRes.body.error).toMatch(/full/i);
  });

  it('accepts the maximum capacity of 10', async () => {
    const { token } = await registerUser(app);
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Big Team', capacity: 10 });

    expect(res.status).toBe(201);
    expect(res.body.team.capacity).toBe(10);
  });
});
