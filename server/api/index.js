// Vercel serverless entry point.
//
// Render's free tier started requiring a card on file, so the API is
// deployed on Vercel instead (free Hobby plan, no card). Vercel runs this
// file as a function for /api/* requests (see vercel.json in this folder).
//
// The Express app itself is unchanged — this file only adapts it to a
// serverless runtime: the MongoDB connection is opened once and reused
// across warm invocations instead of connecting per request.
const connectDB = require('../src/config/db');
const createApp = require('../src/app');

const app = createApp();

let dbReady = null;

function ensureDb() {
  if (!dbReady) {
    dbReady = connectDB().catch((err) => {
      dbReady = null; // allow the next request to retry the connection
      throw err;
    });
  }
  return dbReady;
}

module.exports = async (req, res) => {
  await ensureDb();
  return app(req, res);
};
