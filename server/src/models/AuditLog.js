const mongoose = require('mongoose');

// Audit log (Build Spec §11, NICE): one row per team lifecycle event —
// { actor, action, team, at }. Written fire-and-forget from the team
// controller: an audit failure must never fail the user's action, and
// nothing in the API exposes these rows yet; they exist so the history
// of who did what to a team is never lost.
const auditLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['create', 'join', 'leave', 'delete'], required: true },
  team: { type: mongoose.Schema.Types.ObjectId, required: true },
  at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
