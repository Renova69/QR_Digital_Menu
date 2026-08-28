# P3-3 — Declarative restaurant access

Status: **IMPLEMENTATION COMPLETE; final 41 routes in review in one combined PR.
91 routes merged through PR #62 (`16d21007`), with green PR and post-merge CI.
The last two slices add 16 service-management and 25 payment/subscription routes:
132 guarded management routes; zero temporary migration entries remain.
Merge/CI approval and the deliberately batched backend release are still pending.**
No schema, migration, database, credential, dependency or frontend change is involved.

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
  existing `body.restaurantId` contracts, or the fixed session-token header on
  POS pending-payment reconciliation.
  Conflicting values in another location cannot change the authorized tenant.
- Menu declarations additionally require an explicit `resource` and `params`
  source. Table/zone management similarly declares `restaurant` or its matching
  child resource. Missing/unknown kinds, query-based child targets and mismatched
  policy/resource combinations fail closed in runtime and CI.
- Guards execute before validation pipes. Non-string, array, object, empty,
  whitespace-padded, and overlong ids fail with 400 before Prisma.
  Suspended dashboard/printer requests retain `RESTAURANT_SUSPENDED` for the
  frontend's localized error handling.
- An **omitted** printer-management query selects the first owned, non-deleted
  restaurant ordered by creation time. Billing has its separate existing
  assignment/first-owned fallback; optional service lists stay account-scoped.
  See the final slices below. An explicit invalid/missing/foreign id never
  selects a different default. Empty-string input returns 400.
- Session credentials remain in `X-Table-Session-Token`, never path/query ids.
  The access guard and parameter decorator share the same bounded extractor;
  the resolved context contains the restaurant id, never the credential.
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

## Fifth slice: service management (16 routes)

| Policy                  | Routes | Preserved contract                                                                                         |
| ----------------------- | -----: | ---------------------------------------------------------------------------------------------------------- |
| service-list            |      2 | Optional order/assistance restaurant filter; explicit targets require ownership or assignment              |
| service-member          |      8 | Actual owner or any assigned account; assistance/order/feedback child targets resolve their own restaurant |
| order-update            |      1 | Same membership; CANCELED additionally requires effective OWNER/MANAGER                                    |
| loyalty-management      |      3 | Actual owner only, with the existing loyalty feature gate                                                  |
| notification-management |      2 | Effective OWNER/MANAGER plus actual ownership or assignment                                                |

An omitted list filter still means the account's existing owned/assigned scope.
It does not select the first restaurant or invent a single-tenant context.
The services retain their ownership/assignment filters; FeatureGuard ignores
undeclared body targets and retains its assigned-restaurant fallback. An owner
without an assigned restaurant still needs an explicit target for order-list
entitlements. Explicit foreign targets are now rejected before dispatch rather
than sometimes returning an empty filtered list.

There is no new global admin grant, suspension or deletion policy. Existing
order/loyalty feature checks remain. The guard prevents a raw database MANAGER
role from reviving cancellation or delivery-management access after JWT demotion.
Bulk orders still validate every order against the declared restaurant and status;
notification retry still matches both delivery and restaurant and retains its
failure/uncertainty/CAS checks. No business service or write logic changed.

## Sixth slice: payment and billing (25 routes)

| Policy             | Routes | Access beyond actual ownership                                |
| ------------------ | -----: | ------------------------------------------------------------- |
| payment-pos        |      6 | Assigned effective MANAGER/WAITER, or global SUPER_ADMIN      |
| payment-management |     11 | Assigned effective OWNER/MANAGER, or existing admin exception |
| payment-staff      |      3 | Any assigned account, or global SUPER_ADMIN                   |
| payment-cash       |      2 | Assigned OWNER/MANAGER/WAITER/STAFF, or global SUPER_ADMIN    |
| billing-status     |      1 | Any assigned account or global SUPER_ADMIN                    |
| billing-owner      |      2 | Effective OWNER and actual ownership only                     |

STAFF may collect cash but cannot force/close a table session. KITCHEN may read
the existing cash/feed views but cannot confirm/cancel cash requests. The guard
uses the effective JWT role; a raw MANAGER cannot restore demoted permissions.

Payment policies retain suspension/deletion rejection with the existing admin
exceptions. Reporting/refunds preserve PaymentCore's unusual owner-first ordering:
an admin who actually owns that restaurant does not bypass its status check.
Billing status/checkout/portal retain recovery access without adding a paid-plan,
suspension or deletion gate; checkout/portal still recheck actual ownership in
SubscriptionService before provider work.

Payment, reconciliation-issue and cash-request ids resolve minimal authoritative
relationships. Pending-session reconciliation resolves the header token to its
restaurant before both authorization and the POS feature check. The other POS
body-target routes retain their service-level token+restaurant/table checks.
A different query/body/default restaurant cannot supply a higher plan.

Billing defaults remain assignment first, otherwise the existing first-owned
lookup. Explicit malformed ids are rejected, never interpreted as omitted.
Status retains its FREE/no-subscription response when no restaurant exists
(including an explicit missing row); checkout/portal still fail without a row.
The controller uses only the guard-selected target and does not select a second
default if the first-owned lookup changes. Public payment/session routes,
provider-signature webhooks and account-bound checkout confirmation stay separate.

## Coverage and close-out

`restaurant-access.coverage.spec.ts` imports every `*.controller.ts` and inspects
actual Nest route/guard metadata: **245 routes = 132 guarded + 113 separately
authorized**. Authentication must precede access, and FeatureGuard must follow
access. Mutation fixtures prove missing policies/guards and wrong ordering fail.

`restaurant-access.separate-routes.ts` replaces the temporary legacy inventory.
Its remaining entries are individually named public, account, super-admin,
API-key, enrollment/session/manage-token or provider-signature contracts.
They are **not 113 more P3-3 migrations**, and the file is not a runtime bypass.
No wildcard/class-wide exception is allowed. New routes require the declarative
guard or an explicitly reviewed different authorization contract; stale entries,
duplicates and temporary follow-up reasons fail CI. The guard count is ratcheted
to at least 132 and separate classifications to at most 113.

The management migration inventory is now empty. P3-3 implementation is complete;
review/merge/CI and batch release verification remain distinct gates.
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

Final two-slice verification: **214 backend suites / 3,545 tests passed** (106
new tests). Coverage: **89.80% lines / 76.19% branches**. Type checking and
Nest/SWC build pass. Full lint has zero errors / 497 existing warnings (down
from 544; cap unchanged); the shared policy/guard and new HTTP specs pass with
zero warnings. Prettier, Gitleaks 8.28.0 with CI's exact flags, the static migration
SQL safety gate and all 14 secret-scanner tests pass. Clean-install Linux CI
and its disposable-database E2E job remain merge gates. No local E2E database
or deployed environment was used; no scanner exemption or bypass was added.
HTTP regressions exercise every added route, role/status matrices, cross-tenant
resources, effective-role demotion, declared-source feature checks, optional
lists/billing defaults, malformed ids, shared header parsing and public-route
compatibility. All I/O is mocked; no database or provider is contacted.

**Deployment is deliberately batched** at the user's request (28 Aug 2026).
PR #58/P3-2 is merged at `f4ec9a61`, PR #59 at `6a76bba4`, PR #60 at
`6f472e53`, PR #61 at `d6c5b2ef` and PR #62 at `16d21007`; these await backend
deployment. The last confirmed
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

After the final slices are merged and included in that later batch release, check
order/assistance lists, manager cancellation, feedback/loyalty views, delivery
retry, waiter POS actions, cashier cash collection, owner billing defaults and
multi-location subscription status with demo data. Verify cross-restaurant
denials and continued customer checkout/webhooks. This PR does not run those
release checks or trigger deployment.
