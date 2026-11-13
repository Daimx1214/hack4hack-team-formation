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
  // maxPoolSize is kept small on purpose: on serverless hosting (Vercel)
  // many warm function instances can be alive at once, and each one opens
  // its own pool — a small pool per instance keeps the total comfortably
  // under the Atlas M0 free-tier connection limit (100).
  await mongoose.connect(uri, { maxPoolSize: 5 });
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

module.exports = connectDB;
