const mongoose = require('mongoose');

/**
 * Idempotency record for join requests (Build Spec §10.2).
 *
 * POST /teams/:id/join REQUIRES an Idempotency-Key (a UUID). The flow:
 *  1. The controller first tries to INSERT a record with status
 *     'processing'. The unique index on (user, key) guarantees only one
 *     record per key, even when retries race.
 *  2. When the join attempt settles, the record is updated to 'done' with
 *     the response status that was returned (201 for a fresh join, 409 for
 *     TEAM_FULL / ALREADY_MEMBER, ...), so a later retry replays the SAME
 *     answer instead of joining again.
 *  3. A retry that arrives while the first attempt is still 'processing'
 *     gets 409 REQUEST_IN_PROGRESS.
 * Records expire after 24 hours via the TTL index on createdAt.
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
      enum: ['processing', 'done'],
      default: 'processing',
    },
    responseStatus: {
      type: Number,
      default: null,
    },
    responseCode: {
      type: String,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 60 * 60 * 24, // TTL: 24 hours
    },
  },
  { timestamps: false }
);

// Scoped per team as well as per user+key: the same key string used on a
// different team is a different intent (the route differs), while a retry
// of the SAME join always collides with its original record.
joinRequestSchema.index({ user: 1, key: 1, team: 1 }, { unique: true });

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
