# P3-4 — Menu and tenant-management queries

Status (29 Aug 2026): **IMPLEMENTATION COMPLETE — review/release pending.**
The management slice is integrated with merged PR #64 and the final payment,
import and translation-override slice on the consolidated P3 close-out branch.

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

- Full close-out backend: **222 suites / 3,661 tests pass**.
- ESLint has zero errors within the existing warning cap; TypeScript/Nest and
  frontend production builds pass.
- Production dependency audit and all 26 database-safety policy tests pass.

These are mocked Prisma contract tests, not live PostgreSQL race tests or
proof of RLS enforcement. Database-backed e2e/migration checks and the full
cross-app CI remain for CI; they were not run against any existing database.
No database was connected, seeded, reset or modified for this slice.

## P3-4 close-out

The final slice carries the authorized restaurant into payment settlement and
reporting, cash-request mutation, menu import and translation-override queries.
Provider callbacks, idempotency keys and public/token/account/admin paths retain
their deliberately separate contracts. RLS remains deferred as described in
the operational query evidence; no database role or pooling behavior changed.

No implementation work remains inside P3-4. Review/CI and the batched release
remain, and an open close-out PR must not be described as merged or deployed.

Reference: [Prisma 6 query API](https://www.prisma.io/docs/orm/v6/reference/prisma-client-reference).
The existing client accepts a unique ID alongside non-unique and relation
filters; no compound index or schema migration is required for this syntax.
