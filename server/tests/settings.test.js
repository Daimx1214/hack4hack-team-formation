// Settings endpoints (Build Spec §5.7): PATCH /api/auth/me changes the
// display name; POST /api/auth/logout-all revokes every refresh token
// the user holds ("sign out everywhere").
const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe('PATCH /api/auth/me', () => {
  it('updates the display name and returns the fresh user', async () => {
    const { token } = await registerUser(app, { name: 'Old Name' });
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('New Name');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user.name).toBe('New Name');
  });

  it('rejects unknown fields and anonymous calls', async () => {
    const { token } = await registerUser(app);
    const bad = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'hijack@example.com' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION');

    const anon = await request(app).patch('/api/auth/me').send({ name: 'Nobody' });
    expect(anon.status).toBe(401);
  });
});

describe('POST /api/auth/logout-all', () => {
  it("revokes the user's other sessions too", async () => {
    const email = uniqueEmail();
    const password = 'password123';
    await registerUser(app, { email, password });

    // Two independent browsers = two cookie-keeping agents.
    const browserA = request.agent(app);
    const browserB = request.agent(app);
    const loginA = await browserA.post('/api/auth/login').send({ email, password });
    const loginB = await browserB.post('/api/auth/login').send({ email, password });
    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    // B can refresh before the global sign-out...
    const beforeB = await browserB.post('/api/auth/refresh');
    expect(beforeB.status).toBe(200);

    // ...A signs out everywhere (using A's fresh access token)...
    const out = await browserA
      .post('/api/auth/logout-all')
      .set('Authorization', `Bearer ${loginA.body.accessToken}`);
    expect(out.status).toBe(204);

    // ...and now B's session is dead as well.
    const afterB = await browserB.post('/api/auth/refresh');
    expect(afterB.status).toBe(401);
  });
});
