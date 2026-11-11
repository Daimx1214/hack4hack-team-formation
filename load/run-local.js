// One-command LOCAL load test:
//
//   node load/run-local.js
//
// What it does, end to end:
//   1. Starts a throwaway in-memory MongoDB (mongodb-memory-server — the
//      same package the API tests use, loaded from server/'s install).
//   2. Starts the REAL API server (server/src/server.js) against it on a
//      scratch port.
//   3. Runs load/prepare.js (100 load users + the stampede team).
//   4. Runs Artillery with load/artillery.yml against the local server.
//   5. Writes the machine-readable report to load/report-local.json and a
//      human summary to load/results-local.txt, then shuts everything down.
//
// LOCAL numbers only: the API, the database and the load generator all
// share one small dev machine here. The proof run for the submission is
// the same artillery.yml re-run against the DEPLOYED URL — see README.md.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT = path.join(__dirname, '..');
const PORT = 5055;
const BASE = `http://localhost:${PORT}`;

// mongodb-memory-server is a devDependency of the server package —
// borrow it from there instead of adding a second copy at the root.
const serverRequire = createRequire(path.join(ROOT, 'server', 'package.json'));
const { MongoMemoryServer } = serverRequire('mongodb-memory-server');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 64 * 1024 * 1024, ...options }, (err, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      if (err) reject(err);
      else resolve();
    });
  });
}

async function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet — keep polling
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

async function main() {
  console.log('Starting in-memory MongoDB…');
  const mongo = await MongoMemoryServer.create();

  console.log(`Starting API server on ${BASE}…`);
  const server = spawn('node', ['src/server.js'], {
    cwd: path.join(ROOT, 'server'),
    env: {
      ...process.env,
      MONGO_URI: mongo.getUri(),
      JWT_SECRET: 'load-test-secret',
      PORT: String(PORT),
    },
    stdio: 'inherit',
  });

  try {
    await waitForHealth();
    console.log('API is healthy. Preparing load users + team…');
    await run('node', [path.join(__dirname, 'prepare.js')], {
      env: { ...process.env, LOAD_BASE_URL: BASE },
    });

    console.log('Running Artillery…');
    // IMPORTANT environment fix: this machine routes traffic through an
    // egress proxy (HTTP_PROXY & friends are set), and Artillery's HTTP
    // engine honours those variables but not NO_PROXY — so with them set,
    // requests for http://localhost:<port> are sent to the proxy and die
    // with ECONNRESET instead of reaching the local API. For a LOCAL
    // target the proxy variables must go. (For a deployed --target run
    // from this machine, keep them — external traffic needs the proxy.)
    const artilleryEnv = { ...process.env };
    for (const key of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'all_proxy', 'NODE_USE_ENV_PROXY']) {
      delete artilleryEnv[key];
    }
    await run(
      'npx',
      [
        '-y',
        'artillery@2',
        'run',
        path.join(__dirname, 'artillery.yml'),
        '--target',
        BASE,
        '-o',
        path.join(__dirname, 'report-local.json'),
      ],
      { cwd: ROOT, timeout: 600000, env: artilleryEnv }
    );

    // Summarise the JSON report into results-local.txt.
    const report = JSON.parse(fs.readFileSync(path.join(__dirname, 'report-local.json'), 'utf8'));
    const agg = report.aggregate;
    const latency = (agg.summaries && agg.summaries['http.response_time']) || agg.latency || {};
    const counters = agg.counters || {};
    const codes = Object.keys(counters)
      .filter((k) => k.startsWith('http.codes.'))
      .sort()
      .map((k) => `  ${k.replace('http.codes.', 'HTTP ')}: ${counters[k]}`)
      .join('\n');
    const errors = Object.keys(counters)
      .filter((k) => k.startsWith('errors.'))
      .map((k) => `  ${k}: ${counters[k]}`)
      .join('\n');

    const summary = [
      'TeamForge API — LOCAL load test results',
      '========================================',
      `Date: ${new Date().toISOString()}`,
      `Target: ${BASE} (local machine — API, in-memory MongoDB and Artillery`,
      'all running on the same small dev VM). These are LOCAL numbers;',
      'the submission proof is the same artillery.yml re-run against the',
      'deployed URL.',
      '',
      `Requests completed: ${counters['http.responses'] || 'n/a'}`,
      `Request rate (mean): ${agg.rates ? agg.rates['http.request_rate'] : 'n/a'} req/s`,
      'Response codes:',
      codes || '  (none recorded)',
      errors ? `Errors:\n${errors}` : 'Errors: none',
      '',
      'Response time (ms):',
      `  min:  ${latency.min}`,
      `  mean: ${latency.mean}`,
      `  p50:  ${latency.median}`,
      `  p95:  ${latency.p95}`,
      `  p99:  ${latency.p99}`,
      `  max:  ${latency.max}`,
      '',
      'PS1 target: p95 < 200 ms.',
      '',
    ].join('\n');

    fs.writeFileSync(path.join(__dirname, 'results-local.txt'), summary);
    console.log('\n' + summary);
  } finally {
    server.kill();
    await mongo.stop();
  }
}

main().catch((err) => {
  console.error('Local load test failed:', err.message);
  process.exit(1);
});
