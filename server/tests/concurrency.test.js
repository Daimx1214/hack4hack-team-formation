const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam, uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

/**
 * These are the tests that prove the PS1 claim.
 *
 * A naive read-check-save join passes every sequential test in
 * teams.test.js and still corrupts state here, because these tests fire
 * many join requests at the same time — the exact situation the atomic
 * conditional update in teamController.joinTeam is designed for.
 */
describe('Concurrency: racing joins', () => {
  it('never over-fills a team: 8 racers, 2 free seats, exactly 2 succeed', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 3 }); // owner + 2 seats

    // Register 8 different racers.
    const racers = [];
    for (let i = 0; i < 8; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      racers.push(await registerUser(app));
    }

    // Fire all 8 join requests at the same time.
    const results = await Promise.all(
      racers.map((racer) =>
        request(app)
          .post(`/api/teams/${team.id}/join`)
          .set('Authorization', `Bearer ${racer.token}`)
          .send({})
      )
    );

    const succeeded = results.filter((r) => r.status === 200);
    const rejected = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(2);
    expect(rejected).toHaveLength(6);

    // Final state must be exactly at capacity, with no duplicate members.
    const check = await request(app).get(`/api/teams/${team.id}`);
    const finalTeam = check.body.team;
    expect(finalTeam.memberCount).toBe(3);
    expect(finalTeam.members).toHaveLength(3);
    const memberIds = finalTeam.members.map((m) => m.user);
    expect(new Set(memberIds).size).toBe(3);
  });

  it('never duplicates a member: the same user racing themselves joins exactly once', async () => {
    const owner = await registerUser(app);
    const racer = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });

    // The same user submits the join 5 times simultaneously (double-click /
    // retry storm). Exactly one may take effect.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/teams/${team.id}/join`)
          .set('Authorization', `Bearer ${racer.token}`)
          .send({})
      )
    );

    const succeeded = results.filter((r) => r.status === 200);
    expect(succeeded).toHaveLength(1);

    const check = await request(app).get(`/api/teams/${team.id}`);
    const finalTeam = check.body.team;
    expect(finalTeam.memberCount).toBe(2); // owner + racer, not owner + 5
    const appearances = finalTeam.members.filter(
      (m) => m.user === racer.user.id
    );
    expect(appearances).toHaveLength(1);
  });

  it('stays consistent when joins and a duplicate race mix', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 }); // 3 free seats

    const users = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      users.push(await registerUser(app));
    }

    // Each of the 3 users fires 3 parallel joins (9 requests, 3 seats).
    const attempts = [];
    users.forEach((u) => {
      for (let i = 0; i < 3; i += 1) {
        attempts.push(
          request(app)
            .post(`/api/teams/${team.id}/join`)
            .set('Authorization', `Bearer ${u.token}`)
            .send({})
        );
      }
    });
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.status === 200)).toHaveLength(3);

    const check = await request(app).get(`/api/teams/${team.id}`);
    const finalTeam = check.body.team;
    expect(finalTeam.memberCount).toBe(4);
    const memberIds = finalTeam.members.map((m) => m.user);
    expect(new Set(memberIds).size).toBe(4); // every member appears exactly once
  });
});

describe('Concurrency: racing leaves', () => {
  it('never drives memberCount negative: the same member leaving 5 times in parallel decrements once', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await request(app)
      .post(`/api/teams/${team.id}/join`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({});

    // Double-click / retry storm on "Leave": 5 identical requests at once.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/teams/${team.id}/leave`)
          .set('Authorization', `Bearer ${member.token}`)
          .send({})
      )
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);

    // Only the owner remains; the counter is 1 — not 0, and never negative.
    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(1);
    expect(check.body.team.members).toHaveLength(1);
    expect(check.body.team.members[0].user).toBe(owner.user.id);
  });

  it('handles every member leaving at the same time: counter ends at exactly 1 (the owner)', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });

    const members = [];
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const member = await registerUser(app);
      members.push(member);
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post(`/api/teams/${team.id}/join`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({});
    }

    const results = await Promise.all(
      members.map((member) =>
        request(app)
          .post(`/api/teams/${team.id}/leave`)
          .set('Authorization', `Bearer ${member.token}`)
          .send({})
      )
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(3);

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(1);
    expect(check.body.team.members).toHaveLength(1);
  });
});

describe('Concurrency: duplicate registration race', () => {
  it('creates exactly one account when the same email registers 5 times in parallel', async () => {
    const email = uniqueEmail();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/auth/register')
          .send({ name: 'Racer', email, password: 'password123' })
      )
    );

    // Exactly one winner; everyone else gets the duplicate-email 409 —
    // the unique index must never leak out as a 500.
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
  });
});

describe('Concurrency: idempotency keys under racing retries', () => {
  it('a retry storm with ONE Idempotency-Key creates exactly one membership', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });
    const headers = { 'Idempotency-Key': 'retry-storm-1' };

    // 5 parallel sends of the SAME logical request (same key).
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/teams/${team.id}/join`)
          .set('Authorization', `Bearer ${joiner.token}`)
          .set(headers)
          .send({})
      )
    );

    // No server errors, at least one success, and — the actual guarantee —
    // exactly one membership exists afterwards, however the races resolved.
    expect(results.every((r) => r.status === 200 || r.status === 409)).toBe(true);
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(2);
    const appearances = check.body.team.members.filter((m) => m.user === joiner.user.id);
    expect(appearances).toHaveLength(1);
  });

  it('parallel replays AFTER a recorded join all return the original result', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });
    const headers = { 'Idempotency-Key': 'replay-after-success' };

    const first = await request(app)
      .post(`/api/teams/${team.id}/join`)
      .set('Authorization', `Bearer ${joiner.token}`)
      .set(headers)
      .send({});
    expect(first.status).toBe(200);

    // The key is now recorded, so every replay — even in parallel — is
    // answered from the record: 200 + idempotentReplay, no new join.
    const replays = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post(`/api/teams/${team.id}/join`)
          .set('Authorization', `Bearer ${joiner.token}`)
          .set(headers)
          .send({})
      )
    );

    expect(replays.every((r) => r.status === 200)).toBe(true);
    expect(replays.every((r) => r.body.idempotentReplay === true)).toBe(true);

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(2);
  });
});
