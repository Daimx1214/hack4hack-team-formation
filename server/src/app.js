const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');
const { getStats } = require('./controllers/teamController');
const asyncHandler = require('./utils/asyncHandler');

/**
 * Build the Express app. Kept separate from server.js so tests can import
 * the app and drive it with Supertest without opening a real port.
 */
function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

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
  app.use('/api/auth', authRoutes);
  app.use('/api/teams', teamRoutes);

  // Unknown routes — same error envelope as everywhere else.
  app.use((req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } })
  );

  // Central error handler — anything a controller passes to next(err), and
  // any Mongoose validation error, lands here in the standard envelope.
  // Production responses never leak stack traces or raw driver messages.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
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
