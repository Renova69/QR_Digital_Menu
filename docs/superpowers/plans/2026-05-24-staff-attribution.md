# Staff Attribution & Itemized Bill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track which staff member submitted each POS order and surface that attribution in the client's itemized bill and the manager's dashboard.

**Architecture:** Add `source` (enum) and `staffUserId` (nullable FK) to `Order`. Backend extracts the JWT user on `POST /orders` using an optional Passport strategy — no body changes, no frontend auth changes. `getSessionBill` and `getTableOrders` return per-order attribution; frontend renders grouped itemized views.

**Tech Stack:** NestJS 11, Prisma 6, passport-jwt, React 18, Tailwind v4, TanStack Query

---

## File Map

| File                                                       | Action     | Responsibility                                                                           |
| ---------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `apps/backend/prisma/schema.prisma`                        | Modify     | Add `OrderSource` enum, `source`, `staffUserId`, `staff` relation                        |
| `apps/backend/prisma/migrations/…`                         | Generated  | DB migration                                                                             |
| `apps/backend/src/auth/optional-jwt.strategy.ts`           | **Create** | Passport strategy — returns null on missing/invalid JWT                                  |
| `apps/backend/src/auth/optional-jwt-auth.guard.ts`         | **Create** | Guard wrapping optional strategy                                                         |
| `apps/backend/src/auth/auth.module.ts`                     | Modify     | Register `OptionalJwtStrategy`                                                           |
| `apps/backend/src/orders/orders.controller.ts`             | Modify     | Apply `OptionalJwtAuthGuard`, pass `req.user?.id`                                        |
| `apps/backend/src/orders/orders.service.ts`                | Modify     | Accept `staffUserId`, write `source`/`staffUserId` on create; include staff in `findAll` |
| `apps/backend/src/payment/payment.service.ts`              | Modify     | `getSessionBill` returns itemized orders with `source`/`staffName`                       |
| `apps/backend/src/tables/tables.service.ts`                | Modify     | `getTableOrders` includes staff relation, returns `source`/`staffName`                   |
| `apps/frontend/src/context/OrderContext.tsx`               | Modify     | Add `source`, `staffName` to `Order` interface                                           |
| `apps/frontend/src/components/payment/PaymentModal.tsx`    | Modify     | Itemized bill grouped by source                                                          |
| `apps/frontend/src/components/tables/TableDetailModal.tsx` | Modify     | Source badge per order                                                                   |
| `apps/frontend/src/pages/Dashboard/OrdersView.tsx`         | Modify     | Source badge in order cards                                                              |

---

## Task 1: Prisma Schema — Add OrderSource enum and fields to Order

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add the enum and two fields to schema**

Open `apps/backend/prisma/schema.prisma`. Add the enum anywhere before the `Order` model (e.g. near `OrderStatus`):

```prisma
enum OrderSource {
  CUSTOMER
  POS
}
```

Inside `model Order { … }`, add after the `updatedAt` line:

```prisma
  source      OrderSource  @default(CUSTOMER)
  staffUserId String?
  staff       User?        @relation("StaffOrders", fields: [staffUserId], references: [id])
```

Also add the back-relation inside `model User { … }` after the existing `orders Order[]` line:

```prisma
  staffOrders Order[]      @relation("StaffOrders")
```

- [ ] **Step 2: Run migration**

```bash
cd apps/backend
npx prisma migrate dev --name add_order_source_staff
```

Expected output: `The following migration(s) have been created and applied…`

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma apps/backend/prisma/migrations/
git commit -m "feat(db): add OrderSource enum and staffUserId to Order"
```

---

## Task 2: Optional JWT Strategy + Guard

**Files:**

- Create: `apps/backend/src/auth/optional-jwt.strategy.ts`
- Create: `apps/backend/src/auth/optional-jwt-auth.guard.ts`
- Modify: `apps/backend/src/auth/auth.module.ts`

- [ ] **Step 1: Create the strategy**

Create `apps/backend/src/auth/optional-jwt.strategy.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class OptionalJwtStrategy extends PassportStrategy(
  Strategy,
  "jwt-optional",
) {
  constructor(private readonly configService: ConfigService) {
    const allowBearerAuth =
      process.env.NODE_ENV === "test" ||
      process.env.NODE_ENV === "development" ||
      process.env.ALLOW_BEARER_AUTH === "true";

    const extractors =
      allowBearerAuth && process.env.NODE_ENV !== "production"
        ? [
            ExtractJwt.fromAuthHeaderAsBearerToken(),
            (req: any) => req?.cookies?.token ?? null,
          ]
        : [(req: any) => req?.cookies?.token ?? null];

    super({
      jwtFromRequest: ExtractJwt.fromExtractors(extractors),
      ignoreExpiration: false,
      secretOrKey: (() => {
        if (process.env.NODE_ENV === "test") return "test-secret";
        const secret = configService.get<string>("JWT_SECRET");
        if (!secret) throw new Error("JWT_SECRET must be set");
        return secret;
      })(),
    });
  }

  // Returns the payload when JWT is valid; passport calls handleRequest next.
  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 2: Create the guard**

Create `apps/backend/src/auth/optional-jwt-auth.guard.ts`:

```typescript
import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt-optional") {
  // Override to never throw — return null user when JWT is absent or invalid.
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
```

- [ ] **Step 3: Register OptionalJwtStrategy in AuthModule**

Open `apps/backend/src/auth/auth.module.ts`. Add `OptionalJwtStrategy` to imports at the top and to the `providers` array:

```typescript
import { OptionalJwtStrategy } from "./optional-jwt.strategy";

@Module({
  // …imports unchanged…
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    GoogleStrategy,
    OptionalJwtStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 4: Verify backend compiles**

```bash
cd apps/backend
npm run build 2>&1 | tail -20
```

Expected: no errors, `Successfully compiled` or similar.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/auth/optional-jwt.strategy.ts \
        apps/backend/src/auth/optional-jwt-auth.guard.ts \
        apps/backend/src/auth/auth.module.ts
git commit -m "feat(auth): add OptionalJwtStrategy and guard for public endpoints"
```

---

## Task 3: Orders Controller — Wire Optional Guard

**Files:**

- Modify: `apps/backend/src/orders/orders.controller.ts`

- [ ] **Step 1: Add guard import and apply to POST /orders**

Open `apps/backend/src/orders/orders.controller.ts`. The current `create` method has no guard. Replace it:

```typescript
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

// inside OrdersController class — replace the existing create method:
@Post()
@UseGuards(OptionalJwtAuthGuard)
create(@Body() createOrderDto: CreateOrderDto, @Request() req: any) {
  this.logger.log('POST /orders');
  return this.ordersService.create(createOrderDto, req.user?.id ?? null);
}
```

The other methods (`findAll`, `findOne`, `update`) are unchanged.

- [ ] **Step 2: Verify backend compiles**

```bash
cd apps/backend
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 3: Smoke-test customer order still works**

Start backend: `npm run start:dev`

In another terminal:

```bash
curl -s -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Test","tableId":"1","restaurantId":"<any-id>","items":[]}' \
  | jq '.message // "ok"'
```

Expected: some validation error about items (not a 401). Proves the route is still public.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/orders/orders.controller.ts
git commit -m "feat(orders): apply OptionalJwtAuthGuard to POST /orders"
```

---

## Task 4: Orders Service — Write source and staffUserId on Create

**Files:**

- Modify: `apps/backend/src/orders/orders.service.ts`

- [ ] **Step 1: Update create() signature**

Open `apps/backend/src/orders/orders.service.ts`. The current signature is:

```typescript
async create(createOrderDto: CreateOrderDto) {
```

Change it to:

```typescript
async create(createOrderDto: CreateOrderDto, staffUserId: string | null = null) {
```

- [ ] **Step 2: Add source and staffUserId to the order.create call**

Find the `tx.order.create` call (around line 351). The `data` object currently ends with `tableSessionId`. Add two fields:

```typescript
const order = await tx.order.create({
  data: {
    customerName: createOrderDto.customerName,
    customerPhone: createOrderDto.customerPhone,
    customerId: createOrderDto.customerId,
    tableId: createOrderDto.tableId,
    specialRequests: createOrderDto.specialRequests,
    totalPrice: finalTotal,
    pointsEarned,
    pointsRedeemedForDiscount,
    pointsRedeemedForItems,
    pointsRedeemed: pointsRedeemedForDiscount + pointsRedeemedForItems,
    restaurantId,
    tableSessionId,
    source: staffUserId ? "POS" : "CUSTOMER",
    staffUserId: staffUserId ?? undefined,
    items: { create: itemsData },
  },
  include: { items: true },
});
```

- [ ] **Step 3: Add staff include to findAll**

In `findAll()`, the `prisma.order.findMany` call has:

```typescript
include: {
  items: { include: { menuItem: true } },
},
```

Extend it to:

```typescript
include: {
  items: { include: { menuItem: true } },
  staff: { select: { id: true, name: true, email: true } },
},
```

- [ ] **Step 4: Verify backend compiles**

```bash
cd apps/backend
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/orders/orders.service.ts
git commit -m "feat(orders): record source and staffUserId on order create"
```

---

## Task 5: Payment Service — Expand getSessionBill Response

**Files:**

- Modify: `apps/backend/src/payment/payment.service.ts`

- [ ] **Step 1: Add staff include to the order query**

Open `apps/backend/src/payment/payment.service.ts`. Find `getSessionBill` (line ~125). The `prisma.order.findMany` call currently has:

```typescript
include: {
  items: {
    include: {
      menuItem: { select: { name: true, price: true } },
    },
  },
},
```

Replace with:

```typescript
include: {
  items: {
    include: {
      menuItem: { select: { name: true, price: true } },
    },
  },
  staff: { select: { name: true, email: true } },
},
```

- [ ] **Step 2: Expand the return value**

The current return is:

```typescript
return {
  orders,
  subtotal,
  restaurantId: session.restaurantId,
  tipsEnabled: session.restaurant.tipsEnabled,
  tipOptions: session.restaurant.tipOptions,
};
```

Replace with:

```typescript
const enrichedOrders = orders.map((order) => ({
  id: order.id,
  source: order.source,
  staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
  totalPrice: order.totalPrice,
  items: order.items.map((oi) => ({
    name: oi.menuItem?.name ?? "Unknown item",
    quantity: oi.quantity,
    unitPrice: oi.menuItem?.price ?? 0,
    selectedOptions: Array.isArray(oi.selectedOptions)
      ? oi.selectedOptions
      : [],
  })),
}));

return {
  orders: enrichedOrders,
  subtotal,
  restaurantId: session.restaurantId,
  tipsEnabled: session.restaurant.tipsEnabled,
  tipOptions: session.restaurant.tipOptions,
};
```

- [ ] **Step 3: Verify backend compiles**

```bash
cd apps/backend
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/payment/payment.service.ts
git commit -m "feat(payment): expand getSessionBill with itemized orders and staff attribution"
```

---

## Task 6: Tables Service — Expand getTableOrders Response

**Files:**

- Modify: `apps/backend/src/tables/tables.service.ts`

- [ ] **Step 1: Add staff include to the order query**

Open `apps/backend/src/tables/tables.service.ts`. Find `getTableOrders` (line ~235). The `prisma.order.findMany` call currently includes only `items`. Add staff:

```typescript
const orders = await this.prisma.order.findMany({
  where: { tableSessionId: session.id },
  include: {
    items: {
      include: {
        menuItem: { select: { name: true, price: true } },
      },
    },
    staff: { select: { name: true, email: true } },
  },
  orderBy: { createdAt: "desc" },
});
```

- [ ] **Step 2: Add source and staffName to the returned map**

Find the `orders.map((order) => ({…}))` call. Add two fields alongside the existing ones:

```typescript
return orders.map((order) => ({
  id: order.id,
  customerName: order.customerName,
  totalPrice: order.totalPrice,
  status: order.status,
  specialRequests: order.specialRequests,
  createdAt: order.createdAt,
  source: order.source,
  staffName: order.staff ? (order.staff.name ?? order.staff.email) : null,
  items: order.items.map((oi) => ({
    name: oi.menuItem?.name ?? "Unknown item",
    quantity: oi.quantity,
    totalPrice:
      ((oi.menuItem?.price ?? 0) +
        (Array.isArray(oi.selectedOptions)
          ? (oi.selectedOptions as any[]).reduce(
              (sum: number, option: any) =>
                sum + Number(option?.priceModifier ?? 0),
              0,
            )
          : 0)) *
      oi.quantity,
    options: Array.isArray(oi.selectedOptions)
      ? (oi.selectedOptions as any[])
          .map((o: any) => o?.choiceName)
          .filter(Boolean)
      : [],
  })),
}));
```

- [ ] **Step 3: Verify backend compiles**

```bash
cd apps/backend
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/tables/tables.service.ts
git commit -m "feat(tables): include source and staffName in getTableOrders response"
```

---

## Task 7: Frontend — Extend OrderContext Order Interface

**Files:**

- Modify: `apps/frontend/src/context/OrderContext.tsx`

- [ ] **Step 1: Add source and staffName to the Order interface**

Open `apps/frontend/src/context/OrderContext.tsx`. The `Order` interface (line ~18) currently ends with `updatedAt`. Add:

```typescript
interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  tableId: string;
  status: OrderStatus;
  items: Array<{
    id: string;
    menuItemId: string;
    quantity: number;
    selectedOptions: any[];
    menuItem: {
      id: string;
      name: string;
      price: number;
      description?: string;
    };
  }>;
  totalPrice: number;
  specialRequests?: string;
  createdAt: string;
  updatedAt: string;
  source?: "CUSTOMER" | "POS";
  staffName?: string | null;
  tableSession?: {
    status: string;
  };
}
```

No other changes to this file.

- [ ] **Step 2: Verify frontend type-checks**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `source` or `staffName`.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/context/OrderContext.tsx
git commit -m "feat(frontend): add source and staffName to OrderContext Order interface"
```

---

## Task 8: PaymentModal — Itemized Bill Grouped by Source

**Files:**

- Modify: `apps/frontend/src/components/payment/PaymentModal.tsx`

- [ ] **Step 1: Update BillData interface and BillOrder type**

Open `apps/frontend/src/components/payment/PaymentModal.tsx`. Replace the current `BillData` interface (line ~22):

```typescript
interface BillItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface BillOrder {
  id: string;
  source: "CUSTOMER" | "POS";
  staffName: string | null;
  totalPrice: number;
  items: BillItem[];
}

interface BillData {
  orders: BillOrder[];
  subtotal: number;
  tipsEnabled: boolean;
  tipOptions: number[];
}
```

- [ ] **Step 2: Add helper to get display label for an order**

Add this helper function before the `PaymentForm` component:

```typescript
function getSourceLabel(order: BillOrder): string {
  if (order.source === "CUSTOMER") return "You";
  if (order.staffName) {
    // Show first name only (or full email if no name)
    return order.staffName.includes("@")
      ? order.staffName.split("@")[0]
      : order.staffName.split(" ")[0];
  }
  return "Staff";
}
```

- [ ] **Step 3: Add helper to decide whether to show group headers**

```typescript
// Show headers whenever any POS order exists — covers mixed, POS-only single staff,
// and POS-only multiple staff. Pure CUSTOMER sessions get a flat list.
function showGroupHeaders(orders: BillOrder[]): boolean {
  return orders.some((o) => o.source === "POS");
}
```

- [ ] **Step 4: Replace the tip-step bill display inside PaymentModal**

In `PaymentModal`, the tip step renders `bill.subtotal`. Replace that section with the itemized list. Find the tip selection step JSX (inside the `step === 'tip'` branch) and add the itemized list before the subtotal. The full tip-step section should look like:

```tsx
{step === 'tip' && bill && (
  <div className="space-y-4">
    {/* Itemized orders */}
    <div className="space-y-3">
      {bill.orders.map((order) => (
        <div key={order.id}>
          {showGroupHeaders(bill.orders) && (
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1">
              {getSourceLabel(order) === 'You' ? '🧑 You' : `👤 ${getSourceLabel(order)} (Staff)`}
            </p>
          )}
          <div className="space-y-1">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-foreground">
                  {item.name}
                  {item.quantity > 1 && (
                    <span className="ml-1 text-muted-foreground">×{item.quantity}</span>
                  )}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {formatEuro(item.unitPrice * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>

    {/* Subtotal */}
    <div className="flex justify-between font-semibold text-foreground border-t pt-2">
      <span>{t('payment.subtotal')}</span>
      <span>{formatEuro(bill.subtotal)}</span>
    </div>

    {/* Tip selector — keep existing tip UI below this unchanged */}
```

- [ ] **Step 5: Verify frontend type-checks**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/payment/PaymentModal.tsx
git commit -m "feat(payment): show itemized bill grouped by source in PaymentModal"
```

---

## Task 9: TableDetailModal — Source Badge per Order

**Files:**

- Modify: `apps/frontend/src/components/tables/TableDetailModal.tsx`

- [ ] **Step 1: Add source and staffName to OrderDetail interface**

Open `apps/frontend/src/components/tables/TableDetailModal.tsx`. The `OrderDetail` interface (line ~7) currently ends with `status`. Add:

```typescript
interface OrderDetail {
  id: string;
  customerName?: string;
  createdAt?: string;
  specialRequests?: string | null;
  items: {
    name: string;
    quantity: number;
    totalPrice?: number;
    options?: string[];
  }[];
  totalPrice: number;
  status: string;
  source?: "CUSTOMER" | "POS";
  staffName?: string | null;
}
```

- [ ] **Step 2: Add source badge helper**

Add before the component definition:

```typescript
function SourceBadge({ source, staffName }: { source?: 'CUSTOMER' | 'POS'; staffName?: string | null }) {
  if (!source) return null;
  if (source === 'CUSTOMER') {
    return (
      <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200">
        Self-order
      </span>
    );
  }
  const label = staffName
    ? (staffName.includes('@') ? staffName.split('@')[0] : staffName.split(' ')[0])
    : 'Staff';
  return (
    <span className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200">
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Render badge in each order card header**

In the `orders.map((order) => …)` JSX, find the order header section:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <span className="font-black text-sm text-foreground">
    {formatOrderCode(order.id)}
  </span>
  <span
    className={cn(
      "rounded-md px-2 py-1 text-[10px] font-black uppercase",
      orderStatusStyles[order.status],
    )}
  >
    {t(statusLabels[order.status] || "orders.tabs.new")}
  </span>
</div>
```

Add the `SourceBadge` after the status badge:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <span className="font-black text-sm text-foreground">
    {formatOrderCode(order.id)}
  </span>
  <span
    className={cn(
      "rounded-md px-2 py-1 text-[10px] font-black uppercase",
      orderStatusStyles[order.status],
    )}
  >
    {t(statusLabels[order.status] || "orders.tabs.new")}
  </span>
  <SourceBadge source={order.source} staffName={order.staffName} />
</div>
```

- [ ] **Step 4: Verify frontend type-checks**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/tables/TableDetailModal.tsx
git commit -m "feat(tables): add source badge to order cards in TableDetailModal"
```

---

## Task 10: OrdersView — Source Badge in Order Cards

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/OrdersView.tsx`

- [ ] **Step 1: Add source/staffName to the DashboardOrder type**

Open `apps/frontend/src/pages/Dashboard/OrdersView.tsx`. The `DashboardOrder` type is derived from `useOrders()` (line ~21):

```typescript
type OrdersContextValue = ReturnType<typeof useOrders>;
type DashboardOrder = OrdersContextValue["orders"][number];
```

Because `OrderContext.tsx` `Order` interface was updated in Task 7, `DashboardOrder` already has `source?: 'CUSTOMER' | 'POS'` and `staffName?: string | null`. No interface change needed here.

- [ ] **Step 2: Add SourceBadge component**

Add this helper before the main component export (after the existing helper functions like `getOrderCode`):

```typescript
function SourceBadge({ source, staffName }: { source?: 'CUSTOMER' | 'POS'; staffName?: string | null }) {
  if (!source) return null;
  if (source === 'CUSTOMER') {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200">
        Self
      </span>
    );
  }
  const label = staffName
    ? (staffName.includes('@') ? staffName.split('@')[0] : staffName.split(' ')[0])
    : 'Staff';
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200">
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Render SourceBadge in order cards**

In `OrdersView`, find where each order renders its code and status badge. The pattern is:

```tsx
<span className="font-mono text-sm font-black">{getOrderCode(order.id)}</span>
```

After that `span`, add:

```tsx
<SourceBadge source={order.source} staffName={order.staffName} />
```

- [ ] **Step 4: Verify frontend type-checks**

```bash
cd apps/frontend
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/OrdersView.tsx
git commit -m "feat(orders): add source badge to order cards in OrdersView"
```

---

## Task 11: End-to-End Smoke Test

- [ ] **Step 1: Start both apps**

```bash
# Root
npm run dev
```

Backend on `:3000`, frontend on `:3001`.

- [ ] **Step 2: Customer self-order flow**

1. Open `http://localhost:3001/menu/<restaurant-id>?table=1`
2. Add items to cart, checkout with any name
3. In backend logs verify: order created with `source: CUSTOMER`

```bash
# Or query DB directly
cd apps/backend
npx prisma studio
# Open Order table, check newest row has source=CUSTOMER, staffUserId=null
```

- [ ] **Step 3: POS staff order flow**

1. Log in as a staff user at `http://localhost:3001/device-login`
2. Open POS at `http://localhost:3001/staff/pos`
3. Select the same table as Step 2
4. Add items, submit order
5. Verify in DB: new order has `source=POS`, `staffUserId=<logged-in-user-id>`

- [ ] **Step 4: Client bill view**

1. Back on the public menu page (same table token in localStorage)
2. Click "Request Bill"
3. Verify: itemized list shows two sections — "You" (customer items) and staff name (POS items)
4. Subtotal matches sum of all items

- [ ] **Step 5: Dashboard table detail**

1. Log in as owner/manager at `http://localhost:3001/dashboard`
2. Go to Live Tables, click the table
3. Verify: each order card shows either "Self-order" (blue) or staff name (amber) badge

- [ ] **Step 6: Dashboard orders list**

1. Go to Orders tab in dashboard
2. Verify: each order shows source badge — "Self" or staff name

- [ ] **Step 7: Final commit if any fixes applied**

```bash
git add -A
git commit -m "fix: smoke test corrections for staff attribution"
```
