# Local Review — 2026-06-03

**Scope**: All uncommitted changes vs HEAD (subscription, feature guard, loyalty, restaurant controller, dashboard, staff, menu-import, main.ts, schema)
**Decision**: REQUEST CHANGES — 1 open HIGH, 2 MEDIUM, 4 LOW

---

## Original Issue Verification

### CRITICAL — ALL FIXED ✓

| Issue | Status | Evidence |
|-------|--------|----------|
| C-1 `:id` vs `:restaurantId` IDOR | FIXED | `restaurants.controller.ts` feature-gated routes use `:restaurantId`; `restaurant-id.util.ts` only reads `params.restaurantId` |
| C-2 Stripe client stale at module load | FIXED | Stripe instantiated in constructor via `ConfigService` |
| C-3 Webhook secret defaults to empty string | FIXED | `handleWebhook` throws `BadRequestException` before `constructEvent` if secret is empty |
| C-4 `customer.subscription.paused` unhandled | FIXED | Handled in switch; `paused` in `IMMEDIATE_DOWNGRADE_STATUSES` → immediate FREE downgrade |
| C-5 Loyalty `/enroll` + `/config` no feature guard | FUNCTIONALLY FIXED | `LoyaltyService.enroll()` and `getPublicConfig()` both call `isLoyaltyAvailable()` which checks effective tier + `isLoyaltyEnabled`. Service layer is the correct enforcement boundary here; `/config` is intentionally public (returns `null` when loyalty unavailable). |

### HIGH — ALL FIXED ✓ (except H-8 partial)

| Issue | Status |
|-------|--------|
| H-1 `forceTier` invalid string accepted | FIXED — `forceTier in TIER_FEATURES` guard |
| H-2 2-3 DB queries per guarded request | FIXED — `request._userCache` + `request._restaurantCache_${id}` per-request caching |
| H-3 Null user misleading error | FIXED — explicit `ForbiddenException('User account not found')` |
| H-4 `confirmCheckoutSession` missing `stripePriceId` | FIXED — retrieves subscription from Stripe, writes `stripePriceId` |
| H-5 No index on `stripeCustomerId` | FIXED — `@@index([stripeCustomerId])` in schema.prisma:123 |
| H-6 No index on `pastDueGraceExpiry` | FIXED — `@@index([pastDueGraceExpiry])` in schema.prisma:124 |
| H-7 Race between confirm + webhook (`lt` only) | FIXED — both use `lte` now |
| **H-8 Premium endpoints not feature-gated** | **PARTIAL — see below** |
| H-9 `useFeature` fetches on every mount | NOT VERIFIED (frontend) |
| H-10 Frontend loading shows locked state | NOT VERIFIED (frontend) |
| H-11 Duplicate subscription not blocked | FIXED — checks `blockStatuses` before creating checkout |
| H-12 `confirmCheckoutSession` spams Stripe | FIXED — `processedSessions` Set deduplicates |

### H-8 Detail (open item)

- **Dashboard** (`dashboard.controller.ts`): FIXED — `ANALYTICS_BASIC`, `PAYMENTS_STRIPE`, `ANALYTICS_FULL` gates on all 3 endpoints.
- **Menu import** (`menu-import.controller.ts`): `importConfirm`, `getApiKey`, `regenerateApiKey`, `exportMenu` have no `@RequireFeature`. However `MENU_IMPORT` is in the FREE tier feature list, so all tiers have it. Ownership is checked via `checkOwnership()`. Not a tier-bypass vector — this is acceptable.
- **Staff** (`staff.controller.ts`): No `@RequireFeature`, but `UsersService.createStaffMember` enforces tier staff limits (`getStaffLimit` → FREE=0, STARTER=1, etc.). Service-layer enforcement is correct. HTTP layer allows the attempt but service rejects it. LOW concern.

---

## MEDIUM Issues

### M-1 — TIER_FEATURES manual duplication (NOT FIXED)
**File**: `feature.service.ts:6-39`

STARTER, PROFESSIONAL manually copy FREE and STARTER features instead of spreading:
```typescript
STARTER: [
  FeatureFlag.MENU_VIEW,   // ← copy-pasted from FREE
  FeatureFlag.MENU_EDIT,
  ...
```
Maintenance debt: adding a FREE feature requires updating every tier manually. Suggest:
```typescript
STARTER: [...TIER_FEATURES.FREE, FeatureFlag.ORDERS_RECEIVE, ...]
```
Risk: Diverges silently — a FREE feature added later won't appear in STARTER unless manually added. Not a current bug but will bite on the next feature flag addition.

### M-2 — `forceTier` has no expiration (NOT FIXED)
**File**: `prisma/schema.prisma` (no `forceTierExpiresAt` field)

Super-admin overrides persist forever. Forgotten overrides = permanent free ENTERPRISE access or wrongful FREE downgrade. No tracking of who set it, when, or why. `AdminAuditLog` logs the action but nothing auto-expires or alerts.

### M-NEW-1 — `Origin` header trusted for enrollment URL
**File**: `restaurants.controller.ts:128-130`

```typescript
const frontendBaseUrl = expressReq.headers.origin || process.env.FRONTEND_URL || 'http://localhost:3001';
```

Authenticated ENTERPRISE user can set `Origin: https://evil.com` to generate a device-enrollment QR pointing to a phishing URL. Attack path is limited (requires valid ENTERPRISE JWT), but the fix is trivial:
```typescript
const frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
```
Discard the `origin` header — it's untrusted input.

---

## LOW Issues

### L-1 — No SUPER_ADMIN bypass test in FeatureGuard spec (CONFIRMED OPEN)
**File**: `feature.guard.spec.ts`

`feature.guard.ts:62` has `if (user?.role === 'SUPER_ADMIN') return true` but zero tests cover this path. A regression could silently remove SUPER_ADMIN bypass without test failure.

### L-2 — `processedSessions` lost on restart
**File**: `subscription.service.ts:39`

In-memory Set; server restart triggers duplicate Stripe API calls on `confirmCheckoutSession`. Not a data-corruption risk (DB uses `lte` guard so replay is idempotent), but extra Stripe calls and slight UX delay on POST-restart confirmations. Acceptable for now; Redis-backed deduplication would be more robust at scale.

### L-3 — Webhook secret from `process.env` directly
**File**: `subscription.service.ts:301`

```typescript
const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || '';
```
Inconsistent with how `STRIPE_SECRET_KEY` is read via `ConfigService` in the constructor. Works correctly (runtime read, not module-load), but ConfigService should be preferred for consistency + test injection.

### L-4 — No `SUPER_ADMIN` test for `user.sub` fallback
**File**: `feature.guard.ts:40`

`const userId = request.user?.id ?? request.user?.sub` — the `sub` fallback path has no unit-test coverage in `feature.guard.spec.ts`.

### M-5 — No exhaustiveness guarantee on TIER_FEATURES (PARTIAL)
**File**: `feature.service.ts:6`

`ENTERPRISE: Object.values(FeatureFlag)` is exhaustive. Other tiers manually list flags with no compile-time check that all intended flags are included. Adding a new `FeatureFlag` enum value is a silent no-op for non-ENTERPRISE tiers.

---

## New Logic/Architecture Findings

### Architecture — `processedSessions.clear()` race on > 10000 entries
**File**: `subscription.service.ts:231-234`

```typescript
if (this.processedSessions.size > 10000) {
  this.processedSessions.clear();
}
```

Node.js is single-threaded so there's no concurrency problem, but a `clear()` + immediate re-add can lose session IDs from concurrent async calls yielded at `await` boundaries. Example: Request A adds id X, size hits 10001, then `await` yields to Request B which also clears, then Request A's add happens after B's clear. X is now not in the set. Net effect: duplicate Stripe confirm call for X on the next request. Not a security issue (idempotent DB write) but the intent is violated.

Fix: Use LRU eviction instead of full clear, or drop the Set entirely (DB timestamp guard makes it unnecessary).

### Logic — `staff.controller.ts` allows `LIST` on FREE tier
**File**: `staff.controller.ts:34-41`

`GET` (list staff) has no tier check and no staff count check. A FREE-tier restaurant with existing staff (migrated from a paid tier) can still list them. Not a bug per se but worth documenting as intentional.

### Logic — Loyalty `enroll` silently returns stale points on disabled restaurant
**File**: `loyalty.service.ts:137-138`

```typescript
if (!restaurant || !isLoyaltyAvailable(restaurant, this.featureService)) {
  return this.getPoints(userId, restaurantId);
}
```

If the restaurant doesn't exist, this calls `getPoints` on a non-existent restaurant → returns empty/null points without a 404. User gets a silent no-op instead of a clear error. Low impact (read-only) but confusing in client debugging.

---

## Validation

Tests were not run (no `npm test` invoked). Code review only.

| Check | Result |
|-------|--------|
| TypeScript types | Not run |
| Lint | Not run |
| Tests | Not run |
| Build | Not run |

---

## Files Reviewed

- `apps/backend/src/restaurants/restaurants.controller.ts`
- `apps/backend/src/subscription/subscription.service.ts`
- `apps/backend/src/subscription/subscription.controller.ts`
- `apps/backend/src/subscription/feature.guard.ts`
- `apps/backend/src/subscription/feature.guard.spec.ts`
- `apps/backend/src/subscription/feature.service.ts`
- `apps/backend/src/subscription/feature.service.spec.ts`
- `apps/backend/src/subscription/restaurant-id.util.ts`
- `apps/backend/src/loyalty/loyalty.controller.ts`
- `apps/backend/src/loyalty/loyalty.service.ts` (partial)
- `apps/backend/src/loyalty/loyalty-availability.util.ts`
- `apps/backend/src/dashboard/dashboard.controller.ts`
- `apps/backend/src/restaurants/staff.controller.ts`
- `apps/backend/src/menu-import/menu-import.controller.ts`
- `apps/backend/src/main.ts`
- `apps/backend/prisma/schema.prisma` (index grep)
- `apps/backend/src/users/users.service.ts` (grep)
