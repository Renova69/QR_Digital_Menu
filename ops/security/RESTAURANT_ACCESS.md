# P3-3 — Declarative restaurant access

Status: **PARTIAL — first controller slice implemented; review/release pending.**
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

- Each declaration names exactly one source (`params` or `query`) and key.
  Conflicting values in another location cannot change the authorized tenant.
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

## Coverage and remaining work

`restaurant-access.coverage.spec.ts` imports every `*.controller.ts` and inspects
actual Nest route/guard metadata. It currently discovers **245 routes**. For
migrated routes it verifies authentication before access and feature checks after
access. Mutation fixtures prove missing policies/guards and wrong ordering fail.

The other **223 routes** are frozen, individually named in
`restaurant-access.legacy-routes.ts`. This is an explicit rollout inventory, **not
an authorization assertion or runtime bypass**. It includes public/token routes,
account-only operations, super-admin endpoints, and tenant routes still guarded
inside controllers/services. No wildcard/class-wide exemption is allowed. New
routes require either the declarative guard or a reviewed explanation of their
different authorization. Stale/duplicated entries fail; remove entries as routes
are migrated.

Next P3-3 slices:

1. Menu/category/item/option and other resource-id routes: resolve the resource's
   restaurant server-side, preserving upload ordering and manager permissions.
2. Restaurant settings, devices, imports, tables/zones, reservations, notifications,
   loyalty, feedback, orders and payment management: preserve distinct owner,
   staff, super-admin and token-based policies; remove each legacy entry on migration.
3. Separate permanent public/account/admin classifications from the remaining
   tenant migration inventory, then close P3-3 only after that inventory is empty.

Existing child-resource/service checks remain. This guard is not a substitute for
tenant-constrained queries at the write boundary; that separate work remains P3-4.
It cannot promise a transactional permission snapshot across concurrent updates.

## Verification and release

- Guard tests cover owner/manager/staff/customer/admin matrices, cross-tenant
  denial, effective-role demotion, malformed ids, fallback, status behavior,
  database errors and request-context isolation.
- Local HTTP tests use the real Nest pipeline and FeatureGuard with fake
  authentication/I/O: no AppModule, `.env`, external credentials or live database.
- Controller tests retain analytics tier filtering, date validation and service
  dispatch/audit-actor checks. Authorization cases moved to guard/HTTP tests,
  because directly calling a controller does not execute Nest decorators.

Local verification: **207 backend suites / 2,984 tests passed**, with coverage
at 88.92% lines and 75.28% branches. Type checking and the Nest/SWC build pass.
All changed files pass lint without warnings; repository lint has zero errors
and 614 existing warnings (down from 640, cap unchanged). Prettier, Gitleaks
8.28.0 with CI's flags, the 14 secret-scanner tests, and migration safety pass.
Clean-install Linux CI and its disposable-database E2E job remain merge gates.

**Deployment is deliberately batched** at the user's request (28 Aug 2026).
PR #58/P3-2 is merged at `f4ec9a61` but not backend-deployed. The last confirmed
backend deployment is P3-1 at `e7500785`. No deploy script or live database command
is part of this implementation. Later, deploy approved merged main once through
the existing backup/safety/canary workflow and run the accumulated release checks.

After that batch deploy, verify owner/manager dashboard access, a denied
cross-restaurant request, printer listing/reactivation, staff PIN reset and public
scan recording using development/demo data. P3-1/P2-10 manual checks remain open.
