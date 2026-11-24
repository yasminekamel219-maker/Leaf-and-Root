# API contracts (v1)

Base path `/api/v1`. The authoritative, machine-readable contract is the OpenAPI document served at
`/api/docs-json` (UI at `/api/docs`); this page is the human summary. Request bodies are JSON.

## Conventions

- Success: `{ "data": { ... } }` (204 has no body).
- Error: `{ "error": { "code": "STRING", "message": "text", "details": [...]? } }`.
- Auth: browsers use the `leaf_root_session` HttpOnly cookie; native clients send
  `Authorization: Bearer <token>` (obtain it by sending `X-Auth-Transport: bearer` to register/login).
- Timestamps are ISO-8601 UTC. IDs are UUIDs.
- Rate limits: register and login share three 15-minute windows: 5 per email+IP, `AUTH_RATE_LIMIT_IP`
  (default 20) per IP, `AUTH_RATE_LIMIT_ACCOUNT` (default 30) per email. Every other route is limited to
  100 requests/minute per IP (health is exempt). Exceeding a limit returns `429 RATE_LIMITED`.
  Rationale: [02-security-review.md](02-security-review.md#3-authentication-rate-limits).
- All paths below are relative to `/api/v1`. Implemented routes: `GET /health`, `POST /auth/register`,
  `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `GET /users/me`, `PATCH /users/me`,
  `POST /plants`, `GET /plants`, `GET /plants/:id`, `PATCH /plants/:id`
  (matches the OpenAPI document; verified against `/api/docs-json` by an integration test and a smoke
  test on 2026-11-24). There is **no `DELETE /plants/:id`** (deletion semantics are not approved), and no
  care-task, photo, AI or IoT endpoints.

`User` (public): `{ id, email, name, createdAt, updatedAt }`. `role` and `passwordHash` never appear.

| Status | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON |
| 401 | `UNAUTHORIZED` | Missing/invalid/expired session, or wrong login credentials |
| 403 | `FORBIDDEN` | Blocked cross-site request (CSRF) |
| 404 | `NOT_FOUND` | Unknown route; or, for plants, a plant that does not exist, belongs to another user, or has a malformed id (identical response) |
| 409 | `EMAIL_IN_USE` | Registering an existing email |
| 422 | `VALIDATION_ERROR` | Body fails validation; `details` holds Zod issues |
| 429 | `RATE_LIMITED` | Throttled |
| 503 | `DATABASE_UNAVAILABLE` | Health check cannot reach PostgreSQL |
| 500 | `INTERNAL_ERROR` | Unexpected; generic message |

## Endpoints

### `GET /health` — public
`200 { "data": { "status": "ok", "database": "up" } }` · `503` when the DB is unreachable.

### `POST /auth/register` — public, rate-limited (see above)
Body: `{ "email": string (valid, ≤254), "password": string (10–128), "name": string (2–80, trimmed) }`.
Unknown fields → 422. Email is lower-cased.
- `201 { data: { user } }` + `Set-Cookie: leaf_root_session=…; HttpOnly; SameSite=Lax; Expires=…`
- With `X-Auth-Transport: bearer`: `201 { data: { user, token, expiresAt } }`, no cookie.
- `409 EMAIL_IN_USE` · `422` · `429`

### `POST /auth/login` — public, rate-limited (see above)
Body: `{ "email", "password" }`.
- `200` same shapes as register (cookie or bearer).
- `401` identical body for unknown email and wrong password · `422` · `429`

### `GET /auth/me` — authenticated
`200 { data: { user } }` · `401`.

### `POST /auth/logout` — idempotent
Deletes the presented session and clears the cookie. `204` always (also without credentials).

### `GET /users/me` — authenticated
`200 { data: { user } }` · `401`.

### `PATCH /users/me` — authenticated
Body: `{ "name": string (2–80) }` — **the only editable field**. `email`, `password`, `role`, `id`, or
any other field → `422`; empty body → `422`. `200 { data: { user } }` · `401`.

## Plants (provisional initial subset)

The field set and limits below are **provisional engineering assumptions**, not final product requirements.
All four routes require a valid session (cookie or bearer); missing, invalid, expired or logged-out sessions
return `401 UNAUTHORIZED`.

`Plant`: `{ id (uuid), name, species | null, location | null, notes | null, createdAt, updatedAt }`.
`userId` is never returned. Text fields are trimmed. Limits: `name` 1–80 (required), `species` 1–120,
`location` 1–80, `notes` 1–1000. An empty string is invalid for the optional fields: send `null` (or omit
the field on create) for "no value".

Ownership: the owner is always the session user. Bodies are strict: `userId`, `id`, `status`, timestamps or
any other unknown field → `422 VALIDATION_ERROR`. Every operation only sees the caller's plants; another
user's plant, a missing plant and a malformed id all return the same `404 NOT_FOUND` body
(`"Plant not found"`). `ADMIN` has no bypass.

### `POST /plants`
Body: `{ "name": string, "species"?: string|null, "location"?: string|null, "notes"?: string|null }`.
`201 { data: { plant } }` · `401` · `422`.

### `GET /plants`
Query: `limit` (integer 1–100, default 50), `offset` (integer ≥ 0, default 0); unknown parameters → 422.
Newest first (`createdAt` descending, then `id` ascending). Only the caller's plants.
`200 { data: { plants: Plant[] }, meta: { total, limit, offset } }` (`total` counts all of the caller's
plants) · `401` · `422`.

### `GET /plants/:id`
`200 { data: { plant } }` · `401` · `404`.

### `PATCH /plants/:id`
Partial update; at least one of `name`, `species`, `location`, `notes` (an empty object → 422). `null`
clears `species`, `location` or `notes`; `name` cannot be null or blank. Unspecified fields are untouched
and `updatedAt` advances. `200 { data: { plant } }` · `401` · `404` · `422`.

Not available: `DELETE /plants/:id` (hard vs soft deletion, PM-6, is not approved).

## Compatibility notes for clients

- The web app calls these through the Vite proxy (`/api` → `localhost:3001`), same-origin, so cookies just work.
- Cross-origin browsers need their origin in `CORS_ALLOWED_ORIGINS` and `credentials: "include"`.
- Mobile: store the bearer token in the OS secure store; send `X-Auth-Transport: bearer` only on register/login.
- The legacy unversioned `/api/auth/*` routes no longer exist (the only in-repo caller, `AuthPages.tsx`, was updated).
- Not yet in the API: `/api/photo-submissions` (called by `PlantCareAiPage.tsx`; still prototype-only).
