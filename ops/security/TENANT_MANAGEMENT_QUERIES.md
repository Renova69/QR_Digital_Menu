# P3-4 — Menu and tenant-management queries

Status (28 Aug 2026): **management slice implemented; review/CI pending.
P3-4 remains PARTIAL.** This branch starts independently from main at
`32fdc9e6` (PR #63), not from the open PR #64. PR #64 covers orders,
assistance and feedback; this slice does not replace it.

No deployment, migrations, schema/role changes, RLS activation, credentials,
dependency changes or live database access. Backend deployment remains batched.

## Boundary and preserved permissions

The existing P3-3 guards remain the HTTP authorization boundary. This change
also puts tenant and management conditions into the reviewed Prisma reads,
writes and nested connections, instead of relying only on an earlier lookup.
It adds no routes or authorization framework.

`restaurantManagementWhere` means actual ownership OR a matching assigned
MANAGER. It is deliberately narrower than the any-assigned-account rule used
by operational endpoints. Effective JWT role checks remain in the guards;
the database role never replaces the effective role. There is no new
SUPER_ADMIN bypass. Missing/empty actor identifiers are rejected before Prisma
can omit an undefined predicate.

| Area                               | Query constraint                                                                                                                                                                     | Preserved behavior                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Menu categories, items and options | Membership on management reads; captured tenant plus current owner/manager and active/non-deleted restaurant on final writes. Child/print-station connections also carry the tenant. | Existing feature, pricing, choice JSON, image and translation behavior; public menu paths unchanged.                                  |
| Bulk item edits                    | Selected restaurant on the bulk lookup and the delegated `updateItem` lookup; the captured tenant remains on final writes.                                                           | Partial per-item results; an owner of two restaurants cannot use one restaurant's bulk operation for the other.                       |
| Tables/service points              | Current management access on reads; captured tenant and active/non-deleted restaurant on mutation; scoped restaurant/zone connections at creation.                                   | Existing name, service-point, QR, feature and open-session checks. Explicit zone removal still disconnects.                           |
| Zones                              | Captured tenant plus current owner/manager on writes and reorder. Removal constrains moved tables and deletion, including the fallback zone's tenant, in the existing transaction.   | Existing last/default-zone rules and read-access policy. No new restaurant-status restriction.                                        |
| Restaurant settings/logo           | ID plus current owner/manager and non-deleted restaurant on read/write.                                                                                                              | Existing non-billing settings policy; billing paths are not changed.                                                                  |
| Restaurant removal                 | ID plus actual owner and non-deleted restaurant on lookup and final write.                                                                                                           | Existing soft deletion and device eviction; no hard deletion added.                                                                   |
| Existing staff targets             | ID plus selected restaurant and the target role read before mutation.                                                                                                                | Existing actor guards, target-role restrictions, PIN/password exclusivity, audit and session revocation. Staff creation is unchanged. |

Staff role matching is intentional: a stale PIN reset or management request
must not mutate a target that moved tenant or changed role while the request
was preparing its write. Staff actor authorization still comes from the
existing guard; this slice does not add a current-actor relation check to
those service signatures.

## Missing rows and transactions

`scopedWrite` maps only Prisma's `P2025` missing-row/connection error to a
non-disclosing 404. Other database errors propagate unchanged. It is not a
fallback that retries without tenant constraints.

- Reorder uses scoped `update` operations in a transaction, not `updateMany`
  calls that can match zero rows and still report success.
- Menu-item related-link cleanup and item deletion now share one transaction.
  A scoped miss rejects the transaction before storage cleanup.
- Zone reassignment/deletion and staff mutation/audit/revocation keep their
  transaction boundaries. Missing scoped writes do not emit success events,
  evict sessions or return a newly generated PIN.
- Optional print-station/zone connections preserve the distinction between
  omitted fields and an explicit `null` disconnect.

These are query-level constraints, not a claim that the whole HTTP request
holds an immutable authorization snapshot. Unchanged multi-step business
workflows and background translation work are not newly serialized.

## Verification

Regression coverage checks exact Prisma predicate/connection shapes, bulk
tenant propagation, owner/manager rules, target-role matching, missing-row
handling, reorder rejection, and absence of side effects after a rejected
write. Existing HTTP authorization tests still exercise the real guards,
controllers, validation and bulk-edit service with substituted I/O.

Local verification on this branch:

- Backend: **216 suites / 3,595 tests pass**, including 50 new regression cases.
  Coverage: 88.63% statements, 76.38% branches, 88.73% functions, 89.93% lines.
- ESLint: **0 errors / 496 warnings**, within the unchanged 640-warning cap.
- TypeScript `--noEmit --incremental false` and Nest build pass.
- Gitleaks 8.28.0 with CI's directory-scan flags: no leaks; repository scanner
  tests: 14/14; static migration-SQL safety check passes.

These are mocked Prisma contract tests, not live PostgreSQL race tests or
proof of RLS enforcement. Database-backed e2e/migration checks and the full
cross-app CI remain for CI; they were not run against any existing database.
No database was connected, seeded, reset or modified for this slice.

## Remaining P3-4 work

1. Review/merge PR #64 and this independent management slice; do not count an
   open PR as merged or deployed.
2. Review payment/session transaction scoping separately, preserving provider
   callbacks, settlement and idempotency contracts.
3. Complete the repository query inventory, including remaining import,
   translation-override and other service-specific paths; either constrain
   each relevant query or document its deliberate public/account/admin/token
   contract. The six service modules above are not the whole repository.
4. Carry the RLS evaluation from PR #64 into close-out. This PR neither enables
   RLS nor changes pooling or database roles. Any infrastructure adoption is a
   separate reviewed task, not an implied part of this code change.

Reference: [Prisma 6 query API](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference).
The existing client accepts a unique ID alongside non-unique and relation
filters; no compound index or schema migration is required for this syntax.
