# Leaf & Root API

NestJS 12 · Prisma 7 · PostgreSQL 17 · REST under `/api/v1` · OpenAPI at `/api/docs`.

This is the backend for Leaf & Root. **Implemented today:** health check, authentication (register,
login, logout, current user), the user's profile name, and an **initial, provisional Plant Management
subset** (create, list, view, update the user's own plants). Plant **deletion is not implemented** (its
semantics are not approved, PM-6). Everything else (care tasks, photos, AI, IoT, notifications,
marketplace, community) is **not implemented**; see the status table in the
[root README](../README.md#module-status).

> The original brief suggested a `backend/` folder. The repository already had a wired-up `server/`
> app, so it was extended instead ([why](docs/01-repository-assessment.md)).

## Prerequisites

- Node.js 22+ (CI uses 22; also tested locally on 24)
- pnpm 10
- Docker (Docker Desktop on Windows must be running) for PostgreSQL

## Run locally

From the **repository root** (commands work in PowerShell and bash). Each step lists the expected result.

| Step | Command | Expected result |
|---|---|---|
| 1. Install | `pnpm install --frozen-lockfile` | Finishes with `Done in …` and no errors |
| 2. Database | `docker compose up -d postgres` | Container `leaf-and-root-postgres-1` becomes `healthy` (host port `5434`) |
| 3. Config | `cp server/.env.example server/.env` | `server/.env` exists (git-ignored) |
| 4. Migrate | `pnpm --dir server db:deploy` | `3 migrations found` then `All migrations have been successfully applied.` (or `No pending migrations to apply.` on an up-to-date database) |
| 5. Client | `pnpm --dir server prisma:generate` | `Generated Prisma Client (7.10.1)` into `server/src/generated/prisma` |
| 6. API | `pnpm dev:api` | Log line `Nest application successfully started`; API on `http://localhost:3001` |
| 7. Web (optional) | `pnpm dev` | React app on `http://localhost:8443`, proxying `/api` to the API |

Verify: `GET http://localhost:3001/api/v1/health` returns `{"data":{"status":"ok","database":"up"}}`
(also reachable through the proxy at `http://localhost:8443/api/v1/health`). Swagger UI:
`http://localhost:3001/api/docs`; OpenAPI JSON: `http://localhost:3001/api/docs-json`.

Production-style start (built output): `pnpm --dir server build` then `pnpm --dir server start`
(runs `node dist/main.js`; needs `DATABASE_URL` in the environment or `server/.env`).

All commands above were run on a fresh clone of the repository on 2026-11-24 at commit `799da46`
(Windows, Node 24, pnpm 10.33, PostgreSQL 17 in Docker). After the Plant migration was added,
`db:deploy` was re-verified on a brand-new database (3 migrations applied) but the full fresh-clone
sequence was not repeated. Not tested: running with `NODE_ENV=production` behind HTTPS,
Linux/macOS local setup (CI covers Linux for build and tests only).

### Troubleshooting

- *`failed to connect to the docker API`* → start Docker Desktop, then rerun step 2.
- *Port 5434 or 3001 already in use* → stop the other process or change `API_PORT` / the compose port mapping.
- *`Cannot resolve environment variable: DATABASE_URL`* from `prisma` → `server/.env` is missing (step 3) or `DATABASE_URL` is not set.

## Configuration (environment variables)

Validated at boot by [`src/config/env.ts`](src/config/env.ts); the app refuses to start and names the
offending keys (never their values). Template: [`.env.example`](.env.example). `server/.env` is
git-ignored; the example holds the local-development database credentials from `compose.yaml`
(local use only; never reuse them elsewhere).

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string (`postgres://` or `postgresql://`) |
| `API_PORT` | `3001` | Listen port |
| `NODE_ENV` | `development` | `development`, `test` or `production`. `production` marks the session cookie `Secure` and turns Swagger off by default |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `SESSION_TTL_DAYS` | `30` | Session lifetime in days (1–365), absolute |
| `AUTH_RATE_LIMIT_IP` | `20` | Register/login attempts per client IP per 15 min (1–10000) |
| `AUTH_RATE_LIMIT_ACCOUNT` | `30` | Register/login attempts per email per 15 min across IPs (1–10000) |
| `CORS_ALLOWED_ORIGINS` | empty (CORS off) | Comma-separated origins such as `https://app.example.com`; no wildcard, no path |
| `SWAGGER_ENABLED` | on outside production | `true`/`false`; serves `/api/docs` |
| `TEST_DATABASE_URL` | `<DATABASE_URL database>_test` | Optional; used only by `test:e2e`. Must be local and end in `_test` |

The per email+IP limit (5 per 15 min) is fixed in code, not configurable. The frontend dev server also
reads `PORT` (default `8443`) and `API_PROXY_TARGET` (default `http://127.0.0.1:3001`) in `vite.config.ts`.

## Database and migrations

Schema: [`prisma/schema.prisma`](prisma/schema.prisma); models are described in
[architecture](docs/architecture.md#data-model). Committed migrations live in [`prisma/migrations`](prisma/migrations):
`init` (User, Session), `add_user_role` (`UserRole` enum + `User.role`, default `USER`) and `add_plant`
(`Plant` table, index on `(userId, createdAt)`, foreign key to `User` with `ON DELETE RESTRICT`).

```bash
pnpm --dir server db:deploy    # apply committed migrations (prisma migrate deploy); safe for CI/shared DBs
pnpm --dir server db:migrate   # create + apply a new migration in development (prisma migrate dev)
```

Never run `db:migrate` against a shared or production database.

## Tests

```bash
pnpm --dir server test        # unit tests; no database needed
pnpm --dir server test:e2e    # integration tests against PostgreSQL (step 2 first)
pnpm check                    # from the repo root: generate, unit, typecheck (web + API), build (web + API)
```

Expected results on 2026-11-24 (commit `fa734fc`, locally and in CI): unit **79 passed** (8 files),
integration **114 passed** (6 files), `pnpm check` exit code 0. These counts change as tests are added.
(The earlier foundation-only run in CI was 30 unit / 51 integration.)

`test:e2e` creates and migrates a separate `<name>_test` database automatically; the harness refuses any
database that is not local or whose name does not end in `_test`
([`src/test/test-database.ts`](src/test/test-database.ts)). Your development data is never touched. The
suite raises `AUTH_RATE_LIMIT_IP/ACCOUNT` to 1000 so it can create many accounts from one address;
[`src/auth/auth-hardening.e2e-spec.ts`](src/auth/auth-hardening.e2e-spec.ts) tests the real windows with small values.
CI runs the same commands ([CI details](docs/architecture.md#ci-github-actions)).

## Layout

```
src/
  config/      env validation
  logging/     pino options + redaction
  common/      error filter, Zod body parsing, OpenAPI helpers
  prisma/      PrismaService (global)
  auth/        register / login / logout / me, scrypt, session tokens, SessionAuthGuard, rate limits
  users/       GET/PATCH /users/me
  plants/      POST/GET /plants, GET/PATCH /plants/:id (provisional; no DELETE)
  test/        test database + HTTP helpers
  generated/   Prisma client (git-ignored)
prisma/        schema + migrations
docs/          architecture, API contracts, decisions, traceability, handoffs
```

## Documentation

| Topic | Document |
|---|---|
| Architecture, auth/session flow, ownership, security controls, data model, CI, deployment prerequisites, AI/IoT boundaries | [docs/architecture.md](docs/architecture.md) |
| Endpoints and error contract | [docs/api-contracts.md](docs/api-contracts.md) |
| Security review and known risks | [docs/02-security-review.md](docs/02-security-review.md) |
| Assumptions and pending decisions (D1–D16, PM-*) | [docs/assumptions-and-pending-decisions.md](docs/assumptions-and-pending-decisions.md) |
| Requirements traceability | [docs/requirements-traceability.md](docs/requirements-traceability.md) |
| Plant Management scope and decisions | [docs/04-plant-management-decision-review.md](docs/04-plant-management-decision-review.md) |
| Progress and handoffs | [docs/session-01-handoff.md](docs/session-01-handoff.md) |
| Historical assessment (baseline snapshot) | [docs/01-repository-assessment.md](docs/01-repository-assessment.md) |
