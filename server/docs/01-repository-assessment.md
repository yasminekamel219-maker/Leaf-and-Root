# 01 — Repository & Requirements Assessment

> **Historical snapshot.** This describes the repository as found at the start of session 1 (before
> the foundation work). Statements such as "10 unit + 3 e2e tests", "`GET /api/health`", "one CI job
> with no Postgres service" and the gaps table in section 4 describe that **baseline**, not today's
> state. For the current state see the [server README](../README.md), [architecture](architecture.md) and
> the [handoff](session-01-handoff.md).

Date: 2026-11-24 · Branch: `development` · Scope: backend only (session 1)

## 1. Key finding: a backend slice already exists

The brief proposes a new `backend/` folder. Inspection showed an **untracked but complete `server/` NestJS application** (NestJS 12, Prisma 7, PostgreSQL 17) that the root `package.json`, `pnpm-workspace.yaml`, `vite.config.ts` (`/api` proxy), `compose.yaml`, `README.md` and the project's Obsidian architecture note all already reference.

**Decision:** extend `server/` instead of creating a parallel `backend/`. A second app would duplicate the stack, break the existing `pnpm check` pipeline and the Vite proxy, and cost more than it gives. Docs that the brief placed in `backend/docs/` live in `server/docs/`. This is the "better existing structure" the brief allows for.

## 2. Confirmed findings (evidence-based)

| Area | Finding | Source |
|---|---|---|
| Frontend | React 19, React Router 8 (`HashRouter`), Vite 8, Tailwind 4, no state/data library | `package.json`, `src/App.tsx` |
| Auth UI | `/login` and `/signup` pages. Fields: **name** (2–80), **email**, **password** (min 10 in UI). Already call `POST /api/auth/{login,register}` and show success only on a 2xx | `src/pages/AuthPages.tsx` |
| User types | No shared `User` type exists in `src/`. Only the payload type `AuthPayload` | grep of `src/` |
| API calls | Exactly two: auth (above) and `POST /api/photo-submissions` (multipart, `PlantCareAiPage.tsx`) — **not implemented**, out of scope | grep of `src/` |
| Mock data | Marketplace, blog, community, plant and monitoring content is static in `src/data/siteData.ts` and page components | `src/data/`, `src/pages/` |
| Routes | Public: home, about, plant-care-ai (+identify/health/care/monitoring), marketplace, community, blogs, login, signup, help, privacy, terms | `src/App.tsx` |
| Vite proxy | `/api` → `http://127.0.0.1:3001` | `vite.config.ts` |
| Existing backend | register/login/logout/me, scrypt hashing, SHA-256-hashed opaque sessions in Postgres, Zod validation, throttling, Nest security headers + CSRF (Fetch Metadata), shared error shape, `GET /api/health`, 10 unit + 3 e2e tests | `server/src/**` |
| CI | One job: `pnpm check` on Node 22 with **no Postgres service**, so e2e tests are not run in CI | `.github/workflows/ci.yml` |
| Environment | Node 24.22.1, pnpm 10.33.2, Docker 29.8.2 (daemon had to be started) | shell |

## 3. Requirement sources

| Document | Status |
|---|---|
| SRS / PRD / functional requirements | **Unavailable** — none in the repository |
| `plans/leaf-and-root-homepage.md` | Available; homepage UI plan only, no backend requirements |
| `AGENTS.md` | Available; Figma Make scaffold notes, no backend rules |
| Obsidian: *Leaf and Root*, *Architecture*, *Backlog* | Available; record the agreed first slice (web auth + PostgreSQL) and the stack |
| Flutter, AI service, IoT specs | **Unavailable** |

The only confirmed requirements are what the **frontend UI shows** plus the brief's endpoint list. Everything else is an assumption (see `assumptions-and-pending-decisions.md`).

## 4. Gaps against the session brief (closed this session)

| # | Gap | Plan |
|---|---|---|
| 1 | Routes are `/api/auth/*`, not `/api/v1/*` | Global prefix `api/v1`; frontend fetch path updated (one line) |
| 2 | No `GET/PATCH /users/me` | New `users` module |
| 3 | No role field | `UserRole` enum, default `USER`, never client-settable |
| 4 | No Swagger / OpenAPI | `@nestjs/swagger`, request schemas derived from the Zod schemas |
| 5 | No env validation (`process.env` read ad hoc) | Zod-validated config, fail fast at boot |
| 6 | No structured logging / redaction | `nestjs-pino` with redaction |
| 7 | No CORS allowlist | `CORS_ALLOWED_ORIGINS`, off by default |
| 8 | Health does not check the database | DB probe, 503 on failure |
| 9 | Session only via cookie; no strategy for Flutter | Same opaque session also accepted as `Authorization: Bearer` |
| 10 | e2e tests use the dev database | Dedicated `*_test` database, auto-created and migrated |
| 11 | Expired sessions never cleaned; no expiry test | Opportunistic cleanup + tests |
| 12 | No backend docs | `server/docs/*` |

## 5. Dependencies and boundaries

- **Needs:** PostgreSQL 17 (Docker Compose, host port 5434), Node ≥ 22, pnpm 10.
- **Out of scope (not implemented):** email verification, OAuth, password reset, subscriptions, RBAC beyond a stored role, plant/marketplace/community/blog APIs, photo submissions, AI, IoT, Flutter, any deployment or production database change, Git push/merge.
- **Frontend contract:** the only frontend edit is the auth fetch URL (`/api/auth` → `/api/v1/auth`), required so the existing pages keep working after versioning.
