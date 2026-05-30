# Code Review: Phase 0 — Websocket Room Authorization (#1)

**Reviewed**: 2026-05-30
**Branch**: fix/ws-room-authz → main
**Decision**: APPROVE (1 MEDIUM found and fixed during review)

## Summary
Locks down socket.io room joins. Restaurant rooms now require an authenticated owner/staff/super-admin of that restaurant; order rooms require a short-lived order-scoped signed token issued at order creation. Anonymous connections are still allowed (customer order tracking) but cannot subscribe to the restaurant live feed.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
- **events.gateway.ts `canAccessRestaurant` — suspension parity gap** — initial implementation checked ownership/role but not `user.isActive`/`restaurant.isActive`. The HTTP `jwt.strategy` rejects disabled accounts (`ACCOUNT_DISABLED`) and suspended restaurants (`ACCOUNT_SUSPENDED`); the socket path did not, so a suspended account with an unexpired JWT could keep receiving live events. **FIXED** — `canAccessRestaurant` now selects `isActive`/`disabledAt` and denies disabled users + suspended restaurants. Two regression tests added.

### LOW
- **OrderConfirmationPage** — live tracking depends on `location.state` (orderId + token), so a hard refresh loses both and tracking stops. Pre-existing behavior (orderId was already state-based); not a regression. Acceptable for now.
- **SocketContext** — reconnects on `userId` change; on initial load this can mean a brief anon connect → authed reconnect. Negligible overhead, correct behavior.
- **events.gateway `parseCookie`** — hand-rolled single-cookie parser to avoid adding a dependency. Handles `=` in values (split on first `=`). Exercised indirectly by handshake tests.

## Validation Results

| Check | Result |
|---|---|
| Type check (backend) | Pass |
| Type check (frontend) | Pass |
| Tests (backend) | Pass — 533 (gateway spec 15 new) |
| Lint | Skipped |
| Build | Skipped (tsc covers types) |

## Files Reviewed
- `apps/backend/src/events/events.gateway.ts` — Modified (handshake auth, room authz, order token)
- `apps/backend/src/events/events.gateway.spec.ts` — Added (15 tests)
- `apps/backend/src/events/events.module.ts` — Modified (JwtModule + PrismaModule)
- `apps/backend/src/orders/orders.service.ts` — Modified (issue orderTrackToken)
- `apps/backend/src/orders/orders.service.spec.ts` — Modified (mock signOrderToken)
- `apps/frontend/src/context/SocketContext.tsx` — Modified (reconnect on auth change)
- `apps/frontend/src/pages/CheckoutPage.tsx` — Modified (forward token)
- `apps/frontend/src/pages/OrderConfirmationPage.tsx` — Modified (join with {orderId, token})
