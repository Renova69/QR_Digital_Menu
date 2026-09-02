# P3 security close-out

**Status (2 Sep 2026): COMPLETE. PR #68 merged the close-out with green CI, and
the production image for `445afc6d` contains P3-4 through P3-10. Remaining
P3-1/P3-6 manual checks are release evidence, not open engineering scope.**

This document closes the engineering scope in P3-4 through P3-10 and records
the subsequent merge and production rollout.

## P3-4 — tenant query scoping

PR #64 merged the operational order, assistance and feedback slice; PR #65
merged the management slice; PR #68 finished payment/session, cash-request,
menu-import and translation-override queries. The authorized restaurant is
carried into the authoritative Prisma operation while existing role, provider
callback, token, idempotency and transaction contracts remain intact.

Public, account-owned, admin-only, provider-callback and opaque-token routes are
separate authorization models, not unscoped management queries. RLS was
evaluated and is not enabled: any future adoption needs a non-bypass runtime
role and transaction-local tenant context compatible with pooled connections.

Detailed evidence:

- [Operational query scope](./TENANT_QUERY_SCOPING.md)
- [Management query scope](./TENANT_MANAGEMENT_QUERIES.md)

## P3-5 — provider circuit breakers

DeepL, Stripe and R2 share one per-process circuit implementation. Five counted
dependency failures open the circuit for 60 seconds; one caller owns the half-
open probe. Abort/request-budget failures do not count, reachable 4xx responses
other than 429 reset the failure count, and no retry is introduced. Transitions
are observable in Sentry without URLs, payloads, tenant identifiers or secrets.

## P3-6 — step-up authentication

Every non-GET `SuperAdminController` route, staff PIN reset, and device
enrolment/revocation requires a durable PASSWORD, GOOGLE or OTP session created
within the previous five minutes. PIN, impersonation, legacy, revoked and
expired sessions cannot satisfy the guard. Re-authentication currently means a
normal strong sign-in, which creates a fresh durable session.

Coverage tests fail if a new super-admin mutation or listed credential mutation
omits the guard. Real HTTP tests also pin guard ordering: unauthenticated callers
still receive 401 before step-up evaluates. The only payout endpoint is a GET
snapshot; there is no payout mutation in this codebase to protect.

## P3-7 — PIN login hours

Restaurants may optionally configure start/end `HH:mm` values interpreted in
their IANA timezone. Both NULL preserves unrestricted behavior for every
existing restaurant. Start is inclusive, end is exclusive, overnight windows
are supported, and malformed/partial persisted state fails closed. The check
runs before enrolled-device lookup and PIN hashing.

The dashboard exposes the setting and local timezone. The additive migration
has no backfill and was not applied to any database during implementation. See
[the rollout evidence](../db-safety/P3_PIN_LOGIN_HOURS_ROLLOUT.md).

## P3-8 — review gate

The repository adopts the audit's allowed self-review alternative because a
one-approval rule would deadlock a single-maintainer repository. CI requires all
five PR checklist assertions: full-diff review, tests, security/tenant review,
no destructive data behavior, and rollout/recovery notes.

## P3-9 — dependency updates

GitHub's repository API reported Dependabot security fixes enabled and unpaused
on 29 Aug 2026. No `dependabot.yml` is needed for that native security-update
mode; adding one would separately schedule routine version-update PRs.

CI runs a production dependency audit. The committed baseline contains six
reviewed high advisory IDs; critical findings or any new high advisory fail the
gate. The local close-out audit passed with no critical or new high finding.

## P3-10 — static API documentation

The Docusaurus site publishes a generated OpenAPI JSON artifact and API
changelog. The backend build uses Nest's Swagger compile-time plugin, then loads
that metadata into the same compiled DTO classes used by `AppModule`; inherited
and nested DTO properties therefore survive generation. CI regenerates the
artifact, rejects drift, and rejects empty DTO schemas. Production Swagger UI
remains disabled, so documentation does not expose a new backend discovery
route.

## Verification snapshot

- Backend: 222 suites / 3,661 tests pass.
- Frontend: 143 files / 1,050 tests pass.
- Backend and frontend production builds pass with zero type errors.
- Lint: zero errors within the existing warning caps.
- Production dependency audit: pass; no critical or new high advisory.
- Database-safety policy: 26/26 tests pass; migration chain remains
  forward-only.

PR #68 and its post-merge CI passed. The batch is present in the production
image for `445afc6d`; the current configuration-only revision serves that image
with readiness 200. PIN-login hours were manually verified after the follow-up
fixes in PRs #70/#71. The unfinished release evidence is the P3-1
revocation/socket/legacy matrix and the P3-6 step-up matrix.
