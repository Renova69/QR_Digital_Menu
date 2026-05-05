---
phase: 5
plan: 2
title: "Checkout Hookup & Dashboard Indication"
wave: 2
depends_on: ["01"]
files_modified:
  - frontend/src/pages/CheckoutPage.tsx
  - frontend/src/pages/DashboardPage.tsx
  - frontend/src/context/OrderContext.tsx
requirements: [REQ-012]
autonomous: true
must_haves:
  - Checkout form matches exact backend payload syntax.
  - Dashboard tab features an active badge enumerating unhandled 'NEW' orders in real time.
---

<objective>
Fix synchronization artifacts in the React frontend. Ensure `CheckoutPage` transmits valid Order DTO properties (`tableId`). Provide immediate visual queues to the backend staff navigating the `DashboardPage`. 
</objective>

## Tasks

<task id="2.1">
<title>Align CheckoutPage payload</title>
<read_first>
- frontend/src/pages/CheckoutPage.tsx
</read_first>
<action>
In `frontend/src/pages/CheckoutPage.tsx`, review the `orderData` submission. Change `table: tableNumber` to `tableId: tableNumber` so it squarely targets the backend DTO validation.
Ensure it successfully triggers `createOrder` network invocation.
</action>
<acceptance_criteria>
- Frontend form submit maps to `tableId`.
</acceptance_criteria>
</task>

<task id="2.2">
<title>Sync OrderContext polling</title>
<read_first>
- frontend/src/context/OrderContext.tsx
</read_first>
<action>
`OrderContext` calls `getOrders()` on mount via intervals. This works perfectly locally with JWT interceptors. Ensure there are no type discrepancies blocking standard flow (e.g. nested elements vs shallow fields). The existing polling mechanism is sufficient, just verify it isn't clashing.
</action>
<acceptance_criteria>
- Handled orders accurately reflect API changes.
</acceptance_criteria>
</task>

<task id="2.3">
<title>Dashboard Orders Tab Notification Badge</title>
<read_first>
- frontend/src/pages/DashboardPage.tsx
</read_first>
<action>
Currently, `DashboardPage` blindly renders text buttons for tabs. Add a dot/badge logic to the standard layout.
In `frontend/src/pages/DashboardPage.tsx`:
- Import `useOrders` context. (Wait, `DashboardPage` wraps `OrdersView`, which calls `useOrders`. The root dashboard itself needs access to the count to augment the tab's look).
- Query `orders` from `useOrders()`.
- Filter for `orders.filter(o => o.status === 'NEW').length`.
- On the `Orders` dashboard tab button, attach a notification pill displaying the number if `> 0`.
</action>
<acceptance_criteria>
- If new orders are placed, the top-level tab explicitly highlights the volume visually to grab the waiter's attention.
</acceptance_criteria>
</task>
