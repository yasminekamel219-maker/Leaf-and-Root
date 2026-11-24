# Progress log and session handoffs

Canonical record of what each session did, the evidence, the Git state, and what the next session
should do. (The file name is historical; it covers all sessions so far.) Topic documents hold the
details: [architecture](architecture.md), [API contracts](api-contracts.md),
[security review](02-security-review.md), [decisions](assumptions-and-pending-decisions.md),
[traceability](requirements-traceability.md), [Plant Management review](04-plant-management-decision-review.md).

## Current state (2026-11-24)

| Item | State |
|---|---|
| Implemented backend | Health, authentication (register, login, logout, `GET /auth/me`), user profile name (`GET`/`PATCH /users/me`), and the initial plant subset (`POST`/`GET /plants`, `GET`/`PATCH /plants/:id`). No other endpoints. |
| Frontend | Static prototype; only login and sign-up call the API (`/api/v1/auth/*`). No screen uses the plant API; the frontend was not modified. |
| Plant Management | Initial subset **implemented, provisional** (session 3). **Not complete**: `DELETE` is blocked on PM-6; fields/limits are engineering assumptions. |
| CI | Green on all three stacked draft PRs in the fork, including the plant module (run links in the CI evidence section). Not merged anywhere. |
| Requirements sources | Original SRS/DFD, Flutter, AI and IoT specs are **unavailable** and were **not** reviewed |

## Git state

| Ref | State |
|---|---|
| `development` | Untouched (local and on the fork, `a680f32`) |
| `feature/backend-foundation-auth` | Pushed to the owner's fork only (`abdalrahmansaqr1/Leaf-and-Root`, a fork of `yasminekamel219-maker/Leaf-and-Root`). Head at last verification: `799da46`, equal local and remote |
| Draft PR #1 on the fork | `feature/backend-foundation-auth` → fork `development`. Open, **draft, not merged**; opened only because CI triggers on `pull_request`, not on feature-branch pushes |
| `docs/session-2-plant-requirements` | Pushed to the fork. Remote head `4a171a4` (documentation consolidation, on top of `799da46`) |
| `feature/plant-management-crud` | Pushed to the fork. Remote head at the time of the CI run below: `fa734fc` (Plant Management initial subset, on top of `4a171a4`). A later documentation-only commit may sit on top; check `git log` |

### Stacked draft pull requests (all inside the fork `abdalrahmansaqr1/Leaf-and-Root`, all open, none merged)

| PR | Base ← head | Contents |
|---|---|---|
| [#1](https://github.com/abdalrahmansaqr1/Leaf-and-Root/pull/1) | `development` ← `feature/backend-foundation-auth` (`799da46`) | Foundation + authentication (preserved as it was) |
| [#2](https://github.com/abdalrahmansaqr1/Leaf-and-Root/pull/2) | `feature/backend-foundation-auth` ← `docs/session-2-plant-requirements` (`4a171a4`) | 1 commit, 12 documentation files |
| [#3](https://github.com/abdalrahmansaqr1/Leaf-and-Root/pull/3) | `docs/session-2-plant-requirements` ← `feature/plant-management-crud` (`fa734fc`) | 1 commit, 21 files: Plant model/migration, plants module, tests, documentation |

The PR file lists were checked on GitHub: #2 contains only documentation, #3 only the Plant Management change.
Nothing was pushed to `upstream`; `development` and `main` on the fork still point to `a680f32` and `024956c`.

### CI evidence for the stacked PRs (GitHub Actions on the fork; workflow runs on `pull_request`)

| Run | Head | `check` | `API integration tests (PostgreSQL)` |
|---|---|---|---|
| [45321859732](https://github.com/abdalrahmansaqr1/Leaf-and-Root/actions/runs/45321859732) (PR #2) | `4a171a4` | **success**: 30 unit tests, frontend and API builds | **success**: 51 tests |
| [45321864482](https://github.com/abdalrahmansaqr1/Leaf-and-Root/actions/runs/45321864482) (PR #3) | `fa734fc` | **success**: 79 unit tests, typecheck, frontend and API builds | **success**: 114 tests (6 files) against a fresh CI PostgreSQL container with all 3 migrations applied by the harness |

Counts were read from the run logs. The integration job creates a new database in a new container, so it is
also the fresh-database migration check, and its tests assert the `Plant` foreign key is `RESTRICT`, the
index exists, ownership isolation holds for two users and for an `ADMIN`, and no `DELETE` route or OpenAPI
operation exists. The ownership tests were also shown to be effective locally by a mutation check (removing
the owner scope made 3 tests fail). Earlier foundation runs: see the table above.

Nothing was pushed to `upstream`, merged or deployed.

Commits on the feature branch: `fbcc681` (foundation + authentication), `336c209` (CI job, rate limits,
scrypt upgrade, cookie fix), `25550bb` (timing fix, security review, handoff), `14f2ea7` (CI placeholder
`DATABASE_URL`), `799da46` (CI results and an early Plant Management readiness report, since replaced by
[04-plant-management-decision-review.md](04-plant-management-decision-review.md)). Not committed on purpose: `.claude/launch.json`
(local tool state).

## Session 1 — Backend foundation and authentication

Extended the existing `server/` app (see [01-repository-assessment.md](01-repository-assessment.md) for why
not `backend/`): validated env, `/api/v1`, health with a database probe, error envelope, pino logging with
redaction, CORS allowlist, security headers + CSRF, Swagger, isolated test-database harness, register/login/
logout/me, cookie and bearer sessions, `GET`/`PATCH /users/me`, `UserRole` migration. Follow-ups: PostgreSQL
CI job, three-window auth rate limiting, scrypt N=2^16 with rehash-on-login, malformed-cookie fix, timing
padding for legacy hashes. Frontend change: one line in `AuthPages.tsx`.

### Verification evidence

| Check | Result | Where |
|---|---|---|
| `tsc --noEmit` (server) | clean | local, 2026-11-24 |
| Unit tests | **30 / 30** (7 files) | local; CI run 45311513292 |
| Integration tests (isolated `leaf_and_root_test`) | **51 / 51** (4 files) | local; CI run 45311513292 |
| `pnpm check` | exit 0 | local and on a fresh clone; CI `check` job |
| Fresh-clone setup (install, `db:deploy`, `prisma:generate`, unit, e2e, `pnpm check`, `dev:api`, `dev`, Vite proxy, Swagger, `start`) | all worked | local, documentation session |
| `db:deploy` on a brand-new database | `All migrations have been successfully applied.` (2 migrations) | local scratch database, since dropped |
| Malformed-cookie test red before the fix | failed with `URIError` | local |

### CI evidence (GitHub Actions on the fork, draft PR #1)

| Run | Head | `check` | `API integration tests (PostgreSQL)` |
|---|---|---|---|
| 45310842815 | `25550bb` | **failed**: `prisma generate` needs `DATABASE_URL` (locally supplied by the ignored `server/.env`) | pass |
| 45311142969 | `14f2ea7` | pass | pass |
| 45311513292 | `799da46` | pass (30 unit tests, frontend and API builds) | pass (51 tests) |

The failure was fixed by a placeholder `DATABASE_URL` on the database-free job; no test was changed, skipped
or weakened. The `api-integration` job exists on the feature branch only until it is merged, so upstream
`main`/`development` do not run it yet. GitHub Actions is enabled on the fork. Details of the jobs:
[architecture → CI](architecture.md#ci-github-actions).

### Real-browser verification (manual, in-app browser; React on :8443 → Vite proxy → API :3001)

The app uses `HashRouter`, so pages are `/#/signup` and `/#/login`.

| Scenario | Observed |
|---|---|
| Sign up through the form | `POST /api/v1/auth/register` → 201 |
| Sign up with an existing email | UI shows "An account already exists for this email" (409) |
| Login, wrong password | UI shows the generic "Invalid email or password" |
| Login, correct password | UI shows the "Welcome back!" state |
| Session cookie | Not visible to `document.cookie` (HttpOnly); `/auth/me` and `/users/me` → 200 with it |
| Persistence | `/auth/me` still 200 after an incidental full-page reload by the dev server |
| No credentials | `/auth/me` with `credentials: omit` → 401 |
| `PATCH /users/me` | name changed → 200; `{role:"ADMIN"}` → 422 |
| Logout | 204; `/auth/me` afterwards → 401; second logout → 204 |
| Cross-origin read from the page to the API origin | Blocked by the browser (CORS off in the default `.env`) |
| Allowlist (second API instance with `CORS_ALLOWED_ORIGINS=http://localhost:8443`, curl) | Allowed origin gets `Access-Control-Allow-Origin` + credentials; `https://evil.example` gets none |
| CSRF (curl with `Sec-Fetch-Site: cross-site`) | Non-allowlisted origin → 403; allowlisted origin → 204 |

Not covered: the "account created" card after sign-up (the dev server reloaded the page and cleared it; not
repeated), a `Secure` cookie over real HTTPS, the bearer flow in a real mobile client, other browsers, and
any automated browser test (the run was manual and CI cannot repeat it).

## Session 2 — Plant Management requirements review (docs only)

Reviewed PM-1…PM-8, defined the minimal Plant model and API as **proposals**, added the traceability matrix,
and marked D15 (PostgreSQL integration tests in CI) implemented and verified in CI on the feature branch
(run 45311513292), **not yet merged into `development`**. No code or schema changes. See
[04-plant-management-decision-review.md](04-plant-management-decision-review.md).

## Session 2b — Documentation consolidation (docs only)

Audited and updated all backend and root documentation against the implementation, folded the readiness
report into the Plant Management review (deleting the duplicate file), added CI, ownership, AI/IoT and
deployment sections to [architecture.md](architecture.md), and verified every setup command on a fresh clone.
Committed locally as `4a171a4` on `docs/session-2-plant-requirements`. No push.

## Session 3 — Plant Management, initial CRUD subset (provisional)

Branch `feature/plant-management-crud` (pushed to the fork, from `4a171a4`; draft PR #3). Implemented in `server/src/plants/`:
`POST /plants`, `GET /plants` (`limit`, `offset`, `meta.total`), `GET /plants/:id`, `PATCH /plants/:id`;
Prisma model `Plant` and migration `20261124032335_add_plant` (index `(userId, createdAt)`, foreign key
`ON DELETE RESTRICT`, no `deletedAt`); shared `parseQuery` helper next to `parseBody`; OpenAPI schemas.
Contract and rules: [api-contracts](api-contracts.md#plants-provisional-initial-subset),
[architecture](architecture.md#plant-ownership-implemented-provisional-scope). **Not implemented:**
`DELETE` (PM-6), plant limit, species catalogue, care schedules, photos, AI, IoT, notifications.

Tests were written first and run red (schema unit file failed on the missing module; 62 e2e tests failed),
then green after the implementation. A mutation check (removing the `userId` scope from `get` and `update`)
made 3 ownership tests fail, and restoring it made all pass.

| Check | Result (run locally 2026-11-24) |
|---|---|
| `tsc --noEmit` | clean |
| Unit tests | **79 / 79** (8 files; was 30) |
| Integration tests | **114 / 114** (6 files; was 51); new: 63 across `plants.e2e-spec.ts` and `plants-ownership.e2e-spec.ts` |
| `pnpm check` (generate, unit, typecheck web+api, build web+api) | exit 0 |
| `prisma migrate status` on the dev database | 3 migrations, up to date; `migrate diff` against the schema: no difference |
| `db:deploy` on a brand-new scratch database | 3 migrations applied; table, index and `ON DELETE RESTRICT` confirmed in `psql`; database dropped |
| Direct API smoke test, two users, built server on the dev database | A created/listed/updated own plant; B listed 0 plants, got 404 on A's plant for GET and PATCH, 404 for DELETE, 422 for `userId` in the body; anonymous list 401; OpenAPI lists only `/api/v1/plants` and `/api/v1/plants/{id}` |
| Existing authentication tests | still pass (part of the 114) |

An earlier version of the smoke script had a path bug (empty plant id), so its output was discarded and the
smoke test was rerun with a corrected script; only the rerun is reported. The existing OpenAPI test in
`app.e2e-spec.ts` lists every path exactly; the two plant paths were added to its expected list (an
extension, not a relaxation). The frontend build is part of `pnpm check` and passed; no frontend file changed.
Smoke users `smoke-a-…@example.com` and `smoke-b-…@example.com` and one plant remain in the dev database.
CI later ran on this work and passed (see the CI evidence for the stacked PRs above). See [04-plant-management-decision-review.md §10](04-plant-management-decision-review.md#10-session-3-outcome-what-was-implemented-and-where-it-differs-from-the-proposals).

## Known limitations and remaining risks

- argon2id not adopted (D10); ~64 MiB per concurrent hash; not load-tested.
- Rate-limit counters are in memory and per process; `trust proxy` not configured (D11).
- The per-account window permits a limited lock-out of a victim's login.
- Registration reveals existing emails (409, D9).
- Sessions are absolute-lifetime; no refresh or "revoke other sessions" (D8).
- Swagger UI needs a relaxed CSP; keep it off in production unless intended.
- Local exposure: `compose.yaml` publishes PostgreSQL on all interfaces and Vite listens on `0.0.0.0`
  ([details](02-security-review.md#3b-local-development-exposure-found-during-the-documentation-audit)).
- The dev database contains test users from manual checks (`smoke-…@example.com`, `browser-check-1@example.com`).
- The e2e config raises `AUTH_RATE_LIMIT_IP/ACCOUNT` to 1000; the hardening spec tests the real windows.
- Requirements sources are unavailable (above); D1–D16 are unresolved, see [decisions](assumptions-and-pending-decisions.md).

## Recommended next backend task

1. Get the owner's decision on **PM-6** (hard vs soft deletion, D7 retention) and confirm the provisional
   plant fields; then implement `DELETE /plants/:id` (and `deletedAt` only if soft deletion is chosen) with
   the matching tests and the `Plant.userId` foreign-key decision.
2. Owner reviews the three stacked draft PRs (#1 → #2 → #3) and decides how they land; nothing is merged.
3. Then, depending on decisions: care tasks (PM-3/PM-4), photo submission (D12), or the auth decisions
   (D1, D2, D5).

## Handoff for the next Claude Code session

1. **Read first:** this file, then [04-plant-management-decision-review.md](04-plant-management-decision-review.md)
   (section 10 lists where the implementation differs from the proposals),
   [assumptions-and-pending-decisions.md](assumptions-and-pending-decisions.md), [architecture.md](architecture.md).
2. **Environment:** follow [server/README.md](../README.md#run-locally). Docker Desktop must be running; if the
   dev database is missing, `docker compose up -d postgres` then `pnpm --dir server db:deploy`.
3. **Git:** three local/remote lines of work exist (foundation branch pushed to the fork; docs branch and plant
   branch local). Decide with the owner how they land, stacked in order foundation → docs → plants. Do not
   push, merge, deploy or touch `development` without explicit approval.
4. **Rules that still apply:** backend only; no unapproved business rules; do not describe unrun tests as
   passing; the SRS/DFD are unavailable, so cite them only when the files are provided; keep AI, IoT, photos,
   scheduling, reminders and marketplace out of plant work; do not mark Plant Management complete.
5. **Conventions to follow:** `/api/v1`, `{data}`/`{error}` envelopes, strict Zod schemas via `parseBody`,
   `SessionAuthGuard` + `@CurrentUser()`, OpenAPI decorators, integration tests against the isolated test DB.
6. **Done means:** `pnpm check` and `pnpm --dir server test:e2e` pass locally, CI green, docs and the
   traceability matrix updated in the same change.
