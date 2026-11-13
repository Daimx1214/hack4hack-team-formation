const request = require('supertest');
const { randomUUID } = require('crypto');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, createTeam } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

/**
 * Contract tests for the endpoints added by the build-spec alignment:
 * browse query (search / filter / sort / pagination), /teams/mine,
 * PATCH /teams/:id (owner edit), and /api/stats.
 */

function joinAs(token, teamId) {
  return request(app)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', randomUUID())
    .send({});
}

describe('GET /api/teams — search, filter, sort, pagination', () => {
  it('paginates and reports meta totals', async () => {
    const { token } = await registerUser(app);
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await createTeam(app, token, { name: `Paged Team ${i}` });
    }

    const page1 = await request(app).get('/api/teams?limit=2&page=1');
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });

    const page3 = await request(app).get('/api/teams?limit=2&page=3');
    expect(page3.body.data).toHaveLength(1);
  });

  it('filters by status=open and status=full', async () => {
    const owner = await registerUser(app);
    const joiner = await registerUser(app);
    const open = await createTeam(app, owner.token, { name: 'Open Team', capacity: 3 });
    const full = await createTeam(app, owner.token, { name: 'Full Team', capacity: 2 });
    await joinAs(joiner.token, full.id);

    const openRes = await request(app).get('/api/teams?status=open');
    expect(openRes.body.data.map((t) => t.id)).toEqual([open.id]);

    const fullRes = await request(app).get('/api/teams?status=full');
    expect(fullRes.body.data.map((t) => t.id)).toEqual([full.id]);
    expect(fullRes.body.data[0].isFull).toBe(true);
    expect(fullRes.body.data[0].seatsLeft).toBe(0);
  });

  it('searches name and description case-insensitively via ?q=', async () => {
    const { token } = await registerUser(app);
    await createTeam(app, token, { name: 'Rust Rockets', description: 'Systems fun' });
    await createTeam(app, token, { name: 'Python Pals', description: 'We love RUST tooling' });

    const byName = await request(app).get('/api/teams?q=rust');
    expect(byName.body.meta.total).toBe(2); // one by name, one by description

    const byDesc = await request(app).get('/api/teams?q=systems');
    expect(byDesc.body.meta.total).toBe(1);
    expect(byDesc.body.data[0].name).toBe('Rust Rockets');
  });

  it('sorts by most seats left with ?sort=seats', async () => {
    const { token } = await registerUser(app);
    await createTeam(app, token, { name: 'Small Team', capacity: 2 }); // 1 seat left
    await createTeam(app, token, { name: 'Roomy Team', capacity: 6 }); // 5 seats left

    const res = await request(app).get('/api/teams?sort=seats');
    expect(res.body.data[0].name).toBe('Roomy Team');
    expect(res.body.data[1].name).toBe('Small Team');
  });

  it('marks isMember / isOwner relative to the caller', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinAs(member.token, team.id);

    const asMember = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${member.token}`);
    expect(asMember.body.data[0].isMember).toBe(true);
    expect(asMember.body.data[0].isOwner).toBe(false);

    const asAnon = await request(app).get('/api/teams');
    expect(asAnon.body.data[0].isMember).toBe(false);
    expect(asAnon.body.data[0].isOwner).toBe(false);
  });
});

describe('GET /api/teams/mine', () => {
  it('returns created teams for role=created and joined teams for role=joined', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });
    await joinAs(member.token, team.id);

    const created = await request(app)
      .get('/api/teams/mine?role=created')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(created.body.data.map((t) => t.id)).toEqual([team.id]);

    const joined = await request(app)
      .get('/api/teams/mine?role=joined')
      .set('Authorization', `Bearer ${member.token}`);
    expect(joined.body.data.map((t) => t.id)).toEqual([team.id]);

    const ownerJoined = await request(app)
      .get('/api/teams/mine?role=joined')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(ownerJoined.body.data.map((t) => t.id)).toEqual([team.id]); // owner is member #1
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/teams/mine');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/teams/:id', () => {
  it('lets the owner edit name, description and capacity', async () => {
    const owner = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 4 });

    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Renamed Team', description: 'New pitch', capacity: 6 });

    expect(res.status).toBe(200);
    expect(res.body.team.name).toBe('Renamed Team');
    expect(res.body.team.description).toBe('New pitch');
    expect(res.body.team.capacity).toBe(6);
    expect(res.body.team.seatsLeft).toBe(5);
  });

  it('forbids a non-owner from editing (403 FORBIDDEN)', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const team = await createTeam(app, owner.token);

    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ name: 'Hijacked Name' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses capacity below the current member count (409 CAPACITY_BELOW_MEMBERS)', async () => {
    const owner = await registerUser(app);
    const m2 = await registerUser(app);
    const m3 = await registerUser(app);
    const team = await createTeam(app, owner.token, { capacity: 5 });
    await joinAs(m2.token, team.id);
    await joinAs(m3.token, team.id); // 3 members now

    // Capacity 2 is a legal shape (2–12) but below the 3 current members,
    // so the STATE rule — not the shape rule — must reject it.
    const res = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ capacity: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CAPACITY_BELOW_MEMBERS');

    // Lowering to exactly the member count is allowed (team becomes full).
    const exact = await request(app)
      .patch(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ capacity: 3 });
    expect(exact.status).toBe(200);
    expect(exact.body.team.isFull).toBe(true);
  });
});

describe('GET /api/stats', () => {
  it('returns real totals computed from the teams collection', async () => {
    const owner = await registerUser(app);
    const member = await registerUser(app);
    const t1 = await createTeam(app, owner.token, { name: 'Stats One', capacity: 4 });
    await createTeam(app, owner.token, { name: 'Stats Two', capacity: 2 });
    await joinAs(member.token, t1.id);

    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    // Stats One: 2/4 (2 open) + Stats Two: 1/2 (1 open) = 3 members, 3 open.
    expect(res.body).toEqual({ teams: 2, members: 3, openSeats: 3 });
  });

  it('returns zeros when there are no teams', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.body).toEqual({ teams: 0, members: 0, openSeats: 0 });
  });
});

describe('GET /api/health', () => {
  it('reports status ok with the db up', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });
});
