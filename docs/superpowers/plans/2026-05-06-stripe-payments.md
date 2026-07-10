# Stripe Pay-at-Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pay-at-table flow using Stripe Connect — customers scan a QR code, order, then pay from their phone; restaurants receive funds minus a platform fee.

**Architecture:** A `TableSession` groups all orders from one browser during a table visit using a token stored in `localStorage`. A `Payment` record tracks each Stripe PaymentIntent. `StripeProvider` implements `IPaymentProvider` (abstraction for future MyPOS). `PaymentService` orchestrates sessions, billing, and Stripe calls; `RestaurantsService` handles Stripe Connect onboarding. Both `PrismaService` and `EventsGateway` are `@Global()` — no module import needed.

**Tech Stack:** NestJS 11, Prisma 6, stripe npm package, React 18, @stripe/react-stripe-js, @stripe/stripe-js, TanStack Query, i18next

---

## File Map

| Action | Path                                                              |
| ------ | ----------------------------------------------------------------- |
| Modify | `apps/backend/prisma/schema.prisma`                               |
| Create | `apps/backend/src/payment/payment-provider.interface.ts`          |
| Create | `apps/backend/src/payment/stripe.provider.ts`                     |
| Create | `apps/backend/src/payment/stripe.provider.spec.ts`                |
| Create | `apps/backend/src/payment/payment.service.ts`                     |
| Create | `apps/backend/src/payment/payment.service.spec.ts`                |
| Create | `apps/backend/src/payment/payment.controller.ts`                  |
| Create | `apps/backend/src/payment/payment.module.ts`                      |
| Modify | `apps/backend/src/main.ts`                                        |
| Modify | `apps/backend/src/app.module.ts`                                  |
| Modify | `apps/backend/src/restaurants/restaurants.service.ts`             |
| Create | `apps/backend/src/restaurants/restaurants-stripe.service.spec.ts` |
| Modify | `apps/backend/src/restaurants/restaurants.controller.ts`          |
| Modify | `apps/backend/src/restaurants/restaurants.module.ts`              |
| Modify | `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`       |
| Modify | `apps/backend/src/orders/dto/create-order.dto.ts`                 |
| Modify | `apps/backend/src/orders/orders.service.ts`                       |
| Modify | `apps/frontend/src/lib/api.ts`                                    |
| Modify | `apps/frontend/src/pages/PublicMenuPage.tsx`                      |
| Create | `apps/frontend/src/components/payment/PaymentModal.tsx`           |
| Modify | `apps/frontend/src/pages/Dashboard/SettingsView.tsx`              |
| Modify | `apps/frontend/src/components/tables/TableView.tsx`               |
| Modify | `apps/frontend/src/locales/en/translation.json`                   |
| Modify | `apps/frontend/src/locales/bg/translation.json`                   |
| Modify | `apps/frontend/src/locales/ro/translation.json`                   |

---

## Task 1: DB Schema — TableSession, Payment, new enums, field additions

**Files:**

- Modify: `apps/backend/prisma/schema.prisma`

> No unit test for schema — verify by running `npx prisma db push` successfully.

- [ ] **Step 1: Add new enums and models to schema**

Add at the end of `apps/backend/prisma/schema.prisma`, after the last `enum` block:

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
  table        RestaurantTable    @relation(fields: [tableId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([tableId, status])
  @@map("table_session")
}

model Payment {
  id                    String          @id @default(cuid())
  tableSessionId        String
  restaurantId          String
  stripePaymentIntentId String?         @unique
  amount                Float
  tipAmount             Float           @default(0)
  platformFeeAmount     Float           @default(0)
  currency              String          @default("eur")
  status                PaymentStatus   @default(PENDING)
  provider              PaymentProvider @default(STRIPE)
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
  tableSession          TableSession    @relation(fields: [tableSessionId], references: [id])
  restaurant            Restaurant      @relation(fields: [restaurantId], references: [id])

  @@index([stripePaymentIntentId])
  @@map("payment")
}

enum TableSessionStatus {
  OPEN
  PAID
  CLOSED_NO_PAYMENT
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

- [ ] **Step 2: Add fields to Restaurant model**

In `schema.prisma`, inside the `Restaurant` model block, after `defaultTheme` field (line ~63), add:

```prisma
  stripeAccountId      String?
  stripeOnboarded      Boolean  @default(false)
  paymentsEnabled      Boolean  @default(false)
  tipsEnabled          Boolean  @default(false)
  tipOptions           Int[]    @default([2, 4, 5])
  platformFeePercent   Float    @default(0.5)
  tableSessions        TableSession[]
  payments             Payment[]
```

- [ ] **Step 3: Add field to Order model**

In the `Order` model block, after `specialRequests` field, add:

```prisma
  tableSessionId String?
  tableSession   TableSession? @relation(fields: [tableSessionId], references: [id])
```

- [ ] **Step 4: Add relation to RestaurantTable model**

In the `RestaurantTable` model block, after `restaurant` relation, add:

```prisma
  sessions TableSession[]
```

- [ ] **Step 5: Push schema to Neon**

Run in `apps/backend`:

```bash
cd apps/backend && npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 6: Regenerate Prisma client**

```bash
cd apps/backend && npx prisma generate
```

Expected: `Generated Prisma Client (v6.x.x) to ./node_modules/@prisma/client`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/prisma/schema.prisma
git commit -m "feat: add TableSession, Payment models and Stripe fields to schema"
```

---

## Task 2: Install Stripe packages

**Files:** `apps/backend/package.json`, `apps/frontend/package.json`

- [ ] **Step 1: Install Stripe SDK in backend**

```bash
cd apps/backend && npm install stripe
```

Expected: `added 1 package`

- [ ] **Step 2: Install Stripe.js in frontend**

```bash
cd apps/frontend && npm install @stripe/stripe-js @stripe/react-stripe-js
```

Expected: `added 2 packages`

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json apps/backend/package-lock.json apps/frontend/package.json apps/frontend/package-lock.json
git commit -m "chore: install stripe + @stripe/react-stripe-js packages"
```

---

## Task 3: Payment provider interface + StripeProvider

**Files:**

- Create: `apps/backend/src/payment/payment-provider.interface.ts`
- Create: `apps/backend/src/payment/stripe.provider.ts`
- Create: `apps/backend/src/payment/stripe.provider.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/payment/stripe.provider.spec.ts`:

```typescript
import { StripeProvider } from "./stripe.provider";

describe("StripeProvider", () => {
  let provider: StripeProvider;
  let mockStripe: any;

  beforeEach(() => {
    provider = new StripeProvider();
    mockStripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          client_secret: "cs_test_secret",
          id: "pi_test_123",
        }),
      },
      webhooks: {
        constructEvent: jest
          .fn()
          .mockReturnValue({ type: "payment_intent.succeeded" }),
      },
      accounts: {
        create: jest.fn().mockResolvedValue({ id: "acct_new" }),
        retrieve: jest.fn().mockResolvedValue({ charges_enabled: true }),
      },
      accountLinks: {
        create: jest
          .fn()
          .mockResolvedValue({ url: "https://connect.stripe.com/onboard" }),
      },
    };
    (provider as any).stripe = mockStripe;
  });

  describe("createPaymentIntent", () => {
    it("creates a PaymentIntent with correct params and returns clientSecret + paymentIntentId", async () => {
      const result = await provider.createPaymentIntent({
        amountCents: 2000,
        currency: "eur",
        restaurantStripeAccountId: "acct_123",
        platformFeeCents: 100,
        metadata: { sessionId: "s1", paymentId: "p1" },
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 2000,
        currency: "eur",
        automatic_payment_methods: { enabled: true },
        application_fee_amount: 100,
        transfer_data: { destination: "acct_123" },
        metadata: { sessionId: "s1", paymentId: "p1" },
      });
      expect(result).toEqual({
        clientSecret: "cs_test_secret",
        paymentIntentId: "pi_test_123",
      });
    });
  });

  describe("constructWebhookEvent", () => {
    it("delegates to stripe.webhooks.constructEvent and returns the event", () => {
      const payload = Buffer.from("{}");
      const sig = "sig_test";
      const result = provider.constructWebhookEvent(payload, sig);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        payload,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
      expect(result.type).toBe("payment_intent.succeeded");
    });
  });

  describe("createExpressAccount", () => {
    it("creates a Stripe Express account and returns the id", async () => {
      const result = await provider.createExpressAccount();
      expect(mockStripe.accounts.create).toHaveBeenCalledWith({
        type: "express",
      });
      expect(result).toBe("acct_new");
    });
  });

  describe("createAccountLink", () => {
    it("creates an account link and returns the url", async () => {
      const result = await provider.createAccountLink(
        "acct_123",
        "https://refresh",
        "https://return",
      );
      expect(mockStripe.accountLinks.create).toHaveBeenCalledWith({
        account: "acct_123",
        refresh_url: "https://refresh",
        return_url: "https://return",
        type: "account_onboarding",
      });
      expect(result).toBe("https://connect.stripe.com/onboard");
    });
  });

  describe("retrieveAccount", () => {
    it("retrieves a Stripe account and returns charges_enabled", async () => {
      const result = await provider.retrieveAccount("acct_123");
      expect(mockStripe.accounts.retrieve).toHaveBeenCalledWith("acct_123");
      expect(result).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && npx jest src/payment/stripe.provider.spec.ts -t "StripeProvider" --no-coverage
```

Expected: FAIL — `Cannot find module './stripe.provider'`

- [ ] **Step 3: Create the interface**

Create `apps/backend/src/payment/payment-provider.interface.ts`:

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

- [ ] **Step 4: Implement StripeProvider**

Create `apps/backend/src/payment/stripe.provider.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import Stripe from "stripe";
import { IPaymentProvider } from "./payment-provider.interface";

@Injectable()
export class StripeProvider implements IPaymentProvider {
  private readonly stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
  }

  async createPaymentIntent(params: {
    amountCents: number;
    currency: string;
    restaurantStripeAccountId: string;
    platformFeeCents: number;
    metadata: Record<string, string>;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const intent = await this.stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: params.currency,
      automatic_payment_methods: { enabled: true },
      application_fee_amount: params.platformFeeCents,
      transfer_data: { destination: params.restaurantStripeAccountId },
      metadata: params.metadata,
    });
    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET || "",
    );
  }

  async createExpressAccount(): Promise<string> {
    const account = await this.stripe.accounts.create({ type: "express" });
    return account.id;
  }

  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return link.url;
  }

  async retrieveAccount(accountId: string): Promise<boolean> {
    const account = await this.stripe.accounts.retrieve(accountId);
    return account.charges_enabled;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/backend && npx jest src/payment/stripe.provider.spec.ts --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 6: Run full test suite to check no regressions**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All previously passing tests still pass

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/payment/
git commit -m "feat: add IPaymentProvider interface and StripeProvider implementation"
```

---

## Task 4: PaymentService

**Files:**

- Create: `apps/backend/src/payment/payment.service.ts`
- Create: `apps/backend/src/payment/payment.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/payment/payment.service.spec.ts`:

```typescript
import { PaymentService } from "./payment.service";
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";

describe("PaymentService", () => {
  let service: PaymentService;
  let mockPrisma: any;
  let mockStripeProvider: any;
  let mockEvents: any;

  beforeEach(() => {
    mockPrisma = {
      tableSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
      },
      restaurant: {
        findUnique: jest.fn(),
      },
    };
    mockStripeProvider = {
      createPaymentIntent: jest.fn(),
      constructWebhookEvent: jest.fn(),
    };
    mockEvents = {
      emitToRestaurant: jest.fn(),
    };

    service = new PaymentService(mockPrisma, mockStripeProvider, mockEvents);
  });

  describe("getOrCreateSession", () => {
    it("returns existing OPEN session when valid token is provided", async () => {
      const existing = { id: "s1", token: "tok1", status: "OPEN" };
      mockPrisma.tableSession.findFirst.mockResolvedValue(existing);

      const result = await service.getOrCreateSession(
        "table1",
        "rest1",
        "tok1",
      );

      expect(result.session).toEqual(existing);
      expect(result.token).toBe("tok1");
      expect(mockPrisma.tableSession.create).not.toHaveBeenCalled();
    });

    it("creates a new session when no token is provided", async () => {
      const created = { id: "s2", token: "tok2", status: "OPEN" };
      mockPrisma.tableSession.create.mockResolvedValue(created);

      const result = await service.getOrCreateSession(
        "table1",
        "rest1",
        undefined,
      );

      expect(mockPrisma.tableSession.create).toHaveBeenCalledWith({
        data: { tableId: "table1", restaurantId: "rest1" },
      });
      expect(result.token).toBe("tok2");
    });

    it("creates a new session when token does not match an OPEN session", async () => {
      const created = { id: "s3", token: "tok3", status: "OPEN" };
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      mockPrisma.tableSession.create.mockResolvedValue(created);

      const result = await service.getOrCreateSession(
        "table1",
        "rest1",
        "stale-token",
      );

      expect(mockPrisma.tableSession.create).toHaveBeenCalled();
      expect(result.token).toBe("tok3");
    });
  });

  describe("getSessionBill", () => {
    it("returns bill info including subtotal and tip options", async () => {
      const session = {
        id: "s1",
        token: "tok1",
        restaurantId: "rest1",
        status: "OPEN",
        restaurant: { tipsEnabled: true, tipOptions: [5, 10, 15] },
      };
      mockPrisma.tableSession.findFirst.mockResolvedValue(session);
      mockPrisma.order.findMany.mockResolvedValue([
        { totalPrice: 15.0 },
        { totalPrice: 8.5 },
      ]);

      const result = await service.getSessionBill("tok1");

      expect(result.subtotal).toBeCloseTo(23.5);
      expect(result.tipsEnabled).toBe(true);
      expect(result.tipOptions).toEqual([5, 10, 15]);
    });

    it("throws NotFoundException when session not found", async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue(null);
      await expect(service.getSessionBill("bad-token")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("createPaymentIntent", () => {
    it("throws ForbiddenException when paymentsEnabled is false", async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: "s1",
        restaurantId: "rest1",
        restaurant: {
          paymentsEnabled: false,
          stripeOnboarded: true,
          stripeAccountId: "acct_1",
          platformFeePercent: 0.5,
          tipsEnabled: false,
          tipOptions: [],
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent("tok1", 0)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws BadRequestException when stripeOnboarded is false", async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: "s1",
        restaurantId: "rest1",
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: false,
          stripeAccountId: null,
          platformFeePercent: 0.5,
          tipsEnabled: false,
          tipOptions: [],
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20 }]);

      await expect(service.createPaymentIntent("tok1", 0)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("calculates totals, creates Payment record, and returns clientSecret", async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: "s1",
        restaurantId: "rest1",
        restaurant: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: "acct_123",
          platformFeePercent: 0.5,
          tipsEnabled: true,
          tipOptions: [5, 10],
        },
      });
      mockPrisma.order.findMany.mockResolvedValue([{ totalPrice: 20.0 }]);
      mockPrisma.payment.create.mockResolvedValue({ id: "pay1" });
      mockStripeProvider.createPaymentIntent.mockResolvedValue({
        clientSecret: "cs_test",
        paymentIntentId: "pi_test",
      });
      mockPrisma.payment.update.mockResolvedValue({});

      const result = await service.createPaymentIntent("tok1", 10); // 10% tip

      // subtotal = 20, tip = 2 (10%), total = 22
      expect(result.total).toBeCloseTo(22);
      expect(result.tipAmount).toBeCloseTo(2);
      expect(mockStripeProvider.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 2200, // 22 * 100
          currency: "eur",
          restaurantStripeAccountId: "acct_123",
          platformFeeCents: 11, // 22 * 0.5 / 100 * 100 = 11
        }),
      );
      expect(result.clientSecret).toBe("cs_test");
    });
  });

  describe("handleWebhookEvent", () => {
    it("on payment_intent.succeeded: updates Payment + TableSession + emits socket event", async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test" } },
      });
      const payment = {
        id: "pay1",
        tableSessionId: "s1",
        tableSession: { restaurantId: "rest1" },
      };
      mockPrisma.payment.findFirst.mockResolvedValue(payment);
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.tableSession.update.mockResolvedValue({});

      await service.handleWebhookEvent(Buffer.from("{}"), "sig");

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: "pay1" },
        data: { status: "SUCCEEDED", stripePaymentIntentId: "pi_test" },
      });
      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { status: "PAID", paidAt: expect.any(Date) },
      });
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        "rest1",
        "payment:confirmed",
        expect.any(Object),
      );
    });

    it("on payment_intent.payment_failed: updates Payment status to FAILED", async () => {
      mockStripeProvider.constructWebhookEvent.mockReturnValue({
        type: "payment_intent.payment_failed",
        data: { object: { id: "pi_test" } },
      });
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: "pay1",
        tableSessionId: "s1",
        tableSession: { restaurantId: "rest1" },
      });
      mockPrisma.payment.update.mockResolvedValue({});

      await service.handleWebhookEvent(Buffer.from("{}"), "sig");

      expect(mockPrisma.payment.update).toHaveBeenCalledWith({
        where: { id: "pay1" },
        data: { status: "FAILED" },
      });
    });
  });

  describe("closeSession", () => {
    it("sets session status to CLOSED_NO_PAYMENT", async () => {
      mockPrisma.tableSession.findFirst.mockResolvedValue({
        id: "s1",
        status: "OPEN",
        restaurantId: "rest1",
      });
      mockPrisma.tableSession.update.mockResolvedValue({});

      await service.closeSession("tok1", "rest1");

      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { status: "CLOSED_NO_PAYMENT" },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && npx jest src/payment/payment.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './payment.service'`

- [ ] **Step 3: Implement PaymentService**

Create `apps/backend/src/payment/payment.service.ts`:

```typescript
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StripeProvider } from "./stripe.provider";
import { EventsGateway } from "../events/events.gateway";

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeProvider,
    private readonly events: EventsGateway,
  ) {}

  async getOrCreateSession(
    tableId: string,
    restaurantId: string,
    token?: string,
  ): Promise<{ session: any; token: string }> {
    if (token) {
      const existing = await this.prisma.tableSession.findFirst({
        where: { token, status: "OPEN" },
      });
      if (existing) return { session: existing, token };
    }

    const session = await this.prisma.tableSession.create({
      data: { tableId, restaurantId },
    });
    return { session, token: session.token };
  }

  async getSessionBill(token: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: "OPEN" },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException("Session not found");

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });

    const subtotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);

    return {
      orders,
      subtotal,
      restaurantId: session.restaurantId,
      tipsEnabled: session.restaurant.tipsEnabled,
      tipOptions: session.restaurant.tipOptions,
    };
  }

  async createPaymentIntent(token: string, tipPercent: number) {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, status: "OPEN" },
      include: { restaurant: true },
    });

    if (!session) throw new NotFoundException("Session not found");

    const { restaurant } = session;

    if (!restaurant.paymentsEnabled) {
      throw new ForbiddenException(
        "Payments are not enabled for this restaurant",
      );
    }

    if (!restaurant.stripeOnboarded || !restaurant.stripeAccountId) {
      throw new BadRequestException("Stripe not connected");
    }

    const orders = await this.prisma.order.findMany({
      where: { tableSessionId: session.id },
    });

    const subtotal = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const tipAmount = Math.round(subtotal * tipPercent) / 100;
    const total = subtotal + tipAmount;
    const platformFee = (total * restaurant.platformFeePercent) / 100;

    const payment = await this.prisma.payment.create({
      data: {
        tableSessionId: session.id,
        restaurantId: session.restaurantId,
        amount: total,
        tipAmount,
        platformFeeAmount: platformFee,
        currency: "eur",
        status: "PENDING",
      },
    });

    const { clientSecret, paymentIntentId } =
      await this.stripe.createPaymentIntent({
        amountCents: Math.round(total * 100),
        currency: "eur",
        restaurantStripeAccountId: restaurant.stripeAccountId,
        platformFeeCents: Math.round(platformFee * 100),
        metadata: { sessionId: session.id, paymentId: payment.id },
      });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { stripePaymentIntentId: paymentIntentId },
    });

    return { clientSecret, paymentId: payment.id, total, tipAmount };
  }

  async handleWebhookEvent(payload: Buffer, signature: string) {
    const event = this.stripe.constructWebhookEvent(payload, signature);

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as any;
      const payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
        include: { tableSession: true },
      });
      if (!payment) return;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCEEDED", stripePaymentIntentId: intent.id },
      });

      await this.prisma.tableSession.update({
        where: { id: payment.tableSessionId },
        data: { status: "PAID", paidAt: new Date() },
      });

      this.events.emitToRestaurant(
        payment.tableSession.restaurantId,
        "payment:confirmed",
        { paymentId: payment.id, tableSessionId: payment.tableSessionId },
      );
    }

    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as any;
      const payment = await this.prisma.payment.findFirst({
        where: { stripePaymentIntentId: intent.id },
      });
      if (!payment) return;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
    }
  }

  async closeSession(token: string, restaurantId: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { token, restaurantId, status: "OPEN" },
    });
    if (!session) throw new NotFoundException("Session not found");

    await this.prisma.tableSession.update({
      where: { id: session.id },
      data: { status: "CLOSED_NO_PAYMENT" },
    });
  }

  async getTableSessions(restaurantId: string) {
    return this.prisma.tableSession.findMany({
      where: { restaurantId, status: { in: ["OPEN", "PAID"] } },
      orderBy: { createdAt: "desc" },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && npx jest src/payment/payment.service.spec.ts --no-coverage
```

Expected: PASS — 8 tests pass

- [ ] **Step 5: Run full test suite**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/payment/payment.service.ts apps/backend/src/payment/payment.service.spec.ts
git commit -m "feat: add PaymentService with session, bill, intent, and webhook handling"
```

---

## Task 5: PaymentController + PaymentModule

**Files:**

- Create: `apps/backend/src/payment/payment.controller.ts`
- Create: `apps/backend/src/payment/payment.module.ts`

> No unit tests for controller — routes are thin delegations, tested via integration or manually.

- [ ] **Step 1: Create PaymentController**

Create `apps/backend/src/payment/payment.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PaymentService } from "./payment.service";

@Controller("payments")
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post("session")
  @HttpCode(HttpStatus.OK)
  getOrCreateSession(
    @Body()
    body: {
      tableId: string;
      restaurantId: string;
      sessionToken?: string;
    },
  ) {
    return this.paymentService.getOrCreateSession(
      body.tableId,
      body.restaurantId,
      body.sessionToken,
    );
  }

  @Get("session/:token/bill")
  getSessionBill(@Param("token") token: string) {
    return this.paymentService.getSessionBill(token);
  }

  @Post("session/:token/intent")
  @HttpCode(HttpStatus.OK)
  createPaymentIntent(
    @Param("token") token: string,
    @Body() body: { tipPercent: number },
  ) {
    return this.paymentService.createPaymentIntent(token, body.tipPercent ?? 0);
  }

  @Post("session/:token/close")
  @HttpCode(HttpStatus.OK)
  closeSession(
    @Param("token") token: string,
    @Body() body: { restaurantId: string },
  ) {
    return this.paymentService.closeSession(token, body.restaurantId);
  }

  @Get("sessions/:restaurantId")
  getTableSessions(@Param("restaurantId") restaurantId: string) {
    return this.paymentService.getTableSessions(restaurantId);
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  handleWebhook(
    @Req() req: any,
    @Headers("stripe-signature") signature: string,
  ) {
    return this.paymentService.handleWebhookEvent(req.body, signature);
  }
}
```

- [ ] **Step 2: Create PaymentModule**

Create `apps/backend/src/payment/payment.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { PaymentController } from "./payment.controller";
import { StripeProvider } from "./stripe.provider";

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, StripeProvider],
  exports: [StripeProvider],
})
export class PaymentModule {}
```

- [ ] **Step 3: Run full test suite**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass (new files have no spec yet — that's fine)

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/payment/payment.controller.ts apps/backend/src/payment/payment.module.ts
git commit -m "feat: add PaymentController and PaymentModule"
```

---

## Task 6: main.ts — raw body for webhook

**Files:**

- Modify: `apps/backend/src/main.ts`

The webhook endpoint requires the raw (unparsed) request body for Stripe signature verification. NestJS applies body-parser by default. We disable it and apply manually so the webhook path gets raw bytes.

- [ ] **Step 1: Update main.ts**

Replace the full contents of `apps/backend/src/main.ts` with:

```typescript
import { NestFactory } from "@nestjs/core";
import { RequestMethod } from "@nestjs/common";
import * as express from "express";
import { AppModule } from "./app.module";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    app.enableCors({
      origin: process.env.FRONTEND_URL || "http://localhost:3001",
      credentials: true,
    });

    // Webhook must receive raw body for Stripe signature verification
    app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

    // All other routes get parsed JSON
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.setGlobalPrefix("api", {
      exclude: [{ path: "/", method: RequestMethod.GET }],
    });

    const config = new DocumentBuilder()
      .setTitle("QR Menu API")
      .setDescription("API for QR-based restaurant menu system")
      .setVersion("1.0")
      .addTag("authentication", "Endpoints for user authentication")
      .addTag("menu", "Endpoints for menu management")
      .addTag("restaurants", "Endpoints for restaurant management")
      .addTag("dashboard", "Endpoints for dashboard statistics")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api-docs", app, document);

    await app.listen(3000, "0.0.0.0");
    console.log("✅ Application is running");
  } catch (error) {
    console.error("❌ Application failed to start:", error);
    process.exit(1);
  }
}
bootstrap();
```

- [ ] **Step 2: Verify backend still compiles**

```bash
cd apps/backend && npm run build
```

Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/main.ts
git commit -m "fix: configure raw body for Stripe webhook endpoint in main.ts"
```

---

## Task 7: app.module.ts — register PaymentModule

**Files:**

- Modify: `apps/backend/src/app.module.ts`

- [ ] **Step 1: Add PaymentModule import**

In `apps/backend/src/app.module.ts`, add the import:

```typescript
import { PaymentModule } from "./payment/payment.module";
```

And add `PaymentModule` to the `imports` array after `LoyaltyModule`:

```typescript
    LoyaltyModule,
    PaymentModule,
```

- [ ] **Step 2: Verify backend compiles and tests pass**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/app.module.ts
git commit -m "feat: register PaymentModule in AppModule"
```

---

## Task 8: RestaurantsService — Stripe Connect methods

**Files:**

- Modify: `apps/backend/src/restaurants/restaurants.service.ts`
- Create: `apps/backend/src/restaurants/restaurants-stripe.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/restaurants/restaurants-stripe.service.spec.ts`:

```typescript
import { RestaurantsService } from "./restaurants.service";
import { NotFoundException, ForbiddenException } from "@nestjs/common";

describe("RestaurantsService — Stripe Connect", () => {
  let service: RestaurantsService;
  let mockPrisma: any;
  let mockTranslation: any;
  let mockStripe: any;

  beforeEach(() => {
    mockPrisma = {
      restaurant: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockTranslation = {};
    mockStripe = {
      createExpressAccount: jest.fn().mockResolvedValue("acct_new"),
      createAccountLink: jest
        .fn()
        .mockResolvedValue("https://connect.stripe.com/onboard"),
      retrieveAccount: jest.fn().mockResolvedValue(true),
    };

    service = new RestaurantsService(
      mockPrisma,
      mockTranslation as any,
      mockStripe as any,
    );
  });

  describe("generateConnectLink", () => {
    it("creates a new Express account when restaurant has no stripeAccountId", async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: "rest1",
        ownerId: "user1",
        stripeAccountId: null,
      });

      const result = await service.generateConnectLink("rest1", "user1");

      expect(mockStripe.createExpressAccount).toHaveBeenCalled();
      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "rest1" },
          data: expect.objectContaining({ stripeAccountId: "acct_new" }),
        }),
      );
      expect(result.url).toBe("https://connect.stripe.com/onboard");
    });

    it("reuses existing stripeAccountId when already set", async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: "rest1",
        ownerId: "user1",
        stripeAccountId: "acct_existing",
      });

      await service.generateConnectLink("rest1", "user1");

      expect(mockStripe.createExpressAccount).not.toHaveBeenCalled();
      expect(mockStripe.createAccountLink).toHaveBeenCalledWith(
        "acct_existing",
        expect.any(String),
        expect.any(String),
      );
    });

    it("throws ForbiddenException when userId does not own restaurant", async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: "rest1",
        ownerId: "other-user",
        stripeAccountId: null,
      });

      await expect(
        service.generateConnectLink("rest1", "user1"),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getStripeStatus", () => {
    it("returns stripeOnboarded=true and updates DB when charges_enabled", async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: "rest1",
        ownerId: "user1",
        stripeAccountId: "acct_123",
        stripeOnboarded: false,
      });
      mockStripe.retrieveAccount.mockResolvedValue(true);

      const result = await service.getStripeStatus("rest1", "user1");

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: "rest1" },
        data: { stripeOnboarded: true },
      });
      expect(result.stripeOnboarded).toBe(true);
    });

    it("returns stripeOnboarded=false when no stripeAccountId", async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: "rest1",
        ownerId: "user1",
        stripeAccountId: null,
        stripeOnboarded: false,
      });

      const result = await service.getStripeStatus("rest1", "user1");

      expect(mockStripe.retrieveAccount).not.toHaveBeenCalled();
      expect(result.stripeOnboarded).toBe(false);
    });
  });

  describe("disconnectStripe", () => {
    it("clears stripeAccountId and sets stripeOnboarded=false", async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: "rest1",
        ownerId: "user1",
        stripeAccountId: "acct_123",
      });

      await service.disconnectStripe("rest1", "user1");

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: "rest1" },
        data: { stripeAccountId: null, stripeOnboarded: false },
      });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend && npx jest src/restaurants/restaurants-stripe.service.spec.ts --no-coverage
```

Expected: FAIL — `service.generateConnectLink is not a function` (method not yet added)

- [ ] **Step 3: Inject StripeProvider and add connect methods to RestaurantsService**

In `apps/backend/src/restaurants/restaurants.service.ts`, update the constructor and add three new methods:

Add import at top:

```typescript
import { StripeProvider } from "../payment/stripe.provider";
```

Update the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly translationService: TranslationService,
    private readonly stripeProvider: StripeProvider,
  ) {}
```

Add these three methods at the end of the class (before the closing `}`):

```typescript
  async generateConnectLink(restaurantId: string, userId: string) {
    const restaurant = await this.findOne(restaurantId, userId);

    let accountId = restaurant.stripeAccountId;
    if (!accountId) {
      accountId = await this.stripeProvider.createExpressAccount();
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeAccountId: accountId },
      });
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const url = await this.stripeProvider.createAccountLink(
      accountId,
      `${baseUrl}/dashboard/settings?stripe=refresh`,
      `${baseUrl}/dashboard/settings?stripe=success`,
    );

    return { url };
  }

  async getStripeStatus(restaurantId: string, userId: string) {
    const restaurant = await this.findOne(restaurantId, userId);

    if (!restaurant.stripeAccountId) {
      return { stripeOnboarded: false };
    }

    const chargesEnabled = await this.stripeProvider.retrieveAccount(
      restaurant.stripeAccountId,
    );

    if (chargesEnabled && !restaurant.stripeOnboarded) {
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeOnboarded: true },
      });
    }

    return { stripeOnboarded: chargesEnabled };
  }

  async disconnectStripe(restaurantId: string, userId: string) {
    await this.findOne(restaurantId, userId);

    return this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { stripeAccountId: null, stripeOnboarded: false },
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend && npx jest src/restaurants/restaurants-stripe.service.spec.ts --no-coverage
```

Expected: PASS — 6 tests pass

- [ ] **Step 5: Run full test suite**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/restaurants/restaurants.service.ts apps/backend/src/restaurants/restaurants-stripe.service.spec.ts
git commit -m "feat: add Stripe Connect methods to RestaurantsService"
```

---

## Task 9: RestaurantsController + RestaurantsModule — connect routes

**Files:**

- Modify: `apps/backend/src/restaurants/restaurants.controller.ts`
- Modify: `apps/backend/src/restaurants/restaurants.module.ts`

- [ ] **Step 1: Add Stripe Connect routes to RestaurantsController**

In `apps/backend/src/restaurants/restaurants.controller.ts`, after the existing `translateAll` route, add:

```typescript
  @Post(':id/stripe/connect')
  generateConnectLink(@Param('id') id: string, @Request() req) {
    return this.restaurantsService.generateConnectLink(id, req.user.id);
  }

  @Get(':id/stripe/status')
  getStripeStatus(@Param('id') id: string, @Request() req) {
    return this.restaurantsService.getStripeStatus(id, req.user.id);
  }

  @Post(':id/stripe/disconnect')
  disconnectStripe(@Param('id') id: string, @Request() req) {
    return this.restaurantsService.disconnectStripe(id, req.user.id);
  }
```

- [ ] **Step 2: Update RestaurantsModule to import PaymentModule**

Replace `apps/backend/src/restaurants/restaurants.module.ts` with:

```typescript
import { Module } from "@nestjs/common";
import { RestaurantsService } from "./restaurants.service";
import { RestaurantsController } from "./restaurants.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { TranslationModule } from "../translation/translation.module";
import { PaymentModule } from "../payment/payment.module";

@Module({
  imports: [PrismaModule, TranslationModule, PaymentModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
  exports: [RestaurantsService],
})
export class RestaurantsModule {}
```

- [ ] **Step 3: Build and run tests**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/restaurants/restaurants.controller.ts apps/backend/src/restaurants/restaurants.module.ts
git commit -m "feat: add Stripe Connect routes to RestaurantsController"
```

---

## Task 10: update-restaurant.dto.ts — payment fields

**Files:**

- Modify: `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`

- [ ] **Step 1: Add payment validation fields**

In `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`, add these imports at the top (update the existing imports):

Add `IsArray` is already imported. Add `IsInt` to the existing import from `class-validator`:

```typescript
import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  IsInt,
  Min,
  Max,
} from "class-validator";
```

Then add these fields at the end of the class (before closing `}`):

```typescript
  @IsOptional()
  @IsBoolean()
  paymentsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  tipsEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(100, { each: true })
  tipOptions?: number[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  platformFeePercent?: number;
```

- [ ] **Step 2: Run full tests**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/restaurants/dto/update-restaurant.dto.ts
git commit -m "feat: add payment DTO fields to UpdateRestaurantDto"
```

---

## Task 11: Orders — sessionToken wiring

**Files:**

- Modify: `apps/backend/src/orders/dto/create-order.dto.ts`
- Modify: `apps/backend/src/orders/orders.service.ts`
- Modify: `apps/backend/src/orders/orders.module.ts`

The orders service needs to call `PaymentService.getOrCreateSession()`. Since `PaymentModule` exports `StripeProvider` (not `PaymentService`), the cleanest approach is to inline the session logic in `OrdersService` using `PrismaService` directly (which is global). This keeps modules loosely coupled and avoids a circular dependency.

- [ ] **Step 1: Add sessionToken to CreateOrderDto**

In `apps/backend/src/orders/dto/create-order.dto.ts`, add after the `redeemItemIds` field:

```typescript
  @IsString()
  @IsOptional()
  sessionToken?: string;
```

- [ ] **Step 2: Wire sessionToken in OrdersService**

In `apps/backend/src/orders/orders.service.ts`, update the `create` method to:

1. Accept `sessionToken` from the DTO
2. Resolve or create a `TableSession`
3. Link the order to the session
4. Return `sessionToken` in the response

Find the section in `create()` where the `Order` is created (around line 180+). Read the full create method to find the exact Prisma call, then update the order creation data block to include `tableSessionId`.

First, add this helper at the top of the `create` method (before the items validation):

```typescript
// Resolve or create TableSession for pay-at-table
let sessionToken = createOrderDto.sessionToken;
let tableSessionId: string | undefined;

if (createOrderDto.tableId) {
  // Lookup the table to get restaurantId
  // restaurantId is derived from menu items below — wire session after restaurant check
}
```

Actually, the full session wiring needs to happen AFTER `restaurantId` is known (line ~55). Here is the complete block to insert after the restaurant validation (after the `if (dbItem.category.restaurantId !== restaurantId)` throw block, before the happy hour section):

```typescript
// Resolve or create TableSession
let sessionToken = createOrderDto.sessionToken;
let tableSessionId: string | undefined;

if (sessionToken) {
  const existingSession = await this.prisma.tableSession.findFirst({
    where: { token: sessionToken, status: "OPEN" },
  });
  if (existingSession) {
    tableSessionId = existingSession.id;
  } else {
    sessionToken = undefined; // stale token — will create new below
  }
}

if (!tableSessionId) {
  const newSession = await this.prisma.tableSession.create({
    data: { tableId: createOrderDto.tableId, restaurantId },
  });
  tableSessionId = newSession.id;
  sessionToken = newSession.token;
}
```

Then in the `prisma.order.create` call, add `tableSessionId` to the `data` block:

```typescript
        tableSessionId,
```

And update the return value of `create()` to include `sessionToken`. Find the final `return` statement and wrap it:

```typescript
return { ...order, sessionToken };
```

**Note:** The exact line numbers shift. Read the current file to locate the `prisma.order.create` call (it's the large `data: { ... }` block with `customerName`, `tableId`, `restaurantId`, etc.) and add `tableSessionId` to it. The `return order` at the end becomes `return { ...order, sessionToken }`.

- [ ] **Step 3: Build to verify TypeScript compiles**

```bash
cd apps/backend && npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Run tests**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/orders/dto/create-order.dto.ts apps/backend/src/orders/orders.service.ts
git commit -m "feat: wire TableSession to Order creation, return sessionToken in response"
```

---

## Task 12: Frontend api.ts — payment API functions

**Files:**

- Modify: `apps/frontend/src/lib/api.ts`

- [ ] **Step 1: Add payment API functions**

In `apps/frontend/src/lib/api.ts`, append these functions at the end of the file:

```typescript
// Payment / TableSession

export const getOrCreateSession = async (
  tableId: string,
  restaurantId: string,
  sessionToken?: string,
) => {
  const response = await api.post("/payments/session", {
    tableId,
    restaurantId,
    sessionToken,
  });
  return response.data as { session: any; token: string };
};

export const getSessionBill = async (token: string) => {
  const response = await api.get(`/payments/session/${token}/bill`);
  return response.data as {
    orders: any[];
    subtotal: number;
    restaurantId: string;
    tipsEnabled: boolean;
    tipOptions: number[];
  };
};

export const createPaymentIntent = async (
  token: string,
  tipPercent: number,
) => {
  const response = await api.post(`/payments/session/${token}/intent`, {
    tipPercent,
  });
  return response.data as {
    clientSecret: string;
    paymentId: string;
    total: number;
    tipAmount: number;
  };
};

export const closeSession = async (token: string, restaurantId: string) => {
  const response = await api.post(`/payments/session/${token}/close`, {
    restaurantId,
  });
  return response.data;
};

export const getTableSessions = async (restaurantId: string) => {
  const response = await api.get(`/payments/sessions/${restaurantId}`);
  return response.data as Array<{
    id: string;
    token: string;
    tableId: string;
    status: string;
    createdAt: string;
    paidAt?: string;
  }>;
};

export const generateStripeConnectLink = async (restaurantId: string) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/stripe/connect`,
  );
  return response.data as { url: string };
};

export const getStripeStatus = async (restaurantId: string) => {
  const response = await api.get(`/restaurants/${restaurantId}/stripe/status`);
  return response.data as { stripeOnboarded: boolean };
};

export const disconnectStripe = async (restaurantId: string) => {
  const response = await api.post(
    `/restaurants/${restaurantId}/stripe/disconnect`,
  );
  return response.data;
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/lib/api.ts
git commit -m "feat: add payment and Stripe Connect API functions to frontend api.ts"
```

---

## Task 13: Frontend PublicMenuPage — session token + Request Bill button

**Files:**

- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx`

Changes:

1. Read `sessionToken` from `localStorage` keyed by `session-{tableId}` before order submission
2. Pass `sessionToken` to `createOrder`, store returned `sessionToken` if present
3. Show "Request Bill" button in the action bar when a session token exists
4. Clicking it calls `getSessionBill`, then opens `PaymentModal`

- [ ] **Step 1: Add session token state and modal state**

In `PublicMenuPage.tsx`, after the existing state declarations, add:

```typescript
const [sessionToken, setSessionToken] = useState<string | null>(null);
const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
```

Add the import for `PaymentModal` at the top:

```typescript
import { PaymentModal } from "../components/payment/PaymentModal";
import { getSessionBill } from "../lib/api";
```

- [ ] **Step 2: Load session token from localStorage on mount**

In the `useEffect` where `table` is read from URL params (around lines 42–49), add:

```typescript
if (table) {
  setTableNumber(table);
  const stored = localStorage.getItem(`session-${table}`);
  if (stored) setSessionToken(stored);
}
```

- [ ] **Step 3: Persist session token from order response**

Find the `handleCheckout` or order submission function in `PublicMenuPage.tsx`. The actual order submission happens in `CheckoutPage.tsx` (not in `PublicMenuPage`). Instead, the session token needs to be passed down to the cart and returned from checkout.

Since order submission happens in `CheckoutPage.tsx`, the session management is:

- `PublicMenuPage` reads `localStorage.getItem('session-{table}')` on mount and stores in state
- `CheckoutPage` must also read/write the session token

The `PublicMenuPage` state for `sessionToken` is used to show/hide the Request Bill button. The `CheckoutPage` manages its own localStorage read/write since it has direct access to the `tableId` from cart context.

In `CheckoutPage.tsx`, after a successful order creation, add:

```typescript
if (orderResponse.sessionToken) {
  localStorage.setItem(`session-${tableNumber}`, orderResponse.sessionToken);
}
```

For now, in `PublicMenuPage`, update the effect to re-check localStorage whenever `tableNumber` changes:

```typescript
useEffect(() => {
  if (tableNumber) {
    const stored = localStorage.getItem(`session-${tableNumber}`);
    setSessionToken(stored);
  }
}, [tableNumber]);
```

- [ ] **Step 4: Add Request Bill button to action bar**

Find the action bar section in `PublicMenuPage.tsx` (the `div` containing the `CartIcon` and Call Waiter button — it has `fixed bottom-0` classes). Add a Request Bill button before `CartIcon`:

```tsx
{
  sessionToken && (
    <Button
      variant="default"
      size="sm"
      className="bg-accent text-accent-foreground"
      onClick={async () => {
        try {
          await getSessionBill(sessionToken);
          setIsPaymentModalOpen(true);
        } catch {
          setSessionToken(null);
          if (tableNumber) localStorage.removeItem(`session-${tableNumber}`);
        }
      }}
    >
      {t("payment.requestBill")}
    </Button>
  );
}
```

- [ ] **Step 5: Add PaymentModal to render tree**

At the end of the JSX return, before the closing `</>`, add:

```tsx
{
  isPaymentModalOpen && sessionToken && restaurantId && (
    <PaymentModal
      sessionToken={sessionToken}
      restaurantId={restaurantId}
      onClose={() => setIsPaymentModalOpen(false)}
      onSuccess={() => {
        setIsPaymentModalOpen(false);
        setSessionToken(null);
        if (tableNumber) localStorage.removeItem(`session-${tableNumber}`);
      }}
    />
  );
}
```

- [ ] **Step 6: Update CheckoutPage to persist session token**

In `apps/frontend/src/pages/CheckoutPage.tsx`, find the `createOrder` call response handler. Add session token persistence:

```typescript
const orderData = await createOrder({
  ...payload,
  sessionToken: localStorage.getItem(`session-${cartTableNumber}`) || undefined,
});
if (orderData.sessionToken && cartTableNumber) {
  localStorage.setItem(`session-${cartTableNumber}`, orderData.sessionToken);
}
```

- [ ] **Step 7: Build frontend to check for TypeScript errors**

```bash
cd apps/frontend && npm run build 2>&1 | head -50
```

Expected: Build succeeds or shows only warnings (not errors)

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/PublicMenuPage.tsx apps/frontend/src/pages/CheckoutPage.tsx
git commit -m "feat: add session token management and Request Bill button to PublicMenuPage"
```

---

## Task 14: Frontend PaymentModal.tsx

**Files:**

- Create: `apps/frontend/src/components/payment/PaymentModal.tsx`

Three-step modal: tip selection → Stripe Elements → confirmation.

- [ ] **Step 1: Create PaymentModal**

Create `apps/frontend/src/components/payment/PaymentModal.tsx`:

```tsx
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getSessionBill, createPaymentIntent } from "../../lib/api";
import { Button } from "../ui/button";
import { useTranslation } from "react-i18next";
import { CheckCircle2, X } from "lucide-react";

const stripePromise = loadStripe(
  (import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY || "",
);

interface PaymentModalProps {
  sessionToken: string;
  restaurantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "tip" | "pay" | "done";

interface BillData {
  subtotal: number;
  tipsEnabled: boolean;
  tipOptions: number[];
}

function PaymentForm({
  clientSecret,
  total,
  tipAmount,
  onSuccess,
  onClose,
}: {
  clientSecret: string;
  total: number;
  tipAmount: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (result.error) {
      setError(result.error.message || t("payment.paymentFailed"));
      setProcessing(false);
    } else if (result.paymentIntent?.status === "succeeded") {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>{t("payment.subtotal")}</span>
          <span>€{(total - tipAmount).toFixed(2)}</span>
        </div>
        {tipAmount > 0 && (
          <div className="flex justify-between">
            <span>{t("payment.tip")}</span>
            <span>€{tipAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-foreground border-t pt-1">
          <span>{t("payment.total")}</span>
          <span>€{total.toFixed(2)}</span>
        </div>
      </div>

      <PaymentElement />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={processing}
        >
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={processing || !stripe}
        >
          {processing
            ? t("payment.processing")
            : `${t("payment.pay")} €${total.toFixed(2)}`}
        </Button>
      </div>
    </form>
  );
}

export function PaymentModal({
  sessionToken,
  restaurantId,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("tip");
  const [bill, setBill] = useState<BillData | null>(null);
  const [selectedTip, setSelectedTip] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentTip, setPaymentTip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessionBill(sessionToken)
      .then((data) => setBill(data))
      .catch(() => onClose());
  }, [sessionToken]);

  const activeTipPercent =
    customTip !== "" ? parseFloat(customTip) || 0 : selectedTip;

  const handleContinueToPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createPaymentIntent(sessionToken, activeTipPercent);
      setClientSecret(result.clientSecret);
      setPaymentTotal(result.total);
      setPaymentTip(result.tipAmount);
      setStep("pay");
    } catch (e: any) {
      setError(e.response?.data?.message || t("payment.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-card text-card-foreground rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === "tip" && t("payment.yourBill")}
            {step === "pay" && t("payment.payment")}
            {step === "done" && t("payment.thankYou")}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {step === "tip" && bill && (
          <div className="space-y-4">
            <p className="text-2xl font-bold">€{bill.subtotal.toFixed(2)}</p>

            {bill.tipsEnabled && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("payment.addTip")}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setSelectedTip(0);
                      setCustomTip("");
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === 0 && customTip === "" ? "bg-accent text-accent-foreground border-accent" : "border-border"}`}
                  >
                    {t("payment.noTip")}
                  </button>
                  {bill.tipOptions.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        setSelectedTip(pct);
                        setCustomTip("");
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === pct && customTip === "" ? "bg-accent text-accent-foreground border-accent" : "border-border"}`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t("payment.custom")}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customTip}
                    onChange={(e) => {
                      setCustomTip(e.target.value);
                      setSelectedTip(0);
                    }}
                    placeholder="0"
                    className="w-16 px-2 py-1 border border-border rounded text-sm bg-background"
                  />
                  <span className="text-sm">%</span>
                </div>
                {activeTipPercent > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("payment.tipAmount")}: €
                    {((bill.subtotal * activeTipPercent) / 100).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <Button
              className="w-full"
              onClick={handleContinueToPayment}
              disabled={loading}
            >
              {loading ? t("payment.loading") : t("payment.continue")}
            </Button>
          </div>
        )}

        {step === "pay" && clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: "stripe" } }}
          >
            <PaymentForm
              clientSecret={clientSecret}
              total={paymentTotal}
              tipAmount={paymentTip}
              onSuccess={() => setStep("done")}
              onClose={onClose}
            />
          </Elements>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-lg font-medium">
              {t("payment.paymentReceived")}
            </p>
            <p className="text-2xl font-bold">€{paymentTotal.toFixed(2)}</p>
            <Button className="w-full" onClick={onSuccess}>
              {t("payment.backToMenu")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to check TypeScript**

```bash
cd apps/frontend && npm run build 2>&1 | head -50
```

Expected: Build succeeds (warnings OK, errors not OK)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/payment/PaymentModal.tsx
git commit -m "feat: add PaymentModal with tip selection, Stripe Elements, and confirmation"
```

---

## Task 15: Frontend SettingsView — Payments tab

**Files:**

- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

Add a "Payments" tab with three sections:

1. Accept digital payments toggle (`paymentsEnabled`)
2. Stripe Connect section (connect/disconnect)
3. Tips section (toggle + quick % options)

- [ ] **Step 1: Add payment state and API imports**

In `apps/frontend/src/pages/Dashboard/SettingsView.tsx`, at the top:

Add imports:

```typescript
import {
  generateStripeConnectLink,
  getStripeStatus,
  disconnectStripe,
} from "../../lib/api";
```

After the existing state declarations, add:

```typescript
// Payment settings
const [paymentsEnabled, setPaymentsEnabled] = useState(false);
const [tipsEnabled, setTipsEnabled] = useState(false);
const [tipOptions, setTipOptions] = useState<number[]>([2, 4, 5]);
const [newTipOption, setNewTipOption] = useState("");
const [stripeOnboarded, setStripeOnboarded] = useState(false);
const [stripeLoading, setStripeLoading] = useState(false);
const [activeSettingsTab, setActiveSettingsTab] = useState<
  "general" | "loyalty" | "payments"
>("general");
```

- [ ] **Step 2: Populate payment state from activeRestaurant**

Find the `useEffect` that populates state from `activeRestaurant` (where `setAddress`, `setContactInfo` etc. are called). Add to it:

```typescript
setPaymentsEnabled(activeRestaurant.paymentsEnabled ?? false);
setTipsEnabled(activeRestaurant.tipsEnabled ?? false);
setTipOptions(activeRestaurant.tipOptions ?? [2, 4, 5]);
setStripeOnboarded(activeRestaurant.stripeOnboarded ?? false);
```

Also add a Stripe status refresh when the component mounts (handles the `?stripe=success` return):

```typescript
const params = new URLSearchParams(window.location.search);
if (params.get("stripe") === "success" && activeRestaurant?.id) {
  getStripeStatus(activeRestaurant.id).then((s) =>
    setStripeOnboarded(s.stripeOnboarded),
  );
}
```

- [ ] **Step 3: Add payment fields to save handler**

Find the `handleSave` function (calls `updateRestaurant`). Add payment fields to the payload:

```typescript
      paymentsEnabled,
      tipsEnabled,
      tipOptions,
```

- [ ] **Step 4: Add tab switcher and Payments tab UI**

In the JSX, add tab buttons before the existing sections. The current SettingsView renders sections without tabs — wrap existing content in a "general" section and add a "payments" tab.

Find the outermost `<div>` inside the component's return and add tab navigation at the top:

```tsx
{
  /* Tab nav */
}
<div className="flex gap-1 border-b border-border mb-6">
  {(["general", "loyalty", "payments"] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveSettingsTab(tab)}
      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
        activeSettingsTab === tab
          ? "border-accent text-accent"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {t(`settings.tabs.${tab}`)}
    </button>
  ))}
</div>;
```

Wrap the existing content (general + loyalty sections) in `{activeSettingsTab === 'general' && (...)}` and `{activeSettingsTab === 'loyalty' && (...)}` blocks.

After those, add the payments tab:

```tsx
{
  activeSettingsTab === "payments" && (
    <div className="space-y-6">
      {/* Enable payments toggle */}
      <div className="p-4 border border-border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {t("payment.settings.acceptPayments")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("payment.settings.acceptPaymentsDesc")}
            </p>
          </div>
          <button
            onClick={() => setPaymentsEnabled(!paymentsEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${paymentsEnabled ? "bg-accent" : "bg-muted"}`}
            role="switch"
            aria-checked={paymentsEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${paymentsEnabled ? "translate-x-6" : "translate-x-1"}`}
            />
          </button>
        </div>
        {paymentsEnabled && !stripeOnboarded && (
          <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded">
            {t("payment.settings.connectStripeWarning")}
          </p>
        )}
      </div>

      {/* Stripe Connect */}
      <div className="p-4 border border-border rounded-lg space-y-3">
        <p className="font-medium">{t("payment.settings.stripeConnect")}</p>
        {stripeOnboarded ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-600 font-medium">
              ✓ {t("payment.settings.stripeConnected")}
            </span>
            <button
              onClick={async () => {
                if (!activeRestaurant?.id) return;
                if (!window.confirm(t("payment.settings.disconnectConfirm")))
                  return;
                await disconnectStripe(activeRestaurant.id);
                setStripeOnboarded(false);
              }}
              className="text-sm text-red-500 hover:underline"
            >
              {t("payment.settings.disconnect")}
            </button>
          </div>
        ) : (
          <Button
            variant="outline"
            disabled={stripeLoading}
            onClick={async () => {
              if (!activeRestaurant?.id) return;
              setStripeLoading(true);
              try {
                const { url } = await generateStripeConnectLink(
                  activeRestaurant.id,
                );
                window.location.href = url;
              } catch {
                setStripeLoading(false);
              }
            }}
          >
            {stripeLoading
              ? t("payment.settings.connecting")
              : t("payment.settings.connectStripe")}
          </Button>
        )}
      </div>

      {/* Tips */}
      {paymentsEnabled && (
        <div className="p-4 border border-border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium">{t("payment.settings.tips")}</p>
            <button
              onClick={() => setTipsEnabled(!tipsEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tipsEnabled ? "bg-accent" : "bg-muted"}`}
              role="switch"
              aria-checked={tipsEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${tipsEnabled ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>
          {tipsEnabled && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {t("payment.settings.quickTipOptions")}
              </p>
              <div className="flex flex-wrap gap-2">
                {tipOptions.map((pct) => (
                  <span
                    key={pct}
                    className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm"
                  >
                    {pct}%
                    <button
                      onClick={() =>
                        setTipOptions(tipOptions.filter((t) => t !== pct))
                      }
                      className="text-muted-foreground hover:text-red-500 ml-1"
                      aria-label={`Remove ${pct}%`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newTipOption}
                  onChange={(e) => setNewTipOption(e.target.value)}
                  placeholder="e.g. 15"
                  className={inputCls + " w-24"}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const v = parseInt(newTipOption);
                    if (v > 0 && v <= 100 && !tipOptions.includes(v)) {
                      setTipOptions([...tipOptions, v].sort((a, b) => a - b));
                      setNewTipOption("");
                    }
                  }}
                >
                  {t("payment.settings.addTipOption")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Button onClick={handleSave} disabled={loading}>
        {loading ? t("settings.saving") : t("settings.saveSettings")}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx
git commit -m "feat: add Payments tab to SettingsView with Stripe Connect and tips config"
```

---

## Task 16: Frontend TableView — session status indicators

**Files:**

- Modify: `apps/frontend/src/components/tables/TableView.tsx`

Add a colored dot per table card showing OPEN (orange) or PAID (green) session status. Add a "Close session" button for OPEN sessions (waiter clears when customer pays cash).

- [ ] **Step 1: Fetch table sessions**

In `apps/frontend/src/components/tables/TableView.tsx`, add import:

```typescript
import {
  getTables,
  createTable,
  deleteTable,
  getTableSessions,
  closeSession,
} from "../../lib/api";
```

Add session query below the existing `tables` query:

```typescript
const { data: sessions } = useQuery({
  queryKey: ["tableSessions", restaurantId],
  queryFn: () => getTableSessions(restaurantId),
  enabled: !!restaurantId,
  refetchInterval: 30000,
});

const sessionByTableId = React.useMemo(() => {
  const map = new Map<string, { token: string; status: string }>();
  (sessions || []).forEach((s) =>
    map.set(s.tableId, { token: s.token, status: s.status }),
  );
  return map;
}, [sessions]);
```

Add close session mutation:

```typescript
const closeSessionMutation = useMutation({
  mutationFn: ({
    token,
    restaurantId: rid,
  }: {
    token: string;
    restaurantId: string;
  }) => closeSession(token, rid),
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["tableSessions", restaurantId],
    });
  },
});
```

- [ ] **Step 2: Add status dot and close button to each table card**

Find the table card rendering in `TableView.tsx` (the `map` over `tables`). Inside each card, add the session indicator:

```tsx
{
  /* Session status indicator */
}
{
  (() => {
    const session = sessionByTableId.get(table.id);
    if (!session) return null;
    return (
      <div className="flex items-center gap-2 mt-1">
        <span
          className={`inline-block w-2 h-2 rounded-full ${session.status === "OPEN" ? "bg-orange-400" : "bg-green-400"}`}
        />
        <span className="text-xs text-muted-foreground">
          {session.status === "OPEN"
            ? t("tables.sessionOpen")
            : t("tables.sessionPaid")}
        </span>
        {session.status === "OPEN" && (
          <button
            onClick={() =>
              closeSessionMutation.mutate({
                token: session.token,
                restaurantId,
              })
            }
            className="text-xs text-muted-foreground hover:text-red-500 underline"
          >
            {t("tables.closeSession")}
          </button>
        )}
      </div>
    );
  })();
}
```

- [ ] **Step 3: Build to verify**

```bash
cd apps/frontend && npm run build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/components/tables/TableView.tsx
git commit -m "feat: add session status indicators and close session to TableView"
```

---

## Task 17: Locale keys — EN/BG/RO

**Files:**

- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

- [ ] **Step 1: Add payment keys to English locale**

In `apps/frontend/src/locales/en/translation.json`, add a `"payment"` top-level key:

```json
  "payment": {
    "requestBill": "Request Bill",
    "yourBill": "Your Bill",
    "payment": "Payment",
    "thankYou": "Thank You!",
    "subtotal": "Subtotal",
    "tip": "Tip",
    "total": "Total",
    "addTip": "Add a tip?",
    "noTip": "No Tip",
    "custom": "Custom",
    "tipAmount": "Tip amount",
    "continue": "Continue to Payment",
    "pay": "Pay",
    "processing": "Processing...",
    "paymentReceived": "Payment received",
    "backToMenu": "Back to Menu",
    "loading": "Loading...",
    "paymentFailed": "Payment failed. Please try again.",
    "failedToLoad": "Could not initiate payment. Please try again.",
    "settings": {
      "acceptPayments": "Accept digital payments",
      "acceptPaymentsDesc": "Allow customers to pay from their phone after ordering.",
      "connectStripeWarning": "Connect Stripe to start accepting payments.",
      "stripeConnect": "Stripe Connect",
      "stripeConnected": "Stripe Connected",
      "disconnect": "Disconnect",
      "disconnectConfirm": "Disconnect Stripe? This will disable digital payments.",
      "connectStripe": "Connect Stripe",
      "connecting": "Connecting...",
      "tips": "Tips",
      "quickTipOptions": "Quick tip % buttons shown to customers",
      "addTipOption": "Add"
    }
  },
  "tables": {
    "sessionOpen": "Open session",
    "sessionPaid": "Paid",
    "closeSession": "Close session"
  }
```

Also add the settings tabs key. Find the `"settings"` → `"tabs"` section in the locale file and add:

```json
      "payments": "Payments",
      "general": "General",
      "loyalty": "Loyalty"
```

Also add a `"common"` key if it doesn't already exist (used by PaymentModal cancel button):

```json
  "common": {
    "cancel": "Cancel"
  }
```

- [ ] **Step 2: Add Bulgarian locale keys**

In `apps/frontend/src/locales/bg/translation.json`, add the same `"payment"` and `"tables"` keys with Bulgarian translations:

```json
  "payment": {
    "requestBill": "Поискай сметката",
    "yourBill": "Вашата сметка",
    "payment": "Плащане",
    "thankYou": "Благодарим!",
    "subtotal": "Сума",
    "tip": "Бакшиш",
    "total": "Общо",
    "addTip": "Добави бакшиш?",
    "noTip": "Без бакшиш",
    "custom": "По избор",
    "tipAmount": "Сума за бакшиш",
    "continue": "Продължи към плащане",
    "pay": "Плати",
    "processing": "Обработва се...",
    "paymentReceived": "Плащането е получено",
    "backToMenu": "Обратно към менюто",
    "loading": "Зарежда се...",
    "paymentFailed": "Плащането неуспешно. Опитайте отново.",
    "failedToLoad": "Не може да се стартира плащане. Опитайте отново.",
    "settings": {
      "acceptPayments": "Приемай дигитални плащания",
      "acceptPaymentsDesc": "Позволи на клиентите да плащат от телефона си.",
      "connectStripeWarning": "Свържи Stripe, за да започнеш да приемаш плащания.",
      "stripeConnect": "Stripe Connect",
      "stripeConnected": "Stripe свързан",
      "disconnect": "Изключи",
      "disconnectConfirm": "Изключи Stripe? Това ще деактивира дигиталните плащания.",
      "connectStripe": "Свържи Stripe",
      "connecting": "Свързване...",
      "tips": "Бакшиши",
      "quickTipOptions": "Бързи % бутони за бакшиш, показани на клиентите",
      "addTipOption": "Добави"
    }
  },
  "tables": {
    "sessionOpen": "Отворена сесия",
    "sessionPaid": "Платено",
    "closeSession": "Затвори сесията"
  }
```

Also add to `"settings"` → `"tabs"`:

```json
      "payments": "Плащания",
      "general": "Общи",
      "loyalty": "Лоялност"
```

- [ ] **Step 3: Add Romanian locale keys**

In `apps/frontend/src/locales/ro/translation.json`:

```json
  "payment": {
    "requestBill": "Cere nota",
    "yourBill": "Nota ta",
    "payment": "Plată",
    "thankYou": "Mulțumim!",
    "subtotal": "Subtotal",
    "tip": "Bacșiș",
    "total": "Total",
    "addTip": "Adaugă bacșiș?",
    "noTip": "Fără bacșiș",
    "custom": "Personalizat",
    "tipAmount": "Sumă bacșiș",
    "continue": "Continuă la plată",
    "pay": "Plătește",
    "processing": "Se procesează...",
    "paymentReceived": "Plată primită",
    "backToMenu": "Înapoi la meniu",
    "loading": "Se încarcă...",
    "paymentFailed": "Plata a eșuat. Încearcă din nou.",
    "failedToLoad": "Nu se poate iniția plata. Încearcă din nou.",
    "settings": {
      "acceptPayments": "Acceptă plăți digitale",
      "acceptPaymentsDesc": "Permite clienților să plătească de pe telefon.",
      "connectStripeWarning": "Conectează Stripe pentru a accepta plăți.",
      "stripeConnect": "Stripe Connect",
      "stripeConnected": "Stripe conectat",
      "disconnect": "Deconectează",
      "disconnectConfirm": "Deconectează Stripe? Aceasta va dezactiva plățile digitale.",
      "connectStripe": "Conectează Stripe",
      "connecting": "Se conectează...",
      "tips": "Bacșișuri",
      "quickTipOptions": "Butoane rapide % bacșiș afișate clienților",
      "addTipOption": "Adaugă"
    }
  },
  "tables": {
    "sessionOpen": "Sesiune deschisă",
    "sessionPaid": "Plătit",
    "closeSession": "Închide sesiunea"
  }
```

Also add to `"settings"` → `"tabs"`:

```json
      "payments": "Plăți",
      "general": "General",
      "loyalty": "Loialitate"
```

- [ ] **Step 4: Build frontend**

```bash
cd apps/frontend && npm run build 2>&1 | head -50
```

Expected: Build succeeds

- [ ] **Step 5: Run backend tests**

```bash
cd apps/backend && npm test -- --no-coverage
```

Expected: All tests pass

- [ ] **Step 6: Final commit**

```bash
git add apps/frontend/src/locales/
git commit -m "feat: add payment and table session i18n keys in EN/BG/RO"
```

---

## Dev Webhook Setup (after all tasks complete)

To test webhooks locally, install the Stripe CLI and run:

```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

Copy the `whsec_...` secret it prints and update `STRIPE_WEBHOOK_SECRET` in `apps/backend/.env`.

---

## Post-implementation: Update documentation

After all tasks pass, update `CODING_ROADMAP.md` to mark Phase 19 as complete and add the implementation details to the "Current Focus" section.

```bash
git add CODING_ROADMAP.md CLAUDE.md
git commit -m "docs: mark Stripe pay-at-table (Phase 19) as complete in roadmap"
```
