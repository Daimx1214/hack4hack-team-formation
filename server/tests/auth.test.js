const request = require('supertest');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe('POST /api/auth/register', () => {
  it('creates a user and returns a token, without exposing the password hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Daim', email: uniqueEmail(), password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.name).toBe('Daim');
    expect(res.body.user.id).toBeDefined();
    expect(res.body.token).toBeDefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'First', email, password: 'password123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Second', email, password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: uniqueEmail() });

    expect(res.status).toBe(400);
  });

  it('rejects a password shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Shorty', email: uniqueEmail(), password: '123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 6/i);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Login User', email, password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);
  });

  it('rejects a wrong password with 401', async () => {
    const email = uniqueEmail();
    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Wrong Pass', email, password: 'password123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'not-the-password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'password123' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the current user when given a valid token', async () => {
    const email = uniqueEmail();
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Me User', email, password: 'password123' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
