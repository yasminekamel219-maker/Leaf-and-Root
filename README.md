# Leaf & Root

Leaf & Root is a graduation-project web app for plant care: identify a plant, get care guidance,
keep routines, and browse a community and a small marketplace. This repository holds the React
frontend and the first slice of the NestJS backend.

> **Honest status:** the frontend is mostly a static prototype. The backend implements **accounts**
> (register, login, logout, current user, profile name) and an **initial, provisional plant subset**
> (create, list, view, update the user's own plants; **no delete**). AI, IoT, notifications,
> marketplace and community have **no backend yet**, and **no frontend screen uses the plant API**.

## What exists today

| Area | State | Details |
|---|---|---|
| Frontend (`src/`) | Prototype, mostly static | Home, About, Plant Care & AI (+ identify/health/care/monitoring), Marketplace, Community, Blogs, Help/Privacy/Terms. Content comes from static data in `src/data/siteData.ts`. |
| Frontend ↔ backend | Login and sign-up only | `src/pages/AuthPages.tsx` calls `POST /api/v1/auth/login` and `/register`. The UI has no logout, profile or session-aware screens. `PlantCareAiPage.tsx` calls `POST /api/photo-submissions`, which **does not exist** on the backend. |
| Backend (`server/`) | Foundation, authentication, initial plant subset | NestJS 12, Prisma 7, PostgreSQL 17, REST under `/api/v1`, Swagger at `/api/docs`. |
| CI | Green on the fork's stacked draft PRs, including the plant module (run 45321864482, head `fa734fc`); nothing is merged | GitHub Actions: build/typecheck/unit job and a PostgreSQL integration-test job. See [server/docs/architecture.md](server/docs/architecture.md#ci-github-actions). |

### Module status

| Module | Status |
|---|---|
| Authentication and sessions | **Completed** (register, login, logout, `GET /auth/me`) |
| User profile (`/users/me`, name only) | **Completed** |
| Health check (`GET /health`) | **Completed** |
| Plant management: add, list, view, edit | **Implemented, provisional** – fields and limits are engineering assumptions; verified locally and in CI on a draft PR; not merged |
| Plant deletion | **Blocked** – hard vs soft delete not approved ([PM-6](server/docs/assumptions-and-pending-decisions.md)); no endpoint exists |
| Care tasks, reminders, notifications | Pending decisions, not started |
| Photo submission, AI analysis, chatbot | Pending requirements, not started |
| IoT / sensors | Pending requirements, not started |
| Marketplace, community, blogs | Static frontend only |
| Email verification, password reset, OAuth, roles/RBAC | Pending decisions |

The original SRS/DFD documents are **not in this repository** and have not been reviewed. See
[requirements traceability](server/docs/requirements-traceability.md).

## How the applications relate

```
Browser ──▶ Vite dev server :8443 (React app)
                │  proxies /api/*
                ▼
            NestJS API :3001  ──▶  PostgreSQL :5434 (Docker, local)
            /api/v1/...            Swagger: /api/docs
```

The web app calls the API same-origin through the Vite proxy (`vite.config.ts`), so the session
cookie needs no CORS. Mobile (Flutter) clients are expected to use the bearer-token transport
described in [API contracts](server/docs/api-contracts.md); no mobile client exists in this repo.

## Quick start

Prerequisites: Node.js 22+, pnpm 10, Docker (for PostgreSQL). Commands run from the repository root
and work in PowerShell and bash.

```bash
pnpm install --frozen-lockfile
docker compose up -d postgres
cp server/.env.example server/.env
pnpm --dir server db:deploy
pnpm --dir server prisma:generate
```

Run the API and the web app in separate terminals:

```bash
pnpm dev:api    # API on http://localhost:3001
pnpm dev        # web on http://localhost:8443 (proxies /api to the API)
```

Check it works: `http://localhost:3001/api/v1/health` returns `{"data":{"status":"ok","database":"up"}}`,
and the same URL works through `http://localhost:8443/api/v1/health`. The web app uses `HashRouter`, so
pages live at `http://localhost:8443/#/signup` and `/#/login`.

Quality checks (generate, unit tests, typecheck web + API, build web + API):

```bash
pnpm check
```

With PostgreSQL running, also run the API integration tests (they use a separate `*_test` database
and never touch your development data):

```bash
pnpm --dir server test:e2e
```

Full backend setup, environment variables, migrations and troubleshooting: [server/README.md](server/README.md).

## Documentation map

| Topic | Canonical document |
|---|---|
| Backend setup, env vars, migrations, tests, layout | [server/README.md](server/README.md) |
| Architecture, auth/session flow, ownership, security controls, data model, CI, deployment prerequisites, AI/IoT boundaries | [server/docs/architecture.md](server/docs/architecture.md) |
| Endpoints and error contract (Swagger is the machine-readable source) | [server/docs/api-contracts.md](server/docs/api-contracts.md) |
| Security review and known risks | [server/docs/02-security-review.md](server/docs/02-security-review.md) |
| Confirmed requirements, assumptions, pending decisions (D1–D16, PM-*) | [server/docs/assumptions-and-pending-decisions.md](server/docs/assumptions-and-pending-decisions.md) |
| Requirements traceability | [server/docs/requirements-traceability.md](server/docs/requirements-traceability.md) |
| Plant Management scope and decisions | [server/docs/04-plant-management-decision-review.md](server/docs/04-plant-management-decision-review.md) |
| Progress and session handoffs | [server/docs/session-01-handoff.md](server/docs/session-01-handoff.md) |
| Historical repository assessment | [server/docs/01-repository-assessment.md](server/docs/01-repository-assessment.md) |

## Project map

- `src/` React frontend (`main.tsx`, `App.tsx` routes, `pages/`, `components/`, `data/` static content).
- `server/` NestJS API, Prisma schema and migrations, tests, backend documentation.
- `compose.yaml` local PostgreSQL service.
- `.github/workflows/ci.yml` CI.
- `.figma/` Figma Make runtime configuration (generated; do not edit by hand).
- `plans/` historical frontend design plan.

## Contribution workflow

The canonical repository is [`yasminekamel219-maker/Leaf-and-Root`](https://github.com/yasminekamel219-maker/Leaf-and-Root).
Contributors without direct write access work from a fork. This project uses one long-lived
`development` branch for active work:

1. Sync `development` with `upstream/main` before starting the next change.
2. Keep the next pull request focused and commit it to `development`.
3. Open a pull request from the fork's `development` branch to `upstream/main`.
4. After merge, sync the same branch again instead of creating another branch.

The CI workflow runs on pull requests and on pushes to `main` and `development` only; a push to any
other branch does not start it until a pull request is open.

Do not commit secrets, generated builds, dependencies, or local agent/plugin state.
