# P3-1 — Durable login sessions

Implementation/review/merge: complete via PR #57. Backend deployment checkpoint:
28 Aug 2026, commit `e75007853d333186cdbc76db1dd20551b2b6e2ad`.
Manual release verification: still pending; deployment alone does not prove the
two-browser and live-socket product checks below.

## Verified deployment checkpoint — 28 Aug 2026

- Revision `qr-menu-backend-00206-tuq` received 100% traffic; readiness returned
  200 and the Redis adapter was confirmed.
- Pre-migration backup `db-backup-ksbkk` completed with a verified archive and
  manifest: `gs://qr-menu-db-backups-469216/2026/08/qr-menu-db-2026-08-28T06-54-34Z.bak`.
- `20260827160000_add_user_sessions` applied at `2026-08-28T06:55:05.925Z`.
  All 66 migrations are successfully applied; schema diff was empty. Older
  rolled-back attempts remain in the ledger and were not erased.
- Persisted legacy JWT cutoff: `2026-08-29T06:55:05.715Z`; no ad hoc extension.
- Application counts before/after were unchanged: 25 users, 16 restaurants,
  2,657 orders, 1,027 menu items, 70 tables, 1,658 menu views, 84 payments.
  The backup role could read both new session tables.
- Historical checksum discrepancies were separately identified. No historical
  migration files or ledger entries were changed; reconciliation is separate
  from P3-2 and must not use resets or overwrite existing data.

## Contract

- Every password, registration, Google, OTP, PIN, and impersonation login records
  a `UserSession` before returning its JWT. The row stores an opaque id, the
  account session version, method, bounded IP/user-agent display metadata, and
  lifecycle timestamps. It never stores the JWT or login credentials.
- Lifetime remains 24 hours for dashboard/customer logins, 12 hours for PIN,
  and at most the existing one-hour impersonation JWT lifetime. Existing device
  and impersonation validity checks still apply independently.
- `GET /api/v1/auth/sessions?cursor=<uuid>` returns up to 50 unrevoked,
  unexpired records for the authenticated user's current version, plus a
  continuation cursor. Device/browser labels are descriptive, not proof of
  device identity. Separate device/restaurant/impersonation controls can still
  deny access to an otherwise unexpired record.
- `DELETE /api/v1/auth/sessions/:sessionId` revokes only a row owned by the
  caller. `DELETE /api/v1/auth/sessions` increments the account version and
  marks its rows revoked in one transaction. The timestamp-based legacy
  revocation check is retained too.
- Ordinary logout revokes its signed cookie's durable row and clears the
  cookie. Invalid/expired cookies can still be cleared. A persistence error
  propagates to error reporting; it is not reported as successful revocation.
  Offline/local logout cannot guarantee server-side revocation.
- Mandatory HTTP auth, optional HTTP auth, and WebSocket handshakes share the
  same session checks. Cluster-visible sockets are evicted by session/user id;
  in-flight handshakes participate in eviction before gaining room access.
  Authenticated sockets disconnect at their JWT expiry too, so expired sessions
  cannot disappear from inventory while retaining a live event feed.
  Redis eviction failures reach Sentry. Already-running HTTP requests are not
  cancelled; a Redis outage can delay socket disconnection even though new
  HTTP requests and reconnections are rejected.
- Global signout does not revoke device enrolment or print-agent credentials.
  A trusted tablet can log in again with a correct PIN. No token refresh flow,
  credential TTL change, or automatic deletion of session history is added.

## Migration evidence and compatibility

Migration: `20260827160000_add_user_sessions`.

- **Phase:** expand plus bounded legacy compatibility. No destructive contract.
- **Old app + new schema:** schema-compatible; old code ignores the new column
  and tables. It cannot enforce per-session revocation, so schema-compatible
  rollback is not equivalent to retaining the new security guarantee.
- **New app + old schema:** unsupported; migrate before starting the new revision.
- **Affected rows / locks:** add `app_user.sessionVersion` with default zero;
  create empty `user_session` and `auth_session_rollout` tables/indexes; insert
  one rollout row. No application rows are deleted or explicitly rewritten.
  ALTER TABLE briefly requires an exclusive lock. One transaction, five-second
  lock acquisition timeout, 30-second statement timeout; abort rather than wait
  indefinitely under traffic.
- **Backfill/resumability:** old JWTs cannot be inventoried retrospectively.
  No fabricated session records. The persisted deadline is migration time plus
  24 hours, not first login or a hardcoded calendar date. The migration is
  atomic; failed-ledger recovery follows `MIGRATION_POLICY.md`, never ledger
  deletion or a reset.
- **Legacy bridge:** until that deadline, claimless old JWTs are accepted only
  for an account still at session version zero and subject to existing checks.
  Global signout/password or access changes can invalidate them earlier. At
  the deadline, old tokens require a fresh login even if their own JWT expiry
  is later. This is a bounded compatibility window, not a promised full 24
  hours for tokens minted by the old revision after migration.
- **Pre-migration invariants:** normal deployment backup, target/ledger/schema
  integrity, database-loss guards, and green exact-SHA CI.
- **Post-migration invariants:** all 66 migrations applied; Prisma schema diff
  empty; rollout row id 1 has a real deadline; a login writes its session row;
  copied revoked cookies fail mandatory and optional authentication.
- **Forward recovery:** retain all new structures/data and ship a forward code
  fix or separately reviewed additive migration. No down SQL, reset, truncate,
  broad delete, or restore-over-current-data procedure.
- **Application rollback safe until:** the expanded schema remains compatible,
  but an old revision loses per-session enforcement and can accept previously
  revoked individual JWTs. Treat rollback as a security decision; prefer a
  forward fix. Do not silently move traffic back after advertising revocation.
- **Staging:** the approved no-real-client development exception still applies.
  The existing exact-SHA staging gate becomes required before real traffic.

## Deployment order and release checks

1. Merge only after review and green CI. Deploy only from clean, updated `main`
   using the guarded script and the approved development/staging mode.
2. Backend migration, canary, and **100% traffic on the new backend** first.
   Verify the serving SHA and Redis adapter. Old revisions ignore session ids;
   do not claim individual revocation during mixed-version traffic.
3. Frontend session controls next. If Vercel deploys first, the inventory can
   show a retryable load error until backend rollout; existing login continues.
4. Test two separate browser sessions: inventory/current marker, revoke the
   other one, copied-cookie HTTP rejection, and live-socket disconnection.
5. Test signout everywhere, fresh login afterwards, cross-account isolation,
   PIN login without lost enrolment, and existing impersonation expiry/exit.
6. Confirm old sessions show the legacy notice and can be globally revoked.
   Check the persisted deadline; do not move it ad hoc to keep old JWTs alive.
7. Mark release verified only after those checks on the actual serving revision.

## Automated evidence

- Full backend and frontend unit suites, types, builds, lint caps, and locale
  interpolation parity checked locally.
- Full migration chain applied to a newly created local PostgreSQL 17 database;
  Prisma schema parity verified. No remote database was used.
- `test/auth-sessions.e2e-spec.ts` exercises password issuance, inventory
  allowlisting, owned revocation, copied-cookie logout, global-version races,
  fresh login, cursor pagination, and mandatory/optional rejection against
  PostgreSQL. It refuses remote or mismatched database URLs.
- Unit tests pin expired/missing sessions, exact legacy cutoff, malformed claims,
  same-second password-change login, socket handshake/revocation races, error
  propagation, account-scoped UI caching, pagination, and legacy global logout.
