# Stripe Pay-at-Table Design

## Scope

Pay-at-table flow for a multi-restaurant SaaS using Stripe Connect (Platform model).  
Customers order, eat, then pay from their phone. Restaurants receive funds directly minus a platform fee.  
Tips are owner-configurable. Architecture abstracts the payment provider for future MyPOS integration.

---

## Architecture Overview

**Model:** Stripe Connect Platform — restaurants are Express connected accounts. Customer pays → Stripe splits automatically → restaurant gets funds minus platform application fee.

**Payment timing:** After eating. Customer taps "Request Bill" in the public menu → tip selection → Stripe Elements → payment confirmed → table session closed.

**Session tracking:** A `TableSession` with a unique token is created on first order and stored in the customer's `localStorage`. All orders from that browser link to the session. New customer at same table = new session (no token in their browser).

**Provider abstraction:** `PaymentService` interface on the backend. `StripePaymentProvider` is the first implementation. MyPOS slots in later as a second implementation with zero changes to order/session logic.

---

## DB Schema Changes

### New model: `TableSession`

```prisma
model TableSession {
  id           String             @id @default(cuid())
  token        String             @unique @default(cuid())
  tableId      String
  restaurantId String
  status       TableSessionStatus @default(OPEN)
  createdAt    DateTime           @default(now())
  paidAt       DateTime?
  orders       Order[]
  payments     Payment[]
  restaurant   Restaurant         @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  table        Table              @relation(fields: [tableId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([tableId, status])
}

enum TableSessionStatus {
  OPEN
  PAID
  CLOSED_NO_PAYMENT
}
```

### New model: `Payment`

```prisma
model Payment {
  id                     String        @id @default(cuid())
  tableSessionId         String
  restaurantId           String
  stripePaymentIntentId  String?       @unique
  amount                 Float
  tipAmount              Float         @default(0)
  platformFeeAmount      Float         @default(0)
  currency               String        @default("eur")
  status                 PaymentStatus @default(PENDING)
  provider               PaymentProvider @default(STRIPE)
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt
  tableSession           TableSession  @relation(fields: [tableSessionId], references: [id])
  restaurant             Restaurant    @relation(fields: [restaurantId], references: [id])

  @@index([stripePaymentIntentId])
}

enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
}

enum PaymentProvider {
  STRIPE
  MYPOS
}
```

### Modify: `Order`

Add one field:

```prisma
tableSessionId String?
tableSession   TableSession? @relation(fields: [tableSessionId], references: [id])
```

### Modify: `Restaurant`

Add fields:

```prisma
stripeAccountId      String?
stripeOnboarded      Boolean  @default(false)
paymentsEnabled      Boolean  @default(false)
tipsEnabled          Boolean  @default(false)
tipOptions           Int[]    @default([2, 4, 5])
platformFeePercent   Float    @default(0.5)
```

### Modify: `Table`

Add relation:

```prisma
sessions TableSession[]
```

---

## Backend

### New module: `PaymentModule`

**Files:**

- `apps/backend/src/payment/payment.module.ts`
- `apps/backend/src/payment/payment.service.ts` — orchestration + provider selection
- `apps/backend/src/payment/payment.controller.ts` — HTTP routes
- `apps/backend/src/payment/stripe.provider.ts` — Stripe-specific logic
- `apps/backend/src/payment/payment-provider.interface.ts` — abstraction interface

**Payment provider interface** (`payment-provider.interface.ts`):

```typescript
export interface IPaymentProvider {
  createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }>;

  constructWebhookEvent(payload: Buffer, signature: string): any;
}
```

**StripeProvider** (`stripe.provider.ts`):

- Initializes `new Stripe(process.env.STRIPE_SECRET_KEY)`
- `createPaymentIntent`: calls `stripe.paymentIntents.create()` with `transfer_data.destination` = restaurant's `stripeAccountId`, `application_fee_amount` = platform fee in cents
- `constructWebhookEvent`: calls `stripe.webhooks.constructEvent()`

**PaymentService** (`payment.service.ts`) — key methods:

`getOrCreateSession(tableId, restaurantId, token?)`:

- If token provided → find session by token where status=OPEN → return it
- Else → create new TableSession → return `{ session, token }`

`getSessionBill(token)`:

- Find session by token, status=OPEN
- Sum all linked orders' `totalPrice`
- Return `{ orders, subtotal, restaurantId, tipsEnabled, tipOptions }`

`createPaymentIntent(token, tipPercent)`:

- Fetch session + restaurant
- Validate restaurant has `paymentsEnabled = true` → else throw `403 Forbidden`
- Validate restaurant has `stripeOnboarded = true` → else throw `400 Bad Request('Stripe not connected')`
- Calculate: `subtotal` = sum of orders, `tipAmount` = subtotal × tipPercent/100, `total` = subtotal + tipAmount
- `platformFee` = total × `restaurant.platformFeePercent` / 100
- Create `Payment` record (status=PENDING)
- Call `stripeProvider.createPaymentIntent({ amountCents: total*100, platformFeeCents: platformFee*100, restaurantStripeAccountId: restaurant.stripeAccountId, metadata: { sessionId, paymentId } })`
- Return `{ clientSecret, paymentId, total, tipAmount }`

`handleWebhookEvent(payload, signature)`:

- `stripeProvider.constructWebhookEvent(payload, signature)`
- On `payment_intent.succeeded`:
  - Find Payment by `stripePaymentIntentId`
  - Update Payment status → SUCCEEDED
  - Update TableSession status → PAID, set `paidAt`
  - Emit socket event `payment:confirmed` to restaurant room
- On `payment_intent.payment_failed`:
  - Update Payment status → FAILED

**PaymentController** (`payment.controller.ts`) routes:

```
POST /api/payments/session          → getOrCreateSession (public)
GET  /api/payments/session/:token/bill → getSessionBill (public)
POST /api/payments/session/:token/intent → createPaymentIntent (public)
POST /api/payments/webhook          → handleWebhookEvent (public, raw body)
```

### Stripe Connect Onboarding — in `RestaurantsController`

```
POST /api/restaurants/:id/stripe/connect     → generate onboarding link (owner auth)
GET  /api/restaurants/:id/stripe/status      → check stripeOnboarded status (owner auth)
POST /api/restaurants/:id/stripe/disconnect  → clear stripeAccountId (owner auth)
```

`generateConnectLink(restaurantId)`:

- Call `stripe.accountLinks.create({ account: existingAccountId OR stripe.accounts.create({ type: 'express' }), refresh_url, return_url, type: 'account_onboarding' })`
- Store `stripeAccountId` on restaurant
- Return `{ url }` — frontend redirects to it

On return from Stripe (`return_url` = `/dashboard/settings?stripe=success`):

- Frontend calls `GET /api/restaurants/:id/stripe/status`
- Backend calls `stripe.accounts.retrieve(stripeAccountId)` → check `charges_enabled`
- If true → set `stripeOnboarded = true`

### Orders service change

`createOrder()` — add session wiring:

- Accept optional `sessionToken` in the order DTO
- Call `paymentService.getOrCreateSession(tableId, restaurantId, sessionToken)`
- Set `order.tableSessionId`
- Return `sessionToken` in response (frontend stores in localStorage if not already set)

### New env vars (already in .env)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...     (frontend only)
STRIPE_WEBHOOK_SECRET=...              (set after webhook endpoint created in Stripe dashboard)
```

**Dev webhook setup:** Run `stripe listen --forward-to localhost:3000/api/payments/webhook` (requires Stripe CLI). Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` in `.env`.

**Production webhook:** Add endpoint `https://yourdomain.com/api/payments/webhook` in Stripe Dashboard → Developers → Webhooks. Subscribe to events: `payment_intent.succeeded`, `payment_intent.payment_failed`. Copy the signing secret into the production env var.

**Important:** The webhook route must receive the **raw request body** (not parsed JSON). In NestJS, exclude it from the global body parser using `app.use('/api/payments/webhook', express.raw({ type: 'application/json' }))` in `main.ts`.

---

## Frontend

### Public menu — session token management

`PublicMenuPage.tsx` / order submission:

- Before `POST /api/orders`, read `sessionToken` from `localStorage.getItem('session-{tableId}')`
- Include `sessionToken` in order body
- On order success, if response includes `sessionToken` → `localStorage.setItem('session-{tableId}', token)`

### "Request Bill" button

Added to public menu action bar (alongside Sign In / Cart):

- Visible only when `localStorage` has a session token for current table
- Calls `GET /api/payments/session/:token/bill` to confirm session has orders
- Opens `PaymentModal`

### New: `PaymentModal.tsx`

Step 1 — **Tip selection** (if `tipsEnabled`):

- "No Tip" button + quick % buttons (from `tipOptions`) + "Custom" input
- "Continue" → step 2

Step 2 — **Stripe Elements**:

- Load `@stripe/stripe-js` with `VITE_STRIPE_PUBLISHABLE_KEY`
- Call `POST /api/payments/session/:token/intent` with tip percent
- Mount `<PaymentElement>` (handles card / Apple Pay / Google Pay automatically)
- Show total + tip breakdown
- On payment success → clear `localStorage` session token → show confirmation

Step 3 — **Confirmation**:

- Checkmark, "Payment received", total paid
- "Back to menu" button

### Settings — Payments tab

New tab in `SettingsView.tsx`:

**Enable payments toggle (top of tab):**

- Toggle: "Accept digital payments" → sets `paymentsEnabled`
- When OFF: "Request Bill" button hidden on public menu; payment intent routes return 403 for this restaurant; Stripe Connect + tips sections still visible so owner can configure in advance
- When ON but `!stripeOnboarded`: show warning banner "Connect Stripe to start accepting payments"
- Use case: restaurants using app for ordering + loyalty only (cash / physical POS) can leave this off indefinitely

**Stripe Connect section:**

- If `!stripeOnboarded`: "Connect Stripe" button → calls `POST /api/restaurants/:id/stripe/connect` → redirect to Stripe onboarding URL
- If `stripeOnboarded`: green badge "Stripe Connected" + "Disconnect" option

**Tips section** (visible when `paymentsEnabled`):

- Toggle: "Enable tips"
- When enabled: editable list of quick-tip % options (default [2, 4, 5]) + add/remove buttons
- Save → `PATCH /api/restaurants/:id` with `{ tipsEnabled, tipOptions }`

### Owner dashboard — table view

Each table card shows:

- Orange dot = OPEN session (orders pending payment)
- Green dot = PAID (recent session)
- Owner can manually close a session (cash payment / customer left) via a "Close session" button

---

## MyPOS — Future Integration

When ready, add `MyposPaymentProvider` implementing `IPaymentProvider`:

- `createPaymentIntent` → MyPOS online payment API call → returns redirect URL or embedded widget
- `constructWebhookEvent` → parse MyPOS callback

`PaymentService` selects provider based on `restaurant.paymentProvider` field (add `STRIPE | MYPOS` enum to Restaurant later).

Zero changes to `TableSession`, `Payment`, or frontend flow — only the provider implementation changes.

---

## Payment Flow Diagram

```
Customer browser                Backend                    Stripe
─────────────────────────────────────────────────────────────────
scan QR → place order ──────→ create TableSession ────────────────
          store token ←─────── return token
place more orders ─────────→ link to session
tap "Request Bill" ─────────→ GET session bill ←── orders sum
tip selection
tap "Pay" ──────────────────→ create PaymentIntent ──→ Stripe PI
                    ←────────── clientSecret
Stripe Elements loads
customer pays ──────────────────────────────────────→ charge
                                  ←── webhook: succeeded
                     update Payment SUCCEEDED
                     update Session PAID
                     emit socket payment:confirmed
confirmation screen
```

---

## Files Changed Summary

| File                                                     | Change                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/backend/prisma/schema.prisma`                      | Add `TableSession`, `Payment`, new enums, Restaurant/Order/Table fields |
| `apps/backend/src/payment/payment-provider.interface.ts` | New — provider abstraction                                              |
| `apps/backend/src/payment/stripe.provider.ts`            | New — Stripe implementation                                             |
| `apps/backend/src/payment/payment.service.ts`            | New — orchestration                                                     |
| `apps/backend/src/payment/payment.controller.ts`         | New — HTTP routes                                                       |
| `apps/backend/src/payment/payment.module.ts`             | New — module wiring                                                     |
| `apps/backend/src/restaurants/restaurants.service.ts`    | Add Stripe Connect onboarding methods                                   |
| `apps/backend/src/restaurants/restaurants.controller.ts` | Add `/stripe/connect`, `/stripe/status` routes                          |
| `apps/backend/src/orders/orders.service.ts`              | Accept `sessionToken`, wire `tableSessionId`                            |
| `apps/backend/src/orders/dto/create-order.dto.ts`        | Add optional `sessionToken` field                                       |
| `apps/backend/src/app.module.ts`                         | Register `PaymentModule`                                                |
| `apps/backend/.env` + `.env.example`                     | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                            |
| `apps/frontend/.env`                                     | `VITE_STRIPE_PUBLISHABLE_KEY`                                           |
| `apps/frontend/src/pages/PublicMenuPage.tsx`             | Session token management, "Request Bill" button                         |
| `apps/frontend/src/components/payment/PaymentModal.tsx`  | New — tip + Stripe Elements + confirmation                              |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx`     | Payments tab (Connect + tips config)                                    |
| `apps/frontend/src/pages/Dashboard/TablesView.tsx`       | Session status indicators per table                                     |
| `apps/frontend/src/locales/en/translation.json`          | Payment + tips i18n keys                                                |
| `apps/frontend/src/locales/bg/translation.json`          | Same in Bulgarian                                                       |
| `apps/frontend/src/locales/ro/translation.json`          | Same in Romanian                                                        |
