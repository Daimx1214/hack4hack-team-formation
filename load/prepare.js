// Prepare step for the load test (run against an already-running API):
//
//   node load/prepare.js
//
// It registers a pool of throwaway load-test users through the real API,
// has the first one create the "stampede" team (capacity 10, the maximum),
// and writes everything the Artillery run needs into load/context.json:
//
//   { "teamId": "...", "tokens": ["<jwt>", ...] }
//
// The Artillery processor (processor.js) reads that file to hand each
// virtual user a token and the team id. Re-running prepare is safe: if a
// user already exists (409) it simply logs in to fetch a fresh token.
const fs = require('fs');
const path = require('path');

const BASE = process.env.LOAD_BASE_URL || 'http://localhost:5000';
const USER_COUNT = 100;
const PASSWORD = 'load-pass-123';

async function api(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Register one load user; on 409 (already registered) log in instead.
// Returns the user's JWT either way.
async function getToken(i) {
  const email = `loaduser${i}@example.com`;
  const registered = await api('/api/auth/register', {
    method: 'POST',
    body: { name: `Load User ${i}`, email, password: PASSWORD },
  });
  if (registered.status === 201) return registered.data.token;

  const loggedIn = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  if (loggedIn.status === 200) return loggedIn.data.token;

  throw new Error(`Could not get a token for ${email} (register ${registered.status}, login ${loggedIn.status})`);
}

async function main() {
  // Small concurrency pool: registering hashes a password server-side,
  // so firing all 100 at once would just queue on bcrypt anyway.
  const tokens = [];
  const POOL = 10;
  for (let start = 0; start < USER_COUNT; start += POOL) {
    const batch = [];
    for (let i = start; i < Math.min(start + POOL, USER_COUNT); i += 1) {
      batch.push(getToken(i));
    }
    // eslint-disable-next-line no-await-in-loop
    tokens.push(...(await Promise.all(batch)));
  }

  // The first user creates the stampede team at max capacity (10).
  const created = await api('/api/teams', {
    method: 'POST',
    token: tokens[0],
    body: {
      name: 'Load Test Stampede Team',
      description: 'Created by load/prepare.js — 100 users will race to join it.',
      capacity: 10,
    },
  });
  if (created.status !== 201) {
    throw new Error(`Team creation failed: ${created.status} ${JSON.stringify(created.data)}`);
  }

  const context = { teamId: created.data.team.id, tokens };
  fs.writeFileSync(path.join(__dirname, 'context.json'), JSON.stringify(context, null, 2));
  console.log(`Prepared ${tokens.length} load users and team ${context.teamId} (${BASE}).`);
  console.log('Wrote load/context.json — now run Artillery (see load/README.md).');
}

main().catch((err) => {
  console.error('prepare failed:', err.message);
  process.exit(1);
});
