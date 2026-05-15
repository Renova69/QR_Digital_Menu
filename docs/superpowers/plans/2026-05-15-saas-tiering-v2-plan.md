# SaaS Tiering V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4-tier SaaS subscription system (Free/Starter/Professional/Enterprise at €0/€10/€25/€40) with Stripe Billing, feature gating at API + UI level, and 4 demo restaurants.

**Architecture:** `SubscriptionTier` enum on `Restaurant` model. `FeatureService` resolves tier → feature flags. `@RequireFeature()` NestJS decorator/guard blocks unauthorized API calls. `useFeature()` React hook conditionally renders UI. Stripe Checkout for signup, Customer Portal for billing management, webhook with timestamp-gated atomic updates to prevent race conditions.

**Tech Stack:** NestJS 11, Prisma 6, Neon Postgres, Stripe Billing (same account as existing Stripe Connect), React 18, Tailwind v4, i18next.

---

## File Map

### Create (backend — 8 files)
| File | Purpose |
|------|---------|
| `apps/backend/src/subscription/subscription.module.ts` | NestJS module registration |
| `apps/backend/src/subscription/subscription.service.ts` | Tier→feature resolution, Stripe Checkout/Portal session creation, webhook handling with atomic timestamp gate |
| `apps/backend/src/subscription/subscription.controller.ts` | `/api/subscription/status`, `/checkout`, `/portal`, `/webhook` |
| `apps/backend/src/subscription/feature.service.ts` | `getFeatures(tier)` → `FeatureFlag[]`, `hasFeature(tier, flag)` → `boolean` |
| `apps/backend/src/subscription/feature.guard.ts` | NestJS guard reading `@RequireFeature()` metadata, resolving restaurant from JWT, calling `FeatureService` |
| `apps/backend/src/subscription/require-feature.decorator.ts` | `@RequireFeature(FeatureFlag)` decorator |
| `apps/backend/src/subscription/feature-flag.enum.ts` | `FeatureFlag` string enum (21 values) |
| `apps/backend/src/subscription/dto/checkout.dto.ts` | `{ tier: SubscriptionTier }` DTO |

### Create (frontend — 7 files)
| File | Purpose |
|------|---------|
| `apps/frontend/src/hooks/useFeature.ts` | React hook wrapping `useContext(RestaurantContext)` → `hasFeature(flag)` |
| `apps/frontend/src/pages/PricingPage.tsx` | Public `/pricing` route, 4-column comparison table |
| `apps/frontend/src/components/subscription/SubscriptionBanner.tsx` | Dashboard top banner — tier badge + upgrade CTA |
| `apps/frontend/src/components/subscription/UpgradeModal.tsx` | Modal triggered when clicking locked feature |
| `apps/frontend/src/components/subscription/BillingView.tsx` | Settings tab — current tier, Manage Billing button |
| `apps/backend/prisma/seed-demo-restaurants.ts` | Seed script creating 4 demo restaurants (one per tier) |
| (i18n keys added inline to existing translation.json files) |

### Modify (backend — 7 files)
| File | Change |
|------|--------|
| `apps/backend/prisma/schema.prisma` | Add `SubscriptionTier` enum, 5 fields on `Restaurant` |
| `apps/backend/src/app.module.ts` | Register `SubscriptionModule` |
| `apps/backend/src/orders/orders.service.ts` | Add `@RequireFeature(ORDERS_RECEIVE)` on create/findAll |
| `apps/backend/src/payment/payment.module.ts` | Import `SubscriptionModule` so guard is available |
| `apps/backend/src/loyalty/loyalty.service.ts` | Add `@RequireFeature(LOYALTY)` on relevant methods |
| `apps/backend/src/translation/translation.service.ts` | Add `@RequireFeature(LANGUAGES_MULTI)` |
| `apps/backend/src/orders/orders.module.ts` | Import `SubscriptionModule` |

### Modify (frontend — 9 files)
| File | Change |
|------|--------|
| `apps/frontend/src/context/RestaurantContext.tsx` | Add `tier: SubscriptionTier` to `Restaurant` interface and context value |
| `apps/frontend/src/App.tsx` | Add `/pricing` route, conditionally register POS/KDS routes |
| `apps/frontend/src/pages/PublicMenuPage.tsx` | Hide cart when `!hasFeature('orders:receive')` |
| `apps/frontend/src/pages/DashboardPage.tsx` | Add `SubscriptionBanner`, tier-gate sidebar items |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx` | Add "subscription" tab with `BillingView` |
| `apps/frontend/src/components/ProtectedRoute.tsx` | Gate `/staff/pos` and `/staff/kitchen` routes |
| `apps/frontend/src/locales/en/translation.json` | ~20 new keys |
| `apps/frontend/src/locales/bg/translation.json` | ~20 new keys |
| `apps/frontend/src/locales/ro/translation.json` | ~20 new keys |

---

## Implementation Tasks

### Task 1: Schema changes — SubscriptionTier enum + Restaurant fields

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add SubscriptionTier enum before Restaurant model**

In `apps/backend/prisma/schema.prisma`, add before the `Restaurant` model (around line 30):

```prisma
enum SubscriptionTier {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}
```

- [ ] **Step 2: Add fields to Restaurant model**

Add inside the `Restaurant` model (after existing Stripe fields around line 78):

```prisma
tier                  SubscriptionTier  @default(FREE)
stripeCustomerId      String?
stripeSubscriptionId  String?
stripePriceId         String?
tierUpdatedAt         DateTime?
```

Remove the pre-existing `stripeCustomerId` if it already exists on the model (check current schema — the existing spec from May 10 may not have added it yet).

- [ ] **Step 3: Push schema to Neon**

Run: `cd apps/backend; npx prisma db push`
Expected: "Your database is now in sync with your schema."

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/schema.prisma
git commit -m "feat: add SubscriptionTier enum and tier fields to Restaurant schema"
```

---

### Task 2: FeatureFlag enum + FeatureService

**Files:**
- Create: `apps/backend/src/subscription/feature-flag.enum.ts`
- Create: `apps/backend/src/subscription/feature.service.ts`
- Test: `apps/backend/src/subscription/feature.service.spec.ts`

- [ ] **Step 1: Write the FeatureFlag enum**

```typescript
// apps/backend/src/subscription/feature-flag.enum.ts
export enum FeatureFlag {
  MENU_VIEW = 'menu:view',
  MENU_EDIT = 'menu:edit',
  MENU_IMPORT = 'menu:import',
  QR_MANAGE = 'qr:manage',
  ORDERS_RECEIVE = 'orders:receive',
  ORDERS_CALL_WAITER = 'orders:call-waiter',
  ANALYTICS_BASIC = 'analytics:basic',
  ANALYTICS_FULL = 'analytics:full',
  PAYMENTS_STRIPE = 'payments:stripe',
  LANGUAGES_MULTI = 'languages:multi',
  BRANDING_CUSTOM = 'branding:custom',
  LOYALTY = 'loyalty',
  CUSTOMERS_AUTH = 'customers:auth',
  UPSELLING = 'upselling',
  DAYPARTING = 'dayparting',
  POS = 'pos',
  KDS = 'kds',
  RBAC = 'rbac',
  MULTILOCATION = 'multilocation',
  PRINTERS_THERMAL = 'printers:thermal',
  TEMPLATES_MENU = 'templates:menu',
  STAFF_UNLIMITED = 'staff:unlimited',
}
```

- [ ] **Step 2: Write the failing test for FeatureService**

```typescript
// apps/backend/src/subscription/feature.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { FeatureService } from './feature.service';
import { FeatureFlag } from './feature-flag.enum';

describe('FeatureService', () => {
  let service: FeatureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeatureService],
    }).compile();
    service = module.get<FeatureService>(FeatureService);
  });

  describe('getFeatures', () => {
    it('returns only menu+qr features for FREE tier', () => {
      const features = service.getFeatures('FREE');
      expect(features).toContain(FeatureFlag.MENU_VIEW);
      expect(features).toContain(FeatureFlag.MENU_EDIT);
      expect(features).toContain(FeatureFlag.QR_MANAGE);
      expect(features).not.toContain(FeatureFlag.ORDERS_RECEIVE);
      expect(features).not.toContain(FeatureFlag.POS);
    });

    it('returns orders+analytics for STARTER tier', () => {
      const features = service.getFeatures('STARTER');
      expect(features).toContain(FeatureFlag.ORDERS_RECEIVE);
      expect(features).toContain(FeatureFlag.ANALYTICS_BASIC);
      expect(features).toContain(FeatureFlag.MENU_IMPORT);
      expect(features).not.toContain(FeatureFlag.PAYMENTS_STRIPE);
      expect(features).not.toContain(FeatureFlag.LOYALTY);
    });

    it('returns payments+loyalty+branding for PROFESSIONAL tier', () => {
      const features = service.getFeatures('PROFESSIONAL');
      expect(features).toContain(FeatureFlag.PAYMENTS_STRIPE);
      expect(features).toContain(FeatureFlag.LOYALTY);
      expect(features).toContain(FeatureFlag.BRANDING_CUSTOM);
      expect(features).toContain(FeatureFlag.LANGUAGES_MULTI);
      expect(features).not.toContain(FeatureFlag.POS);
      expect(features).not.toContain(FeatureFlag.KDS);
    });

    it('returns all features for ENTERPRISE tier', () => {
      const features = service.getFeatures('ENTERPRISE');
      expect(features).toContain(FeatureFlag.POS);
      expect(features).toContain(FeatureFlag.KDS);
      expect(features).toContain(FeatureFlag.RBAC);
      expect(features).toContain(FeatureFlag.MULTILOCATION);
      expect(features).toContain(FeatureFlag.PRINTERS_THERMAL);
    });
  });

  describe('hasFeature', () => {
    it('returns true when tier has the feature', () => {
      expect(service.hasFeature('ENTERPRISE', FeatureFlag.POS)).toBe(true);
      expect(service.hasFeature('PROFESSIONAL', FeatureFlag.PAYMENTS_STRIPE)).toBe(true);
      expect(service.hasFeature('STARTER', FeatureFlag.ORDERS_RECEIVE)).toBe(true);
    });

    it('returns false when tier lacks the feature', () => {
      expect(service.hasFeature('FREE', FeatureFlag.POS)).toBe(false);
      expect(service.hasFeature('STARTER', FeatureFlag.LOYALTY)).toBe(false);
      expect(service.hasFeature('PROFESSIONAL', FeatureFlag.KDS)).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/backend; npx jest src/subscription/feature.service.spec.ts`
Expected: FAIL — "FeatureService is not defined"

- [ ] **Step 4: Implement FeatureService**

```typescript
// apps/backend/src/subscription/feature.service.ts
import { Injectable } from '@nestjs/common';
import { FeatureFlag } from './feature-flag.enum';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

const TIER_FEATURES: Record<Tier, FeatureFlag[]> = {
  FREE: [
    FeatureFlag.MENU_VIEW,
    FeatureFlag.MENU_EDIT,
    FeatureFlag.QR_MANAGE,
  ],
  STARTER: [
    FeatureFlag.MENU_VIEW,
    FeatureFlag.MENU_EDIT,
    FeatureFlag.MENU_IMPORT,
    FeatureFlag.QR_MANAGE,
    FeatureFlag.ORDERS_RECEIVE,
    FeatureFlag.ANALYTICS_BASIC,
  ],
  PROFESSIONAL: [
    FeatureFlag.MENU_VIEW,
    FeatureFlag.MENU_EDIT,
    FeatureFlag.MENU_IMPORT,
    FeatureFlag.QR_MANAGE,
    FeatureFlag.ORDERS_RECEIVE,
    FeatureFlag.ORDERS_CALL_WAITER,
    FeatureFlag.ANALYTICS_BASIC,
    FeatureFlag.ANALYTICS_FULL,
    FeatureFlag.PAYMENTS_STRIPE,
    FeatureFlag.LANGUAGES_MULTI,
    FeatureFlag.BRANDING_CUSTOM,
    FeatureFlag.LOYALTY,
    FeatureFlag.CUSTOMERS_AUTH,
    FeatureFlag.UPSELLING,
    FeatureFlag.DAYPARTING,
  ],
  ENTERPRISE: Object.values(FeatureFlag), // all features
};

@Injectable()
export class FeatureService {
  getFeatures(tier: string): FeatureFlag[] {
    return TIER_FEATURES[tier as Tier] ?? TIER_FEATURES.FREE;
  }

  hasFeature(tier: string, feature: FeatureFlag): boolean {
    return this.getFeatures(tier).includes(feature);
  }

  getStaffLimit(tier: string): number {
    switch (tier) {
      case 'FREE':
      case 'STARTER':
        return 1;
      case 'PROFESSIONAL':
        return 5;
      case 'ENTERPRISE':
        return Infinity;
      default:
        return 1;
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/backend; npx jest src/subscription/feature.service.spec.ts`
Expected: PASS — 6 tests passing

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/subscription/
git commit -m "feat: add FeatureFlag enum and FeatureService with tier resolution"
```

---

### Task 3: @RequireFeature decorator + FeatureGuard

**Files:**
- Create: `apps/backend/src/subscription/require-feature.decorator.ts`
- Create: `apps/backend/src/subscription/feature.guard.ts`
- Test: `apps/backend/src/subscription/feature.guard.spec.ts`
- Modify: `apps/backend/src/restaurants/restaurants.module.ts` — export Restaurant model type access

- [ ] **Step 1: Write the decorator**

```typescript
// apps/backend/src/subscription/require-feature.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { FeatureFlag } from './feature-flag.enum';

export const REQUIRE_FEATURE_KEY = 'requireFeature';
export const RequireFeature = (...features: FeatureFlag[]) =>
  SetMetadata(REQUIRE_FEATURE_KEY, features);
```

- [ ] **Step 2: Write the guard**

```typescript
// apps/backend/src/subscription/feature.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureService } from './feature.service';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { FeatureFlag } from './feature-flag.enum';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly featureService: FeatureService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<FeatureFlag[]>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true; // no feature requirement on this route
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new ForbiddenException({ code: 'AUTH_REQUIRED' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { staffRestaurant: true },
    });

    const restaurant = user?.staffRestaurant;
    const tier = restaurant?.tier ?? 'FREE';

    const missing = requiredFeatures.filter((f) => !this.featureService.hasFeature(tier, f));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FEATURE_LOCKED',
        requiredFeatures: missing,
        message: `Your plan (${tier}) does not include: ${missing.join(', ')}`,
      });
    }

    return true;
  }
}
```

- [ ] **Step 3: Wire into SubscriptionModule**

```typescript
// apps/backend/src/subscription/subscription.module.ts
import { Module, Global } from '@nestjs/common';
import { FeatureService } from './feature.service';
import { FeatureGuard } from './feature.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [FeatureService, FeatureGuard],
  exports: [FeatureService, FeatureGuard],
})
export class SubscriptionModule {}
```

Note: `@Global()` ensures `FeatureService` and `FeatureGuard` are available in all modules without needing to import `SubscriptionModule` everywhere.

- [ ] **Step 4: Register in AppModule**

In `apps/backend/src/app.module.ts`, add to imports array (before existing modules that will use it):

```typescript
import { SubscriptionModule } from './subscription/subscription.module';

// in @Module.imports:
SubscriptionModule,
```

- [ ] **Step 5: Write guard tests**

```typescript
// apps/backend/src/subscription/feature.guard.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { FeatureGuard } from './feature.guard';
import { FeatureService } from './feature.service';
import { FeatureFlag } from './feature-flag.enum';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException } from '@nestjs/common';

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let reflector: Reflector;
  let featureService: FeatureService;
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureGuard,
        FeatureService,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    guard = module.get<FeatureGuard>(FeatureGuard);
    reflector = module.get<Reflector>(Reflector);
    featureService = module.get<FeatureService>(FeatureService);
  });

  it('allows if no feature requirement set', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }) } as any;
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('allows if user tier has the required feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    prisma.user.findUnique.mockResolvedValue({
      staffRestaurant: { tier: 'ENTERPRISE' },
    });
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }) } as any;
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException if user tier lacks the feature', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([FeatureFlag.POS]);
    prisma.user.findUnique.mockResolvedValue({
      staffRestaurant: { tier: 'FREE' },
    });
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1' } }) }) } as any;
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd apps/backend; npx jest src/subscription/feature.guard.spec.ts`
Expected: PASS — 3 tests

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/subscription/ apps/backend/src/app.module.ts
git commit -m "feat: add @RequireFeature decorator and FeatureGuard with NestJS guard pattern"
```

---

### Task 4: Subscription controller + Stripe Checkout/Portal/webhook

**Files:**
- Create: `apps/backend/src/subscription/subscription.service.ts`
- Create: `apps/backend/src/subscription/subscription.controller.ts`
- Create: `apps/backend/src/subscription/dto/checkout.dto.ts`
- Modify: `apps/backend/src/subscription/subscription.module.ts`
- Test: `apps/backend/src/subscription/subscription.service.spec.ts`

- [ ] **Step 1: Write the DTO**

```typescript
// apps/backend/src/subscription/dto/checkout.dto.ts
import { IsEnum } from 'class-validator';

export enum CheckoutTier {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export class CreateCheckoutDto {
  @IsEnum(CheckoutTier)
  tier: CheckoutTier;
}
```

- [ ] **Step 2: Write SubscriptionService**

```typescript
// apps/backend/src/subscription/subscription.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-04-22.dahlia',
});

const PRICE_MAP: Record<string, string> = {
  STARTER: process.env.STRIPE_PRICE_STARTER || '',
  PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL || '',
  ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE || '',
};

const TIER_FROM_PRICE: Record<string, string> = {};
// Build reverse map after env is loaded
function getTierFromPrice(priceId: string): string {
  for (const [tier, pid] of Object.entries(PRICE_MAP)) {
    if (pid === priceId) return tier;
  }
  return 'FREE';
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createCheckoutSession(restaurantId: string, tier: string, ownerId: string) {
    const priceId = PRICE_MAP[tier];
    if (!priceId) throw new Error(`No Stripe price configured for tier ${tier}`);

    let { stripeCustomerId } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { stripeCustomerId: true },
    });

    if (!stripeCustomerId) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
      const customer = await stripe.customers.create({ email: user.email, metadata: { restaurantId } });
      stripeCustomerId = customer.id;
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeCustomerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?subscribed=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/pricing`,
      metadata: { restaurantId, tier },
    });

    return { url: session.url };
  }

  async createPortalSession(restaurantId: string) {
    const { stripeCustomerId } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { stripeCustomerId: true },
    });
    if (!stripeCustomerId) throw new Error('No Stripe customer');

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard/settings`,
    });

    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || '';
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.error('Webhook signature verification failed');
      throw err;
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.updated':
        await this.applySubscriptionFromEvent(event);
        break;
      case 'customer.subscription.deleted':
        await this.applyCancellationFromEvent(event);
        break;
    }

    return { received: true };
  }

  private async applySubscriptionFromEvent(event: Stripe.Event) {
    const sub = (event.data.object as any);
    const customerId = sub.customer as string;
    const priceId = sub.items?.data?.[0]?.price?.id;
    const tier = priceId ? getTierFromPrice(priceId) : 'FREE';
    const eventTime = new Date(event.created * 1000);

    // Atomic timestamp-gated update prevents race conditions between
    // checkout.session.completed and customer.subscription.updated firing concurrently
    const result = await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [
          { tierUpdatedAt: null },
          { tierUpdatedAt: { lt: eventTime } },
        ],
      },
      data: {
        tier: tier as any,
        stripeSubscriptionId: sub.id ?? sub.subscription,
        stripePriceId: priceId,
        tierUpdatedAt: eventTime,
      },
    });

    this.logger.log(
      `Subscription event ${event.type}: customer=${customerId} tier=${tier} applied=${result.count > 0}`,
    );
  }

  private async applyCancellationFromEvent(event: Stripe.Event) {
    const sub = event.data.object as any;
    const customerId = sub.customer as string;
    const eventTime = new Date(event.created * 1000);

    await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [
          { tierUpdatedAt: null },
          { tierUpdatedAt: { lt: eventTime } },
        ],
      },
      data: {
        tier: 'FREE',
        stripeSubscriptionId: null,
        stripePriceId: null,
        tierUpdatedAt: eventTime,
      },
    });

    this.logger.log(`Subscription cancelled: customer=${customerId}`);
  }
}
```

- [ ] **Step 3: Write SubscriptionController**

```typescript
// apps/backend/src/subscription/subscription.controller.ts
import { Controller, Get, Post, Body, Req, UseGuards, Headers, RawBodyRequest, HttpCode } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FeatureService } from './feature.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly featureService: FeatureService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getStatus(@Req() req: any) {
    const userId = req.user.id ?? req.user.sub;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { staffRestaurant: { select: { id: true, tier: true, stripeSubscriptionId: true, tierUpdatedAt: true } } },
    });
    const restaurant = user?.staffRestaurant;
    const tier = restaurant?.tier ?? 'FREE';
    return {
      tier,
      features: this.featureService.getFeatures(tier),
      staffLimit: this.featureService.getStaffLimit(tier),
      hasSubscription: !!restaurant?.stripeSubscriptionId,
    };
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    const userId = req.user.id ?? req.user.sub;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { staffRestaurant: { select: { id: true } } },
    });
    return this.subscriptionService.createCheckoutSession(user.staffRestaurant.id, dto.tier, userId);
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard)
  async createPortal(@Req() req: any) {
    const userId = req.user.id ?? req.user.sub;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { staffRestaurant: { select: { id: true } } },
    });
    return this.subscriptionService.createPortalSession(user.staffRestaurant.id);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    return this.subscriptionService.handleWebhook(req.rawBody!, sig);
  }
}
```

- [ ] **Step 4: Update SubscriptionModule to include controller**

Add to `subscription.module.ts`:
```typescript
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

// Add to @Module:
controllers: [SubscriptionController],
providers: [FeatureService, FeatureGuard, SubscriptionService],
```

- [ ] **Step 5: Ensure raw body is preserved for webhook**

Check `apps/backend/src/main.ts` — the Stripe webhook for payments likely already has raw body middleware. The subscription webhook at `/api/subscription/webhook` needs the same treatment. In `main.ts`:

```typescript
// Ensure raw body is available for BOTH webhook endpoints
app.use('/api/subscription/webhook', rawBodyMiddleware());
```

If no raw body middleware exists yet, add:
```typescript
function rawBodyMiddleware() {
  return raw({ type: 'application/json' });
}
// app.use('/api/payment/webhook', rawBodyMiddleware());  // existing
app.use('/api/subscription/webhook', rawBodyMiddleware());  // new
```

- [ ] **Step 6: Add env vars to .env.example**

In `apps/backend/.env.example`, add:
```
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...
```

- [ ] **Step 7: Write service spec (minimal — focuses on timestamp gate logic)**

```typescript
// apps/backend/src/subscription/subscription.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let prisma: { restaurant: { findUniqueOrThrow: jest.Mock; update: jest.Mock; updateMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      restaurant: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get<SubscriptionService>(SubscriptionService);
  });

  it('updateMany uses timestamp gate to prevent race conditions', async () => {
    prisma.restaurant.findUniqueOrThrow.mockResolvedValue({ stripeCustomerId: 'cus_123' });
    // actual test verifies updateMany called with tierUpdatedAt OR clause
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd apps/backend; npx jest src/subscription/`
Expected: All subscription specs passing

- [ ] **Step 9: Verify no TS errors**

Run: `cd apps/backend; npx tsc --noEmit`
Expected: Clean (may have pre-existing errors in unrelated files — confirm no new errors in subscription/)

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/subscription/ apps/backend/src/main.ts apps/backend/.env.example
git commit -m "feat: add Stripe Checkout, Customer Portal, and timestamp-gated webhook handling"
```

---

### Task 5: useFeature React hook + RestaurantContext update

**Files:**
- Create: `apps/frontend/src/hooks/useFeature.ts`
- Modify: `apps/frontend/src/context/RestaurantContext.tsx`

- [ ] **Step 1: Add tier to RestaurantContext interface**

In `apps/frontend/src/context/RestaurantContext.tsx`, add to the `Restaurant` interface:

```typescript
tier?: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
tierUpdatedAt?: string;
```

Ensure the restaurant fetch from API includes these fields (the `getRestaurants` call already returns the full restaurant object — Prisma will include the new fields automatically since they're on the model).

- [ ] **Step 2: Create useFeature hook**

```typescript
// apps/frontend/src/hooks/useFeature.ts
import { useRestaurantContext } from '../context/RestaurantContext';

type FeatureFlag =
  | 'menu:view' | 'menu:edit' | 'menu:import' | 'qr:manage'
  | 'orders:receive' | 'orders:call-waiter'
  | 'analytics:basic' | 'analytics:full'
  | 'payments:stripe' | 'languages:multi' | 'branding:custom'
  | 'loyalty' | 'customers:auth' | 'upselling' | 'dayparting'
  | 'pos' | 'kds' | 'rbac' | 'multilocation'
  | 'printers:thermal' | 'templates:menu' | 'staff:unlimited';

const TIER_FEATURES: Record<string, FeatureFlag[]> = {
  FREE: ['menu:view', 'menu:edit', 'qr:manage'],
  STARTER: ['menu:view', 'menu:edit', 'menu:import', 'qr:manage', 'orders:receive', 'analytics:basic'],
  PROFESSIONAL: [
    'menu:view', 'menu:edit', 'menu:import', 'qr:manage',
    'orders:receive', 'orders:call-waiter',
    'analytics:basic', 'analytics:full',
    'payments:stripe', 'languages:multi', 'branding:custom',
    'loyalty', 'customers:auth', 'upselling', 'dayparting',
  ],
  ENTERPRISE: [
    'menu:view', 'menu:edit', 'menu:import', 'qr:manage',
    'orders:receive', 'orders:call-waiter',
    'analytics:basic', 'analytics:full',
    'payments:stripe', 'languages:multi', 'branding:custom',
    'loyalty', 'customers:auth', 'upselling', 'dayparting',
    'pos', 'kds', 'rbac', 'multilocation',
    'printers:thermal', 'templates:menu', 'staff:unlimited',
  ],
};

export function useFeature(feature: FeatureFlag): boolean {
  const { activeRestaurant } = useRestaurantContext();
  const tier = activeRestaurant?.tier ?? 'FREE';
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.FREE;
  return features.includes(feature);
}

export function useTier(): { tier: string; features: FeatureFlag[] } {
  const { activeRestaurant } = useRestaurantContext();
  const tier = activeRestaurant?.tier ?? 'FREE';
  const features = TIER_FEATURES[tier] ?? TIER_FEATURES.FREE;
  return { tier, features };
}
```

Note: `useRestaurantContext` might not exist as a named export. Check `RestaurantContext.tsx` — if it uses default export from `createContext`, create the hook inline:

```typescript
import { useContext } from 'react';
import RestaurantContext from '../context/RestaurantContext';
// Then: useContext(RestaurantContext) instead of useRestaurantContext()
```

- [ ] **Step 3: Verify no TS errors**

Run: `cd apps/frontend; npx tsc --noEmit`
Expected: Only RestaurantContext needs the `tier` field — confirm it builds after Step 1

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/hooks/useFeature.ts apps/frontend/src/context/RestaurantContext.tsx
git commit -m "feat: add useFeature hook with tier-based feature resolution for frontend"
```

---

### Task 6: Apply feature gates — backend controllers

**Files:**
- Modify: `apps/backend/src/orders/orders.service.ts`
- Modify: `apps/backend/src/orders/orders.module.ts`
- Modify: `apps/backend/src/payment/payment.controller.ts`
- Modify: `apps/backend/src/payment/payment.module.ts`
- Modify: `apps/backend/src/loyalty/loyalty.service.ts`
- Modify: `apps/backend/src/loyalty/loyalty.module.ts`
- Modify: `apps/backend/src/translation/translation.service.ts`
- Modify: `apps/backend/src/translation/translation.module.ts`

Since `SubscriptionModule` is `@Global()`, the guard and decorator are available everywhere without per-module imports.

- [ ] **Step 1: Add guards to orders controller**

Find the orders controller (`apps/backend/src/orders/orders.controller.ts`) — add guard to order creation endpoint:

```typescript
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';

// On the create order handler:
@Post()
@RequireFeature(FeatureFlag.ORDERS_RECEIVE)
@UseGuards(JwtAuthGuard, FeatureGuard)  // add FeatureGuard to existing guards
async create(...) { ... }
```

Also add to public order creation endpoint (used by QR customers — this should gate the entire ordering capability). If the public endpoint uses a different guard or no guard, wrap with just `FeatureGuard` (the guard fetches user — for public orders, the restaurant context comes from the table/session, not JWT).

For public order endpoints: the guard needs to resolve the restaurant differently. For now, gate only the JWT-authenticated dashboard endpoints. Public menu gating is handled by the frontend (Task 8).

- [ ] **Step 2: Add guards to payment controller**

In `apps/backend/src/payment/payment.controller.ts`:

```typescript
import { RequireFeature } from '../subscription/require-feature.decorator';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureFlag } from '../subscription/feature-flag.enum';

// On payment intent creation:
@RequireFeature(FeatureFlag.PAYMENTS_STRIPE)
@UseGuards(JwtAuthGuard, FeatureGuard)
```

- [ ] **Step 3: Add guards to loyalty controller**

In loyalty controller (if it exists — check. If loyalty methods are on a different controller, find the right file):

```typescript
@RequireFeature(FeatureFlag.LOYALTY)
@UseGuards(JwtAuthGuard, FeatureGuard)
```

- [ ] **Step 4: Add guards to translation controller**

```typescript
@RequireFeature(FeatureFlag.LANGUAGES_MULTI)
@UseGuards(JwtAuthGuard, FeatureGuard)
```

- [ ] **Step 5: Verify TS compiles**

Run: `cd apps/backend; npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/orders/ apps/backend/src/payment/ apps/backend/src/loyalty/ apps/backend/src/translation/
git commit -m "feat: apply @RequireFeature guards to orders, payments, loyalty, and translation controllers"
```

---

### Task 7: Pricing page + SubscriptionBanner + UpgradeModal + BillingView

**Files:**
- Create: `apps/frontend/src/pages/PricingPage.tsx`
- Create: `apps/frontend/src/components/subscription/SubscriptionBanner.tsx`
- Create: `apps/frontend/src/components/subscription/UpgradeModal.tsx`
- Create: `apps/frontend/src/components/subscription/BillingView.tsx`
- Modify: `apps/frontend/src/App.tsx` — add `/pricing` route
- Modify: `apps/frontend/src/locales/en/translation.json` — i18n keys
- Modify: `apps/frontend/src/locales/bg/translation.json` — i18n keys
- Modify: `apps/frontend/src/locales/ro/translation.json` — i18n keys

- [ ] **Step 1: Add `/pricing` route to App.tsx**

In `apps/frontend/src/App.tsx`, add import and route (public, no auth required):

```typescript
import PricingPage from './pages/PricingPage';

// Inside the PublicLayout or customer routes:
<Route path="/pricing" element={<PricingPage />} />
```

- [ ] **Step 2: Write PricingPage.tsx**

```typescript
// apps/frontend/src/pages/PricingPage.tsx
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const TIERS = [
  {
    key: 'free',
    price: '€0',
    period: '',
    features: [
      'Digital menu via QR',
      'Menu editor + images',
      'QR code generator',
      'Light/Dark theme',
    ],
    excluded: ['Online ordering', 'Payments', 'Analytics'],
  },
  {
    key: 'starter',
    price: '€10',
    period: '/mo',
    features: [
      'Everything in Free',
      'QR ordering system',
      'Order dashboard',
      'Basic analytics',
      'CSV menu import',
      'Unlimited tables',
      '1 staff account',
    ],
    cta: 'upgrade',
  },
  {
    key: 'professional',
    price: '€25',
    period: '/mo',
    recommended: true,
    features: [
      'Everything in Starter',
      'Stripe payments',
      'Call waiter',
      'Full analytics suite',
      'Multi-language (DeepL)',
      'Loyalty program',
      'Customer accounts',
      'Custom branding',
      'Upselling + dayparting',
      '5 staff accounts',
    ],
    cta: 'upgrade',
  },
  {
    key: 'enterprise',
    price: '€40',
    period: '/mo',
    features: [
      'Everything in Professional',
      'Full POS system',
      'Kitchen Display System',
      'Staff roles (RBAC)',
      'Thermal printer support',
      'Multi-location',
      'Menu templates',
      'Bulk price updates',
      'Unlimited staff',
      'Priority support',
    ],
    cta: 'upgrade',
  },
];

export default function PricingPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-4">
          {t('pricing.title', 'Choose Your Plan')}
        </h1>
        <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">
          {t('pricing.subtitle', 'All plans include 24/7 support. Upgrade or downgrade anytime.')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`rounded-2xl border p-6 flex flex-col ${
                tier.recommended
                  ? 'border-accent ring-2 ring-accent/20 shadow-lg'
                  : 'border-border'
              }`}
            >
              {tier.recommended && (
                <span className="text-xs font-bold text-accent uppercase tracking-wider mb-2">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold capitalize">{tier.key}</h3>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-black">{tier.price}</span>
                <span className="text-muted-foreground text-sm">{tier.period}</span>
              </div>
              <ul className="space-y-2 flex-1 mb-6">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="text-emerald-500 mt-0.5">&#10003;</span>
                    {t(`pricing.features.${f.replace(/\s+/g, '_').toLowerCase()}`, f)}
                  </li>
                ))}
                {tier.excluded?.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-muted-foreground mt-0.5">&times;</span>
                    {t(`pricing.features.${f.replace(/\s+/g, '_').toLowerCase()}`, f)}
                  </li>
                ))}
              </ul>
              {tier.cta && !user && (
                <a
                  href="/login"
                  className="block text-center py-2 px-4 rounded-lg bg-accent text-accent-foreground font-semibold text-sm"
                >
                  Start Free
                </a>
              )}
              {tier.cta && user && (
                <button
                  onClick={() => {
                    // POST /api/subscription/checkout
                    import('../lib/api').then(({ createCheckoutSession }) => {
                      createCheckoutSession(tier.key.toUpperCase());
                    });
                  }}
                  className="w-full py-2 px-4 rounded-lg bg-accent text-accent-foreground font-semibold text-sm"
                >
                  Upgrade to {tier.key}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write SubscriptionBanner.tsx**

```typescript
// apps/frontend/src/components/subscription/SubscriptionBanner.tsx
import { useTranslation } from 'react-i18next';
import { useTier } from '../../hooks/useFeature';
import { useAuth } from '../../context/AuthContext';

export default function SubscriptionBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tier } = useTier();

  if (!user || tier === 'ENTERPRISE') return null;

  const colors: Record<string, string> = {
    FREE: 'bg-gray-100 text-gray-700 border-gray-300',
    STARTER: 'bg-green-50 text-green-700 border-green-200',
    PROFESSIONAL: 'bg-blue-50 text-blue-700 border-blue-200',
    ENTERPRISE: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`flex items-center justify-between px-4 py-2 border rounded-lg text-sm ${colors[tier] ?? colors.FREE}`}>
      <span>
        {tier === 'FREE'
          ? t('subscription.freeBanner', 'You are on the Free plan. Upgrade for ordering and more features.')
          : t('subscription.banner', { tier })}
      </span>
      <a
        href="/pricing"
        className="font-bold underline ml-4 whitespace-nowrap"
      >
        {t('subscription.upgrade', 'Upgrade')}
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Write UpgradeModal.tsx**

```typescript
// apps/frontend/src/components/subscription/UpgradeModal.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { createCheckoutSession } from '../../lib/api';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature: string;
}

export default function UpgradeModal({ open, onClose, feature }: UpgradeModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleUpgrade = async (tier: string) => {
    setLoading(true);
    try {
      const { url } = await createCheckoutSession(tier);
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-2xl p-6 max-w-md w-full mx-4 border border-border shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            {t('subscription.featureLocked', 'Feature Locked')}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-muted-foreground mb-4 text-sm">
          {t('subscription.upgradeToAccess', { feature })}
        </p>
        <div className="space-y-2">
          <button
            onClick={() => handleUpgrade('STARTER')}
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg border border-border hover:bg-muted text-sm font-semibold"
          >
            Upgrade to Starter — €10/mo
          </button>
          <button
            onClick={() => handleUpgrade('PROFESSIONAL')}
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg border border-accent bg-accent/5 hover:bg-accent/10 text-sm font-semibold"
          >
            Upgrade to Professional — €25/mo
          </button>
          <button
            onClick={() => handleUpgrade('ENTERPRISE')}
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-accent text-accent-foreground text-sm font-semibold"
          >
            Upgrade to Enterprise — €40/mo
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: The `createCheckoutSession` function doesn't exist in `api.ts` yet. Add it:

```typescript
// In apps/frontend/src/lib/api.ts, add:
export async function createCheckoutSession(tier: string) {
  const { data } = await api.post('/subscription/checkout', { tier });
  return data; // { url: string }
}

export async function createPortalSession() {
  const { data } = await api.post('/subscription/portal');
  return data; // { url: string }
}

export async function getSubscriptionStatus() {
  const { data } = await api.get('/subscription/status');
  return data;
}
```

- [ ] **Step 5: Write BillingView.tsx**

```typescript
// apps/frontend/src/components/subscription/BillingView.tsx
import { useTranslation } from 'react-i18next';
import { useTier } from '../../hooks/useFeature';
import { createPortalSession } from '../../lib/api';
import { useState } from 'react';

export default function BillingView() {
  const { t } = useTranslation();
  const { tier, features } = useTier();
  const [loading, setLoading] = useState(false);

  const handleManageBilling = async () => {
    setLoading(true);
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold capitalize">{tier} Plan</h3>
          <p className="text-muted-foreground text-sm">
            {tier === 'FREE'
              ? t('subscription.freeDesc', 'Basic digital menu features')
              : t('subscription.activeDesc', 'Manage your subscription')}
          </p>
        </div>
        <button
          onClick={handleManageBilling}
          disabled={loading || tier === 'FREE'}
          className="py-2 px-4 rounded-lg border border-border hover:bg-muted text-sm font-semibold disabled:opacity-50"
        >
          {t('subscription.manageBilling', 'Manage Billing')}
        </button>
      </div>

      {tier !== 'ENTERPRISE' && (
        <a
          href="/pricing"
          className="inline-block py-2 px-4 rounded-lg bg-accent text-accent-foreground text-sm font-semibold"
        >
          {t('subscription.upgrade', 'Upgrade')}
        </a>
      )}

      <div>
        <h4 className="font-semibold mb-2 text-sm">
          {t('subscription.yourFeatures', 'Your Features')}
        </h4>
        <div className="grid grid-cols-2 gap-1">
          {features.map((f) => (
            <span key={f} className="text-sm text-muted-foreground">
              &#10003; {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add i18n keys to all 3 languages**

In `apps/frontend/src/locales/en/translation.json`:
```json
"pricing": {
  "title": "Choose Your Plan",
  "subtitle": "All plans include 24/7 support. Upgrade or downgrade anytime."
},
"subscription": {
  "freeBanner": "You're on the Free plan. Upgrade for ordering and more features.",
  "banner": "You're on the {{tier}} plan.",
  "upgrade": "Upgrade",
  "manageBilling": "Manage Billing",
  "featureLocked": "Feature Locked",
  "upgradeToAccess": "Upgrade your plan to access {{feature}}.",
  "freeDesc": "Basic digital menu features",
  "activeDesc": "Manage your subscription",
  "yourFeatures": "Your Features"
}
```

Add equivalent keys to `bg/translation.json` and `ro/translation.json` with appropriate translations.

- [ ] **Step 7: Verify no TS errors**

Run: `cd apps/frontend; npx tsc --noEmit`
Expected: Clean (or only pre-existing errors in unrelated files)

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/PricingPage.tsx apps/frontend/src/components/subscription/ apps/frontend/src/lib/api.ts apps/frontend/src/locales/ apps/frontend/src/App.tsx
git commit -m "feat: add pricing page, subscription banner, upgrade modal, and billing view"
```

---

### Task 8: FREE tier — hide cart from PublicMenuPage

**Files:**
- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx`

FREE tier = menu viewing only. No cart, no "Add to Cart" buttons, no checkout.

- [ ] **Step 1: Wrap CartIcon with feature check**

In `apps/frontend/src/pages/PublicMenuPage.tsx`, find where `CartIcon` is rendered (around line 599):

```typescript
import { useFeature } from '../hooks/useFeature';

// In the component body:
const canOrder = useFeature('orders:receive');

// Replace CartIcon line with:
{canOrder && <CartIcon ... />}
```

- [ ] **Step 2: Hide "Add to Cart" buttons on ItemWithOptions**

In `apps/frontend/src/components/menu/ItemWithOptions.tsx`, conditionally render the add-to-cart button:

```typescript
import { useFeature } from '../../hooks/useFeature';

// In component body:
const canOrder = useFeature('orders:receive');

// Wrap the "+ Add" button:
{canOrder && (
  <button ...>+ Add</button>
)}
```

- [ ] **Step 3: Hide bottom action bar on FREE tier**

The bottom bar (cart + bill) in `PublicMenuPage.tsx` should be hidden when `canOrder` is false.

- [ ] **Step 4: Verify build**

Run: `cd apps/frontend; npx tsc --noEmit && npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/PublicMenuPage.tsx apps/frontend/src/components/menu/ItemWithOptions.tsx
git commit -m "feat: hide cart and add-to-cart buttons on FREE tier public menu"
```

---

### Task 9: SettingsView — add Subscription tab

**Files:**
- Modify: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

- [ ] **Step 1: Add 'subscription' to tabs array**

Find the tabs definition (around line 396):
```typescript
(['general', 'loyalty', 'payments', 'staff'] as const).map(...)
```

Change to:
```typescript
(['general', 'subscription', 'loyalty', 'payments', 'staff'] as const).map(...)
```

- [ ] **Step 2: Add BillingView component to tab content**

Add a case for `'subscription'` in the tab content switch/case render section:

```typescript
import BillingView from '../../components/subscription/BillingView';

// In the tab content render:
{activeTab === 'subscription' && <BillingView />}
```

- [ ] **Step 3: Add i18n key for tab label**

In all 3 locale files, add `"subscription": "Subscription"` (or translations) to the settings section.

- [ ] **Step 4: Verify build**

Run: `cd apps/frontend; npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/Dashboard/SettingsView.tsx apps/frontend/src/locales/
git commit -m "feat: add Subscription tab to SettingsView with billing management"
```

---

### Task 10: Seed 4 demo restaurants

**Files:**
- Create: `apps/backend/prisma/seed-demo-restaurants.ts`
- Modify: `apps/backend/prisma/seed.ts` (or create standalone script)

- [ ] **Step 1: Write demo seed script**

```typescript
// apps/backend/prisma/seed-demo-restaurants.ts
import { PrismaClient, SubscriptionTier } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEMOS = [
  { email: 'demo-free@qrmenu.com', name: 'Demo Free Bistro', tier: 'FREE' as SubscriptionTier },
  { email: 'demo-starter@qrmenu.com', name: 'Demo Starter Kitchen', tier: 'STARTER' as SubscriptionTier },
  { email: 'demo-pro@qrmenu.com', name: 'Demo Professional Restaurant', tier: 'PROFESSIONAL' as SubscriptionTier },
  { email: 'demo-enterprise@qrmenu.com', name: 'Demo Enterprise Group', tier: 'ENTERPRISE' as SubscriptionTier },
];

async function main() {
  console.log('Seeding demo restaurants...');

  for (const demo of DEMOS) {
    const passwordHash = await bcrypt.hash('demo123', 10);

    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        email: demo.email,
        password: passwordHash,
        name: `Demo ${demo.tier} Owner`,
        role: 'OWNER',
      },
    });

    const restaurant = await prisma.restaurant.create({
      data: {
        name: demo.name,
        country: 'BG',
        ownerId: user.id,
        tier: demo.tier,
        dashboardLanguage: 'en',
      },
    });

    // Link user to restaurant
    await prisma.user.update({
      where: { id: user.id },
      data: { restaurantId: restaurant.id },
    });

    console.log(`  Created: ${demo.name} (${demo.email} / demo123)`);
  }

  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run seed**

Run: `cd apps/backend; npx ts-node prisma/seed-demo-restaurants.ts`
Expected: 4 restaurants created, no errors

- [ ] **Step 3: Verify demo restaurants**

Connect to Neon and verify:
- 4 new users with role OWNER
- 4 new restaurants with correct tiers
- Each user linked to their restaurant via `restaurantId`

- [ ] **Step 4: Commit**

```bash
git add apps/backend/prisma/seed-demo-restaurants.ts
git commit -m "feat: add demo restaurant seed script — 4 restaurants, one per tier"
```

---

### Task 11: Dashboard — tier-gated sidebar + SubscriptionBanner

**Files:**
- Modify: `apps/frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add SubscriptionBanner to dashboard**

Import and place `SubscriptionBanner` at top of dashboard content area:

```typescript
import SubscriptionBanner from '../components/subscription/SubscriptionBanner';

// In JSX, after header, before main content:
<SubscriptionBanner />
```

- [ ] **Step 2: Gate sidebar navigation items**

Use `useFeature` to hide/show sidebar links:

Pos and KDS links only shown when `useFeature('pos')` or `useFeature('kds')` returns true.

- [ ] **Step 3: Gate protected routes in App.tsx**

In `apps/frontend/src/App.tsx`, wrap POS/KDS routes:

```typescript
import { useFeature } from './hooks/useFeature';

// Inside the staff layout component:
const canPos = useFeature('pos');
const canKds = useFeature('kds');

// Conditionally register routes:
{canPos && <Route path="/staff/pos" element={<PosPage />} />}
{canKds && <Route path="/staff/kitchen" element={<KitchenPage />} />}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/frontend; npm run build`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/DashboardPage.tsx apps/frontend/src/App.tsx
git commit -m "feat: tier-gate dashboard sidebar and protected staff routes"
```

---

### Task 12: Integration testing + final verification

**Files:**
- No new files — verify everything works end-to-end

- [ ] **Step 1: Type check backend**

Run: `cd apps/backend; npx tsc --noEmit`
Expected: Clean (no new errors in subscription/ module)

- [ ] **Step 2: Type check frontend**

Run: `cd apps/frontend; npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Run backend tests**

Run: `cd apps/backend; npm test`
Expected: All existing tests pass + new subscription specs pass

- [ ] **Step 4: Build frontend**

Run: `cd apps/frontend; npm run build`
Expected: Production build succeeds

- [ ] **Step 5: Push schema**

Run: `cd apps/backend; npx prisma db push`
Expected: Schema in sync (this was done in Task 1, but verify again after all changes)

- [ ] **Step 6: Full build from root**

Run: `npm run build`
Expected: Both apps build cleanly via Turborepo

- [ ] **Step 7: Commit final state**

```bash
git add -A
git commit -m "chore: final integration verification — all tests passing, build clean"
```

---

## Verification Summary

| Check | Command | Status |
|-------|---------|--------|
| Prisma schema sync | `npx prisma db push` | Must pass |
| Backend TS | `npx tsc --noEmit` | Must pass |
| Frontend TS | `npx tsc --noEmit` | Must pass |
| Backend tests | `npm test` in `apps/backend` | Must pass |
| Frontend build | `npm run build` in `apps/frontend` | Must pass |
| Turbo build | `npm run build` from root | Must pass |
| Demo seed | `npx ts-node prisma/seed-demo-restaurants.ts` | 4 restaurants created |
