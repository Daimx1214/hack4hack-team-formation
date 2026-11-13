const request = require('supertest');

// Small factories shared by the test files so each test reads as
// arrange → act → assert instead of repeating HTTP boilerplate.

let counter = 0;
function uniqueEmail() {
  counter += 1;
  return `user${counter}-${Date.now()}@example.com`;
}

// Register a user through the real API and return { user, token }.
async function registerUser(app, overrides = {}) {
  const body = {
    name: overrides.name || 'Test User',
    email: overrides.email || uniqueEmail(),
    password: overrides.password || 'password123',
  };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { user: res.body.user, token: res.body.accessToken };
}

// Create a team through the real API as the given user.
async function createTeam(app, token, overrides = {}) {
  const body = {
    name: overrides.name || 'Team Alpha',
    description: overrides.description || 'A test team',
    capacity: overrides.capacity === undefined ? 4 : overrides.capacity,
  };
  const res = await request(app)
    .post('/api/teams')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  if (res.status !== 201) {
    throw new Error(`createTeam failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.team;
}

module.exports = { registerUser, createTeam, uniqueEmail };
