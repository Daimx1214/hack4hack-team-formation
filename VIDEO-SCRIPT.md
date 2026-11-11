# VIDEO-SCRIPT.md — 5-Minute Demo Video (Hack4Hack PS1)

**Project:** TeamForge — race-proof team formation platform
**Total runtime:** 5:00. Speak slowly and clearly; the times are guides, not
a race. If a segment runs long, trim the tour (Segment 2–3), never the key
demo (Segment 4).

> **🔗 LIVE URL PLACEHOLDER — UPDATE AFTER DEPLOYMENT**
> The live client URL is not deployed yet. Everywhere this script says
> **`[[LIVE_URL]]`**, use the real deployed URL once it exists, and record
> the app-tour segments (2–4) against the live site. Until deployment is
> live, record against the local app (`http://localhost:5173`) and re-shoot
> those segments after deploying. Also update Segment 7 with the deployed
> load-test numbers once `load/artillery.yml` has been re-run against the
> live API (see `load/README.md`).

---

## Before you record — checklist

- [ ] **Seed the database** so every screen matches this script:
      `cd server && npm run seed` — ⚠️ this **wipes the DB first**, then
      creates the 6 demo users and 4 demo teams. After seeding:
      **API Wizards is 3/4 (exactly 1 seat left)**, Frontend Foxes is
      3/3 FULL, ML Mavericks is 1/5, Open Source Owls is 2/6.
- [ ] **Demo accounts** (all use password `demo1234`):
      Ayesha `ayesha@example.com` · Bilal `bilal@example.com` ·
      Chen `chen@example.com` · Dana `dana@example.com` ·
      Elias `elias@example.com` · Fatima `fatima@example.com`.
- [ ] **Prepare the two race tabs BEFORE recording** (Segment 4 depends on
      this): Tab 1 logged in as **Dana**, Tab 2 logged in as **Elias**,
      both sitting on the **API Wizards** team page. Neither Dana nor Elias
      is a member of API Wizards, so both tabs show "3/4 members ·
      1 seat left" and an active **Join team** button. Do not touch Tab 2
      again until Segment 4 — its slightly stale page is what makes the
      demo real.
- [ ] Start the app: server (`cd server && npm run dev`, port 5000) and
      client (`cd client && npm run dev`, http://localhost:5173) — or open
      **`[[LIVE_URL]]`** once deployed. If using the deployed API, open the
      live site once a few minutes early: the free tier can cold-start.
- [ ] Open a terminal in `server/` (for Segment 5) and have
      `load/results-local.txt` ready to open (Segment 7). Have the GitHub
      Actions page for the repo open in another tab (Segment 6).
- [ ] In your editor, open `server/src/controllers/teamController.js` at
      the `joinTeam` function (Segment 4, second half).
- [ ] Browser zoom ~125% so text is readable on video. Close notifications,
      bookmarks bar, and anything personal. Full-screen the browser.
- [ ] Honest note: the **Members list on the team page shows member IDs**,
      not names (the API returns user IDs). Narrate the **counter and the
      badges** ("3/4 → 4/4", "1 seat left → FULL") — don't say "you can see
      Dana's name in the list", because you can't.

---

## Segment 1 — The problem (0:00–0:35)

**On screen:** Your face or a title slide with the project name, then the
live app open at **`[[LIVE_URL]]`** (or localhost) on the Teams page. Don't
click anything yet.

**Say:**

> "Hi, I'm Daim Ali. This is TeamForge, my solution for Hack4Hack problem
> statement one: team formation that is race-proof.
>
> Here is the problem. In the last hours before a hackathon deadline,
> many people click Join on the same team at the same time. The normal
> way to write that code is: read the team, check if a seat is free, then
> add the member. Two requests can both pass the check — and the team
> ends up with more members than its capacity. That is a race condition,
> and this project makes it impossible."

## Segment 2 — Register, log in, and the teams list (0:35–1:15)

**On screen:** Click **Register** (top right). Fill the form: Name
`Test User`, Email `test@example.com`, Password `test1234`, Skills
`React, Node.js`. Click **Register** — you land back on the home page,
logged in (your name is in the nav bar). Slowly scroll the teams list and
point at: **API Wizards — 3/4, "1 seat left" badge**; **Frontend Foxes —
3/3, "FULL" badge**; ML Mavericks 1/5; Open Source Owls 2/6.

**Say:**

> "Registration and login use JWT. The password is hashed with bcrypt —
> it is never stored or returned in plain text.
>
> This is the teams list. Every card shows the member count and how many
> seats are left. Frontend Foxes is already full. And look at API
> Wizards: three out of four members — exactly one seat left. Remember
> this team; it is where the race will happen."

## Segment 3 — Create a team (1:15–1:45)

**On screen:** Click **Create team** in the nav. Fill: Team name
`Demo Rockets`, Description `Created live in the demo`, Capacity `3`,
Skills needed `React`. Pause on the hint text under the heading ("Capacity
is fixed once the team is created…"). Click **Create team**. You land on
the new team's page: **1/3 members**, you are the owner. Click **Teams**
in the nav to go back to the list.

**Say:**

> "Any user can create a team. The creator becomes the owner and the
> first member, so the count starts at one.
>
> Notice this line: capacity is fixed once the team is created. That is
> not a missing feature — it is part of the safety design, and I will
> explain why in the closing."

## Segment 4 — THE key demo: one seat, two racers, and the 409 (1:45–3:00)

**On screen (part A — the race):** Switch to **Tab 1 (Dana)**, parked on
the API Wizards page: 3/4, "1 seat left". Click **Join team**. A green
banner appears: **"You joined the team."** The counter now shows **4/4**
and the badge says **FULL**.
Now switch to **Tab 2 (Elias)**. The page still shows the old state —
3/4, "1 seat left", active Join button — because it loaded before Dana
joined. Click **Join team**. A red banner appears: **"Team is full."**
That is the API's **409 Conflict**. The page refreshes itself and now
shows the true state: 4/4, FULL. Elias did not get in.

**Say (part A):**

> "Now the important part. I have two users open in two tabs: Dana and
> Elias. Both are looking at API Wizards — one seat left.
>
> Dana clicks Join… she is in. The team is now full: four out of four.
>
> But Elias's screen still shows the old page — one seat left. In a
> normal app, his click would read the old state and push the team to
> five members. Watch what happens here… 'Team is full.' That red banner
> is an HTTP 409 from the API. The server checked the seat and took the
> seat in one single atomic step, so there was no gap for Elias to slip
> through. The count is exactly four. Never five."

**On screen (part B — the code):** Switch to the editor showing
`joinTeam` in `server/src/controllers/teamController.js`. Highlight the
`findOneAndUpdate` call: the filter (`memberCount: { $lt: capacity }`,
`'members.user': { $ne: userId }`) and the update (`$push` + `$inc`).

**Say (part B):**

> "This is the whole trick, in one database call. The seat check is
> inside the filter of the same update that adds the member. MongoDB
> runs it atomically, so two racing requests are forced into a queue by
> the database itself: the first one takes the seat, the second one
> finds the filter no longer matches — and gets a 409. No locks, no
> transactions."

## Segment 5 — Proof: the concurrency test and idempotency (3:00–3:35)

**On screen:** Switch to the terminal in `server/` and run:

```
npx jest tests/concurrency.test.js
```

Let the output settle on the passing test named **"never over-fills a
team: 8 racers, 2 free seats, exactly 2 succeed"** (and the idempotency
tests just below it in the same file).

**Say:**

> "A demo shows it once; tests prove it every time. This test fires
> eight different users at the last two seats of a team, all at the same
> moment. Exactly two get a 200. Six get a 409. The final member count
> is exactly the capacity, with no duplicate members.
>
> The same file tests idempotency: if a client retries a join with the
> same Idempotency-Key — a double-click, a network retry — the server
> returns the original result instead of joining twice. Retries are
> safe by design."

## Segment 6 — All 50 tests and CI (3:35–4:05)

**On screen:** In the terminal, show the full suite result
(`cd server && npm test` → **"Tests: 50 passed"**). Then switch to the
GitHub Actions tab showing the green CI run for the latest push.

**Say:**

> "In total there are fifty API tests, all passing. They cover the happy
> paths, the edge cases — duplicate email returns 409, bad tokens return
> 401, deleted teams return 404 — and the whole concurrency suite.
>
> The tests run against a real MongoDB, started in memory by the test
> setup, so there is no mocking of the thing we are trying to prove.
> And the same suite runs in GitHub Actions on every push and every
> pull request."

## Segment 7 — Load test (4:05–4:40)

**On screen:** Open `load/results-local.txt`. Point at the lines:
requests completed **2,029** · HTTP 200: 1,667 · HTTP 409: 362 ·
errors: none · **p95: 10.1 ms**.

**Say:**

> "Finally, load. I ran Artillery against the API: two thousand and
> twenty-nine requests, a mix of browsing and a join stampede on one
> team. Zero errors. The 362 responses with status 409 are the stampede
> losing the race — that is correct behaviour, not failures.
>
> The p95 response time was 10.1 milliseconds. The requirement is under
> 200 — so we are about twenty times inside the budget. This run was on
> my local machine, with the API, the database, and the load generator
> all sharing one small VM; the same Artillery config is re-run against
> the deployed API for the submission numbers."
>
> *(After the deployed re-run, replace the last two sentences with:
> "Against the live API at [[LIVE_URL]], the same test gave a p95 of
> [[LIVE_P95]] milliseconds.")*

## Segment 8 — The design choice, and closing (4:40–5:00)

**On screen:** Back to the browser on the Teams page at **`[[LIVE_URL]]`**
(or localhost), API Wizards showing **4/4 FULL**. Stay on this screen
until the end.

**Say:**

> "The design choice in one sentence: all of a team's membership lives
> in a single document, and MongoDB makes a single-document update
> atomic — so one conditional update gives the guarantee that
> transactions would, without needing a replica set, locks, or extra
> infrastructure.
>
> TeamForge: a team can never over-fill, and a user can never join
> twice — not by luck, but by construction. The code, the tests, and
> the design document are all in the repository. Thank you."

---

## After recording — quick self-check

- [ ] Total length is at or under 5:00.
- [ ] The 409 banner ("Team is full") is clearly visible in Segment 4.
- [ ] The "8 racers, 2 free seats" test name is readable in Segment 5.
- [ ] "50 passed" and the green CI run are readable in Segment 6.
- [ ] p95 = 10.1 ms is readable in Segment 7.
- [ ] No real passwords, tokens, or personal data on screen anywhere
      (demo accounts only).
- [ ] Once deployment is live: re-shoot Segments 2–4 and 8 on
      **`[[LIVE_URL]]`** and update Segment 7 with the live p95, as marked.
