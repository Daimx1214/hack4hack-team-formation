const mongoose = require('mongoose');

// A request to join a team that requires owner approval (Spec §2, NICE).
// Lifecycle: pending → approved (the atomic join ran for this user) or
// pending → rejected. The partial unique index guarantees at most ONE
// pending application per (team, user) — re-applying after a decision is
// fine, double-applying while pending is not.
const joinApplicationSchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

joinApplicationSchema.index(
  { team: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('JoinApplication', joinApplicationSchema);
