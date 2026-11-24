# Architecture

## Shape: modular monolith

One deployable NestJS app. Each business area is a Nest module with its own controller, service and
schemas; modules talk through exported services, never through each other's tables.

```
AppModule
├─ LoggerModule (nestjs-pino)     structured, redacted logs
├─ ThrottlerModule + ThrottlerGuard       global limit + auth windows (auth-rate-limit.ts)
├─ PrismaModule (global)          the only database access point
├─ AuthModule                     register · login · logout · me · SessionAuthGuard
├─ UsersModule  ──imports──▶ AuthModule   profile read/update
├─ PlantsModule ──imports──▶ AuthModule   plants: create · list · view · update (no delete)
└─ HealthController               liveness + DB probe
```

Future areas (care tasks, marketplace, …) become new modules, as plants did, that import `AuthModule` for
`SessionAuthGuard` / `@CurrentUser()` and use `PrismaService`.

## Request pipeline

`security headers + CSRF (Fetch Metadata)` → `CORS (allowlist)` → `body parser` → `throttler` →
`SessionAuthGuard` (protected routes) → controller → Zod `parseBody` → service → Prisma →
`ApiExceptionFilter` shapes every error. A final fallback returns the same JSON envelope for paths
outside `/api/v1` (Nest only mounts its 404 handler under the global prefix).

## Authentication and session strategy

**Chosen:** server-side opaque sessions stored in PostgreSQL.

- On register/login the server creates 32 random bytes (`base64url`) and stores only its
  **SHA-256 hash** in `Session.tokenHash` with `expiresAt` (default 30 days, absolute).
- **Web:** token is delivered as an `HttpOnly; SameSite=Lax` cookie (`Secure` in production). JS cannot read it.
- **Flutter/native:** send `X-Auth-Transport: bearer` on register/login to receive the same token in the
  JSON body, then send `Authorization: Bearer <token>`. No cookie is set in that mode.
- `SessionAuthGuard` accepts either transport. `Authorization` wins over a stale cookie.
- **Logout** deletes the session row, so the token is dead immediately. Other devices' sessions survive.
- **Expiry** is enforced in the lookup query (`expiresAt > now`); expired rows for a user are swept on that user's next login.

### Trade-offs (why not JWT)

| | Opaque DB session (chosen) | Stateless JWT |
|---|---|---|
| Real logout / revocation | Immediate | Needs a deny-list or short TTL + refresh rotation |
| Per-request cost | One indexed DB lookup | None |
| Leaked token | Revoke by deleting the row | Valid until expiry |
| Complexity | Low | Refresh flow, key rotation, token storage rules |
| Scale-out | Shared DB (already required) | Easier cross-service verification |

At this stage "actual logout invalidation" and simplicity outweigh the per-request lookup. If a
separate service later needs to verify identity without the DB, introduce short-lived JWTs minted
from a session at that point (see pending decisions).

Known costs: the bearer token is long-lived (30 days) and lives in device storage (use the platform
secure store); there is no refresh/rotation and no "list/revoke my other sessions" endpoint yet.

## Passwords

Node `crypto.scrypt` (N=2^16, r=8, p=2, 16-byte random salt, 64-byte key), stored as
`scrypt$N$r$p$salt$key`, verified with `timingSafeEqual` using the parameters stored in the hash.
Older, weaker hashes (N=2^14, p=1) still verify and are re-hashed on the next successful login.
Login runs a dummy hash for unknown emails so response time does not reveal which emails exist.
Moving to argon2id is still pending (D10). See [02-security-review.md](02-security-review.md).

## User permissions and ownership

What exists today:

- Two stored roles, `USER` (default) and `ADMIN`. The role is never returned or writable through the API.
  **`ADMIN` currently grants nothing**: no endpoint checks the role, and there is no RBAC (decision D5).
- Every protected endpoint (`GET /auth/me`, `GET`/`PATCH /users/me`) acts on the user attached to the
  session by `SessionAuthGuard`. There is no `:id` parameter, so one user cannot address another user's
  record. Logout deletes only the presented session.

### Plant ownership (implemented, provisional scope)

Plants are the first user-owned resource (`POST`/`GET /plants`, `GET`/`PATCH /plants/:id`). Rules enforced
in code and covered by integration tests:

- `userId` comes **only** from the authenticated session (`@CurrentUser()`); request bodies are strict
  Zod schemas, so `userId`, `id`, `status`, timestamps or any unknown field are rejected with 422.
- Every query is scoped by owner **inside the database call** (`findFirst({ where: { id, userId } })`,
  `update({ where: { id, userId } })`, list and count filtered by `userId`); there is no fetch-then-compare.
- A plant that does not exist, a plant owned by another user, and a malformed id all return the same
  `404 NOT_FOUND` ("Plant not found"), so existence is not leaked.
- No role bypass: an `ADMIN` gets the same 404 for other users' plants.
- The foreign key `Plant.userId → User.id` is `ON DELETE RESTRICT`: a user who owns plants cannot be deleted
  until an account-deletion and retention policy is approved (D7). No user-deletion endpoint exists today.
- No `DELETE /plants/:id` exists (PM-6). The field set and limits are provisional engineering assumptions;
  see [04-plant-management-decision-review.md](04-plant-management-decision-review.md).

## Security controls

- Strict Zod schemas (`.strict()`): unknown fields (e.g. `role`) are rejected with 422.
- `role` is stored but never selectable by clients (`publicUserSelect` omits it) nor writable via the API.
- Rate limits: register and login each have three 15-minute windows (per IP, per email+IP = 5, per email; the first and last are configurable, see [server README](../README.md#configuration-environment-variables)); 100 requests/min per IP globally; health exempt. Rationale and trade-offs: [02-security-review.md](02-security-review.md#3-authentication-rate-limits).
- Security headers (Nest `useSecurityHeaders`, helmet-8 defaults); CSP is relaxed for Swagger only while Swagger is enabled.
- CSRF: Fetch-Metadata check on state-changing requests; allowlisted CORS origins are trusted; non-browser clients unaffected.
- CORS: explicit allowlist, credentials on, no wildcard (rejected at config validation).
- Logging: request/response serializers keep method, path (no query string) and status only; redaction of `authorization`, `cookie`, `set-cookie`, `password*`, `token*` at root and one level down.
- Errors: one envelope `{ "error": { "code", "message", "details?" } }`; 5xx messages are generic and the stack goes to the log only.

## Data model

```
User(id uuid pk, email unique ≤254, passwordHash, name ≤80, role USER|ADMIN default USER, createdAt, updatedAt)
Session(id uuid pk, tokenHash char(64) unique, userId → User cascade, expiresAt, createdAt)   idx: userId, expiresAt
Plant(id uuid pk, userId → User RESTRICT, name ≤80 required, species ≤120 null, location ≤80 null, notes text null (≤1000 validated), createdAt, updatedAt)   idx: (userId, createdAt)
```

Emails are lower-cased and trimmed before storage, so uniqueness is case-insensitive.

`Plant` is a **provisional** model: the field set and the length limits are engineering assumptions, not
product-owner-approved requirements. There is no `deletedAt` (soft deletion is not approved), the `notes`
limit is enforced by validation rather than the column type, and `Plant.userId` uses `ON DELETE RESTRICT`
(not `CASCADE`) until an account-deletion and retention policy exists. Relationships: one `User` has many
`Session`s (deleted with the user) and many `Plant`s (they block deleting the user).

## Testing strategy

Unit tests (no DB): password hashing, token hashing, Zod schemas, env validation, log redaction,
token extraction, test-database safety. Integration tests (real PostgreSQL, isolated `*_test`
database, real HTTP via `fetch` against a listening app): every endpoint, persistence assertions by
querying Prisma directly, expiry by rewriting `expiresAt`, logout invalidation, the three rate-limit
windows, malformed cookies, legacy password-hash upgrade, CORS, CSRF, OpenAPI contents, and for plants:
authentication (missing, invalid, expired, logged-out sessions), validation, mass-assignment rejection,
owner-only reads and writes between two users, the ADMIN non-bypass, pagination and ordering, the
database foreign-key rule and index, and the absence of any DELETE. Run commands and
current counts: [server README](../README.md#tests).

## CI (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Triggers: `pull_request`, and pushes
to `main` and `development` (a push to any other branch does not start it).

| Job | What it runs | Database |
|---|---|---|
| `check` | `pnpm check`: Prisma generate, unit tests, typecheck (web + API), build (web + API) | None. A placeholder `DATABASE_URL` is set because `prisma.config.ts` requires one to load |
| `api-integration` | `pnpm --dir server prisma:generate` then `pnpm --dir server test:e2e` | PostgreSQL 17 service container; the harness creates `leaf_and_root_test` and applies every migration |

Evidence: run [45321864482](https://github.com/abdalrahmansaqr1/Leaf-and-Root/actions/runs/45321864482)
on the fork's stacked draft PR #3 (head `fa734fc`, includes the Plant module): `check` passed (79 unit tests,
typecheck, frontend and API builds) and `api-integration` passed (114 tests). Foundation-only run
45311513292 (head `799da46`): 30 unit and 51 integration tests. An earlier run failed in
`check` because `DATABASE_URL` was missing; that was fixed without changing any test. The workflow change
exists on the feature branch only until it is merged, so the upstream `main`/`development` do not run
`api-integration` yet.

## Integrations not yet implemented (AI and IoT)

**Nothing in this section is implemented, and the requirements documents for it are unavailable**
(the original SRS/DFD, AI-service spec and IoT/hardware spec are not in the repository). The lists below
are open questions for the product owner, not requirements.

| Capability | What the repository shows | Open decisions |
|---|---|---|
| Photo submission / AI analysis | The frontend (`PlantCareAiPage.tsx`) posts multipart form data to `/api/photo-submissions`; no such route exists on the API | AI provider/model service, sync vs async, photo storage and size/type limits, privacy, moderation, cost and rate limits (D12, D14) |
| Chatbot | Not present in the repository | Everything (D14) |
| IoT / sensors | Frontend copy and sample data describe optional sensor readings; no backend code | Protocol, device authentication (devices are not users and must not reuse user sessions), device-to-plant mapping, reading storage and retention (D14, PM-8) |

## Deployment prerequisites

No deployment has been performed or configured. Facts about the current code that any deployment must
account for (hosting choice and topology are decision D11):

- **No Dockerfile or deployment manifest** exists for the API; only `compose.yaml` for local PostgreSQL.
- **Migrations are a separate step**: the app does not migrate on boot. Run `pnpm --dir server db:deploy`
  against the target database before starting a new version.
- **Required environment**: `DATABASE_URL`; set `NODE_ENV=production` (Secure cookie, Swagger off by
  default), an explicit `CORS_ALLOWED_ORIGINS` if a browser app on another origin calls the API, and review `LOG_LEVEL`.
- **HTTPS**: the `Secure` cookie requires HTTPS end to end; this was not exercised in testing.
- **Reverse proxy**: `trust proxy` is not configured, so behind a proxy every client appears with the proxy's
  IP and the per-IP rate limit would apply to everyone together.
- **Rate-limit counters are in memory** and per process; multiple instances would not share them.
- **Database**: PostgreSQL 17 is what was tested; backups, connection limits and credentials management are open.
- **Hashing cost**: about 64 MiB of memory per concurrent password hash; size the host accordingly.
- **Logs** go to stdout as JSON (pino) with sensitive fields redacted; health probe: `GET /api/v1/health`.
