const mongoose = require('mongoose');

// One entry in a team's member list. Embedded inside the Team document so
// that ALL membership state for a team lives in a single document — this is
// what lets us change membership with one atomic update (see DESIGN.md §3).
const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'member'],
      default: 'member',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Capacity can be edited by the owner (PATCH /teams/:id) but never
    // below the current member count — that floor is enforced in the
    // controller with a 409. Editing is race-safe: the join operation
    // re-reads capacity on every request and enforces it inside the same
    // atomic write, so a mid-flight edit can never cause an over-fill
    // (lowering capacity can only make the filter stricter). See DESIGN.md §3.3.
    capacity: {
      type: Number,
      required: true,
      min: [2, 'Capacity must be at least 2'],
      max: [12, 'Capacity must be at most 12'],
      default: 4,
    },
    members: {
      type: [memberSchema],
      default: [],
    },
    // Denormalised counter, kept in sync with `members` ONLY through atomic
    // $inc updates in the same write as the $push/$pull (never set directly).
    // Keeping it as a number lets the join filter use a simple, index-friendly
    // condition: memberCount < capacity.
    memberCount: {
      type: Number,
      default: 0,
    },
    // Invite code (Spec §2, NICE): a shareable code that joins this team
    // via POST /teams/join-by-code. Only the owner ever sees it in API
    // responses (the serializer enforces that); regenerating replaces it.
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    // Join approvals (Spec §2, NICE): when true, a join becomes a
    // pending JoinApplication the owner must approve before the atomic
    // join runs. Default false = the original one-click join.
    requireApproval: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

teamSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Team', teamSchema);
