// Per-account brute-force lockout (Build Spec §11, SHOULD): after 5
// failed logins an account locks for 15 minutes; while locked, even the
// CORRECT password gets the same generic 401, so neither the lock nor
// the error reveals anything about the account.
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const { connectTestDB, clearTestDB, closeTestDB } = require('./setup');
const { registerUser, uniqueEmail } = require('./helpers');

const app = createApp();

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const User = mongoose.model('User');

async function login(email, password) {
  return request(app).post('/api/auth/login').send({ email, password });
}

describe('Account lockout', () => {
  it('locks after 5 failed logins; the correct password is refused while locked, with the generic error', async () => {
    const email = uniqueEmail();
    await registerUser(app, { email, password: 'password123' });

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const bad = await login(email, 'wrong-password');
      expect(bad.status).toBe(401);
      expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    const locked = await login(email, 'password123');
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toBe('Email or password is incorrect');

    // Other accounts are unaffected by this account's lock.
    const other = uniqueEmail();
    await registerUser(app, { email: other, password: 'password123' });
    const otherLogin = await login(other, 'password123');
    expect(otherLogin.status).toBe(200);
  });

  it('lets the user back in once the lock has expired', async () => {
    const email = uniqueEmail();
    const { user } = await registerUser(app, { email, password: 'password123' });
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await login(email, 'wrong-password');
    }
    // Simulate the 15 minutes passing.
    await User.updateOne({ _id: user.id }, { lockedUntil: new Date(Date.now() - 1000) });
    const backIn = await login(email, 'password123');
    expect(backIn.status).toBe(200);
  });

  it('resets the failure counter on a successful login', async () => {
    const email = uniqueEmail();
    await registerUser(app, { email, password: 'password123' });
    // 4 wrong, 1 right, 4 wrong, 1 right: never 5 in a row, never locked.
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const bad = await login(email, 'wrong-password');
        expect(bad.status).toBe(401);
      }
      // eslint-disable-next-line no-await-in-loop
      const ok = await login(email, 'password123');
      expect(ok.status).toBe(200);
    }
  });
});
