# Hack4Hack PS1 — Race-Proof Team Formation Platform

A team-formation platform for hackathons where **concurrent join/create
operations can never corrupt state**: a team can never exceed its capacity and
a user can never end up in the same team twice — even when many requests hit
the server at exactly the same moment.

Built for the **Hack4Hack Crew Hiring Challenge 2026, Problem Statement 1**.

## Why this is interesting

The naive way to add a member is:

1. Read the team.
2. Check `members.length < capacity`.
3. Push the new member and save.

Two requests doing this at the same time both pass step 2 and both push —
the team ends up over capacity. That is a classic **race condition**
(check-then-act is not atomic).

This project fixes it by making the check and the write **one atomic database
operation** (see `DESIGN.md` for the full explanation).

## Tech stack

| Layer    | Choice                              |
| -------- | ----------------------------------- |
| Frontend | React (Vite)                        |
| Backend  | Node.js + Express                   |
| Database | MongoDB + Mongoose                  |
| Auth     | JWT (register / login)              |
| Tests    | Jest + Supertest + mongodb-memory-server |
| CI       | GitHub Actions                      |
| Load test| Artillery (plan in `DESIGN.md`)     |

## Project layout

```
hack4hack/
├── server/            Express API (src: config, models, routes, controllers, middleware)
│   └── tests/         Jest + Supertest API tests
├── client/            React (Vite) frontend
├── DESIGN.md          Design doc: data model, race strategy, API, testing, load test
└── BUILD-PLAN.md      Day-by-day build plan (Nov 11 → Nov 15)
```

## How to run

### 1. Database

You need a MongoDB connection string. Easiest options:

- **MongoDB Atlas** free tier (used for deployment), or
- a local `mongod`, or
- Docker: `docker run -d -p 27017:27017 mongo`

### 2. Server

```bash
cd server
cp .env.example .env     # then fill in MONGO_URI and JWT_SECRET
npm install
npm run dev              # http://localhost:5000
```

### 3. Client

```bash
cd client
npm install
npm run dev              # http://localhost:5173
```

The client talks to the API at `http://localhost:5000/api` by default
(override with `VITE_API_URL` in `client/.env`).

### 4. Tests

```bash
cd server
npm test
```

The tests do **not** need a running MongoDB — they use
`mongodb-memory-server`, which starts a throwaway in-memory MongoDB,
runs the suite against the real Express app, and tears it down.

## API summary

| Method | Endpoint              | Auth | Description                          |
| ------ | --------------------- | ---- | ------------------------------------ |
| POST   | `/api/auth/register`  | –    | Create an account, returns JWT       |
| POST   | `/api/auth/login`     | –    | Log in, returns JWT                  |
| GET    | `/api/auth/me`        | JWT  | Current user                         |
| GET    | `/api/health`         | –    | Health check                         |
| POST   | `/api/teams`          | JWT  | Create a team (creator = owner, member #1) |
| GET    | `/api/teams`          | –    | List teams                           |
| GET    | `/api/teams/:id`      | –    | One team                             |
| POST   | `/api/teams/:id/join` | JWT  | **Join a team (race-proof)** — supports `Idempotency-Key` header |
| POST   | `/api/teams/:id/leave`| JWT  | Leave a team                         |
| DELETE | `/api/teams/:id`      | JWT  | Delete a team (owner only)           |

## The race-proof guarantee

`POST /teams/:id/join` performs a **single atomic conditional update**:

```js
Team.findOneAndUpdate(
  {
    _id: teamId,
    memberCount: { $lt: capacity },        // still has a free seat
    'members.user': { $ne: userId },       // not already a member
  },
  {
    $push: { members: { user: userId, role: 'member' } },
    $inc: { memberCount: 1 },
  },
  { new: true }
);
```

MongoDB guarantees that one update on one document is atomic: the conditions
and the write succeed or fail **together**. Two racing requests are
serialised by the database — the second one re-evaluates the conditions
against the already-updated document and fails instead of over-filling the
team. No locks, no transactions, no replica set required — it works on any
MongoDB deployment. Full reasoning in `DESIGN.md`.
