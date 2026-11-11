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
    // Capacity is IMMUTABLE after creation (enforced in the controllers by
    // simply never offering an update path). The join operation reads this
    // value and uses it in its atomic filter — if it could change mid-flight,
    // a stale value could be enforced. See DESIGN.md §3.3.
    capacity: {
      type: Number,
      required: true,
      min: [2, 'Capacity must be at least 2'],
      max: [10, 'Capacity must be at most 10'],
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
    skillsNeeded: {
      type: [String],
      default: [],
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
