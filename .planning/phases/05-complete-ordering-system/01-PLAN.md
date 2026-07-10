---
phase: 5
plan: 1
title: "Database Orders Refinement & Backend Service"
wave: 1
depends_on: []
files_modified:
  - backend/prisma/schema.prisma
  - backend/src/orders/dto/create-order.dto.ts
  - backend/src/orders/dto/update-order.dto.ts
  - backend/src/orders/orders.controller.ts
  - backend/src/orders/orders.service.ts
requirements: [REQ-011]
autonomous: true
must_haves:
  - Order model supports `specialRequests` field.
  - Backend orders creation securely calculates total price dynamically from the DB item prices, not the frontend.
  - Backend derives `restaurantId` directly from the assigned menu items.
  - Get and Update routes are protected via JWT.
---

<objective>
Update the Prisma schema for Order extensions, then wire up the empty NestJS `OrdersService` and `OrdersController` to handle real database interactions securely. Prices must be securely calculated server-side.
</objective>

## Tasks

<task id="1.1">
<title>Update Order Prisma Model</title>
<read_first>
- backend/prisma/schema.prisma
</read_first>
<action>
Modify `backend/prisma/schema.prisma` to add `specialRequests` to `Order`:
```prisma
model Order {
  // ...existing fields
  specialRequests String?
}
```
Run the shell commands mapping it:
```bash
npx.cmd prisma db push --schema=prisma/schema.prisma
npx.cmd prisma generate --schema=prisma/schema.prisma
```
*(Use `cd backend && ...` logic as previously configured via standard workspace paths)*.
</action>
<acceptance_criteria>
- Prisma schema reflects `specialRequests String?`
- Migration to DB passes.
</acceptance_criteria>
</task>

<task id="1.2">
<title>Implement Order DTOs</title>
<read_first>
- backend/src/orders/dto/create-order.dto.ts
- backend/src/orders/dto/update-order.dto.ts
</read_first>
<action>
In `create-order.dto.ts`, add the class-validator properties for `customerName`, `customerPhone` (optional), `tableId`, `specialRequests` (optional), and an array of `items` (each having `menuItemId`, `quantity`, and `selectedOptions`).

In `update-order.dto.ts`, map the status change wrapper expecting `status: OrderStatus`.
</action>
<acceptance_criteria>

- DTOs enforce structured payload types corresponding to frontend checkout behaviors.
  </acceptance_criteria>
  </task>

<task id="1.3">
<title>Build OrdersService Creation Logic</title>
<read_first>
- backend/src/orders/orders.service.ts
</read_first>
<action>
Implement the `create` method.
1. Fetch the `MenuItem` from DB for `items[0].menuItemId` to grab the `category.restaurantId` natively.
2. Iterate all items to map their DB prices + option modifiers, computing the `totalPrice` sum securely in the route.
3. Call `prisma.order.create` chaining the `items` inside `create: []` records.
</action>
<acceptance_criteria>
- `create` returns a valid, DB-persisted `Order`.
- `totalPrice` derives entirely from Prisma lookup results, ignoring frontend calculation claims.
</acceptance_criteria>
</task>

<task id="1.4">
<title>Implement Dashboard Operations (Get/Update)</title>
<read_first>
- backend/src/orders/orders.service.ts
- backend/src/orders/orders.controller.ts
</read_first>
<action>
Update `orders.service.ts`:
- `findAll(userId)`: Query and return all `Order` items containing items where `restaurant.ownerId === userId`, ordered by descending `createdAt`. Connect nested `items.menuItem`.
- `updateStatus(orderId, status, userId)`: Update the Prisma `status` if the user owns the parent restaurant.

Update `orders.controller.ts`:

- Route `POST /` remains public (no guard).
- Route `GET /` acquires `@UseGuards(JwtAuthGuard)` and passes `req.user.id` to `findAll()`.
- Route `PATCH /:id/status` mapped, guarded, passing user lookup.
  </action>
  <acceptance_criteria>
- Dashboard endpoints are protected.
- Customers can create unauthenticated orders.
  </acceptance_criteria>
  </task>
