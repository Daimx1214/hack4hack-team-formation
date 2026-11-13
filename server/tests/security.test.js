// Security checklist tests (Build Spec §11/§12). The auth rate-limit cap
// is lowered via env BEFORE the app is built so the 429 behaviour can be
// exercised without sending hundreds of requests; each Jest test file
// has its own module registry, so this does not affect other suites.
process.env.RATE_LIMIT_AUTH_MAX = '3';

const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe('Security headers (helmet)', () => {
  it('sets protective headers and does not advertise Express', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('Auth rate limiting', () => {
  it('returns 429 RATE_LIMITED once the per-IP request cap is used up (Spec §11: every auth request counts)', async () => {
    const email = uniqueEmail();
    // The register itself is auth request #1 against this file's cap of 3.
    await registerUser(app, { email, password: 'password123' });

    // Requests #2 and #3 are answered normally — success or failure,
    // they all count toward the same cap.
    const ok = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(bad.status).toBe(401);

    // Request #4 crosses the cap: rate-limited, in the standard envelope.
    const limited = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('CORS allowlist', () => {
  it('reflects an allowlisted origin and not an unknown one', async () => {
    const good = await request(app)
      .get('/api/teams')
      .set('Origin', 'https://hack4hack-web.vercel.app');
    expect(good.headers['access-control-allow-origin']).toBe('https://hack4hack-web.vercel.app');

    const evil = await request(app)
      .get('/api/teams')
      .set('Origin', 'https://evil.example.com');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('Body size limit', () => {
  it('rejects a JSON body over 10kb with 413', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Big Body', email: uniqueEmail(), password: 'x'.repeat(20000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
