# Assumptions and pending decisions

No SRS/PRD exists in the repository (see the assessment), so requirements are classified explicitly.

## A. Confirmed requirements
Confirmed by the session brief and/or visible in the frontend UI:

1. Register, login, logout, retrieve current user, view/update basic profile.
2. Email + password sign-in as the current frontend flow; sign-up fields are name, email, password.
3. User model: id, email, password hash, name, created/updated timestamps, internal role.
4. Users cannot assign their own privileged roles.
5. Stack: NestJS, TypeScript, PostgreSQL, Prisma, REST, OpenAPI, Docker Compose for dev DB, `/api/v1`.
6. Backend only: no frontend/Flutter/AI/IoT work; no deployment, no production DB changes, no push/merge.
7. Per the product owner's later brief (SRS citation **pending**, file unavailable): users can add a plant with
   basic information, view their plants, view plant details, edit a plant, and delete a plant. Nothing is
   implemented yet; see [04-plant-management-decision-review.md](04-plant-management-decision-review.md).

## B. Provisional assumptions (implemented, easy to change)

| # | Assumption | Where | Change cost |
|---|---|---|---|
| P1 | Email + password is the initial method, **not** a final decision | `auth/` | Low |
| P2 | Password length 10–128 (the sign-up form already enforces min 10) | `auth.schemas.ts` | Low |
| P3 | Name 2–80 chars (matches the form's `minLength/maxLength`) | schemas | Low |
| P4 | Session lifetime 30 days, absolute (not sliding) | `SESSION_TTL_DAYS` | Config |
| P5 | Opaque DB-backed sessions rather than JWT | `docs/architecture.md` | Medium |
| P6 | Bearer transport for native clients via `X-Auth-Transport: bearer` | `auth.controller.ts` | Low |
| P7 | Only `name` is user-editable; email change deferred | `users.schemas.ts` | Low |
| P8 | `role` ∈ {USER, ADMIN}; ADMIN only grantable by operators in the DB | `schema.prisma` | Low |
| P9 | `role` is not exposed in API responses | `publicUserSelect` | Low |
| P10 | Register returns 409 `EMAIL_IN_USE` (reveals that an email exists) | `auth.service.ts` | Low |
| P11 | Logout is idempotent (204 even without a valid session) | `auth.controller.ts` | Low |
| P12 | Swagger on by default outside production | `env.ts` | Config |
| P13 | Web app is a same-origin client via the Vite proxy; CORS off by default | `create-app.ts` | Config |
| P14 | Auth rate limits per 15 min: 5 per email+IP (fixed), 20 per IP and 30 per email (configurable) | `auth-rate-limit.ts`, `env.ts` | Config |
| P15 | scrypt N=2^16, r=8, p=2 with rehash-on-login (argon2id still pending, D10) | `password.ts` | Low |
| P16 | Plant fields: `name` required; `species`, `location`, `notes` optional (provisionally accepted as "basic information"; not final product approval) | `schema.prisma`, `plants.schemas.ts` | Low (add/rename column) |
| P17 | Plant length limits: name ≤ 80, species ≤ 120, location ≤ 80, notes ≤ 1000 (notes limit enforced by validation, column is `text`); text trimmed; empty string invalid, `null` = no value / clears | `plants.schemas.ts` | Low |
| P18 | Plant list: `limit` 1–100 (default 50), `offset` ≥ 0, newest first (`createdAt` desc, `id` asc), `meta.total` | `plants.schemas.ts`, `plants.service.ts` | Low |
| P19 | A missing plant, another user's plant and a malformed id all return the same 404; `ADMIN` has no ownership bypass | `plants.service.ts` | Low |
| P20 | `Plant.userId` is `ON DELETE RESTRICT` (not `CASCADE`) and there is no `deletedAt`, until PM-6 and D7 are decided | `schema.prisma`, migration `add_plant` | Low–medium |

## C. Pending decisions (need product/owner input; **not implemented**)

| # | Decision | Notes |
|---|---|---|
| D1 | Email verification | Blocks safe email change and trust in `email` |
| D2 | Password recovery / reset | Needs an email provider decision |
| D3 | OAuth / social login | Providers unspecified |
| D4 | Final auth method for mobile (password vs OTP vs social) | Affects Flutter |
| D5 | Roles and RBAC (what ADMIN can do, other roles e.g. moderator/seller) | Only a stored enum exists |
| D6 | Subscriptions / billing | Out of scope |
| D7 | Account deletion, data export, retention | Privacy requirements unknown |
| D8 | Multi-device session management (list/revoke), session lifetime policy, refresh tokens | |
| D9 | Email-enumeration policy (generic register response vs 409) | Trade-off UX vs privacy |
| D10 | Move to argon2id | scrypt was raised to N=2^16,r=8,p=2 with rehash-on-login (see 02-security-review.md); argon2id still pending |
| D11 | Deployment topology: reverse proxy (`trust proxy` for correct client IP in rate limiting), TLS, hosting, backups, migration ownership | Rate limiting uses the socket IP until configured |
| D12 | Photo-submission contract, storage, limits, privacy | Frontend already calls `POST /api/photo-submissions` |
| D13 | Marketplace (real commerce vs demo), community moderation, blogs; plant care tasks | Currently static frontend data. **Plant CRUD** (add/list/view/edit/delete) is per the product owner's brief; its open questions are tracked as PM-1…PM-8 below |
| D14 | AI provider/model-service integration; IoT protocol/auth (device identity differs from user sessions) | |
| ~~D15~~ | ~~CI: add a PostgreSQL service so `test:e2e` runs on pull requests~~ | **RESOLVED (verified) on the feature branch:** Actions run 45311513292 (head `799da46`): `check` pass 30/30, `API integration tests (PostgreSQL)` pass 51/51. Not yet on upstream `main`/`development` until the unmerged draft PR lands. See requirements-traceability.md |
| D16 | Flutter specifics: deep links, push notification tokens | |

## C2. Plant Management decisions (Session 2; full review in 04-plant-management-decision-review.md)

None of these is approved as a final product decision. "Blocks CRUD" = what must be settled before the
corresponding Plant operation can be implemented.

| # | Decision | Classification | Engineering recommendation | Blocks CRUD |
|---|---|---|---|---|
| PM-1 | Plant limit ("up to 10") | Frontend-only marketing copy | No limit; optional config cap later | No |
| PM-2 | Species catalogue / plant identity | Undefined in requirements | Free-text `species`, no catalogue | No |
| PM-3 | Care tasks and scheduling | Undefined in requirements | Defer; no schedule fields on `Plant` | No |
| PM-4 | Care history and retention | Undefined; depends on PM-3, D7 | Defer | No |
| PM-5 | Plant photos | Undefined; see D12 | No image field; no arbitrary URLs | No |
| PM-6 | Deletion semantics (hard vs soft; retention) | Operation per brief; semantics **not approved** | Engineering leaning: hard delete, **not approved**; alternatives in the review. `DELETE /plants/:id` is **not implemented** | **Only the delete operation** (create/list/view/edit are implemented, provisionally) |
| PM-7 | Notifications / reminders | Separate capability | Out of scope | No |
| PM-8 | Device-to-plant mapping | Separate capability; undefined | Out of scope; stable `Plant.id` | No |
| PM-F | Definition of "basic information" (Plant fields) | Undefined in requirements. **Provisionally accepted by the team** as an engineering assumption: `name` required; `species`, `location`, `notes` optional. Not final product-owner approval | Implemented provisionally (P16, P17); final confirmation pending | No |

## D. Unavailable sources
SRS/PRD, Flutter app spec, AI service spec, IoT/hardware spec, any API design docs, any Figma
backend annotations. Marked unavailable rather than guessed.
