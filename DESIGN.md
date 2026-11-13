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
| `capacity`    | Number   | 2–12, editable by the owner, never below the member count (see §3.3) |
| `members`     | [Member] | embedded subdocuments: `{ user, role, joinedAt }` |
| `memberCount` | Number   | denormalised counter, always updated atomically with `members` |
| `skillsNeeded`| [String] | optional                                          |
| timestamps    | Date     |                                                   |

`members` is embedded in the team document on purpose: the whole membership
state of a team lives in **one document**, and MongoDB applies updates to a
single document atomically. That fact is the foundation of the whole design.

### JoinRequest (idempotency record)

| Field            | Type     | Notes                                        |
| ---------------- | -------- | -------------------------------------------- |
| `user`           | ObjectId | who sent the join                            |
| `team`           | ObjectId | which team                                   |
| `key`            | String   | the client's `Idempotency-Key` header value (a UUID) |
| `status`         | String   | `processing` while the join runs, then `done` |
| `responseStatus` | Number   | the HTTP status of the original attempt (201 / 409) |
| `responseCode`   | String   | the outcome code (`TEAM_FULL`, `ALREADY_MEMBER`, …) |
| `createdAt`      | Date     | TTL index — records expire after 24 h        |

Unique index on `{ user: 1, key: 1, team: 1 }`: a given user can record a
given key for a given team only once, so a replayed request is recognised
and the original outcome returned instead of executing the join twice —
and two *different* users may safely reuse the same key string.

### RefreshToken (session record)

| Field       | Type     | Notes                                        |
| ----------- | -------- | -------------------------------------------- |
| `user`      | ObjectId | session owner                                |
| `tokenHash` | String   | SHA-256 of the refresh token — the raw token exists only in the client's httpOnly cookie, never in the database |
| `expiresAt` | Date     | 7 days; TTL index removes expired records    |
| `revokedAt` | Date     | set on logout or when the token is rotated   |
| `replacedBy`| ObjectId | the record that superseded this one (rotation chain) |

Refresh tokens are opaque random strings (not JWTs) precisely so they can
be revoked: rotation marks the old record revoked and points it at its
replacement; presenting a revoked token is refused with `401`.

## 3. Concurrency strategy

### 3.1 The core operation: atomic conditional update

Joining a team is exactly one database call:

```js
const team = await Team.findOneAndUpdate(
  {
    _id: teamId,
    $expr: { $lt: ['$memberCount', '$capacity'] }, // condition 1: a seat is free
    'members.user': { $ne: userId },               // condition 2: not already a member
  },
  {
    $push: { members: { user: userId, role: 'member', joinedAt: new Date() } },
    $inc: { memberCount: 1 },         // counter moves in the same atomic write
  },
  { new: true }
);
```

Note the `$expr`: the seat check compares `memberCount` against the team's
**own `capacity` field**, evaluated by the database inside the atomic
operation — never against a value read into JavaScript beforehand (see
§3.3 for why that distinction matters).

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

### 3.3 Capacity is editable — and the join stays exact

An earlier design made `capacity` immutable after creation, out of caution:
if the join filter compared `memberCount` against a capacity value read
into JavaScript just before the update, an owner edit landing between the
read and the write could let one join through against a stale, higher
limit.

The shipped design removes the stale read instead of the feature. The
filter's seat condition is `$expr: { $lt: ['$memberCount', '$capacity'] }`:
both sides are fields of the same document, compared by MongoDB **inside**
the atomic operation. Whatever capacity the document holds at the instant
the write is evaluated is the limit enforced — an edit a millisecond
earlier is simply the new truth the join is judged against. (Had the owner
*lowered* capacity below the current member count, the condition is just
false until someone leaves; nobody is ever ejected.)

The edit endpoint adds the product rule that keeps this sane: capacity may
never be set below the current member count (`409 CAPACITY_BELOW_MEMBERS`,
checked in the controller and mirrored in the UI stepper's floor). Owners
can grow a team from 4 to 6 mid-hackathon, or shrink an under-filled one —
and the race-proof guarantee is untouched, because it never depended on a
value outside the document.

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

Join **requires** an `Idempotency-Key` header (a UUID; missing or malformed
→ `400 MISSING_IDEMPOTENCY_KEY`). The client generates one key per join
*intent* and reuses it across retries of that intent. Behaviour:

- First request with a key: a `JoinRequest` record is claimed in state
  `processing` (the unique index makes the claim itself atomic), the join
  executes, and the record settles to `done` with the outcome (status +
  code) before the response is sent.
- Replay with the same key after it settled: the stored outcome is
  returned — a stored `201` becomes a `200` carrying the current team,
  with an `Idempotent-Replay: true` header; a stored `409` verdict is
  returned as-is. No second join is ever attempted.
- Replay while the original is still `processing`: `409
  REQUEST_IN_PROGRESS` — the caller retries shortly with the same key and
  gets the settled outcome.
- A `404` (team deleted) deletes the record instead of settling it: that
  outcome is not worth replaying, and a later retry should see the world
  as it is.
- Records expire after 24 h (TTL index), bounding the table's growth.

Underneath it all, condition 2 in §3.1 still makes any duplicate join a
harmless `409` — idempotency is what turns retries from errors into
replays of the original success.

## 4. API

Base path `/api`. All request/response bodies are JSON, in a consistent
envelope: success is `{ data, meta? }` (single-resource endpoints return
their named key, e.g. `{ team }` / `{ user, accessToken }`), and errors are
`{ error: { code, message, details? } }` with a meaningful HTTP status and
a machine-readable `code`. Every response carries an `X-Request-Id`.

| Method | Endpoint               | Auth | Success | Errors |
| ------ | ---------------------- | ---- | ------- | ------ |
| POST   | `/auth/register`       | –    | 201 `{ user, accessToken }` + refresh cookie | 400 `VALIDATION`, 409 `EMAIL_TAKEN`, 429 |
| POST   | `/auth/login`          | –    | 200 `{ user, accessToken }` + refresh cookie | 401 `INVALID_CREDENTIALS` (one generic message), 429 |
| POST   | `/auth/refresh`        | cookie | 200 `{ accessToken }` + rotated cookie | 401 `INVALID_REFRESH`, 403 bad origin |
| POST   | `/auth/logout`         | cookie | 204 (token revoked, cookie cleared) | 403 bad origin |
| GET    | `/auth/me`             | JWT  | 200 `{ user }` | 401 |
| GET    | `/health`              | –    | 200 `{ status, uptime, db }` | 503 when the DB is down |
| POST   | `/teams`               | JWT  | 201 `{ team }` (creator is owner + member #1) | 400 `VALIDATION`, 401 |
| GET    | `/teams`               | optional | 200 `{ data, meta }` — `?q=&status=open\|full&sort=newest\|seats&page=&limit=` | 400 `VALIDATION` |
| GET    | `/teams/mine`          | JWT  | 200 `{ data }` — `?role=joined\|created` | 401 |
| GET    | `/teams/:id`           | optional | 200 `{ team }` | 400 `INVALID_ID`, 404 `NOT_FOUND` |
| PATCH  | `/teams/:id`           | JWT (owner) | 200 `{ team }` | 403 `FORBIDDEN`, 409 `CAPACITY_BELOW_MEMBERS`, 404 |
| POST   | `/teams/:id/join`      | JWT  | 201 `{ team }` first join; 200 + `Idempotent-Replay` on replay | 400 `MISSING_IDEMPOTENCY_KEY`, 401, 404, 409 `TEAM_FULL` / `ALREADY_MEMBER` / `REQUEST_IN_PROGRESS` |
| DELETE | `/teams/:id/leave`     | JWT  | 200 `{ team }` | 403 `OWNER_CANNOT_LEAVE`, 404, 409 `NOT_A_MEMBER` |
| DELETE | `/teams/:id`           | JWT (owner) | 204 | 403 `FORBIDDEN`, 404 |
| GET    | `/stats`               | –    | 200 `{ teams, members, openSeats }` | – |

Auth is a short-lived **access JWT (15 minutes, HS256)** sent as
`Authorization: Bearer …`, plus a **rotating refresh token** in an
httpOnly, `Secure`, `SameSite=None` cookie (7 days, SHA-256-hashed at
rest, revoked on logout — see §2). The web client keeps the access token
in memory only and silently refreshes once on a `401`. Passwords are
hashed with bcrypt (cost 12); the hash is never selected into responses
(`select: false` + the model's `toJSON` transform). Security headers come
from helmet, CORS is an exact-origin allowlist with credentials, and rate
limits cap auth attempts (10 failures / 15 min / IP), writes (60 / min /
user) and overall traffic (300 / 15 min / IP) — all `429` in the same
error envelope. Full requirement mapping: Build Spec §9–§11.

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
    `201`, the rest get `409`, final `memberCount` is exactly the capacity,
    and the member list has no duplicates.
  - The spec-scale races: **20 racers for a single seat** (capacity 2,
    owner inside) → exactly 1 success and 19 `TEAM_FULL`; **50 users
    racing a capacity-5 team** → successes equal the seats available.
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
- `contract.test.js` — the Build Spec §10 surface: list search / status
  filter / sort / pagination meta, `/teams/mine` roles, owner `PATCH`
  (including the capacity floor `409`), `/stats`, malformed-id `400`,
  and the error envelope shape.
- `security.test.js` — helmet headers present, CORS reflects only
  allowlisted origins, oversized JSON body → `413`, auth rate limit →
  `429` after the failure cap.
- `session.test.js` — the refresh lifecycle over a cookie-keeping agent:
  login sets an httpOnly cookie, refresh rotates it and the old cookie is
  rejected, logout revokes, a foreign `Origin` on refresh/logout → `403`.

**83 API tests, all passing**, all running in CI
(`.github/workflows/ci.yml`) on every push and pull request — well past
the PS1 requirement of 20+.

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
| API     | Vercel serverless (Hobby free) | Express app behind `server/api/index.js`; functions pinned to Mumbai (`bom1`), next to the Atlas cluster; env vars: `MONGO_URI`, `JWT_ACCESS_SECRET` (legacy `JWT_SECRET` accepted as fallback), `CORS_ORIGINS`, `COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`. (Render was the original plan — its free tier demanded a card on file, so the API moved to Vercel; the app needed no changes beyond the serverless entry point.) |
| Client  | Vercel (Hobby free)    | Vite build; env var: `VITE_API_URL` → deployed API |
| Database| MongoDB Atlas (M0 free)| IP allowlist open (serverless egress IPs are dynamic); single cluster is a replica set, but our design does not depend on it. Mongoose pool capped at 5 per instance so many warm function instances stay under the M0 connection limit. |

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Free-tier serverless cold starts (Vercel) | First request after idle can take ~1–2 s while a function warms; warm-up ping before demo/recording; steady-state latency is network-bound, not app-bound (local p95 is 10.1 ms). |
| `mongodb-memory-server` downloads a mongod binary on first run | Committed lockfile + CI caching; verified locally on day 1. |
| Interview: must explain every line | Code is written conventionally with comments at every non-obvious step — especially the join controller, which carries the whole design in ~40 readable lines. |
