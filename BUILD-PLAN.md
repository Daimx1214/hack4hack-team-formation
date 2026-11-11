# BUILD-PLAN.md — Hack4Hack PS1, Wed Nov 11 → Sun Nov 15, 2026

**Submission deadline: Sun Nov 15, 2026, 23:29 PKT.**
Prize on the line: Full-stack Engineer roles (top 5 per statement announced
Nov 21; interviews Nov 23–26; offers by Nov 30).

**Hard scheduling constraint:** Sat–Sun Daim has NASA Space Apps + CodeShield
(Sat Nov 14 CTF 2–7 PM, Sun Nov 15 blue team 2–7 PM). So all heavy building
lands **Wed–Fri**; the weekend is only packaging, video, and submission.

PS1 deliverables checklist (from the challenge):

- [ ] Working team-formation platform (React + Node/Express + MongoDB)
- [ ] Race-proof join/create — concurrency tests prove it
- [ ] 20+ API tests, running in CI (GitHub Actions)
- [ ] Load test proving p95 < 200 ms
- [ ] Live deployed URL
- [ ] Design doc (`DESIGN.md`)
- [ ] 5-minute demo video
- [ ] Live URL + repo submitted before Sun 23:29 PKT

---

## Wed Nov 11 — Scaffold + core race-proof backend ✅ (started)

- [x] Project scaffold: `server/` (Express + Mongoose), `client/` (Vite + React)
- [x] Models: User, Team, JoinRequest; JWT auth (register/login/me)
- [x] Race-proof join/leave via atomic conditional update (see DESIGN.md §3)
- [x] Test suite: auth + teams + concurrency (Jest + Supertest + memory Mongo) — **29 tests, all passing locally on day 1** (the 20+ target is already met; Thu adds edge cases on top)
- [x] Wed-evening additions (pulled forward from Thu/Sat): edge-case + leave-race +
      idempotency-under-concurrency tests → **50 tests, all passing**; duplicate-email
      register now returns 409 (race-safe); seed script; client UI polish
      (banners, seats-left badges, footer); Artillery load test run LOCALLY —
      **p95 10.1 ms, zero errors** (see `load/results-local.txt`; live-URL re-run still owed)
- [x] CI workflow running the API tests (runs once the repo is pushed to GitHub)
- [x] README + DESIGN.md first versions
- [x] Verified: server boots and serves (`/api/health` 200, register 201); client `npm run build` succeeds
- [ ] Daim: read the join controller once — you must be able to explain it

## Thu Nov 12 — Backend completion + tests to 20+

- [ ] Polish validation + error messages across all endpoints
- [x] Add remaining API tests on top of the 29 passing (done Wed Nov 11): register/login
      edge cases, malformed ObjectId → 404 on join/leave/delete, capacity boundaries,
      leave races, concurrent idempotent replays → 50 total
- [ ] Still open: pagination/filter of team list (endpoint currently returns all teams)
- [x] Seed script (`server/src/seed.js`) with demo users + teams for the demo (done Wed Nov 11)
- [ ] Postman/curl smoke script against a locally running server
- [ ] **Signups only Daim can do (do them today, they gate deployment):**
  - MongoDB Atlas account + free M0 cluster → connection string
  - Render account (API deploy)
  - Vercel or Netlify account (client deploy)
- [ ] Create the GitHub repo for the project and push (repo must be shareable
      with the judges; CI must be green on it)

## Fri Nov 13 — Frontend completion + deployment

- [ ] Client pages finished: Register, Login, Teams list, Team detail
      (member list, seats-left indicator, Join/Leave buttons), Create team
- [x] Client handles 409 states gracefully ("Team full", "Already a member")
      and retries joins with a stable `Idempotency-Key` (done Wed Nov 11:
      error/success banners + seats-left badges; in-flight Join disabled)
- [ ] Deploy: Atlas (DB) → Render (API, env vars set) → Vercel/Netlify (client,
      `VITE_API_URL` pointing at Render)
- [ ] Full end-to-end smoke test on the **live** URLs
- [ ] Freeze features Friday night — after this, only fixes

## Sat Nov 14 — Load test + design doc final (light day: CodeShield 2–7 PM)

- [ ] Morning only: Artillery load test (last-seat stampede scenario,
      DESIGN.md §6) against the live API; record p95 + success counts in
      `load/` and README — LOCAL run already done Wed Nov 11 (p95 10.1 ms,
      zero errors, `load/results-local.txt`); only the live-URL re-run remains
- [ ] If p95 fails: profile join endpoint (indexes, response size) and re-run
- [ ] Final pass on DESIGN.md — numbers from the real load test filled in
- [ ] Draft the demo-video script (see below)
- [ ] (Daim away 2–7 PM: NASA + CodeShield — no build work planned)

## Sun Nov 15 — Packaging + video + submission (deadline 23:29 PKT)

- [ ] Morning: record the 5-minute demo video (script below)
- [ ] Final README pass: live URL, load-test numbers, how to run, CI badge
- [ ] Re-run full test suite + confirm CI green on the final commit
- [ ] (Daim away 2–7 PM: CodeShield blue team)
- [ ] Evening: submit (repo link + live URL + video) — **target 21:00 PKT**,
      well before the 23:29 deadline; do not leave it to the last hour

### Demo video script (5 minutes)

1. **0:00–0:45 — The problem.** Show the naive read-check-save code; explain
   the race in one breath: two requests, one seat, both pass the check.
2. **0:45–2:00 — The platform.** Register, create a team, second user joins;
   show seats-left updating.
3. **2:00–3:30 — The stampede.** Run the concurrency demo: 8 users race for
   2 seats live (script or load test); show exactly 2 succeed, count is
   exact, no duplicates. Show the atomic update code and walk through why
   the database serialises the racers.
4. **3:30–4:15 — Tests + CI.** Test suite running green; GitHub Actions page;
   call out the two concurrency tests by name.
5. **4:15–5:00 — Load test + wrap.** Artillery numbers (p95 < 200 ms),
   live URL on screen, one-line recap of the guarantee.

## Submission checklist (final)

- [ ] Public repo, CI green, README complete with live URL
- [ ] Live client URL loads; live API `/api/health` returns ok
- [ ] 20+ API tests passing locally and in CI
- [ ] Load-test results committed (`load/` — local results in; live-URL re-run pending)
- [ ] DESIGN.md final
- [ ] Demo video uploaded (unlisted is fine) and link in README
- [ ] Submission sent before Sun Nov 15, 23:29 PKT (target: 21:00)
