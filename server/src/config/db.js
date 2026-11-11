const mongoose = require('mongoose');

/**
 * Connect Mongoose to MongoDB using the MONGO_URI environment variable.
 * Called once at server startup (not in tests — tests connect to an
 * in-memory MongoDB themselves, see tests/setup.js).
 */
async function connectDB(uri = process.env.MONGO_URI) {
  if (!uri) {
    throw new Error('MONGO_URI is not set. Copy .env.example to .env and fill it in.');
  }
  await mongoose.connect(uri);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

module.exports = connectDB;
