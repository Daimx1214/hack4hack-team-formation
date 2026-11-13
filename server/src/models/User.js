const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // one account per email — enforced by a unique index
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    passwordHash: {
      type: String,
      required: true,
      // Build Spec §11: the hash is never selected by default; the one
      // place that needs it (login) asks explicitly with
      // .select('+passwordHash'). The toJSON transform below is the
      // second layer — it strips the hash from anything serialized.
      select: false,
    },
    skills: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Hash the plain-text password (temporarily placed in passwordHash by the
// register controller) before the user is saved for the first time.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

// Compare a login attempt against the stored hash.
userSchema.methods.comparePassword = function comparePassword(plainText) {
  return bcrypt.compare(plainText, this.passwordHash);
};

// Never leak the password hash (or internal fields) in API responses.
userSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
