const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam } = require('./helpers');

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
