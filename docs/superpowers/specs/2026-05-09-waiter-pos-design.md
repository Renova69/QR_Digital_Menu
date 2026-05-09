# Waiter POS — Design Spec

> **Date:** 2026-05-09
> **Status:** Approved — ready for implementation planning
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

---

## Goal

Add a `/staff/pos` route to the existing React SPA — a full-viewport, mobile-first Point-of-Sale interface for waiters to take tableside orders rapidly. Must not affect any existing customer-facing routes, dashboard, or cart state.

## Architecture

New `PosLayout` (third layout alongside `AppLayout` and `PublicLayout`) wraps `/staff/pos`. A dedicated `PosContext` owns all POS state — completely isolated from `CartContext`. Two small backend endpoints added to `PaymentController`. Zero Prisma schema changes.

**Tech stack:** React 18, Tailwind CSS 4, Radix UI (Sheet, Dialog), TanStack Query, existing `SocketContext` + `RestaurantContext`.

---

## Decisions Made

| Question | Decision |
|---|---|
| Seat-level ordering | Local frontend grouping only — no DB persistence |
| Course firing | **Dropped** — out of scope |
| Custom discount | **Dropped** — out of scope |
| Per-item notes | Aggregated into `Order.specialRequests` string at submit time — no schema change |
| Cart state | New `PosContext` isolated from customer `CartContext` |
| POS layout | New `PosLayout` — zero chrome, full viewport |

---

## 1. Routing & Auth

### `StaffRoute.tsx`
New auth guard at `apps/frontend/src/components/StaffRoute.tsx`. Allows `OWNER` and `STAFF` roles. Redirects unauthenticated to `/login`, `CUSTOMER` to `/profile`. Same pattern as existing `ProtectedRoute`.

### `App.tsx` addition
```tsx
<Route element={<PosLayout />}>
  <Route
    path="/staff/pos"
    element={
      <StaffRoute>
        <PosProvider>
          <PosPage />
        </PosProvider>
      </StaffRoute>
    }
  />
</Route>
```

`PosProvider` wraps only the POS route. Outer providers (`CartProvider`, `OrderProvider`, `SocketProvider`, `RestaurantProvider`) remain in the existing tree and are accessible inside POS.

---

## 2. PosContext

**File:** `apps/frontend/src/context/PosContext.tsx`

State is **in-memory only** — no localStorage. POS cart is ephemeral; cleared on order submit or session end.

### Types

```ts
interface PosCartItem {
  cartId: string;       // uuid — unique per seat+item+options combo
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: Array<{
    name: string;
    choiceName: string;
    priceModifier: number;
  }>;
  seatNumber: string;   // "Seat 1" | "Seat 2" | "Seat 3" | "Shared" — display only
  itemNote: string;     // free text — folded into specialRequests on submit
}

interface PosSession {
  tableId: string;
  tableName: string;
  sessionToken: string | null;  // null = no active session
  sessionId: string | null;
}
```

### Context interface

```ts
interface PosContextType {
  items: PosCartItem[];
  addItem: (item: Omit<PosCartItem, 'cartId'>) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, qty: number) => void;
  updateNote: (cartId: string, note: string) => void;
  clearCart: () => void;
  session: PosSession | null;
  setSession: (s: PosSession) => void;
  clearSession: () => void;
  getTotal: () => number;
  activeSeat: string;           // global for current session — "Seat 1" default
  setActiveSeat: (seat: string) => void;
}
```

### `specialRequests` serialisation

On order submit, item notes and seat groupings are serialised as:

```
[Seat 1] Ribeye: no salt, Pasta | [Seat 2] Salmon: extra lemon | [Shared] Water
```

Items without notes appear as name only. Items without a seat group are listed under `[Shared]`.

---

## 3. Component Tree

```
apps/frontend/src/
├── components/
│   ├── StaffRoute.tsx
│   └── pos/
│       ├── PosTopBar.tsx           — search input + active table chip
│       ├── PosCategoryFilter.tsx   — sticky horizontal category pills
│       ├── PosItemGrid.tsx         — 2-col dense grid, filtered by category + search query
│       ├── PosItemCard.tsx         — tap → addItem directly, or open PosOptionsDrawer if item has MenuOptions
│       ├── PosOptionsDrawer.tsx    — Radix Sheet (bottom), VARIATION/ADDON selection + item note input
│       ├── PosCartDrawer.tsx       — slide-up cart panel: items grouped by seat, total, submit button
│       ├── PosSeatSelector.tsx     — pill row: Seat 1 | Seat 2 | Seat 3 | Shared (sets activeSeat)
│       ├── PosTableModal.tsx       — Radix Dialog, table grid from getTablesWithStatus, force open/close buttons
│       ├── PosSplitBill.tsx        — integer input → per-person amount display (pure UI math)
│       └── PosQRBill.tsx           — QRCodeSVG pointed at session bill URL
├── context/
│   └── PosContext.tsx
└── pages/pos/
    ├── PosLayout.tsx               — full-viewport shell: sticky top bar, scrollable content, fixed bottom action bar
    └── PosPage.tsx                 — composes all pos/ components
```

### `PosLayout.tsx` structure

```
┌─────────────────────────────────┐  ← sticky top (PosTopBar + PosCategoryFilter)
│  🔍 Search    [Table 5 ●]       │
│  [Стarters] [Mains] [Drinks] ▶  │
├─────────────────────────────────┤
│                                 │
│   Item Grid (scrollable)        │
│                                 │
├─────────────────────────────────┤  ← fixed bottom action bar
│  Seat 1 | Seat 2 | Shared       │
│  [3 items · 42.50 €]  [Submit]  │
└─────────────────────────────────┘
```

Safe-area insets applied to top and bottom bars via `pt-safe` / `pb-safe` utilities (existing `index.css`).

---

## 4. Backend Additions

**One new endpoint** added to `PaymentController`. One existing endpoint reused as-is.

### Existing endpoints used by POS (no changes needed)

| Endpoint | Auth | Used for |
|---|---|---|
| `POST /api/payments/session` | Public | Normal table open — idempotent `getOrCreateSession(tableId, restaurantId)` |
| `POST /api/payments/session/:token/close` | JWT | Force Close — already sets `CLOSED_NO_PAYMENT`, already JWT-guarded |

### New endpoint: `POST /api/payments/session/force-open`

**Auth:** `JwtAuthGuard`

**Body:** `{ tableId: string, restaurantId: string }`

**Logic:**
1. Find any existing `OPEN` session for `tableId`
2. If found → set status to `CLOSED_NO_PAYMENT`
3. Create new `TableSession` with status `OPEN`
4. Return `{ token, id }`

**Use case:** Waiter starts a fresh session on a table left open without payment — overrides the idempotent behaviour of the normal `POST /payments/session`.

No Prisma schema changes. `CLOSED_NO_PAYMENT` enum value already exists in `TableSessionStatus`.

---

## 5. Data Flow

### Startup

1. Waiter opens `/staff/pos` → `StaffRoute` verifies auth
2. `PosTableModal` auto-opens (no session in `PosContext`)
3. `getTablesWithStatus()` populates table grid with live status
4. Waiter selects table:
   - Table has no open session → `POST /payments/session` (existing public endpoint, idempotent)
   - Table has open session → `getOrCreateSession` returns existing token — use it directly
   - Waiter taps "Force Open" → `POST /payments/session/force-open` (new endpoint)
5. `PosContext.setSession()` stores session — modal closes, POS is ready

### Order Submission

1. Waiter selects seat via `PosSeatSelector` (sets `activeSeat`)
2. Taps `PosItemCard`:
   - No `MenuOption[]` on item → `addItem()` immediately with `activeSeat`
   - Has `MenuOption[]` → `PosOptionsDrawer` opens → waiter selects options + optional note → `addItem()`
3. Bottom bar shows count + total → waiter taps "Submit"
4. `PosContext` builds `specialRequests` string from seat groups + item notes
5. `POST /api/orders`:
   ```json
   {
     "customerName": "Staff",
     "tableId": "session.tableId",
     "restaurantId": "activeRestaurant.id",
     "specialRequests": "[Seat 1] Ribeye: no salt | [Seat 2] Pasta",
     "tableSessionId": "session.sessionId",
     "items": [{ "menuItemId": "...", "quantity": 1, "selectedOptions": [...] }]
   }
   ```
6. On success → `clearCart()`. Session stays open. Kitchen receives `newOrder` socket event via existing `EventsGateway`.

### Session End

- "Force Close" → `POST /payments/session/:token/close` (existing endpoint) → `clearSession()`
- Customer pays via Stripe → session closes via existing webhook → `table:status-changed` socket event → `PosTableModal` can detect and prompt waiter

### Phase D — Split Bill & QR

- `PosSplitBill`: `(getTotal() / n).toFixed(2)` — pure UI math, no API call
- `PosQRBill`: `<QRCodeSVG value={billUrl} size={256} />` where `billUrl` uses existing session token format: same URL customers use for tableside payment

---

## 6. Styling Rules

- Dark-mode-compatible from day one — no `dark:` overrides needed if using existing CSS variables
- High contrast: item names in `text-foreground`, prices in `text-accent`
- `PosItemCard`: `h-20`, 2-column grid, name + price only (no image)
- `PosCategoryFilter`: `overflow-x-auto scrollbar-hide`, pills use `bg-accent/10 border border-accent` when active
- All tap targets ≥ 44px
- Minimal animations — `transition-none` on item cards for performance on mid-range Android

---

## 7. Files to Create / Modify

| Action | Path |
|---|---|
| Create | `apps/frontend/src/components/StaffRoute.tsx` |
| Create | `apps/frontend/src/context/PosContext.tsx` |
| Create | `apps/frontend/src/pages/pos/PosLayout.tsx` |
| Create | `apps/frontend/src/pages/pos/PosPage.tsx` |
| Create | `apps/frontend/src/components/pos/PosTopBar.tsx` |
| Create | `apps/frontend/src/components/pos/PosCategoryFilter.tsx` |
| Create | `apps/frontend/src/components/pos/PosItemGrid.tsx` |
| Create | `apps/frontend/src/components/pos/PosItemCard.tsx` |
| Create | `apps/frontend/src/components/pos/PosOptionsDrawer.tsx` |
| Create | `apps/frontend/src/components/pos/PosCartDrawer.tsx` |
| Create | `apps/frontend/src/components/pos/PosSeatSelector.tsx` |
| Create | `apps/frontend/src/components/pos/PosTableModal.tsx` |
| Create | `apps/frontend/src/components/pos/PosSplitBill.tsx` |
| Create | `apps/frontend/src/components/pos/PosQRBill.tsx` |
| Modify | `apps/frontend/src/App.tsx` — add PosLayout + /staff/pos route |
| Modify | `apps/backend/src/payment/payment.controller.ts` — 1 new endpoint (`force-open`) |
| Modify | `apps/backend/src/payment/payment.service.ts` — `forceOpenSession()` method |

No changes to: `prisma/schema.prisma`, `CartContext`, `OrderContext`, `DashboardPage`, any public menu routes.
