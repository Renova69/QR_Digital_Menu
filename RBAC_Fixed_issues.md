# RBAC Fixed Issues

This document summarizes the RBAC and shared-device fixes applied after the staff/PIN login flow broke.

## Fixed Flows

### Shared Device Mode Button

- Fixed the Settings > General shared-device toggle so it reflects the current local device state.
- After enabling Shared Device Mode, the button now changes to `Disable Shared Device Mode`.
- The success/disabled message is shown inline next to the button instead of appearing as a top-page status message.
- Shared device config is stored in `localStorage.sharedDevice` as:

```json
{
  "restaurantId": "...",
  "restaurantName": "..."
}
```

### Device Login Page

- Moved `/device-login` out of the public customer layout.
- The PIN keypad is now a bare route and no longer mounts customer/order/assistance providers.
- On opening `/device-login`, the page clears any existing owner/manager/staff session first.
- PIN buttons are disabled while the existing session is being cleared.
- Wrong PIN attempts now stay on `/device-login`.
- Fixed the 401 interceptor so `/auth/pin-login` errors do not redirect away from the keypad.
- Successful PIN login redirects by role:
  - `WAITER` -> `/staff/pos`
  - `KITCHEN` -> `/staff/kitchen`
  - other staff roles -> `/dashboard`

### Staff Restaurant Assignment

- Staff users are linked to a restaurant through `User.restaurantId`.
- Staff creation stores the active restaurant ID on the created staff user.
- PIN login only searches users assigned to the configured restaurant.
- Auth responses now include `restaurantId`, so the frontend can immediately resolve the staff member's restaurant after login.

### POS Restaurant Loading

- Fixed the POS screen showing `No restaurant selected` immediately after staff login.
- `RestaurantContext` now prioritizes `user.restaurantId` for assigned staff and managers.
- POS now shows `Loading restaurant...` while the assigned restaurant is being fetched.

### Kitchen Display Orders

- Fixed KDS not showing orders for kitchen staff.
- `OrdersService.findAll` now allows assigned staff to read orders for their restaurant.
- `OrdersService.updateStatus` access now accepts either the restaurant owner or a staff member assigned to that restaurant.

### Dashboard And Manager Access

- Dashboard summary/analytics access now allows:
  - restaurant owner
  - assigned `MANAGER`
- Restaurant management actions such as updating settings, logo, and translations now allow owner or assigned manager.
- Owner-only actions remain owner-only:
  - deleting restaurant
  - Stripe connect/status/disconnect

### Assistance Requests

- Assistance request listing already supported owner/staff access by restaurant.
- Fixed `findOne`, `update`, and `remove` so they also verify restaurant access.
- Assistance actions now require either:
  - restaurant owner
  - staff assigned to the same restaurant

### Frontend Provider Fetch Noise

- `OrderProvider` no longer fetches `/orders` on every socket connection state change.
- `OrderProvider` now fetches only when an authenticated owner/manager/staff session exists.
- `AssistanceProvider` now follows the same RBAC-aware loading logic.
- Removed `OrderProvider` and `AssistanceProvider` from public/customer routes.
- `SocketProvider` no longer depends on a nonexistent `token` field from `AuthContext`, preventing unnecessary reconnect churn.

## Files Changed

- `apps/backend/src/auth/auth.controller.ts`
- `apps/backend/src/auth/auth.service.ts`
- `apps/backend/src/orders/orders.service.ts`
- `apps/backend/src/restaurants/restaurants.service.ts`
- `apps/backend/src/dashboard/dashboard.controller.ts`
- `apps/backend/src/assistance/assistance.controller.ts`
- `apps/backend/src/assistance/assistance.service.ts`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/context/AuthContext.tsx`
- `apps/frontend/src/context/RestaurantContext.tsx`
- `apps/frontend/src/context/OrderContext.tsx`
- `apps/frontend/src/context/AssistanceContext.tsx`
- `apps/frontend/src/context/SocketContext.tsx`
- `apps/frontend/src/lib/api.ts`
- `apps/frontend/src/pages/DeviceLoginPage.tsx`
- `apps/frontend/src/pages/Dashboard/SettingsView.tsx`
- `apps/frontend/src/components/pos/PosTableModal.tsx`

## Verification

The following checks passed after the fixes:

```bash
npm.cmd --workspace frontend run build
npm.cmd --workspace backend exec -- nest build
npm.cmd --workspace backend test -- orders.service.spec.ts --runInBand
```

## Notes

- The Vite dev message `ws proxy socket error: write ECONNABORTED` can still appear during browser navigation or reloads when the proxied websocket closes mid-write.
- That message is usually harmless if the backend immediately logs a fresh socket connection.
- The important fix was removing unnecessary protected fetches and reconnect churn from the wrong route layouts.
