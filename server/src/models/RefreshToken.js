const mongoose = require('mongoose');

/**
 * Refresh-token records (Build Spec §9.1).
 *
 * The refresh token itself is an opaque random string that travels only
 * in an httpOnly cookie. The database stores just its SHA-256 hash, so a
 * database leak does not hand out usable sessions. Rotation: every
 * /auth/refresh revokes the presented token and issues a new one
 * (replacedBy links the chain, which makes reuse of an old token
 * detectable). Logout revokes. The TTL index deletes expired records.
 */
const refreshTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0, // TTL: MongoDB removes the document at expiresAt
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  replacedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RefreshToken',
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
