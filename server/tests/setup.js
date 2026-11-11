// Shared test setup: boots a real (in-memory) MongoDB for each test file
// using mongodb-memory-server, and connects Mongoose to it. This lets the
// API tests exercise the REAL database behaviour — including the atomic
// updates the race-proofing depends on — without needing a running mongod.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';

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
