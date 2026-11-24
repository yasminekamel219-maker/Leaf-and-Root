# Security review — authentication (session 1 follow-up)

Scope: password hashing, account enumeration, authentication rate limits, cookie/CORS behaviour.
Method: code review plus tests that actually ran (results in the handoff). Sources the review could
**not** use: the original SRS/DFD documents are not in the repository and were **not** reviewed.
OWASP guidance referenced from the Password Storage Cheat Sheet (scrypt minimum configurations).

## 1. Password hashing

| | Before | After |
|---|---|---|
| Algorithm | scrypt, N=2^14, r=8, p=1 | scrypt, **N=2^16, r=8, p=2** |
| OWASP position | Below the cheat sheet's minimum equivalents (e.g. N=2^14 needs p=5) | One of the listed equivalent-strength settings |
| Measured cost (this Windows dev machine, one hash) | ~33 ms | ~255 ms, ~64 MiB |

Remediation implemented without breaking existing accounts:

- Hashes are self-describing (`scrypt$N$r$p$salt$key`). Verification now uses the parameters stored in
  the hash, so every existing account keeps working.
- `needsRehash()` flags weaker hashes; on the next **successful** login the hash is re-created with the
  current parameters (the plaintext is only available at that moment). No bulk migration, no forced reset.
- Stored parameters are bounded (N ≤ 2^17, r ≤ 16, p ≤ 16, ≤ 256 MiB, N a power of two) so a corrupt or
  hostile row cannot exhaust memory. Covered by a unit test.

Remaining risks / decisions (still **D10**):

- argon2id is OWASP's first choice; it needs a native dependency and a deployment decision, so it is deferred.
- Memory: ~64 MiB per in-flight hash. Node's thread pool runs 4 at a time, so ~256 MiB worst case
  under concurrent logins; size the host accordingly (**D11**). The rate limits below bound the abuse case.
- Not load-tested.

## 2. Account enumeration

| Surface | Status |
|---|---|
| Login: unknown email vs wrong password | Same 401 body and message. A dummy hash equalises work for unknown emails. |
| Login timing for **legacy** hashes | Found during review: after the parameter upgrade, a wrong password on an old (cheaper) hash would answer faster than an unknown email. Fixed by padding to equal work. Timing was **not** statistically measured beyond this reasoning. |
| Register: existing email | **Still reveals** the email (409 `EMAIL_IN_USE`). Unchanged by design: without email delivery (D1/D2) a generic response cannot tell the user what happened. Mitigated, not removed, by the rate limits. Decision **D9** stays open. |
| Register response time (existing vs new) | Existing emails return before hashing; this is moot while the 409 is explicit. |

## 3. Authentication rate limits

Finding: the previous limiter keyed on `email|ip` only, so one client could rotate emails and never
reach a limit (credential stuffing). A background security review flagged the same weakness.

Now, per handler (register and login), each over 15 minutes:

| Window | Key | Default | Purpose |
|---|---|---|---|
| `authIp` | client IP | 20 (`AUTH_RATE_LIMIT_IP`) | Caps stuffing from one client regardless of emails |
| `authPair` | email + IP | 5 | Caps hammering one account from one client |
| `authAccount` | email (all IPs) | 30 (`AUTH_RATE_LIMIT_ACCOUNT`) | Caps distributed guessing |

Trade-offs: the per-account window allows a determined attacker to lock a victim out of logging in
for part of a window (30 attempts needed); it is set well above the pair limit. Many users behind one
NAT share the IP window. Counters are in memory, per process, and reset on restart; multiple API
instances would each keep their own counts (needs a shared store — **D11**). Behind a reverse proxy,
`trust proxy` must be configured or every client appears as the proxy IP (**D11**).

Also fixed: a cookie with invalid percent-encoding made `/auth/me` and `/auth/logout` answer 500; they
now answer 401 and 204.

## 3b. Local development exposure (found during the documentation audit)

- `compose.yaml` publishes PostgreSQL as `"5434:5432"` without a host-address prefix, which by default
  listens on all network interfaces, and uses a simple local-only password. On a shared network that
  exposes the development database. Safer: `"127.0.0.1:5434:5432"`. **Not changed** (outside this
  documentation task); reachability from another machine was not tested.
- The Vite dev server listens on `0.0.0.0` unless `FIGMA_DEV_SERVER_HOST` is set (its startup log prints
  network URLs). That is intended for Figma Make but also exposes the dev app, and through its `/api`
  proxy the dev API, to the local network.

## 4. Cookie / CORS / browser behaviour (observed in a real browser)

See the handoff for the exact run. Summary: session cookie is `HttpOnly` (not visible to
`document.cookie`), `SameSite=Lax`; CORS is off unless `CORS_ALLOWED_ORIGINS` lists an origin; a
non-allowlisted origin gets no `Access-Control-Allow-Origin`; cross-site writes are rejected by the
Fetch-Metadata CSRF check (403) unless the origin is allowlisted.
`Secure` is only set when `NODE_ENV=production`, which was not exercised over HTTPS here.
