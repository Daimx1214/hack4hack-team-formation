const mongoose = require('mongoose');

/**
 * Idempotency record for join requests.
 *
 * When a client sends an `Idempotency-Key` header with POST /teams/:id/join,
 * we store one row per (user, key) after a successful join. If the same
 * request is retried (double-click, network retry, refresh), we find this
 * row and return the original result instead of joining a second time.
 *
 * The unique index on (user, key) is what makes this safe under concurrency:
 * even if two retries arrive at the same moment, only one row can exist.
 */
const joinRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['joined'],
      default: 'joined',
    },
  },
  { timestamps: true }
);

joinRequestSchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
