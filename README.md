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
| Load test| Artillery (config + results in `load/`) |

## Project layout

```
hack4hack/
├── server/            Express API (src: config, models, routes, controllers, middleware)
│   └── tests/         Jest + Supertest API tests
├── client/            React (Vite) frontend
├── load/              Artillery load test: config, prepare/processor, local runner + results
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

**50 API tests, all passing** — happy paths, edge cases (duplicate email
`409`, forged/missing tokens `401`, deleted-team `404`s, capacity
boundaries) and the concurrency suite that proves the race-proofing:
join/leave stampedes, duplicate-registration races, and idempotency-key
retry storms.

The tests do **not** need a running MongoDB — they use
`mongodb-memory-server`, which starts a throwaway in-memory MongoDB,
runs the suite against the real Express app, and tears it down.

### 5. Seed demo data (optional)

```bash
cd server
npm run seed        # WARNING: wipes the database first, then seeds it
```

Creates the demo users and teams below so the app — and the demo video —
can be explored immediately: one team is full, the others have free seats.

#### Demo accounts

All six accounts use the same throwaway password: **`demo1234`**
(fake accounts created by the seed script for this hackathon demo —
not real credentials).

| Name             | Email               |
| ---------------- | ------------------- |
| Ayesha Khan      | ayesha@example.com  |
| Bilal Ahmed      | bilal@example.com   |
| Chen Wei         | chen@example.com    |
| Dana Petrova     | dana@example.com    |
| Elias Rodriguez  | elias@example.com   |
| Fatima Noor      | fatima@example.com  |

### 6. Load test

```bash
node load/run-local.js   # one command: in-memory DB + API + Artillery
```

Latest **local** run (Nov 11, 2026; API, in-memory MongoDB and Artillery
all sharing one small dev VM): 2,029 requests at ~52 req/s — 1,667 × 200,
362 × 409 (the stampede's losing joins, by design), **zero errors**,
**p95 = 10.1 ms** against the PS1 target of p95 < 200 ms.
Full numbers in `load/results-local.txt`; how it works in `load/README.md`.
The same `load/artillery.yml` gets re-run against the deployed URL for
the submission numbers.

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
