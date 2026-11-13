// Invite codes + join approvals (Build Spec §2, NICE):
//  - every team has an invite code only its owner can see; joining by
//    code runs the same pipeline as joining by id
//  - on an approval team, joining files a pending application; the
//    atomic join runs only when the owner approves
const request = require('supertest');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const JoinApplication = mongoose.model('JoinApplication');

async function createTeamRaw(token, overrides = {}) {
  const res = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Team X', description: '', capacity: 4, ...overrides });
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.team;
}

function joinById(teamId, token, key = randomUUID()) {
  return request(app)
    .post(`/api/teams/${teamId}/join`)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', key)
    .send({});
}

describe('Invite codes', () => {
  it('are visible only to the owner, join a team, and die on regeneration', async () => {
    const owner = await registerUser(app);
    const team = await createTeamRaw(owner.token, { name: 'Coded Team' });
    expect(team.inviteCode).toMatch(/^[A-Z2-9]{8}$/);

    const guestView = await request(app).get(`/api/teams/${team.id}`);
    expect(guestView.body.team.inviteCode).toBeUndefined();

    const member = await registerUser(app);
    const joined = await request(app)
      .post('/api/teams/join-by-code')
      .set('Authorization', `Bearer ${member.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ code: team.inviteCode.toLowerCase() }); // codes are case-insensitive to type
    expect(joined.status).toBe(201);
    expect(joined.body.team.isMember).toBe(true);

    const wrong = await request(app)
      .post('/api/teams/join-by-code')
      .set('Authorization', `Bearer ${member.token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ code: 'ZZZZ9999' });
    expect(wrong.status).toBe(404);

    const regen = await request(app)
      .post(`/api/teams/${team.id}/invite-code`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(regen.status).toBe(200);
    expect(regen.body.inviteCode).not.toBe(team.inviteCode);

    const oldCode = await request(app)
      .post('/api/teams/join-by-code')
      .set('Authorization', `Bearer ${(await registerUser(app)).token}`)
      .set('Idempotency-Key', randomUUID())
      .send({ code: team.inviteCode });
    expect(oldCode.status).toBe(404);

    const notOwner = await request(app)
      .post(`/api/teams/${team.id}/invite-code`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(notOwner.status).toBe(403);
  });
});

describe('Join approvals', () => {
  it('files a pending application instead of joining; approval runs the atomic join', async () => {
    const owner = await registerUser(app);
    const team = await createTeamRaw(owner.token, {
      name: 'Approval Team',
      requireApproval: true,
    });
    expect(team.requireApproval).toBe(true);

    const applicant = await registerUser(app);
    const key = randomUUID();
    const applied = await joinById(team.id, applicant.token, key);
    expect(applied.status).toBe(202);
    expect(applied.body.application.status).toBe('pending');
    expect(applied.body.team.isMember).toBe(false);

    // Replaying the same key reports the pending application, and a
    // fresh key does not create a second one.
    const replay = await joinById(team.id, applicant.token, key);
    expect(replay.status).toBe(200);
    expect(replay.headers['idempotent-replay']).toBe('true');
    const again = await joinById(team.id, applicant.token);
    expect(again.status).toBe(200);
    expect(await JoinApplication.countDocuments({ team: team.id, status: 'pending' })).toBe(1);

    // Only the owner can review.
    const stranger = await registerUser(app);
    const forbidden = await request(app)
      .get(`/api/teams/${team.id}/applications`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(forbidden.status).toBe(403);

    const list = await request(app)
      .get(`/api/teams/${team.id}/applications`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].user.id).toBe(applicant.user.id);
    const applicationId = list.body.data[0].id;

    const approve = await request(app)
      .post(`/api/teams/${team.id}/applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(approve.status).toBe(200);
    expect(approve.body.team.memberCount).toBe(2);

    const view = await request(app)
      .get(`/api/teams/${team.id}`)
      .set('Authorization', `Bearer ${applicant.token}`);
    expect(view.body.team.isMember).toBe(true);

    // Decided applications cannot be decided again.
    const redecide = await request(app)
      .post(`/api/teams/${team.id}/applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(redecide.status).toBe(409);
    expect(redecide.body.error.code).toBe('APPLICATION_DECIDED');
  });

  it('rejects, lets the applicant apply again, and refuses approval when the team filled up', async () => {
    const owner = await registerUser(app);
    const team = await createTeamRaw(owner.token, {
      name: 'Tiny Approval',
      capacity: 2,
      requireApproval: true,
    });

    const first = await registerUser(app);
    const second = await registerUser(app);
    await joinById(team.id, first.token);
    await joinById(team.id, second.token);

    const list = await request(app)
      .get(`/api/teams/${team.id}/applications`)
      .set('Authorization', `Bearer ${owner.token}`);
    const byUser = Object.fromEntries(list.body.data.map((a) => [a.user.id, a.id]));

    // Reject the second applicant; they may apply again.
    const reject = await request(app)
      .post(`/api/teams/${team.id}/applications/${byUser[second.user.id]}/reject`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(reject.status).toBe(200);
    expect(reject.body.application.status).toBe('rejected');
    const reapply = await joinById(team.id, second.token);
    expect(reapply.status).toBe(202);

    // Approve the first applicant: the only seat is gone.
    const approveFirst = await request(app)
      .post(`/api/teams/${team.id}/applications/${byUser[first.user.id]}/approve`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(approveFirst.status).toBe(200);

    // Approving the re-applied second request now hits the full team;
    // the request stays pending rather than forcing an over-fill.
    const list2 = await request(app)
      .get(`/api/teams/${team.id}/applications`)
      .set('Authorization', `Bearer ${owner.token}`);
    const pendingSecond = list2.body.data.find(
      (a) => a.user.id === second.user.id && a.status === 'pending'
    );
    const approveSecond = await request(app)
      .post(`/api/teams/${team.id}/applications/${pendingSecond.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(approveSecond.status).toBe(409);
    expect(approveSecond.body.error.code).toBe('TEAM_FULL');

    const finalTeam = await request(app).get(`/api/teams/${team.id}`);
    expect(finalTeam.body.team.memberCount).toBe(2);
  });
});
