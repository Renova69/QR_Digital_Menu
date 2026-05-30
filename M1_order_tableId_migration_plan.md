# M1 — `Order.tableId` stores table name, not the FK cuid (deferred fix plan)

Status: **deferred** (needs schema + data migration + consumer audit). Code review branch `fix/security-audit-integrated`.

## Problem
`OrdersService.create` resolves the client-supplied table name (e.g. `"1"`) to the
real `RestaurantTable.id` (cuid) for **session** creation, but persists the order with
the raw name:

```ts
// apps/backend/src/orders/orders.service.ts  (~line 384)
tableId: createOrderDto.tableId,   // <-- this is the NAME ("1"), not table.id
```

Everywhere else `tableId` is a cuid:
- `TableSession.tableId` = cuid.
- `tables.service.ts` queries sessions/orders by cuid.
- `payment.service` emits `emitTableStatusChanged(restaurantId, session.tableId /* cuid */, …)`.
- `orders.service.create` emits `emitTableStatusChanged(restaurantId, finalOrder.tableId /* NAME */, …)`.

### Impact
- `table:status-changed` socket payload carries a **name** on order-create but a **cuid**
  on payment events — same event, two id spaces. Frontend only survives because it tends to
  refetch table status wholesale rather than match on `tableId`.
- Any future `JOIN`/lookup on `Order.tableId` as an FK silently fails or mismatches.
- Reporting/grouping by table is unreliable if a table is renamed (name is not stable).

Severity: MEDIUM (latent; not currently user-visible).

## Why deferred
- `Order.tableId` is currently a free string, not a real FK — there may be historical rows
  keyed by name. Changing producers without a backfill creates mixed name/cuid data.
- Prod DB is hosted Neon; a migration must be run deliberately with approval (see CLAUDE.md:
  `npx prisma db push` preferred under drift; never bypass seed guards).

## Proposed fix (run as one deliberate change)

### 1. Schema
Keep a stable FK and (optionally) a denormalized display name:
```prisma
model Order {
  // ...
  tableId       String?          // becomes the RestaurantTable cuid (nullable: takeaway/no-table)
  tableName     String?          // optional snapshot of the name at order time
  table         RestaurantTable? @relation(fields: [tableId], references: [id])
  // ...
  @@index([tableId])
}
```
If a relation is too invasive now, at minimum standardize `tableId` to always hold the cuid
and add `tableName` for display.

### 2. Producer change
In `OrdersService.create`, once the table is resolved to `tableCuid`, store the cuid:
```ts
const resolvedTableCuid = tableCuid ?? null;        // from the RestaurantTable lookup
// ...
data: {
  tableId: resolvedTableCuid,
  tableName: createOrderDto.tableId ?? null,        // keep the display name
  // ...
}
```
Note: today `tableId` is also resolved only inside the `if (!tableSessionId && createOrderDto.tableId)`
branch. Ensure the cuid is resolved for **all** order paths (including when a `sessionToken`
is supplied) before persisting — derive it from the session's `tableId` when present.

### 3. Emit change
`orders.service.create` must emit the **cuid**, matching payment events:
```ts
this.eventsGateway.emitTableStatusChanged(
  finalOrder.restaurantId,
  resolvedTableCuid,          // not finalOrder.tableId (name)
  finalOrder.tableSessionId,
);
```

### 4. Data backfill migration
Backfill existing rows where `tableId` is a name → cuid:
```sql
UPDATE "order" o
SET "tableId" = t.id,
    "tableName" = COALESCE(o."tableName", o."tableId")
FROM "restaurant_table" t
WHERE t."restaurantId" = o."restaurantId"
  AND t."name" = o."tableId"
  AND o."tableId" IS NOT NULL
  AND o."tableId" NOT IN (SELECT id FROM "restaurant_table");  -- only rows still keyed by name
```
Verify row counts before/after. Rows with no matching table name stay as-is (orphans to review).

### 5. Consumer audit checklist (verify each before/after)
- [ ] `apps/backend/src/tables/tables.service.ts` — `getTableOrders`, status derivation (uses session cuid already; confirm no `order.tableId` name dependency).
- [ ] `apps/backend/src/payment/payment.service.ts` — bill/detail order mapping (does not key on `order.tableId`; confirm).
- [ ] `apps/frontend` socket handlers for `table:status-changed` — confirm they tolerate cuid (they should; today they receive a name on order-create).
- [ ] Dashboard order list / table detail cards — any display reading `order.tableId` should switch to `order.tableName`.
- [ ] Analytics/reporting grouping by table.

### 6. Tests
- Unit: `orders.service.create` persists cuid in `tableId` and the name in `tableName`,
  for both the `tableId`-name path and the `sessionToken` path.
- Unit: emit uses cuid.
- Regression: existing order/table specs stay green.

## Rollback
Migration is additive (`tableName` new column; `tableId` value normalized). Roll back by
restoring the previous producer line; data backfill is forward-safe (name preserved in
`tableName`).
