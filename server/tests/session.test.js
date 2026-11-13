const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

/**
 * Session tests (Build Spec §9/§12): the refresh-token lifecycle —
 * issued on register/login as an httpOnly cookie, rotated on refresh
 * (the old token stops working), revoked on logout.
 */

function refreshCookieFrom(res) {
  const cookies = res.headers['set-cookie'] || [];
  return cookies.find((c) => c.startsWith('tf_refresh='));
}

async function registerAgent(agent, email) {
  const res = await agent
    .post('/api/auth/register')
    .send({ name: 'Session User', email, password: 'password123' });
  expect(res.status).toBe(201);
  return res;
}

describe('Refresh token lifecycle', () => {
  it('register and login set an httpOnly refresh cookie', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();

    const registered = await registerAgent(agent, email);
    const cookie = refreshCookieFrom(registered);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);

    const loggedIn = await agent
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    expect(loggedIn.status).toBe(200);
    expect(refreshCookieFrom(loggedIn)).toBeDefined();
  });

  it('refresh returns a fresh access token and ROTATES the cookie; the old cookie is then rejected', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    const registered = await registerAgent(agent, email);
    const oldCookie = refreshCookieFrom(registered);

    const refreshed = await agent.post('/api/auth/refresh');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeDefined();
    const newCookie = refreshCookieFrom(refreshed);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(oldCookie);

    // Reuse of the rotated-out (old) token must fail — it was revoked
    // when the new one was issued.
    const reuse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldCookie.split(';')[0]);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('INVALID_REFRESH');
  });

  it('refresh without a cookie is 401 INVALID_REFRESH', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH');
  });

  it('logout revokes the refresh token: a later refresh is 401', async () => {
    const agent = request.agent(app);
    await registerAgent(agent, uniqueEmail());

    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);

    const refreshed = await agent.post('/api/auth/refresh');
    expect(refreshed.status).toBe(401);
    expect(refreshed.body.error.code).toBe('INVALID_REFRESH');
  });

  it('refresh from a non-allowlisted Origin is 403 (CSRF guard)', async () => {
    const agent = request.agent(app);
    await registerAgent(agent, uniqueEmail());

    const res = await agent
      .post('/api/auth/refresh')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(403);
  });

  it('the rotated access token authenticates /me', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail();
    await registerAgent(agent, email);

    const refreshed = await agent.post('/api/auth/refresh');
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });
});
