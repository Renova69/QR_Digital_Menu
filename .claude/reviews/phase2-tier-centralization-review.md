# Code Review: Phase 2 — Tier Centralization (#2, #6, #11)

**Reviewed**: 2026-05-30
**Branch**: fix/tier-centralization → main
**Decision**: APPROVE

## Summary
Makes tier resolution target-restaurant aware instead of "first owned restaurant". `FeatureGuard` now resolves the restaurant the request acts on (param/query/body), verifies the caller is associated with it, and checks THAT restaurant's effective tier. Subscription status accepts an explicit restaurantId with the same access check. Dayparting gates on the effective tier (honors forceTier) via FeatureService instead of a hardcoded tier list.

## Findings

### CRITICAL / HIGH
None.

### MEDIUM
None.

### LOW
- **Guard returns 403 `FEATURE_LOCKED` when an explicit target restaurant is not found** — avoids leaking restaurant existence (good) but the code/message pairing is slightly generic. Acceptable; the service layer would 404 a real miss anyway.
- **`extractRestaurantId` depends on body being parsed before the guard** — true under NestJS defaults (body-parser middleware precedes guards); documented in the util.

## Notable behavior change (intentional, verified safe)
`FeatureGuard` now denies when an explicit target restaurant id belongs to a restaurant the caller does not own/staff (bypass prevention for #2). No legitimate flow breaks: owners/staff/super-admin pass, and any cross-tenant call that would now be denied was already blocked by service-layer ownership checks. Single-restaurant owners (today's norm) are unaffected.

Side benefit: the body.restaurantId extraction also denies the #3 payment-close cross-tenant attempt at the guard layer (defense-in-depth; the service-layer fix still lands in Phase 3).

## Validation Results

| Check | Result |
|---|---|
| Type check (backend) | Pass |
| Type check (frontend) | Pass |
| Tests (backend) | Pass — 526 (guard +4 target tests, subscription controller +4) |
| Lint | Skipped |
| Build | Skipped (tsc covers types) |

## Files Reviewed
- `apps/backend/src/subscription/restaurant-id.util.ts` — Added (target-id extraction)
- `apps/backend/src/subscription/feature.guard.ts` — Modified (target-aware + ownership + effective tier)
- `apps/backend/src/subscription/feature.guard.spec.ts` — Modified (+4 target-aware tests)
- `apps/backend/src/subscription/subscription.controller.ts` — Modified (explicit restaurantId + access check)
- `apps/backend/src/subscription/subscription.controller.spec.ts` — Added (4 tests)
- `apps/backend/src/menu/menu-crud.service.ts` — Modified (isDaypartingEnabled via FeatureService)
- `apps/backend/src/menu/menu-crud.service.spec.ts` — Modified (FeatureService provider)
- `apps/frontend/src/lib/api.ts` — Modified (getSubscriptionStatus(restaurantId))
- `apps/frontend/src/hooks/useFeature.ts` — Modified (passes activeRestaurantId)
