# Plant Management — requirements and decision review (Session 2)

Status: this document was written as a **review** in session 2. **Session 3 implemented the initial subset**
(create, list, view, update; no delete) on the provisional fields. Where the implementation differs from the
proposals below, the **implemented behaviour is documented in
[api-contracts.md](api-contracts.md#plants-provisional-initial-subset) and
[architecture.md](architecture.md#plant-ownership-implemented-provisional-scope)**, and the differences are
listed in section 10. Nothing here is an approved product decision. "Recommendation" means an engineering proposal for the team to
accept, change or reject.

## 0. Source status (read this first)

| Source | Available? | How it is used here |
|---|---|---|
| Original SRS / DFDs | **No file in the repository** (searched tracked files and the working tree by name and extension) | **Not reviewed.** Statements attributed to them come only from the product owner's session brief and are marked *"per brief; SRS citation pending"*. |
| Product owner's Session 2 brief | Yes (chat) | Source of the five CRUD operations and of the list of capabilities the requirements leave undefined. |
| React frontend (`src/types/index.ts` `PlantSpecimen`, `src/data/siteData.ts` `SAMPLE_PLANTS`, home/marketing copy) | Yes | Treated as **illustrative**, never as approved requirements. |
| Existing backend (schema, auth, tests) | Yes | Establishes what can be built on. |

**Request to the product owner:** please provide the original SRS and DFD files (or exact section/figure
numbers) so each `REQ-PL-*` row in [requirements-traceability.md](requirements-traceability.md) can carry
a precise citation. Until then the traceability status for those rows is "Per brief — citation pending".

### Classification legend

- **Confirmed (per brief):** stated by the product owner as an original requirement; SRS citation still pending.
- **Frontend-only:** appears in the prototype UI/copy; not a requirement.
- **Engineering proposal:** this review's suggestion.
- **Pending:** needs a product-owner decision.

## 1. Confirmed minimum scope (per brief)

| ID | Operation | Status |
|---|---|---|
| REQ-PL-01 | Add a plant with basic information | Confirmed (per brief). **"Basic information" is not defined** → field list pending (§3). |
| REQ-PL-02 | View the user's plants | Confirmed (per brief) |
| REQ-PL-03 | View plant details | Confirmed (per brief) |
| REQ-PL-04 | Edit plant information | Confirmed (per brief) |
| REQ-PL-05 | Delete a plant | Confirmed (per brief). **Deletion semantics undefined** → PM-6. |

Explicitly **not** in this scope (separate capabilities per the brief): AI plant analysis, IoT monitoring,
chatbot, marketplace, community, notifications, care scheduling, reminders, photo storage/moderation,
species catalogue, device-to-plant mapping.

## 2. Decision review PM-1 … PM-8

IDs are renamed from the earlier question list "P1–P8" to **PM-1…PM-8** because `P1–P13` already denote
provisional assumptions in `assumptions-and-pending-decisions.md`.

### PM-1 — Plant limit ("Free for up to 10 plants")
- **Classification:** Frontend-only. The only occurrence is marketing copy (`src/pages/AuthPages.tsx:228`). It also implies free vs paid tiers, which touches D6 (subscriptions, out of scope).
- **Recommendation:** do **not** enforce a limit in the first implementation.
- **Alternatives:** (A) none (recommended); (B) a single configurable cap (`MAX_PLANTS_PER_USER`, unset = unlimited) once the owner confirms the number and the error behaviour; (C) plan-based limits, only after D6.
- **If B is chosen:** count-then-insert races, so it needs a transaction/lock; proposed error `409 PLANT_LIMIT_REACHED`.
- **Blocks implementation?** No. **Needs from owner:** is the limit a real rule? If so: number, and what happens at the limit.

### PM-2 — Plant identity and species catalogue
- **Classification:** catalogue and identification are **undefined** in the requirements (per brief). The frontend shows rich species data (scientific name, family, light, humidity, soil, toxicity) in `PlantSpecimen`; that is a catalogue/guidance shape, not a user-entered plant.
- **Recommendation:** a plant is user-entered data: required `name`, optional free-text `species`. No catalogue, no foreign key.
- **Alternatives:** (A) free text (recommended); (B) catalogue table now: invents a data source and ownership that nobody has specified; (C) later add a nullable `speciesId` once identification (D14) or a catalogue is approved (cheap to add, so (A) does not block (C)).
- **Blocks implementation?** No. **Needs from owner:** confirm which fields are "basic information" (§3).

### PM-3 — Care tasks and scheduling
- **Classification:** undefined in the requirements (per brief). Frontend-only: `waterCadence`, `nextAction`, `nextDueDays`, `completedToday`, `status`.
- **Recommendation:** defer entirely; store none of these on `Plant`. They are derived or schedule data and storing them now would silently decide the scheduling model.
- **Alternatives:** (A) defer (recommended); (B) a free-text `notes` field for the user's own care notes (included in the proposal, carries no scheduling semantics); (C) `waterIntervalDays` on `Plant`: rejected, it starts the scheduling model.
- **Blocks implementation?** No for CRUD. Blocks any later care-task session. **Needs from owner:** user-defined vs generated schedules, recurrence, time zones.

### PM-4 — Care history and retention
- **Classification:** undefined. Depends on PM-3 and on D7 (data retention/account deletion).
- **Recommendation:** defer; nothing to build without PM-3.
- **Alternative:** none until PM-3 is decided.
- **Blocks implementation?** No.

### PM-5 — Plant photos
- **Classification:** photo storage undefined (per brief). Frontend `imageUrl` points to external stock-photo URLs; the user-photo flow (`POST /api/photo-submissions`) is a separate pending item (D12).
- **Recommendation:** no image field on `Plant`. Do not accept arbitrary URLs: they enable tracking/SSRF-style abuse and mixed content, and they pre-empt the storage decision.
- **Alternatives:** (A) none now (recommended); (B) later a `PlantPhoto` table once storage, size/type limits, privacy and moderation are decided (D12); (C) nullable `coverImageUrl` limited to the app's own storage, only after (B).
- **Blocks implementation?** No.

### PM-6 — Deletion semantics
- **Classification:** the operation is confirmed (per brief); **semantics are undefined**.
- **Recommendation (provisional, needs approval):** hard delete of the plant row. Future child tables (tasks, photos, history) would `ON DELETE CASCADE`. Reason: simplest behaviour consistent with "Delete a plant", and it avoids keeping personal data with no approved retention rule (D7).
- **Alternatives:** (A) hard delete (recommended); (B) soft delete with `deletedAt`: allows undo/audit but every query must filter it, a retention/purge policy is needed, and it keeps data the owner may not want kept; (C) archive state instead of delete: a different feature.
- **Regret analysis:** hard→soft later loses only past deletions; soft→hard later needs a purge job and a policy. Hard delete is irreversible for users, so the frontend should confirm before calling it.
- **Blocks implementation?** Yes, softly: the team must approve (A) or choose (B) before the migration is written.

### PM-7 — Notifications and reminders
- **Classification:** separate capability per brief; delivery channel undefined (D16).
- **Recommendation:** out of scope. **Blocks implementation?** No.

### PM-8 — Sensor / device linkage
- **Classification:** IoT is a separate capability; device-to-plant mapping is undefined (per brief). Device identity differs from user sessions (D14).
- **Recommendation:** out of scope. Keep `Plant.id` a stable UUID so a future mapping table can reference it. **Blocks implementation?** No.

## 3. Plant fields (provisionally accepted for the initial implementation)

**Update (documentation session):** the team stated that `name` (required) and `species`, `location`,
`notes` (optional) are **provisionally acceptable** for the initial implementation. This is an engineering
assumption, **not** a final product-owner-approved requirement; the table below is otherwise unchanged.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | UUID, server-generated | yes | Never client-supplied |
| `userId` | UUID → `User.id` | yes | From the session only; never in request bodies or responses |
| `name` | varchar(80) | **yes** | Trimmed, 1–80, matches the existing name convention |
| `species` | varchar(120) | no | Free text; no catalogue (PM-2) |
| `location` | varchar(80) | no | Free-text label such as "Living room" |
| `notes` | text, max 1000 chars (validated) | no | User's own notes; carries no scheduling meaning (PM-3 option B) |
| `createdAt`, `updatedAt` | timestamps | yes | Same convention as `User` |

**Still needs product-owner confirmation:** that these fields are what "basic information" means. Fields deliberately **excluded** and why: `status`, `nextAction`, `nextDueDays`,
`completedToday`, `waterCadence`, `lightNeeds`, `humidityRange`, `soilPreference`, `toxicity`, `family`,
`scientificName` (care/catalogue/derived data: PM-2/PM-3), `imageUrl` (PM-5).

```prisma
// Session-2 PROPOSAL, kept for the record. Implemented with `onDelete: Restrict` instead of `Cascade`
// (see section 10); the real model is in server/prisma/schema.prisma.
model Plant {
  id        String   @id @default(uuid()) @db.Uuid
  userId    String   @db.Uuid
  name      String   @db.VarChar(80)
  species   String?  @db.VarChar(120)
  location  String?  @db.VarChar(80)
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

The proposal used `onDelete: Cascade` (mirroring `Session`), subject to D7. **The implementation uses
`Restrict` instead** (section 10).

## 4. Proposed REST contract (engineering proposal)

Base `/api/v1`, all routes require a valid session (`SessionAuthGuard`), envelopes as elsewhere (`{data}` / `{error}`).
`Plant` response: `{ id, name, species, location, notes, createdAt, updatedAt }` (`userId` is not exposed).

| Method + path | Purpose | Success | Errors |
|---|---|---|---|
| `POST /plants` | Create (REQ-PL-01) | `201 { data: { plant } }` | 401, 422 |
| `GET /plants` | List own plants (REQ-PL-02) | `200 { data: { plants }, meta: { total, limit, offset } }` | 401, 422 (bad query) |
| `GET /plants/:id` | Detail (REQ-PL-03) | `200 { data: { plant } }` | 401, 404 |
| `PATCH /plants/:id` | Partial edit (REQ-PL-04) | `200 { data: { plant } }` | 401, 404, 422 |
| `DELETE /plants/:id` | Delete (REQ-PL-05, semantics per PM-6) | `204` | 401, 404 |

Rules:
- Request bodies use **strict** schemas (unknown keys → 422), as `PATCH /users/me` does today. `id`, `userId`, `createdAt`, `updatedAt` are never accepted.
- `PATCH` requires at least one editable field. Supplying `null` for an optional field clears it (proposal).
- List: ordered `createdAt desc, id`; `limit` 1–100 (default 50), `offset` ≥ 0 (proposal; simple and enough while per-user volumes are small).
- `:id` that is not a UUID → `404 NOT_FOUND` (never a database error or 500).
- A second `DELETE` of the same plant → 404 (not idempotent-204; proposal, keeps ownership checks uniform).
- No plant limit enforcement unless PM-1 is approved.

## 5. Ownership and authorization rules (engineering proposal)

1. `userId` always comes from the authenticated session, never from the client.
2. Every query is scoped in the database call itself (`where: { id, userId }`; `updateMany`/`deleteMany` with `userId`), never "fetch then compare".
3. A plant that does not exist and a plant owned by someone else return the **same** `404 NOT_FOUND` body (no existence leak).
4. No role-based bypass: `ADMIN` gets no special plant access until RBAC (D5) is approved.
5. `userId` is not returned and cannot be changed (no transfer between users).
6. Existing global and per-IP throttling applies; no new unauthenticated surface.
7. Logs keep the existing redaction; plant names/notes are user content and should not be logged at info level.

## 6. Required tests (to write first in the implementation session)

Unit: Zod schemas (create/patch bounds, trimming, strict keys, empty patch, null clearing, oversize notes, non-string types).

Integration (real PostgreSQL via the existing isolated test DB):
1. Create returns 201 with the documented shape; `userId` absent; server-generated `id`/timestamps.
2. Create rejects unknown keys (`userId`, `id`, `role`, `status`) and invalid fields with 422.
3. List returns only the caller's plants, correct order, pagination bounds, empty list for a new user.
4. Detail of own plant → 200.
5. **User B cannot read, edit or delete user A's plant** (all return 404, identical body to a missing plant), and A's data is unchanged afterwards.
6. Unknown UUID and non-UUID id → 404 (no 500).
7. PATCH updates only supplied fields, bumps `updatedAt`, can clear optional fields, rejects empty body.
8. DELETE → 204, subsequent GET/PATCH/DELETE → 404 (per the approved PM-6 semantics; with soft delete also assert it is hidden everywhere).
9. All five routes → 401 without a session, with an expired session, and after logout.
10. `ADMIN`-role user still gets 404 on another user's plant (no bypass).
11. Mass-assignment: a body containing `userId` of another user cannot create/move a plant to them.
12. OpenAPI document lists the five operations and schemas.
13. If PM-1 option B is approved: cap boundary, concurrent creates cannot exceed the cap.
14. CI: the `api-integration` job already runs these against PostgreSQL.

## 7. Remaining blockers and decisions

| Item | Blocks the next implementation session? | Owner |
|---|---|---|
| SRS/DFD files or exact citations for REQ-PL-01..05 | No (work can start on the brief), but citations stay pending | Product owner |
| Definition of "basic information" (field list, §3) | No: provisionally accepted (engineering assumption); final confirmation pending | Product owner |
| PM-6 deletion semantics (hard vs soft) | **Blocks only the delete operation and anything that depends on it**, not create/list/view/edit | Product owner |
| PM-1 plant limit | No (default: unlimited) | Product owner |
| PM-2, PM-3, PM-4, PM-5, PM-7, PM-8 | No (deferred by design) | Product owner / later sessions |
| D5 (roles), D7 (retention/account deletion) | No for CRUD; D7 affects the cascade and PM-6 | Product owner |
| D1–D16 other items | Unchanged | — |

## 8. Implementation-ready recommendation

### 8.1 Operations that can proceed now (on the provisional field list)

| Operation | Notes |
|---|---|
| `Plant` model + migration with `id, userId, name, species?, location?, notes?, createdAt, updatedAt` | **No `deletedAt` column** until PM-6 is decided; adding it later is a small migration |
| `POST /plants`, `GET /plants`, `GET /plants/:id`, `PATCH /plants/:id` | REQ-PL-01..04 |
| Ownership rules (§5) and the tests in §6 that do not concern delete | Written first |
| OpenAPI documentation of those four operations | Same pattern as the existing modules |

### 8.2 Held until the product owner decides

| Item | Why it is held |
|---|---|
| `DELETE /plants/:id` (REQ-PL-05) | Hard vs soft deletion is **not approved** (PM-6). Permanent deletion must not be approved silently. If the team wants delete in the same session, it must first pick option A, B or C in writing, and that choice is then recorded in the decision ledger. |
| `onDelete: Cascade` from `User` to `Plant` | Same family as D7 (account deletion/retention). It is only a foreign-key behaviour today because no user-deletion endpoint exists, but it should be confirmed rather than assumed |
| PM-1 plant limit, PM-2..PM-5, PM-7, PM-8 | Deferred by design (§2) |

### 8.3 Recommendation

Run a **small Plant CRUD session limited to create, list, view and edit** (§8.1), tests first, with
ownership enforced as in §5. Hold `DELETE` until PM-6 is answered; if it is answered before the session
starts, add it to the same session with the chosen semantics. Everything else (AI, IoT, photos,
scheduling, reminders, marketplace) stays out. **No decision in this document has been taken on the
team's behalf.**

## 9. What is ready to build on (verified)

- Authenticated identity on every request (`SessionAuthGuard`, `@CurrentUser()`), so ownership checks can use the session user.
- Prisma + migration workflow, an isolated integration-test database, and CI that runs those tests
  against PostgreSQL ([evidence](architecture.md#ci-github-actions)).
- Conventions to reuse: `/api/v1`, `{data}` / `{error}` envelopes, Zod body parsing, OpenAPI helpers,
  rate limiting, redacted logging.
- Risks to watch: do not invent a species/care catalogue; in-memory rate limiting and missing
  `trust proxy` (D11) matter more once data is user-specific; the frontend still uses static data
  (wiring it is frontend work, outside backend scope unless requested); `POST /api/photo-submissions`
  is called by the frontend but not implemented (D12).

## 10. Session 3 outcome: what was implemented and where it differs from the proposals

Implemented (REQ-PL-01..04, provisional): `POST /plants`, `GET /plants`, `GET /plants/:id`,
`PATCH /plants/:id`, the `Plant` model and migration `add_plant`, owner-scoped queries, and the tests listed
in [requirements-traceability.md](requirements-traceability.md#b-plant-management-initial-subset-implemented-in-session-3-not-complete).
**Not implemented:** `DELETE /plants/:id` (PM-6 unapproved), PM-1 plant limit, PM-2..PM-5, PM-7, PM-8.

Differences from the proposals in sections 3 to 6:

| Topic | Proposal | Implemented |
|---|---|---|
| Foreign key to `User` | `ON DELETE CASCADE` | **`ON DELETE RESTRICT`**: a user owning plants cannot be deleted until an account-deletion and retention policy (D7) is approved |
| Optional text fields | not specified | trimmed; empty string invalid; `null` means "no value" and clears on update (limits: species 120, location 80, notes 1000) |
| Non-UUID `:id` | 404 | 404 with the same body as a missing plant |
| Update | "`PATCH` requires at least one field" | same; an empty object returns 422 |
| Test 8 (delete) / 13 (plant limit) | planned | not applicable: no delete route and no limit; a test asserts `DELETE` returns 404 and the row stays |
| Test 12 (OpenAPI) | five operations | four operations; a test asserts exactly these and no delete |

Test counts and evidence: see the [handoff](session-01-handoff.md). Everything in this document that is not
listed above remains a proposal or a pending decision.
