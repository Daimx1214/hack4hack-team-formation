const request = require('supertest');
const { randomUUID } = require('crypto');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam, uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

// Every join carries its own Idempotency-Key (a fresh UUID per intent) —
// these tests exercise the ATOMIC update, not the replay machinery (that
// has its own describe block at the bottom).
function joinReq(token, teamId, key = randomUUID()) {
  return request(app)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({});
}

function leaveReq(token, teamId) {
  return request(app)
    .delete(`/api/teams/${teamId}/leave`)
    .set('Authorization', `Bearer ${token}`);
}

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
    const results = await Promise.all(racers.map((racer) => joinReq(racer.token, team.id)));

    const succeeded = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(succeeded).toHaveLength(2);
    expect(rejected).toHaveLength(6);

    // Final state must be exactly at capacity, with no duplicate members.
    const check = await request(app).get(`/api/teams/${team.id}`);
    const finalTeam = check.body.team;
    expect(finalTeam.memberCount).toBe(3);
    expect(finalTeam.members).toHaveLength(3);
    const memberIds = finalTeam.members.map((m) => m.id);
    expect(new Set(memberIds).size).toBe(3);
  });

  it('never over-fills at spec scale: 20 racers, 1 free seat, exactly 1 succeeds', async () => {
    // The race scenario from the testing plan (Spec §12): capacity 2 with
    // the owner already in leaves exactly one seat for 20 simultaneous
    // joiners. Exactly one may win it.
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 2 });

    const racers = [];
    for (let i = 0; i < 20; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      racers.push(await registerUser(app));
    }

    const results = await Promise.all(racers.map((racer) => joinReq(racer.token, team.id)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const full = results.filter((r) => r.status === 409);
    expect(full).toHaveLength(19);
    expect(full.every((r) => r.body.error.code === 'TEAM_FULL')).toBe(true);

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(2);
    expect(check.body.team.isFull).toBe(true);
  });

  it('never duplicates a member: the same user racing themselves joins exactly once', async () => {
    const owner = await registerUser(app);
    const racer = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });

    // The same user submits the join 5 times simultaneously (each attempt
    // a separate intent with its own key — the same-key storm is covered
    // by the idempotency block below). Exactly one may take effect; the
    // atomic filter's "not already a member" condition rejects the rest.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => joinReq(racer.token, team.id))
    );

    const succeeded = results.filter((r) => r.status === 201);
    expect(succeeded).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);

    const check = await request(app).get(`/api/teams/${team.id}`);
    const finalTeam = check.body.team;
    expect(finalTeam.memberCount).toBe(2); // owner + racer, not owner + 5
    const appearances = finalTeam.members.filter((m) => m.id === racer.user.id);
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
        attempts.push(joinReq(u.token, team.id));
      }
    });
    const results = await Promise.all(attempts);

    expect(results.filter((r) => r.status === 201)).toHaveLength(3);

    const check = await request(app).get(`/api/teams/${team.id}`);
    const finalTeam = check.body.team;
    expect(finalTeam.memberCount).toBe(4);
    const memberIds = finalTeam.members.map((m) => m.id);
    expect(new Set(memberIds).size).toBe(4); // every member appears exactly once
  });
});

describe('Concurrency: racing leaves', () => {
  it('never drives memberCount negative: the same member leaving 5 times in parallel decrements once', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinReq(member.token, team.id);

    // Double-click / retry storm on "Leave": 5 identical requests at once.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => leaveReq(member.token, team.id))
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);

    // Only the owner remains; the counter is 1 — not 0, and never negative.
    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(1);
    expect(check.body.team.members).toHaveLength(1);
    expect(check.body.team.members[0].id).toBe(owner.user.id);
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
      await joinReq(member.token, team.id);
    }

    const results = await Promise.all(members.map((member) => leaveReq(member.token, team.id)));

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
    const key = randomUUID();

    // 5 parallel sends of the SAME logical request (same key).
    const results = await Promise.all(
      Array.from({ length: 5 }, () => joinReq(joiner.token, team.id, key))
    );

    // One attempt wins the key claim and joins (201). The others either
    // find the record still 'processing' (409 REQUEST_IN_PROGRESS) or,
    // if they arrive after it settled, replay the stored success (200).
    // No server errors — and the actual guarantee is the final state:
    // exactly one membership exists, however the races resolved.
    expect(results.every((r) => [200, 201, 409].includes(r.status))).toBe(true);
    expect(
      results.filter((r) => r.status === 201 || r.status === 200).length
    ).toBeGreaterThanOrEqual(1);

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(2);
    const appearances = check.body.team.members.filter((m) => m.id === joiner.user.id);
    expect(appearances).toHaveLength(1);
  });

  it('parallel replays AFTER a recorded join all return the original result', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });
    const key = randomUUID();

    const first = await joinReq(joiner.token, team.id, key);
    expect(first.status).toBe(201);

    // The key's outcome is now recorded as 'done', so every replay — even
    // in parallel — is answered from the record: 200 + the
    // Idempotent-Replay header, and no new join ever happens.
    const replays = await Promise.all(
      Array.from({ length: 5 }, () => joinReq(joiner.token, team.id, key))
    );

    expect(replays.every((r) => r.status === 200)).toBe(true);
    expect(replays.every((r) => r.headers['idempotent-replay'] === 'true')).toBe(true);

    const check = await request(app).get(`/api/teams/${team.id}`);
    expect(check.body.team.memberCount).toBe(2);
  });
});
