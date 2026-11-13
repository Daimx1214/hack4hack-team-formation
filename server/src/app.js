const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const createAuthRouter = require('./routes/authRoutes');
const createTeamRouter = require('./routes/teamRoutes');
const { getStats } = require('./controllers/teamController');
const asyncHandler = require('./utils/asyncHandler');
const { makeLimiters } = require('./middleware/rateLimit');
const { allowedOrigins } = require('./utils/origins');

// CORS allowlist (Spec §11): exact origins only, from the CORS_ORIGINS
// env var (comma-separated). Requests without an Origin header (curl,
// server-to-server, tests) are not CORS requests and pass through.
function corsOptions() {
  const allowed = allowedOrigins();
  return {
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  };
}

/**
 * Build the Express app. Kept separate from server.js so tests can import
 * the app and drive it with Supertest without opening a real port.
 */
function createApp() {
  const app = express();
  const { globalLimiter, authLimiter, writeLimiter } = makeLimiters();

  // Behind the host's proxy (Vercel) the real client IP is in
  // X-Forwarded-For; trust exactly one hop so rate limiting keys on the
  // real IP instead of the proxy's.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(globalLimiter);
  app.use(cookieParser());
  app.use(express.json({ limit: '10kb' }));

  // Health: reports process uptime and whether the database connection is
  // up; 503 when the DB is down so load balancers/monitors can tell the
  // difference between "process alive" and "actually serving".
  app.get('/api/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    return res.status(dbUp ? 200 : 503).json({
      status: dbUp ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      db: dbUp ? 'up' : 'down',
    });
  });

  app.get('/api/stats', asyncHandler(getStats));
  app.use('/api/auth', createAuthRouter({ authLimiter }));
  app.use('/api/teams', createTeamRouter({ writeLimiter }));
  // Root — a small signpost so the bare API URL answers with something
  // useful instead of a platform 404 (vercel.json rewrites "/" here).
  app.get(['/', '/api'], (req, res) => {
    res.json({
      name: 'TeamForge API',
      status: 'ok',
      frontend: 'https://hack4hack-web.vercel.app',
      endpoints: {
        health: '/api/health',
        stats: '/api/stats',
        teams: '/api/teams',
        auth: '/api/auth',
      },
    });
  });

  // Unknown routes — same error envelope as everywhere else.
  app.use((req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
  );

  // Central error handler — anything a controller passes to next(err), and
  // any Mongoose validation error, lands here in the standard envelope.
  // Production responses never leak stack traces or raw driver messages.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // Body-parser failures arrive here too: an oversized body is a 413
    // and malformed JSON is a 400 — neither is a server fault.
    if (err.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    }
    if (err.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Request body is not valid JSON' } });
    }
    if (err.name === 'ValidationError') {
      const details = Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'The request did not pass validation', details } });
    }
    console.error(err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side' } });
  });

  return app;
}

module.exports = createApp;
