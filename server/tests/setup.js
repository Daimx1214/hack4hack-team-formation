// Shared test setup: boots a real (in-memory) MongoDB for each test file
// using mongodb-memory-server, and connects Mongoose to it. This lets the
// API tests exercise the REAL database behaviour — including the atomic
// updates the race-proofing depends on — without needing a running mongod.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
// Production rate-limit defaults (Spec §11: auth 10/15 min counting every
// request) would throttle the suites themselves — most files register and
// log in dozens of users through one app instance. Tests therefore run
// with generous caps; the security suite sets its own small values before
// creating its app, which these ||= defaults never override.
process.env.RATE_LIMIT_AUTH_MAX = process.env.RATE_LIMIT_AUTH_MAX || '1000';
process.env.RATE_LIMIT_GLOBAL_MAX = process.env.RATE_LIMIT_GLOBAL_MAX || '100000';
process.env.RATE_LIMIT_WRITE_MAX = process.env.RATE_LIMIT_WRITE_MAX || '1000';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

async function connectTestDB() {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

async function clearTestDB() {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function closeTestDB() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) await mongoServer.stop();
}

module.exports = { connectTestDB, clearTestDB, closeTestDB };
