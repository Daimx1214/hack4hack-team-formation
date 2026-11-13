# DESIGN.md — Race-Proof Team Formation Platform

**Challenge:** Hack4Hack Crew Hiring Challenge 2026 — Problem Statement 1
**Deadline:** Sun Nov 15, 2026, 23:29 PKT
**Author:** Daim Ali

---

## 1. Problem

Hackathon participants form teams in the final hours before a deadline.
Hundreds of people browse teams and hit "Join" at roughly the same time.
The platform must guarantee, **under any level of concurrency**:

1. A team never has more members than its capacity.
2. A user never appears twice in the same team.
3. Counters shown to users (`memberCount`) always match the real member list.
4. Retrying a request (double-click, network retry, page refresh) does not
   create a duplicate membership.

### The bug we are designing against

The textbook implementation is broken:

```js
// NAIVE — do not do this
const team = await Team.findById(id);              // 1. read
if (team.members.length >= team.capacity) reject;  // 2. check
team.members.push(userId);                         // 3. act
await team.save();
```

Between steps 2 and 3 there is a gap. Two concurrent requests can both read
"1 seat free", both pass the check, and both save → **3 members in a
2-seat team**. This is a *check-then-act race condition*. Any fix must remove
the gap: the check and the write must be a single indivisible operation.

## 2. Data model

### User

| Field          | Type     | Notes                          |
| -------------- | -------- | ------------------------------ |
| `name`         | String   | required                       |
| `email`        | String   | required, unique, lowercased   |
| `passwordHash` | String   | bcrypt hash, never returned    |
| `skills`       | [String] | optional profile info          |
| timestamps     | Date     | `createdAt` / `updatedAt`      |

### Team

| Field         | Type     | Notes                                             |
| ------------- | -------- | ------------------------------------------------- |
| `name`        | String   | required                                          |
| `description` | String   | optional                                          |
| `owner`       | ObjectId | ref `User`; creator of the team                   |
| `capacity`    | Number   | 2–10, **immutable after creation** (see §3.3)     |
| `members`     | [Member] | embedded subdocuments: `{ user, role, joinedAt }` |
| `memberCount` | Number   | denormalised counter, always updated atomically with `members` |
| `skillsNeeded`| [String] | optional                                          |
| timestamps    | Date     |                                                   |

`members` is embedded in the team document on purpose: the whole membership
state of a team lives in **one document**, and MongoDB applies updates to a
single document atomically. That fact is the foundation of the whole design.

### JoinRequest (idempotency record)

| Field  | Type     | Notes                                        |
| ------ | -------- | -------------------------------------------- |
| `user` | ObjectId | who sent the join                            |
| `team` | ObjectId | which team                                   |
| `key`  | String   | the client's `Idempotency-Key` header value  |
| `status` | String | `joined`                                     |

Unique index on `{ user: 1, key: 1 }`: a given user can record a given key
only once, so a replayed request can be recognised and the original result
returned instead of executing the join twice.

## 3. Concurrency strategy

### 3.1 The core operation: atomic conditional update

Joining a team is exactly one database call:

```js
const team = await Team.findOneAndUpdate(
  {
    _id: teamId,
    memberCount: { $lt: capacity },   // condition 1: a seat is free
    'members.user': { $ne: userId },  // condition 2: not already a member
  },
  {
    $push: { members: { user: userId, role: 'member', joinedAt: new Date() } },
    $inc: { memberCount: 1 },         // counter moves in the same atomic write
  },
  { new: true }
);
```

Why this is race-proof:

- MongoDB guarantees **single-document atomicity**: the filter conditions
  are evaluated against the document *as part of the same atomic operation*
  that performs the update. There is no gap between "check" and "act".
- If 10 requests race for the last seat, the database serialises them.
  Exactly one matches `memberCount < capacity`; the other 9 see the updated
  document, fail the filter, and `findOneAndUpdate` returns `null`.
- If the *same* user races themselves (double-click), the second request
  fails condition 2 (`members.user != userId`) because the first request's
  push is already visible. No duplicates, ever.
- `$push` and `$inc` happen in the same write, so `memberCount` can never
  drift away from `members.length`.

When the update returns `null`, we re-read the team once to give the caller
an honest reason (already a member → `409`, team full → `409`, no team →
`404`). That re-read only shapes the *error message*; correctness never
depends on it, because no write happened.

### 3.2 Leaving a team is symmetric

```js
Team.findOneAndUpdate(
  { _id: teamId, 'members.user': userId },     // only if actually a member
  { $pull: { members: { user: userId } }, $inc: { memberCount: -1 } },
  { new: true }
);
```

Same pattern: condition and mutation in one atomic operation, so a
double-submitted "leave" decrements the counter exactly once. The owner
cannot leave their own team (they must delete it instead) — enforced in the
controller before the update.

### 3.3 Why capacity must be immutable

The join update needs the capacity value in its filter. Capacity is read from
the team just before the update. If capacity could change between that read
and the update, the filter could use a stale limit. Making `capacity`
immutable after creation (a product rule: "to change team size, create a new
team") removes that hole entirely — the value read is the value that is
enforced. This trade-off is deliberate and documented here, not accidental.

### 3.4 Alternatives considered

| Approach | Verdict |
| --- | --- |
| Naive read-check-save | ❌ Race condition (this is the bug). |
| **Atomic conditional update (chosen)** | ✅ Single-document atomicity; no locks; works on standalone MongoDB, replica sets, and Atlas. Simple enough to explain line-by-line. |
| Multi-document transactions (`session.withTransaction`) | ⚠️ Correct, but require a **replica set** — a standalone local `mongod` (what most devs run) rejects transactions. More moving parts, more failure modes, harder to reason about under time pressure. Unnecessary here because all state for one team fits in one document. |
| Application-level lock (e.g. Redis lock per team) | ⚠️ Extra infrastructure, lock expiry/deadlock concerns, and the lock itself becomes a failure point. The database already provides the atomicity we need. |
| Optimistic concurrency (`__v` version check + retry) | ⚠️ Works, but under a hot team the retries thrash; the conditional update is the same idea done by the database in one round trip. |

**Decision:** one team = one document; every membership change is one atomic
conditional update on that document. Transactions are unnecessary because we
never need to atomically change two *documents* — membership lives entirely
inside the team document. (Auth/user creation never touches team state.)

### 3.5 Idempotency

Clients may send an `Idempotency-Key` header on join requests. Behaviour:

- First request with a key: join executes; a `JoinRequest` row records
  `(user, key) → team`.
- Replay with the same key (retry, refresh, double submit): the recorded
  result is returned with `200` and no second join attempt.
- The unique index on `{ user, key }` makes even *concurrent* replays safe:
  only one record can ever be created.

Even without a key, a duplicate join is harmless: condition 2 in §3.1 makes
it a `409`, and the state is unchanged. Idempotency keys additionally make
retries *succeed* (returning the original result) instead of erroring, which
is the friendlier API contract.

## 4. API

Base path `/api`. All request/response bodies are JSON. Errors are
`{ "error": "<message>" }` with a meaningful HTTP status.

| Method | Endpoint               | Auth | Success | Errors |
| ------ | ---------------------- | ---- | ------- | ------ |
| POST   | `/auth/register`       | –    | 201 `{ user, token }` | 400 validation, 409 duplicate email |
| POST   | `/auth/login`          | –    | 200 `{ user, token }` | 401 bad credentials |
| GET    | `/auth/me`             | JWT  | 200 `{ user }` | 401 |
| GET    | `/health`              | –    | 200 `{ status: "ok" }` | – |
| POST   | `/teams`               | JWT  | 201 `{ team }` (creator is owner + member #1) | 400 validation, 401 |
| GET    | `/teams`               | –    | 200 `{ teams }` | – |
| GET    | `/teams/:id`           | –    | 200 `{ team }` | 404 |
| POST   | `/teams/:id/join`      | JWT  | 200 `{ team }` | 401, 404, 409 full / already member |
| POST   | `/teams/:id/leave`     | JWT  | 200 `{ team }` | 400 owner cannot leave, 404, 409 not a member |
| DELETE | `/teams/:id`           | JWT  | 200 `{ message }` | 403 not owner, 404 |

Auth: `Authorization: Bearer <JWT>`. Tokens are signed with `JWT_SECRET`
(7-day expiry). Passwords are hashed with bcrypt; the hash is stripped from
every response by the User model's `toJSON` transform.

## 5. Testing strategy

Stack: **Jest + Supertest**, running the real Express app against a real
MongoDB provided by `mongodb-memory-server` (a throwaway in-memory instance
per test file — so CI needs no database service and no secrets).

Test files (in `server/tests/`):

- `auth.test.js` — register happy path, duplicate email, validation errors,
  login happy path, wrong password, unknown email, `/auth/me` with and
  without a token.
- `teams.test.js` — create (owner is member #1), create validation, auth
  required, list, get by id + 404, join happy path, join full team → 409,
  duplicate join → 409, leave, owner-can't-leave, delete by owner,
  delete by non-owner → 403.
- `concurrency.test.js` — **the tests that prove the PS1 claim:**
  - 8 different users race for the last 2 seats of a team → exactly 2 get
    `200`, the rest get `409`, final `memberCount` is exactly the capacity,
    and the member list has no duplicates.
  - The same user fires 5 join requests in parallel → membership appears
    exactly once.
  - Leave races: one member leaving 5 times in parallel decrements the
    counter exactly once (never negative); all members leaving at once end
    at exactly 1 (the owner).
  - Idempotency under concurrency: a retry storm with one
    `Idempotency-Key` creates exactly one membership; replays after a
    recorded join all return the original result.
  - Duplicate registration race: 5 parallel registrations with one email
    create exactly one account (one `201`, the rest `409`).
- `edge-cases.test.js` — duplicate email `409` (incl. different letter
  case), wrong-secret and garbage tokens `401`, no-token `401` on join and
  delete, join/leave/delete against deleted or nonexistent teams `404`,
  malformed ids `404`, non-owner member delete `403`, and the capacity
  boundaries (1, 0, 2.5 rejected; capacity 2 = owner + exactly one seat).
- `join-error-path.test.js` — unit-style regression tests (stubbed Team
  model) for the delete-mid-join race in `joinTeam`'s error path: the
  re-read returning null must answer `404`, never throw a `500`; the
  ordinary full-team `409` on the same path is pinned too.

Target: **20+ API tests**, all running in CI
(`.github/workflows/ci.yml`) on every push and pull request.

## 6. Load test

Tool: **Artillery** (`npx artillery`, config in `load/artillery.yml`)
against the API — run locally first, then re-run against the deployed
URL for the submission numbers.

Two scenarios run **together** for 40 s at ~30 virtual users/second
(~1,200 VUs total) — this is what a deadline rush actually looks like:
people browsing while others stampede the Join button.

| Scenario | Weight | What it does |
| -------- | ------ | ------------ |
| Browse teams | 70% | `GET /api/teams`, then `GET /api/teams/:id` — the read traffic. |
| Join stampede | 30% | `POST /api/teams/:id/join` against **one team of capacity 10**, from a pool of 100 prepared users. |

About the stampede numbers: capacity is capped at 10 and the owner
holds seat #1, so only 9 joins can ever return `200`; every other join
correctly returns `409` ("Team is full" / "already a member"). That is
**the race working as designed**, reproduced under load — the load run
asserts that responses stay fast and there are **zero 5xx errors**, with
**p95 latency < 200 ms** (the PS1 requirement). Exact success counts
(exactly 9 succeed, the count ends at exactly 10, no duplicate members)
are **not** asserted here — they are proven deterministically by the
Jest concurrency tests (§5), which is the right tool for exactness.

Setup and results live in `load/` (see `load/README.md`): `prepare.js`
creates the 100 users and the stampede team, `run-local.js` runs the
whole thing against a throwaway local stack in one command. First local
run (Nov 11, 2026): 2,029 requests completed, zero errors, **p95 =
10.1 ms** — details in `load/results-local.txt`. Live runs against the
deployed API (Nov 13, 2026) are recorded in `load/results-live.txt`:
the reduced profile answered 306/306 requests with zero 5xx; the
full-intensity profile saturated the generator's shared network path
first (856 connection resets in transit, zero bad responses among those
that arrived) — a generator limit, reported as such, not an API result.

## 7. Deployment plan (all free tiers)

| Piece   | Platform               | Notes |
| ------- | ---------------------- | ----- |
| API     | Vercel serverless (Hobby free) | Express app behind `server/api/index.js`; functions pinned to Mumbai (`bom1`), next to the Atlas cluster; env vars: `MONGO_URI`, `JWT_SECRET`. (Render was the original plan — its free tier demanded a card on file, so the API moved to Vercel; the app needed no changes beyond the serverless entry point.) |
| Client  | Vercel (Hobby free)    | Vite build; env var: `VITE_API_URL` → deployed API |
| Database| MongoDB Atlas (M0 free)| IP allowlist open (serverless egress IPs are dynamic); single cluster is a replica set, but our design does not depend on it. Mongoose pool capped at 5 per instance so many warm function instances stay under the M0 connection limit. |

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Free-tier serverless cold starts (Vercel) | First request after idle can take ~1–2 s while a function warms; warm-up ping before demo/recording; steady-state latency is network-bound, not app-bound (local p95 is 10.1 ms). |
| `mongodb-memory-server` downloads a mongod binary on first run | Committed lockfile + CI caching; verified locally on day 1. |
| Interview: must explain every line | Code is written conventionally with comments at every non-obvious step — especially the join controller, which carries the whole design in ~40 readable lines. |
