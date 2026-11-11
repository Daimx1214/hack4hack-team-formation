const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const teamRoutes = require('./routes/teamRoutes');

/**
 * Build the Express app. Kept separate from server.js so tests can import
 * the app and drive it with Supertest without opening a real port.
 */
function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api/teams', teamRoutes);

  // Unknown routes
  app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

  // Central error handler — anything a controller passes to next(err), and
  // any Mongoose validation error, lands here as a clean JSON response.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join('; ') });
    }
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
