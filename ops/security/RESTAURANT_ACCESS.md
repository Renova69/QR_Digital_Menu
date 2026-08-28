# P3-3 — Declarative restaurant access

Status: **PARTIAL — 64 routes merged via PR #59 (`6a76bba4`), #60
(`6f472e53`) and #61 (`d6c5b2ef`), all with green PR and post-merge CI.
Fourth slice adds 27 tables/zones/reservations routes for review (91 total).
Two planned slices remain afterward. Batch release pending.**
This is not completion of the repository-wide migration. No schema, migration,
credential, dependency, or frontend change is involved.

## First slice

`RequireRestaurantAccess` composes `JwtAuthGuard` followed by
`RestaurantAccessGuard`. `AuthorizedRestaurant` supplies the verified restaurant,
effective actor role/id, and tier to the handler. The context is immutable,
request-local, and held in a WeakMap; request bodies/headers cannot populate it.
A missing policy or missing guard context fails closed.

The 22 routes in this slice replace controller-local checks:

| Controller                      | Routes | Preserved access contract                                                                                             |
| ------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------- |
| DashboardController             |      6 | Actual owner or assigned effective MANAGER; reject suspended/deleted restaurants                                      |
| PrintStationController          |     10 | Effective OWNER and actual ownership; active/non-deleted restaurant; existing thermal-printer feature gate            |
| StaffController                 |      5 | Effective OWNER/MANAGER plus ownership or assignment; downstream staff-role restrictions and actor auditing unchanged |
| MenuViewController.getScanStats |      1 | Actual owner or assigned STAFF/MANAGER/WAITER/KITCHEN; no paid-tier gate                                              |

There is no new SUPER_ADMIN bypass. A feature-entitlement bypass is not tenant
authorization. Staff recovery and historical scan reporting retain their existing
restaurant-status behavior; this change does not add a suspension/deletion gate
to those routes. Public view recording remains anonymous.

The principal is the result of JwtStrategy's session/account checks and
subscription-driven role demotion. Never reload the raw database role to replace
it: that would turn an effective STAFF back into a MANAGER.

## Tenant selection and ordering

- Each declaration names exactly one source and key: `params`, `query`, or
  the existing `body.restaurantId` contract on reservation action/internal edits.
  Conflicting values in another location cannot change the authorized tenant.
- Menu declarations additionally require an explicit `resource` and `params`
  source. Table/zone management similarly declares `restaurant` or its matching
  child resource. Missing/unknown kinds, query-based child targets and mismatched
  policy/resource combinations fail closed in runtime and CI.
- Guards execute before validation pipes. Non-string, array, object, empty,
  whitespace-padded, and overlong ids fail with 400 before Prisma.
  Suspended dashboard/printer requests retain `RESTAURANT_SUSPENDED` for the
  frontend's localized error handling.
- Only an **omitted** printer-management query permits the existing owner
  fallback: first owned, non-deleted restaurant ordered by creation time.
  An explicit invalid/missing/foreign id never falls back. Empty-string input
  now returns 400 instead of silently selecting an owner's default restaurant.
- FeatureGuard runs afterward and uses the verified restaurant id, including
  the fallback. It cannot authorize one tenant and apply another tenant's tier.
  It refreshes the context's tier from that same feature check, so analytics
  cannot reuse an earlier premium tier after a downgrade observed during the request.
- Swagger parameter metadata remains declared even though handlers now consume
  the authorized context rather than independently binding restaurant ids.

Example (decorators execute bottom-up):

```ts
@UseGuards(FeatureGuard)
@RequireRestaurantAccess({
  policy: 'dashboard', source: 'query', key: 'restaurantId',
})
@RequireFeature(FeatureFlag.ANALYTICS_BASIC)
@Get('summary')
getSummary(@AuthorizedRestaurant() access: RestaurantAccessContext) {
  return this.dashboardService.getSummary(access.restaurantId);
}
```

## Second slice: menu editing

The `menu-management` policy permits the actual owner or an assigned **effective
MANAGER**, and rejects suspended/soft-deleted restaurants with the existing
`RESTAURANT_SUSPENDED` code. No new subscription feature gate is added.

| Controller                 | Routes | Authoritative target                                 |
| -------------------------- | -----: | ---------------------------------------------------- |
| CategoryController         |      3 | `params.restaurantId` is the restaurant              |
| CategoryDetailController   |      3 | `params.id` -> category.restaurantId                 |
| ItemController             |      3 | `params.categoryId` -> category.restaurantId         |
| ItemDetailController       |      5 | `params.id` -> item.category.restaurantId            |
| MenuOptionController       |      1 | `params.itemId` -> item.category.restaurantId        |
| MenuOptionDetailController |      2 | `params.id` -> option.menuItem.category.restaurantId |
| BulkItemController         |      2 | `params.id` is the restaurant                        |

The shared guard uses minimal relationship selects, then authorizes the resolved
restaurant. Bodies, query parameters and a user's default restaurant cannot
replace that relationship. Direct targets add one guard restaurant lookup;
child targets add a resource lookup plus a restaurant lookup. The existing
service checks remain intentionally; P3-4 is the separate write-scoping work.

**Intentional hardening:** the legacy menu helper reloads the raw user role.
The guard now prevents a subscription-demoted MANAGER (effective STAFF) from
regaining editing access through that helper. An actual owner and an assigned
effective MANAGER retain access. There is no blanket SUPER_ADMIN bypass.

Guards run before `FileInterceptor`, so unauthorized uploads do not reach Multer
buffering, image processing or storage. Authorized uploads retain their existing
throttle, 5MB limit, second service ownership check, server-derived R2 namespace
and orphan cleanup. Bulk/reorder/translation service checks remain unchanged,
including per-item bulk checks when one owner owns multiple restaurants.

Public QR/menu routes and the JWT-only menu-index hint are untouched. The audit
report and dashboard imports follow in the third slice below, with their own
policies rather than borrowing menu editing's owner/manager contract.

## Third slice: tenant management

All 23 declarations use the explicit path restaurant id (`id` or `restaurantId`).
They extend the shared guard, with no parallel ownership implementation in each
controller. Existing service/child checks remain, including the token lookup
scoped by both token id and restaurant id during device revocation.

| Policy                | Routes | Access                                     | Existing status contract                                   |
| --------------------- | -----: | ------------------------------------------ | ---------------------------------------------------------- |
| restaurant-read       |      1 | Actual owner or any assigned account       | Hide deleted; no new suspension gate                       |
| restaurant-management |      6 | Actual owner or assigned effective MANAGER | Hide deleted; existing feature guards remain where present |
| restaurant-owner      |      7 | Actual owner only                          | Hide deleted; existing Stripe feature guards remain        |
| device-management     |      4 | Actual owner or assigned effective MANAGER | Existing POS feature guard enforces suspension/entitlement |
| menu-import           |      4 | Actual owner only                          | No new suspension/deletion gate                            |
| menu-audit            |      1 | Actual owner or any assigned account       | No new suspension/deletion gate                            |

The management operations cover settings, logos, translation enqueue/status and
slug commit (QR preparation). Deletion, Stripe connect/status/disconnect, slug
rename/release/aliases and dashboard import/key/export stay owner-only. Slug
release still requires server-validated `CONFIRM`; device revocation still
increments session version and evicts the socket.

**Intentional hardening and ordering:** as in menu editing, effective STAFF
cannot regain MANAGER rights through a downstream raw-role lookup. JWT runs
once per migrated request, then tenancy, then any FeatureGuard, then the handler
and interceptors. Unauthorized or unentitled logo uploads never reach Multer.
Unknown restaurants now stop with 404 at access authorization, before a feature
guard can misclassify the missing target as a plan failure. Authorized logo
uploads retain their throttle, 5MB cap and second service ownership check.

This migration does not standardize status policy. Import/audit have no existing
status gate, and device management relies on the existing feature guard rather
than independently filtering deleted rows. Tests explicitly cover suspended
restaurants and inconsistent active+deleted rows. Any change to those contracts
is separate from this authorization-placement work.

Different authentication remains explicit in the inventory: restaurant create
and list are JWT account operations; slug availability is JWT-only advisory
over a public namespace; OCR imports retain the tenant-bound hashed API-key
guard; device verify/status retain enrollment-token validation and atomic
single-use enrollment. None receives a new dashboard JWT requirement.

## Fourth slice: tables, zones and reservations

These are **27 existing routes**, not new APIs or workflows. Controller arguments,
response shapes and service checks are unchanged. The guard moves rejection ahead
of dispatch and feature checks; action permissions share one small role map with
the reservation service so effective STAFF cannot regain raw MANAGER privileges.

| Policy                 | Routes | Access beyond the actual owner                    | Existing status contract                                             |
| ---------------------- | -----: | ------------------------------------------------- | -------------------------------------------------------------------- |
| table-read             |      4 | Any assigned account; global SUPER_ADMIN          | Reject inactive/deleted except admin                                 |
| table-management       |      6 | Assigned effective MANAGER                        | Reject inactive/deleted                                              |
| zone-read              |      1 | Any assigned account; global SUPER_ADMIN          | No new status gate                                                   |
| zone-management        |      4 | Assigned effective MANAGER                        | No new status gate                                                   |
| reservation-management |      8 | Assigned effective MANAGER; global SUPER_ADMIN    | Reject inactive except admin; existing feature/service checks remain |
| reservation-read       |      1 | Assigned MANAGER/WAITER/STAFF; global SUPER_ADMIN | Same reservation contract                                            |
| reservation-operations |      2 | Assigned MANAGER/WAITER; global SUPER_ADMIN       | Same reservation contract                                            |
| reservation-action     |      1 | Action-specific assigned role; global SUPER_ADMIN | Same reservation contract                                            |

Reservation actions retain their existing matrix: MANAGER may accept, decline or
cancel; MANAGER/WAITER may mark no-show; MANAGER/WAITER/STAFF may mark arrived.
Actual owners and effective SUPER_ADMIN retain their existing action access.
KITCHEN does not gain access to guest reservation data. Admin exceptions apply
only to the named existing read/reservation policies, not table/zone editing or
previously migrated owner-only routes.

Table/zone edits resolve the resource's restaurant with a minimal relationship
lookup. Table orders retain the declared query restaurant plus the service's
compound table/session filter. Reservation action/internal routes authorize
`body.restaurantId`; their services still check `{ id, restaurantId }` before
writing. An alternate query/body/default tenant cannot replace the declared one.
Malformed body ids and action names fail before Prisma. A missing restaurant
now returns 404 even for an admin/read shortcut that formerly returned no rows.
This does not add a new suspension/deletion rule to zones or reservations.

The class-level reservations feature requirement remains; every method now runs
JWT once, tenancy, then FeatureGuard. Route discovery rejects a future method
without that ordering. Service-point feature gates and anonymous QR resolution
remain unchanged. No database/schema/provider or frontend change is involved.

## Coverage and remaining work

`restaurant-access.coverage.spec.ts` imports every `*.controller.ts` and inspects
actual Nest route/guard metadata. It currently discovers **245 routes**. For
migrated routes it verifies authentication before access and feature checks after
access. Mutation fixtures prove missing policies/guards and wrong ordering fail.

With four slices, **91 routes** use the guard. The other **154 routes** are
frozen, individually named in
`restaurant-access.legacy-routes.ts`. This is an explicit rollout inventory, **not
an authorization assertion or runtime bypass**. It includes public/token routes,
account-only operations, super-admin endpoints, and tenant routes still guarded
inside controllers/services. No wildcard/class-wide exemption is allowed. New
routes require either the declarative guard or a reviewed explanation of their
different authorization. Stale/duplicated entries fail; remove entries as routes
are migrated.

Finite close-out, counted against merged PR #61 plus this fourth slice:

| Slice                                                                                            | Status          | Management routes |
| ------------------------------------------------------------------------------------------------ | --------------- | ----------------: |
| Tables/zones/reservations                                                                        | This review     |                27 |
| Orders (4), assistance (4), feedback (3), loyalty (3), notifications (2)                         | Next            |                16 |
| Payment management (22), subscription status/checkout/portal (3), final inventory classification | Last P3-3 slice |                25 |

After this review, **41 management routes in two slices remain**. The other
**113 routes** have different public/account/admin/token authorization; they are
not 113 more routes to put behind dashboard JWT. The final slice separates their
permanent classifications from the temporary migration inventory. Existing
optional account/default-restaurant contracts must be preserved explicitly.
P3-3 closes when that management inventory is empty and route coverage passes,
not when all 245 endpoints use one guard.

Existing child-resource/service checks remain. This guard is not a substitute for
tenant-constrained queries at the write boundary; that separate work remains P3-4.
It cannot promise a transactional permission snapshot across concurrent updates.

## Verification and release

- Guard tests cover owner/manager/staff/customer/admin matrices, cross-tenant
  denial, effective-role demotion, malformed ids, fallback, status behavior,
  database errors and request-context isolation.
- Local HTTP tests use the real Nest pipeline and FeatureGuard with fake
  authentication/I/O: no AppModule, `.env`, external credentials or live database.
- Menu HTTP tests exercise all 19 editing routes for owner/manager success,
  absent JWT and foreign-tenant denial, plus effective-role demotion, resource
  errors, inactive/deleted targets, unmodified anonymous menu access, real Multer
  ordering/size limits and the real bulk service's cross-restaurant row checks.
- Controller tests retain analytics tier filtering, date validation and service
  dispatch/audit-actor checks. Authorization cases moved to guard/HTTP tests,
  because directly calling a controller does not execute Nest decorators.

First-slice verification: **207 backend suites / 2,984 tests passed**, with coverage
at 88.92% lines and 75.28% branches. Type checking and the Nest/SWC build pass.
All changed files pass lint without warnings; repository lint has zero errors
and 614 existing warnings (down from 640, cap unchanged). Prettier, Gitleaks
8.28.0 with CI's flags, the 14 secret-scanner tests, and migration safety pass.
Clean-install Linux CI and its disposable-database E2E job remain merge gates.

Second-slice verification: **209 backend suites / 3,124 tests passed**, including
101 new menu HTTP cases and 39 resource/policy cases. Coverage is 89.06% lines
and 75.38% branches. Type checking and Nest/SWC build pass. Changed files have
zero lint warnings; repository lint has zero errors / 595 existing warnings
(cap unchanged). Prettier, Gitleaks 8.28.0 with CI's flags, migration safety and
all 14 secret-scanner tests pass.
Clean-install Linux CI and its disposable-database E2E job remain merge gates.

Third-slice verification: **211 backend suites / 3,366 tests passed**, including
214 new HTTP cases and 28 policy cases. Coverage: 89.17% lines / 75.42% branches.
Type checking and Nest/SWC build pass; changed-file lint has zero warnings and
full lint has zero errors / 573 existing warnings (cap unchanged). The tests
exercise real FeatureGuard, ApiKeyGuard and DeviceEnrollmentService against
in-memory I/O, including child-token scope and credential-specific routes.
Prettier, Gitleaks 8.28.0 with CI's exact flags, the migration SQL safety gate
and all 14 secret-scanner tests pass. No scanner exemptions or bypasses.
Clean-install Linux CI remains the merge gate for this slice.

Fourth-slice verification: **212 backend suites / 3,439 tests passed** (73 new:
71 HTTP/metadata cases and two real-service compound booking-scope regressions).
Coverage: 89.40% lines / 75.62% branches. Type checking and Nest/SWC build pass;
full lint has zero errors / 544 warnings (down from 573, cap unchanged).
Gitleaks 8.28.0 with CI's flags, migration SQL safety and all 14 secret-scanner
tests pass. No database or migration was executed. Clean-install Linux CI,
including its disposable-database E2E checks, remains the merge gate.

**Deployment is deliberately batched** at the user's request (28 Aug 2026).
PR #58/P3-2 is merged at `f4ec9a61`, PR #59 at `6a76bba4`, PR #60 at
`6f472e53` and PR #61 at `d6c5b2ef`; these await backend deployment. The last confirmed
backend deployment is P3-1 at `e7500785`. No deploy script or live database command
is part of this implementation. Later, deploy approved merged main once through
the existing backup/safety/canary workflow and run the accumulated release checks.

After that batch deploy, verify owner/manager dashboard access, a denied
cross-restaurant request, printer listing/reactivation, staff PIN reset and public
scan recording using development/demo data. P3-1/P2-10 manual checks remain open.
Also verify menu editing/translations/reordering and image upload as an owner
and assigned manager, cross-restaurant resource denial, bulk editing isolation,
and anonymous access through an already-printed QR.
Also verify settings/device access for the assigned manager; owner-only Stripe,
import-key and slug actions; device revocation/re-enrollment; and continued OCR
API-key, enrollment-token and advisory-slug flows using demo data.
For this slice, verify waiter table/zone reads and reservation arrival, manager
table/zone configuration and booking decisions, denial of cross-restaurant
table/zone edits, and continued service-point QR access. Do not deploy separately.
