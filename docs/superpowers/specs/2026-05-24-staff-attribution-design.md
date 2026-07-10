# Staff Attribution & Itemized Bill — Design Spec

**Date:** 2026-05-24  
**Status:** Approved

---

## Problem

When a waiter adds items to a table via POS, the client's bill shows only a combined subtotal with no indication of what was added by whom. The dashboard manager cannot distinguish self-ordered items from staff-added items. Attribution is currently lost — POS orders all land as `customerName: "Staff"` with no record of which staff member submitted them.

---

## Goals

1. Track which staff member submitted each POS order (per-order granularity, displayed per-item in UI).
2. Show the client an itemized bill grouped by source: "You" (self-order) vs staff name (POS).
3. Show source + staff name in the dashboard table detail modal and orders list.
4. No changes to kitchen display.

---

## Data Model

### Migration: two new fields on `Order`

```prisma
enum OrderSource {
  CUSTOMER
  POS
}

model Order {
  // ... existing fields unchanged ...
  source      OrderSource  @default(CUSTOMER)
  staffUserId String?
  staff       User?        @relation("StaffOrders", fields: [staffUserId], references: [id])
}
```

- `source` defaults to `CUSTOMER` — zero impact on existing customer orders.
- `staffUserId` nullable FK to `User`. Never sent from client body — always extracted from JWT server-side.
- Staff display name resolved at query time: `User.name ?? User.email`. Never stored as a string to avoid drift.

### Attribution granularity

Attribution is **per-order, displayed per-item**. Each POS cart submission creates one order. All items in that order share the same source/staff. Example:

| Order | Source   | Staff | Items             |
| ----- | -------- | ----- | ----------------- |
| A     | CUSTOMER | —     | Pizza x1, Beer x2 |
| B     | POS      | Maria | Steak x1          |
| C     | POS      | João  | Wine x1           |

Client bill shows: Pizza → "You", Beer → "You", Steak → "Maria", Wine → "João".

---

## Backend Changes

### 1. Optional JWT Strategy (new file)

`apps/backend/src/auth/optional-jwt.strategy.ts` + `optional-jwt-auth.guard.ts`

Passport strategy that attempts JWT cookie verification. Returns `null` instead of throwing `UnauthorizedException` when cookie is absent or invalid. Registered in `AuthModule`.

### 2. `orders.controller.ts`

Add `@UseGuards(OptionalJwtAuthGuard)` to `POST /orders`. Pass `req.user?.id ?? null` to service.

```typescript
@Post()
@UseGuards(OptionalJwtAuthGuard)
create(@Body() dto: CreateOrderDto, @Request() req: any) {
  return this.ordersService.create(dto, req.user?.id ?? null);
}
```

Public customer requests: no cookie → `req.user = null` → unaffected.  
POS requests: JWT cookie present → `req.user.id` populated → staff attributed.

### 3. `orders.service.ts`

`create()` gains `staffUserId: string | null` as second parameter.

```typescript
async create(dto: CreateOrderDto, staffUserId: string | null = null) {
  // ... existing validation unchanged ...
  await this.prisma.order.create({
    data: {
      // ... existing fields ...
      source: staffUserId ? 'POS' : 'CUSTOMER',
      staffUserId: staffUserId ?? undefined,
    },
  });
}
```

No other logic in `create()` changes.

### 4. `payment.service.ts` → `getSessionBill()`

Add staff relation to order query. Expand response to include itemized orders:

```typescript
include: {
  items: {
    include: { menuItem: { select: { name: true, price: true } } },
  },
  staff: { select: { name: true, email: true } },
}
```

New response shape per order:

```typescript
{
  id: string;
  source: "CUSTOMER" | "POS";
  staffName: string | null; // staff.name ?? staff.email ?? null
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    selectedOptions: any[];
  }>;
}
```

`subtotal`, `tipsEnabled`, `tipOptions`, `restaurantId` fields unchanged.

### 5. `tables.service.ts` → `getTableOrders()`

Add staff relation include. Return `source` and `staffName` per order. Used by dashboard table detail modal.

---

## Frontend Changes

### 1. `PaymentModal.tsx` — Itemized Bill View

`BillData` interface expands:

```typescript
interface BillOrder {
  id: string;
  source: "CUSTOMER" | "POS";
  staffName: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
}
interface BillData {
  orders: BillOrder[];
  subtotal: number;
  tipsEnabled: boolean;
  tipOptions: number[];
}
```

Tip selection step shows itemized list grouped by source before subtotal line:

```
🧑 You
  Pizza Margherita x1        €12.00
  Beer x2                     €8.00

👤 Maria (Staff)
  Steak x1                   €28.00

👤 João (Staff)
  Wine x1                    €15.00
─────────────────────────────────────
Subtotal                     €63.00
```

- "You" label for `source=CUSTOMER`.
- Staff first name (or email prefix) for `source=POS`.
- If session has only CUSTOMER orders: no grouping headers, flat list. Grouping only appears when mixed or POS-only.

### 2. `TableDetailModal.tsx` — Dashboard Table Detail

Each order card gains a source badge in its header:

- `CUSTOMER` → `Self-order` (blue badge)
- `POS` → staff name (amber badge), e.g. `Maria`

Badge sits next to the order timestamp. Items within each order unchanged.

### 3. `OrdersView.tsx` — Dashboard Orders List

Add `Source` column to the orders table:

- `Self` for CUSTOMER
- Staff name for POS

Small inline badge, same color coding as above.

### 4. `KitchenPage.tsx`

**No changes.** Kitchen only needs table + items + timing.

### 5. `PosCartDrawer.tsx`

**No changes.** JWT cookie is sent automatically with every `api` request via `withCredentials: true`. Staff attribution is extracted server-side.

---

## Auth Pattern: Optional JWT

Industry-standard NestJS pattern. The `OptionalJwtStrategy` extends `PassportStrategy` with `session: false`. In the `validate()` method it returns the user payload when the JWT is valid; in `handleRequest()` it overrides the default to return `null` on error rather than throwing.

This is the correct approach because:

- `POST /orders` must remain public for unauthenticated customer QR flows.
- POS sends the JWT cookie automatically (browser includes cookies on same-origin requests via Vite proxy in dev, and `withCredentials: true` in prod).
- No frontend changes needed — attribution is entirely server-side.

---

## Files Changed Summary

| File                                                           | Change                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                         | Add `OrderSource` enum, `source`, `staffUserId`, `staff` relation to `Order` |
| `prisma/migrations/...`                                        | Generated migration                                                          |
| `auth/optional-jwt.strategy.ts`                                | New — optional JWT passport strategy                                         |
| `auth/optional-jwt-auth.guard.ts`                              | New — guard wrapping optional strategy                                       |
| `auth/auth.module.ts`                                          | Register new strategy                                                        |
| `orders/orders.controller.ts`                                  | Add `OptionalJwtAuthGuard`, pass `staffUserId`                               |
| `orders/orders.service.ts`                                     | Accept `staffUserId`, set `source` field                                     |
| `payment/payment.service.ts`                                   | Expand `getSessionBill` response with itemized orders + staff names          |
| `tables/tables.service.ts`                                     | Add staff relation include to `getTableOrders`                               |
| `components/payment/PaymentModal.tsx`                          | Itemized bill grouped by source                                              |
| `pages/Dashboard/LiveTablesView.tsx` or `TableDetailModal.tsx` | Source badge per order                                                       |
| `pages/Dashboard/OrdersView.tsx`                               | Source column/badge                                                          |

**Not changed:** `KitchenPage.tsx`, `PosCartDrawer.tsx`, `PosContext.tsx`, `CheckoutPage.tsx`

---

## Edge Cases

- **Staff user has no name set** — fall back to `User.email`. Always non-null.
- **Session has only customer orders** — itemized list shows flat items, no group headers.
- **Session has only POS orders** — group header shows staff name, no "You" section.
- **Same staff submits twice** — two separate orders, both attributed to same staff. Grouped under same name in client bill.
- **Force open session** — clears old session, new session starts fresh. Attribution on new orders is correct.
- **Existing orders (pre-migration)** — `source` defaults to `CUSTOMER`, `staffUserId` null. Display shows "Self-order" which is accurate enough for historical data (pre-POS orders were all customer-placed).
