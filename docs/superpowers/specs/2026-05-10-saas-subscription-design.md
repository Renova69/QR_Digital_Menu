# SaaS Subscription System — Design Spec

**Date:** 2026-05-10  
**Status:** Approved  
**Author:** QR Menu Dev

---

## Overview

Add a 3-tier SaaS subscription system so restaurant owners pay the platform for access. Billing via Stripe Subscriptions. New owners get a 14-day Pro trial; after trial they drop to Free unless they subscribe.

---

## Tiers

| Tier | Price | Target |
|------|-------|--------|
| **Free** | €0/mo | Small restaurants, price-sensitive market |
| **Starter** | ~€15/mo | Growing restaurants wanting analytics + payments |
| **Pro** | ~€35/mo | Full-featured: loyalty, multi-language, staff roles |

---

## Feature Gating Matrix

| Feature | Free | Starter | Pro |
|---------|:----:|:-------:|:---:|
| Tables | 3 max | Unlimited | Unlimited |
| Menu items | 20 max | Unlimited | Unlimited |
| Basic ordering + QR codes | ✅ | ✅ | ✅ |
| Custom branding | ❌ | ✅ | ✅ |
| Analytics dashboard | ❌ | ✅ | ✅ |
| Customer feedback + Google Review | ❌ | ✅ | ✅ |
| Live table view (realtime) | ❌ | ✅ | ✅ |
| Stripe pay-at-table | ❌ | ✅ | ✅ |
| Waiter POS (`/staff/pos`) | ❌ | ✅ | ✅ |
| Loyalty program | ❌ | ❌ | ✅ |
| Multi-language (DeepL) | ❌ | ❌ | ✅ |
| Staff roles (Phase 18) | ❌ | ❌ | ✅ |

Usage limits (tables, menu items) enforced server-side on `POST` create — return `403` with descriptive message when limit hit. Feature routes enforced via `@TierRequired` guard.

---

## Trial Policy

- Every new restaurant starts with `subscriptionStatus = TRIALING`, `subscriptionTier = PRO`, `trialEndsAt = createdAt + 14 days`
- Full Pro access during trial — no credit card required
- When trial expires with no active subscription → cron downgrades to `subscriptionTier = FREE`, `subscriptionStatus = CANCELED`
- No grandfathering needed (no existing clients at launch)

---

## Database Schema

5 new fields on `Restaurant`, 2 new enums. No new models needed.

```prisma
enum SubscriptionTier {
  FREE
  STARTER
  PRO
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
}

model Restaurant {
  // ... existing fields unchanged ...

  subscriptionTier     SubscriptionTier   @default(FREE)
  subscriptionStatus   SubscriptionStatus @default(TRIALING)
  trialEndsAt          DateTime?
  stripeCustomerId     String?
  stripeSubscriptionId String?
  stripePriceId        String?
}
```

`stripeCustomerId`, `stripeSubscriptionId`, and `stripePriceId` are null for Free-forever restaurants. `stripePriceId` is stored on every webhook update to enable future price grandfathering without Stripe API calls.

---

## Backend Architecture

### New module: `SubscriptionModule`

Registered in `app.module.ts` alongside existing modules. Uses `@nestjs/schedule` (already registered in `LoyaltyModule`) — no new scheduler setup needed.

### Controller — `SubscriptionController`

Base path: `/api/subscription`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/status` | JWT | Current subscription info for dashboard |
| POST | `/checkout` | JWT | Create Stripe Checkout Session, return URL |
| POST | `/portal` | JWT | Create Stripe Billing Portal Session, return URL |
| POST | `/webhook` | None (raw body) | Stripe webhook receiver |

### Service — `SubscriptionService`

**`createCheckoutSession(restaurantId, tier)`**
1. Find/create `stripeCustomerId` on Stripe, save to DB
2. If restaurant `subscriptionStatus = TRIALING` and `trialEndsAt > now`: pass `subscription_data.trial_end = trialEndsAt` (Unix timestamp) to Stripe. Stripe captures the card immediately but does NOT charge or change access until the trial naturally ends. Owner keeps Pro features for remaining trial days regardless of which tier they subscribe to.
3. Create Stripe Checkout Session with `mode: 'subscription'`, correct price ID, `success_url`, `cancel_url`
4. Return `{ url }` for frontend redirect

**`createPortalSession(restaurantId)`**
1. Lookup `stripeCustomerId` from DB
2. Create Stripe Billing Portal Session
3. Return `{ url }` for frontend redirect

**`handleWebhook(rawBody, signature)`**
Verify Stripe signature. Handle 4 events:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Idempotency check first: if `stripeSubscriptionId` already exists in DB, return `200 OK` and skip. Otherwise set `subscriptionTier`, `subscriptionStatus = ACTIVE`, save `stripeSubscriptionId` + `stripePriceId`. |
| `customer.subscription.updated` | Sync `subscriptionTier` + `stripePriceId` (handles upgrade/downgrade via Stripe Portal). Idempotent by nature — always overwrites to current state. |
| `customer.subscription.deleted` | Set `subscriptionTier = FREE`, `subscriptionStatus = CANCELED`, clear `stripeSubscriptionId` + `stripePriceId`. |
| `invoice.payment_failed` | Set `subscriptionStatus = PAST_DUE` (grace period, not immediate downgrade). |

**Idempotency rule:** Stripe explicitly retries failed webhooks. On `checkout.session.completed`, check `restaurant.stripeSubscriptionId === event.subscription` before writing. If already set, return `200 OK` immediately — no DB write, no race condition.

**`runDailyTrialExpiry()`** — cron `@Cron('0 0 * * *')` (midnight UTC)
Find restaurants where `subscriptionStatus = TRIALING` AND `trialEndsAt < now`. Downgrade: `subscriptionTier = FREE`, `subscriptionStatus = CANCELED`.

> **Note on ScheduleModule:** `ScheduleModule.forRoot()` is currently registered inside `LoyaltyModule`. Move it to `AppModule` so both `LoyaltyModule` and `SubscriptionModule` can use `@Cron` decorators without conflict. `ScheduleModule` is a global NestJS module — registering it in `AppModule` is the correct pattern.

### Guard — `SubscriptionGuard`

```typescript
@TierRequired(SubscriptionTier.STARTER)
@UseGuards(JwtAuthGuard, SubscriptionGuard)
```

Guard resolves the active restaurant from JWT user, checks:
1. If `subscriptionStatus = TRIALING` and `trialEndsAt > now` → pass (full Pro access)
2. If `subscriptionTier >= requiredTier` → pass
3. Otherwise → throw `ForbiddenException` with `{ code: 'TIER_REQUIRED', requiredTier }`

Usage limits checked inline in `MenuService.create` and `TablesService.create` — count existing records, reject if at limit.

### Env vars (add to `apps/backend/.env`)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PRO=price_...
```

---

## Frontend Architecture

### Context update — `RestaurantContext`

Expose from existing restaurant fetch (no new API call):
- `subscriptionTier: SubscriptionTier`
- `subscriptionStatus: SubscriptionStatus`
- `trialEndsAt: string | null`

### New hook — `useTierAccess(requiredTier)`

```typescript
const { hasAccess, isTrialing, daysLeft } = useTierAccess(SubscriptionTier.STARTER)
```

Returns `hasAccess: boolean` (true if trialing-not-expired or tier sufficient), `isTrialing: boolean`, `daysLeft: number`.

### New components

**`/pricing` — Public pricing page**
- Route in `App.tsx`, no auth required
- 3-column feature comparison table
- "Start Free Trial" CTA → registers + creates restaurant → redirects to dashboard

**`SubscriptionBanner` — Dashboard top banner**
Shown conditionally:
- Trialing: "X days left in your Pro trial — Subscribe to keep access" + Upgrade button
- Past due: "Payment failed — update your card" + Manage Billing button
- Free: Subtle "You're on the Free plan — Upgrade for more features" + Upgrade button
- Active: Hidden

**`UpgradeModal` — Locked feature gate**
Triggered when owner clicks a locked feature. Shows tier comparison, "Upgrade to Starter / Pro" buttons → calls `POST /api/subscription/checkout?tier=STARTER`.

**`BillingView` — Dashboard Settings tab (new tab)**
Shows: current plan name, status badge, trial end date (if trialing), next billing date (if active).  
"Manage Billing" button → `POST /api/subscription/portal` → redirect to Stripe Customer Portal.

### Upgrade flow (end-to-end)

1. Owner clicks locked feature → `UpgradeModal` opens
2. Clicks "Upgrade to Starter" → `POST /api/subscription/checkout?tier=STARTER`
3. Backend returns Stripe Checkout URL → frontend `window.location.href = url`
4. Owner completes payment on Stripe hosted page
5. Stripe redirects to `/dashboard?subscribed=true`
6. Webhook fires `checkout.session.completed` → DB updated to `STARTER / ACTIVE`
7. `SubscriptionBanner` disappears, locked features unlock

---

## Key Files to Create / Modify

### Create
- `apps/backend/src/subscription/subscription.module.ts`
- `apps/backend/src/subscription/subscription.service.ts`
- `apps/backend/src/subscription/subscription.controller.ts`
- `apps/backend/src/subscription/subscription.guard.ts`
- `apps/backend/src/subscription/tier-required.decorator.ts`
- `apps/backend/src/subscription/dto/checkout.dto.ts`
- `apps/frontend/src/pages/PricingPage.tsx`
- `apps/frontend/src/components/subscription/SubscriptionBanner.tsx`
- `apps/frontend/src/components/subscription/UpgradeModal.tsx`
- `apps/frontend/src/components/subscription/BillingView.tsx`
- `apps/frontend/src/hooks/useTierAccess.ts`

### Modify
- `apps/backend/src/app.module.ts` — register `SubscriptionModule`
- `apps/backend/src/restaurants/restaurants.service.ts` — set trial fields on `create()`
- `apps/backend/src/menu/menu.service.ts` — enforce 20-item Free limit on `create()`; apply `.take(20)` in `getPublicMenu()` when `subscriptionTier === FREE`
- `apps/backend/src/tables/tables.service.ts` — enforce 3-table Free limit on `create()`
- `apps/backend/src/loyalty/loyalty.service.ts` — add `@TierRequired(PRO)`
- `apps/backend/src/translation/translation.service.ts` — add `@TierRequired(PRO)`
- `apps/backend/src/payment/payment.controller.ts` — add `@TierRequired(STARTER)`
- `apps/backend/prisma/schema.prisma` — new fields + enums
- `apps/frontend/src/context/RestaurantContext.tsx` — expose subscription fields
- `apps/frontend/src/App.tsx` — add `/pricing` route, wrap POS route with tier check
- `apps/frontend/src/pages/DashboardPage.tsx` — add `SubscriptionBanner` + `BillingView` tab

---

## Downgrade Behavior

When a restaurant downgrades (trial expires, subscription canceled, payment failed):
- Existing data is **never deleted** — tables > 3 and items > 20 remain in the dashboard safely
- **New creates** are blocked (POST endpoints return `403` when at limit)
- **Public menu enforcement:** `MenuService.getPublicMenu()` applies `.take(20)` when `subscriptionTier === FREE`. The owner can keep 60 items in the dashboard and edit/rename them freely — but customers on the QR menu only see the first 20 until the owner re-subscribes. This closes the loophole where owners could bypass the item limit via `PATCH` edits on existing records.
- Tables > 3 are hidden from the public menu (`take(3)`) on Free tier using the same pattern
- This avoids data loss and eliminates PATCH-based limit bypass

---

## Out of Scope (not in this spec)

- Annual billing discount (add later)
- Per-restaurant multi-location limits (Phase 20)
- Admin panel for manual overrides (not needed with Stripe automation)
- Translation cost optimization (separate future task)