# INTERVIEW-PREP.md — Defending TeamForge Line by Line

For the Hack4Hack hiring interview. The rule for every answer below:
**only claim what the code actually does.** If an interviewer finds a gap,
name it before they do — the "with more time" answers in Q10 are honest on
purpose.

---

## (a) The core idea in 3 sentences

1. All membership state for one team — the member list and its count —
   lives inside a **single MongoDB document**, and MongoDB guarantees that
   an update to a single document is **atomic**.
2. So joining a team is **one** `findOneAndUpdate` whose *filter* contains
   the rules ("a seat is free" AND "this user is not already a member")
   and whose *update* adds the member and increments the counter — the
   check and the write are the same indivisible operation, so there is no
   gap for a race to slip through.
3. Because the guarantee comes from the database operation itself, it
   holds at any concurrency level, and the test suite proves it by firing
   real parallel requests and asserting the exact final state.

## (b) `joinTeam` walkthrough — `server/src/controllers/teamController.js`

The function runs in this order:

1. **Validate the id.** If `req.params.id` is not a valid ObjectId →
   `404 Team not found` (a malformed id can never crash the query).
2. **Idempotency replay check** (details in section (c)): if an
   `Idempotency-Key` header is present and a `JoinRequest` row already
   exists for `(user, key)`, return the recorded team with `200` and
   `idempotentReplay: true`. No second join is attempted.
3. **Read the capacity only:** `Team.findById(teamId).select('capacity')`.
   If the team doesn't exist → `404`. This read is safe *only* because
   capacity is immutable (see below).
4. **The atomic update** — the heart of the project:

```js
Team.findOneAndUpdate(
  {
    _id: teamId,
    memberCount: { $lt: existing.capacity }, // a seat must still be free
    'members.user': { $ne: userId },         // user must not already be in
  },
  {
    $push: { members: { user: userId, role: 'member', joinedAt: new Date() } },
    $inc: { memberCount: 1 },
  },
  { new: true }
);
```

**The filter conditions, one by one:**

- `_id: teamId` — this team, and only this team.
- `memberCount: { $lt: capacity }` — "there is still a free seat",
  expressed as a plain numeric comparison the database can evaluate
  inside the update.
- `'members.user': { $ne: userId }` — on an array field, `$ne` matches
  only when **no** element equals the user — i.e. "not already a member".

**Why check-and-act in one operation kills the race:** in the naive
version, "read → check in JavaScript → save" are three separate steps,
and two concurrent requests can both pass the check before either saves.
Here there are no separate steps: MongoDB evaluates the filter against
the document **as part of the same atomic operation** that performs the
write. Racing requests are serialised by the database — the first one(s)
with a genuinely free seat match and write; the next one re-evaluates the
filter against the *already-updated* document, no longer matches, and
`findOneAndUpdate` returns `null` **without writing anything**. We then
re-read the team once, only to pick an honest error message (already a
member → `409`, otherwise team full → `409`). Correctness never depends
on that re-read — by the time we do it, no incorrect write has happened.

**Why `memberCount` is stored, not computed:** the filter needs the
seat check *inside* the atomic operation, as a simple comparison on a
stored field: `memberCount < capacity`. A computed `members.length` is
not a stored field the update filter can test this way (and the plain
comparison is index-friendly, as the model comment notes). Stored
counters normally risk drifting from the real list — that risk is removed
here because the counter is *only* ever changed by `$inc` in the same
atomic write as the `$push`/`$pull` it belongs to (join: `+1`, leave:
`−1`). There is no code path that changes one without the other, so the
counter cannot drift.

**Why capacity is immutable:** `joinTeam` reads the capacity in step 3
and embeds that number in the step-4 filter. If capacity could change
between the read and the update, the filter could enforce a stale limit
(e.g. the owner shrinks the team mid-flight). So there is deliberately
**no endpoint that updates capacity** — a product rule, enforced by
omission: "to change team size, create a new team." The create-team page
tells the user this up front. The value read is therefore always the
value enforced.

**Leaving is symmetric** (`leaveTeam`): the owner is refused first
(`400` — the owner must delete the team instead). Then one atomic update
whose filter requires `'members.user': userId` (only matches a real
member) applies `$pull` + `$inc: -1` together. A double-submitted leave
decrements exactly once and the counter can never go negative.

## (c) Idempotency — `server/src/models/JoinRequest.js` + `joinTeam`

- A client may send an **`Idempotency-Key`** header with
  `POST /api/teams/:id/join`. (The React client does: `client/src/api.js`
  generates one key per join click, shaped `join-<teamId>-<uuid>`.)
- **First request with a key:** the join executes; afterwards a
  `JoinRequest` row records `(user, team, key)` with `status: 'joined'`.
- **Replay with the same key** (network retry, refresh, a client that
  re-sends): `joinTeam` finds the row *before* attempting any join and
  returns the recorded team with `200` and `idempotentReplay: true` —
  the retry *succeeds with the original result* instead of erroring.
- **The unique index on `{ user: 1, key: 1 }`** is what makes this safe
  under concurrency: only one row for a given user+key can ever exist.
  If two copies of a request race to create the row, the loser's insert
  fails with duplicate-key error `11000`, which the controller
  deliberately swallows — it just means "already recorded".
- **The honest boundary** (say this before they find it): two copies of
  the *same* request arriving at the exact same instant can both miss the
  pre-check lookup. The guarantee that still holds is the important one —
  the atomic member condition admits the user **exactly once**; the extra
  copy gets a `409`, never a duplicate seat. Replays that arrive *after*
  the join is recorded always get the original `200` result. Both halves
  are covered by tests (`concurrency.test.js`: "a retry storm with ONE
  Idempotency-Key creates exactly one membership" and "parallel replays
  AFTER a recorded join all return the original result").
- And even with **no key at all**, a duplicate join is harmless: the
  `'members.user': { $ne: userId }` condition turns it into a `409` and
  the state is unchanged. Keys upgrade retries from "error" to "same
  success" — the friendlier API contract.

## (d) 10 likely questions, with model answers

**Q1. Why not just use MongoDB transactions?**
Because everything a join changes lives in **one document**, and a
single-document update is already atomic — a transaction would add
nothing. It would also cost something real: multi-document transactions
require a **replica set**, so the app would stop working on a standalone
local `mongod`, which is what most developers (and my CI) run. More
moving parts, more failure modes, zero extra correctness for this data
shape. If I ever needed to change two *documents* atomically — say,
reserving a seat in a Team and a slot in an Event — that is when I would
reach for a transaction.

**Q2. What happens if the server crashes mid-join?**
The join itself is a single atomic database write: it either applied
completely or not at all — there is no half-joined state to clean up.
The one two-step part is the idempotency record, which is written *after*
the team update on purpose. If the process died in between, the
membership exists but the key was never recorded; a retry with that key
then attempts the join, hits the "already a member" condition, and gets
a `409` — still no duplicate. If the crash happened before the update,
nothing was written and the retry simply succeeds. Every crash point
leaves valid state.

**Q3. How do your tests actually prove race-safety?**
They don't mock anything: Jest + Supertest drive the real Express app
against a real MongoDB (an in-memory instance from
`mongodb-memory-server`), and the concurrency tests fire requests in
parallel with `Promise.all`. The headline test: 8 different users race
for the last 2 seats of a capacity-3 team — exactly 2 responses are
`200`, 6 are `409`, the final `memberCount` is exactly 3, and the member
list contains no duplicates. There are matching tests for one user racing
themselves (5 parallel joins → exactly 1 membership), leave races (the
counter decrements once, never goes negative), a duplicate-registration
race (5 parallel, same email → one `201`, four `409`), and idempotency
retry storms. The naive read-check-save implementation passes all my
*sequential* tests and fails these — that difference is the proof.

**Q4. Why MongoDB? Why embed members inside the team?**
The problem statement fixes the stack (React + Node/Express + MongoDB),
but the embedding is a real design decision, not an accident: putting
`members` inside the team document means *all* membership state for a
team is in one document, and single-document atomicity is exactly the
guarantee the whole design rests on. A separate `Memberships` collection
would split the state across documents and push me toward transactions
or application-level locks for no benefit at this scale.

**Q5. Why store `memberCount` instead of computing `members.length`?**
Because the seat check has to live *inside* the atomic update filter as
a comparison on a stored field — `memberCount: { $lt: capacity }`. A
computed length isn't a field the filter can test that way. The usual
objection to a stored counter is drift; here it can't drift because the
counter only ever moves via `$inc` inside the same atomic write as the
`$push`/`$pull` it describes.

**Q6. Isn't immutable capacity just a missing feature?**
It's a deliberate trade-off, and I'd defend it as the right call here.
`joinTeam` reads the capacity just before the atomic update and puts
that number in the filter; if capacity could change between that read
and the update, a stale limit could be enforced and a team could
over-fill. Making capacity fixed at creation removes that hole entirely.
The product cost is small and disclosed to the user on the create-team
page: to change team size, create a new team.

**Q7. Why `409` for a full team or a duplicate join? Why not `400`?**
`400` means "your request is malformed" — but a join request to a full
team is perfectly well-formed; it *conflicts with the current state* of
the resource, which is exactly what `409 Conflict` means. It's also
state-dependent: the same request can succeed later if someone leaves.
I use the same logic in auth — duplicate email on register is a `409`,
not a `400`.

**Q8. Walk me through your auth. Is registration race-safe too?**
Register validates the input, checks for an existing account, and
creates the user; the plain password is placed in `passwordHash` and the
User model's pre-save hook replaces it with a **bcrypt** hash (cost 10),
so plain text is never stored, and the model's `toJSON` transform strips
the hash from every response. Login compares with bcrypt and returns a
**JWT** (signed with `JWT_SECRET`, 7-day expiry, carrying only the user
id); the `requireAuth` middleware verifies it and loads the user fresh
from the database on every protected request. Registration is race-safe
in the same spirit as joins: two parallel registrations with one email
can both pass the pre-check, but the **unique index** on `email` rejects
the second insert, and the controller translates that duplicate-key error
into the same `409` a sequential caller would get — the concurrency
suite tests exactly that (one `201`, four `409`, never a `500`).

**Q9. What if 100 users join 100 *different* teams at the same moment?**
No problem, and no contention: atomicity is per-document, and each join
touches only its own team's document. There is no global lock anywhere
in the design, so unrelated joins proceed fully in parallel. Contention
only ever exists *within* one hot team document — which is precisely the
case the conditional update serialises correctly.

**Q10. What would you add with more time?**
Two honest items, both already noted in my build plan: **(1) Pagination
and filtering on `GET /api/teams`** — today it returns every team, newest
first; fine for a demo, wrong for a real directory. **(2) The load
test re-run against the deployed URL** — the local Artillery run is done
(p95 10.1 ms, zero errors), and the same config needs its run against
the live API so the submission numbers come from the real deployment.
If I had time after those: shorter-lived access tokens with refresh
tokens, instead of a single 7-day JWT.

## (e) Know your files — one line each

### Server (`server/src/`)

| File | The one thing it does |
| --- | --- |
| `controllers/teamController.js` | All team endpoints — **`joinTeam` here is the whole project**: the atomic conditional update, plus symmetric leave, create/list/get/delete. |
| `controllers/authController.js` | Register / login / me; signs the JWT; translates duplicate-email races into `409`. |
| `models/Team.js` | Team schema: embedded `members`, the stored `memberCount`, and the comment explaining why capacity is immutable. |
| `models/User.js` | User schema: bcrypt pre-save hook, `comparePassword`, and the `toJSON` transform that strips the hash. |
| `models/JoinRequest.js` | Idempotency record; the **unique `{ user, key }` index** lives here. |
| `middleware/auth.js` | `requireAuth`: verifies the Bearer JWT, loads the user onto `req.user`, `401` on anything invalid. |
| `routes/teamRoutes.js` / `routes/authRoutes.js` | The route table: which endpoints exist and which require auth (reads are public; create/join/leave/delete require JWT). |
| `app.js` | Builds the Express app (CORS, JSON, `/api/health`, routers, central error handler) **without** listening — so tests can import it. |
| `server.js` | The entry point: connects the DB and listens on `PORT`. |
| `config/db.js` | `connectDB` — the single Mongoose connection from `MONGO_URI`. |
| `utils/asyncHandler.js` | Wraps async controllers so rejected promises reach the error handler instead of crashing. |
| `seed.js` | Wipes the DB and seeds the 6 demo users (`demo1234`) and 4 demo teams (API Wizards 3/4, Frontend Foxes full) used in the video. |

### Tests (`server/tests/`)

| File | The one thing it does |
| --- | --- |
| `concurrency.test.js` | **The proof**: 8 racers / 2 seats, self-races, leave races, registration race, idempotency storms — 8 tests. |
| `teams.test.js` | Sequential team behaviour: create/list/get/join/leave/delete, full-team and duplicate-join `409`s, owner rules, populated member names on GET — 18 tests. |
| `join-error-path.test.js` | Unit-style (stubbed model) regression tests for the delete-mid-join race in `joinTeam`'s error path: re-read null → `404`, never `500` — 2 tests. |
| `auth.test.js` | Register/login/me happy paths and failures (duplicate email, wrong password, no token) — 9 tests. |
| `edge-cases.test.js` | Hostile inputs: forged tokens, malformed ids, deleted teams, capacity boundaries (1, 0, 2.5 rejected) — 16 tests. |
| `setup.js` / `helpers.js` | Spin up the in-memory MongoDB per test file; small factories for users/teams/tokens. |

### Client (`client/src/`)

| File | The one thing it does |
| --- | --- |
| `api.js` | The fetch wrapper: attaches the JWT from localStorage, throws the server's error message — and keeps one stable **`Idempotency-Key`** per join intent (sessionStorage) so retries replay instead of re-joining. |
| `App.jsx` | Shell + routes: nav (Teams / Create team / Log in / Register), restores the session from the stored token via `/auth/me`. |
| `pages/Teams.jsx` | Home: team cards with member counts and seats-left badges (`FULL` / "1 seat left"). |
| `pages/TeamDetail.jsx` | Team page: member list, Join/Leave/Delete buttons; shows API `409`s as a plain red banner — the race-proofing made visible. |
| `pages/CreateTeam.jsx` | Create form (name, description, capacity 2–10, skills) — including the hint that capacity is fixed after creation. |
| `pages/Login.jsx` / `pages/Register.jsx` | The auth forms; both hand the returned `{ user, token }` to `App`. |

### Load, CI, docs

| File | The one thing it does |
| --- | --- |
| `load/artillery.yml` | The load scenario: 70% browse traffic + 30% join stampede against one team, ~40 s. |
| `load/run-local.js` | One-command local load test: in-memory DB + real API + Artillery; writes `report-local.json` and `results-local.txt`. |
| `load/prepare.js` / `load/processor.js` | Create the 100 load users + stampede team, and feed each virtual user its token during the run. |
| `load/results-local.txt` | The local numbers: 2,029 requests, zero errors, **p95 10.1 ms**. |
| `.github/workflows/ci.yml` | GitHub Actions: on every push/PR to `main` — Node 20, `npm ci`, `npm test` (no DB service needed; tests bring their own in-memory MongoDB). |
| `DESIGN.md` | The design doc: data model, race strategy, alternatives table (transactions/locks/optimistic concurrency), API, testing, load plan. |
| `README.md` | Overview, how to run, demo accounts, API summary, the atomic-update snippet. |
| `BUILD-PLAN.md` | The day-by-day plan and submission checklist — including what's still open (deployment, live load re-run). |
