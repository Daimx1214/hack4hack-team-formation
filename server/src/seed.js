require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Team = require('./models/Team');
const JoinRequest = require('./models/JoinRequest');

/**
 * Seed script — fills the database with demo data so the app (and the
 * demo video) can be explored immediately, without registering accounts
 * by hand first.
 *
 *   cd server && npm run seed
 *
 * WARNING: it WIPES all users, teams and join records first, so every run
 * starts from the same clean demo state. Never run it against a database
 * you care about.
 *
 * Demo accounts (also listed in the README "Demo accounts" section):
 * every user below signs in with the same throwaway password `demo1234`.
 * These are fake accounts for a hackathon demo — not real credentials.
 */
const DEMO_PASSWORD = 'demo1234';

const DEMO_USERS = [
  { name: 'Ayesha Khan', email: 'ayesha@example.com', skills: ['React', 'Node.js'] },
  { name: 'Bilal Ahmed', email: 'bilal@example.com', skills: ['MongoDB', 'Express'] },
  { name: 'Chen Wei', email: 'chen@example.com', skills: ['TypeScript', 'React'] },
  { name: 'Dana Petrova', email: 'dana@example.com', skills: ['CSS', 'React'] },
  { name: 'Elias Rodriguez', email: 'elias@example.com', skills: ['Python', 'APIs'] },
  { name: 'Fatima Noor', email: 'fatima@example.com', skills: ['Machine Learning', 'Python'] },
];

// Team blueprints. `members` lists emails in join order; the FIRST email
// is the owner (seat #1 — see DESIGN.md: the owner occupies a seat).
// memberCount is derived from the list, so the counter can never disagree
// with the members it describes.
const DEMO_TEAMS = [
  {
    name: 'API Wizards',
    description: 'Building a race-proof hackathon API with Node and MongoDB.',
    capacity: 4,
    skillsNeeded: ['React', 'MongoDB'],
    members: ['ayesha@example.com', 'bilal@example.com', 'chen@example.com'], // 3/4
  },
  {
    name: 'Frontend Foxes',
    description: 'Pixel-perfect UI crew. This team is full — try another one.',
    capacity: 3,
    skillsNeeded: [],
    members: ['dana@example.com', 'elias@example.com', 'fatima@example.com'], // 3/3 FULL
  },
  {
    name: 'ML Mavericks',
    description: 'Fresh team looking for builders of every kind.',
    capacity: 5,
    skillsNeeded: ['Python', 'React', 'Node.js'],
    members: ['fatima@example.com'], // 1/5
  },
  {
    name: 'Open Source Owls',
    description: 'Night-owl contributors welcome, any stack.',
    capacity: 6,
    skillsNeeded: ['Git', 'JavaScript'],
    members: ['bilal@example.com', 'ayesha@example.com'], // 2/6
  },
];

async function seed() {
  await connectDB();

  // Clean slate: remove every existing user/team/join record.
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    JoinRequest.deleteMany({}),
  ]);

  // Create the demo users one at a time so the User model's pre-save hook
  // hashes each password (same path the register endpoint uses).
  const usersByEmail = {};
  for (const demo of DEMO_USERS) {
    // eslint-disable-next-line no-await-in-loop
    const user = await User.create({ ...demo, passwordHash: DEMO_PASSWORD });
    usersByEmail[demo.email] = user;
  }

  // Create the teams with their member lists baked in.
  for (const blueprint of DEMO_TEAMS) {
    const [ownerEmail, ...memberEmails] = blueprint.members;
    const members = [
      { user: usersByEmail[ownerEmail]._id, role: 'owner', joinedAt: new Date() },
      ...memberEmails.map((email) => ({
        user: usersByEmail[email]._id,
        role: 'member',
        joinedAt: new Date(),
      })),
    ];
    // eslint-disable-next-line no-await-in-loop
    await Team.create({
      name: blueprint.name,
      description: blueprint.description,
      owner: usersByEmail[ownerEmail]._id,
      capacity: blueprint.capacity,
      skillsNeeded: blueprint.skillsNeeded,
      members,
      memberCount: members.length, // counter matches the list by construction
    });
  }

  console.log(`Seeded ${DEMO_USERS.length} demo users and ${DEMO_TEAMS.length} demo teams.`);
  console.log(`Demo login: any email above with password "${DEMO_PASSWORD}" (e.g. ayesha@example.com).`);

  await mongoose.connection.close();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.connection.close();
  process.exit(1);
});
