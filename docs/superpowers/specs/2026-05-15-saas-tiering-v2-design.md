# SaaS Tiering V2 — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Author:** QR Menu Dev
**Supersedes:** `2026-05-10-saas-subscription-design.md`

---

## Overview

Replace the 3-tier Free/Starter/Pro (€0/€15/€35) design with a 4-tier Free/Starter/Professional/Enterprise (€0/€10/€25/€40) model. Enterprise absorbs POS + KDS + RBAC + thermal printing + multi-location. Free tier becomes pure menu-viewing (no cart, no ordering) to maximize upgrade conversion.

Billing via Stripe Subscriptions. No trial required at launch — clean 4-tier lineup with 4 demo restaurants (one per tier) for sales demos.

---

## Tiers

| Tier | Price | Target |
|------|-------|--------|
| **Free** | €0/mo | Digital menu only — QR code leads to view-only menu. Lead generation. |
| **Starter** | €10/mo | Small restaurants / fast food. QR ordering + basic dashboard. |
| **Professional** | €25/mo | Growing venues. Payments, loyalty, multi-language, branding. |
| **Enterprise** | €40/mo | Full operations. POS, KDS, RBAC, thermal printing, multi-location. |

---

## Feature Gating Matrix

### Customer-Facing

| Feature | Free | Starter | Professional | Enterprise |
|---------|:---:|:-------:|:------------:|:----------:|
| View menu (QR) | ✅ | ✅ | ✅ | ✅ |
| Place orders (QR) | ❌ | ✅ | ✅ | ✅ |
| Call waiter | ❌ | ❌ | ✅ | ✅ |
| Pay at table (Stripe) | ❌ | ❌ | ✅ | ✅ |
| Loyalty points + tiers | ❌ | ❌ | ✅ | ✅ |
| Multi-language menu | ❌ | 1 lang | ✅ | ✅ |
| Customer accounts (OTP) | ❌ | ❌ | ✅ | ✅ |

### Dashboard / Staff

| Feature | Free | Starter | Professional | Enterprise |
|---------|:---:|:-------:|:------------:|:----------:|
| Menu CRUD + images | ✅ | ✅ | ✅ | ✅ |
| QR code management | ✅ | ✅ | ✅ | ✅ |
| Table management | ✅ | Unlimited | Unlimited | Unlimited |
| Order receiving | ❌ | ✅ | ✅ | ✅ |
| Basic analytics | ❌ | ✅ | ✅ | ✅ |
| Full analytics | ❌ | ❌ | ✅ | ✅ |
| Custom branding | ❌ | ❌ | ✅ | ✅ |
| Google Review redirect | ❌ | ❌ | ✅ | ✅ |
| Dayparting | ❌ | ❌ | ✅ | ✅ |
| Upselling / trending | ❌ | ❌ | ✅ | ✅ |
| Menu CSV import | ❌ | ✅ | ✅ | ✅ |
| DeepL translation | ❌ | ❌ | ✅ | ✅ |
| Waiter POS (`/staff/pos`) | ❌ | ❌ | ❌ | ✅ |
| KDS (`/staff/kitchen`) | ❌ | ❌ | ❌ | ✅ |
| Thermal printer support | ❌ | ❌ | ❌ | ✅ |
| RBAC (staff roles) | ❌ | ❌ | ❌ | ✅ |
| Multi-location | ❌ | ❌ | ❌ | ✅ |
| Menu templates | ❌ | ❌ | ❌ | ✅ |
| Bulk price updates | ❌ | ❌ | ❌ | ✅ |
| Shared device mode | ❌ | ❌ | ❌ | ✅ |
| Device enrollment (PIN) | ❌ | ❌ | ❌ | ✅ |

### Staff Seats

| Tier | Staff Limit |
|------|-------------|
| Free | 1 (owner only) |
| Starter | 1 (owner only) |
| Professional | 5 |
| Enterprise | Unlimited |

---

## Free Tier: View-Only Public Menu

Public menu page loaded via QR → menu items visible → **no cart, no "Add to Cart" button, no CartIcon, no CartDrawer.** Pure digital menu replacement.

Dashboard access limited to: menu editor, QR code management, basic settings. No orders tab, no analytics, no staff management.

---

## Architecture

### Feature Gating

Single source of truth: `FeatureService` resolves `SubscriptionTier` → `FeatureFlag[]`.

```typescript
enum FeatureFlag {
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

Backend: `@RequireFeature(FeatureFlag.POS)` decorator + guard at API/socket level.
Frontend: `useFeature(FeatureFlag.POS)` hook for conditional rendering + route registration.

**No usage limits** (table count, item count). Feature gating is purely capability-based. Previous spec's 20-item / 3-table Free limits are removed — Free tier has no ordering, so item/table limits are irrelevant.

---

## Database Schema

```prisma
enum SubscriptionTier {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}

model Restaurant {
  // ... existing fields unchanged ...

  tier                  SubscriptionTier  @default(FREE)
  stripeCustomerId      String?
  stripeSubscriptionId  String?
  stripePriceId         String?
  tierUpdatedAt         DateTime?
}
```

No `SubscriptionStatus` enum needed (no trial period). `tier` is the single source of truth.
No `trialEndsAt` needed (no trial).

---

## Stripe Integration

### Products + Prices

| Stripe Product | Monthly Price ID (env var) |
|----------------|---------------------------|
| QR Menu Free | — (no charge) |
| QR Menu Starter | `STRIPE_PRICE_STARTER` |
| QR Menu Professional | `STRIPE_PRICE_PROFESSIONAL` |
| QR Menu Enterprise | `STRIPE_PRICE_ENTERPRISE` |

### Env Vars

`STRIPE_SECRET_KEY` already exists (used by Stripe Connect payments). Reuse same key. Add:

```
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...   # separate from existing STRIPE_WEBHOOK_SECRET (payments)
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

Note: `STRIPE_WEBHOOK_SECRET` is already used by the payment webhook (`StripeProvider`). The subscription webhook at `/api/subscription/webhook` uses its own secret `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`. Create a separate webhook endpoint in Stripe Dashboard for subscriptions, filtering only billing events (`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`).

### Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Idempotency check → set `tier`, save `stripeSubscriptionId` + `stripePriceId` |
| `customer.subscription.updated` | Sync tier + price ID (handles upgrade/downgrade via Portal) |
| `customer.subscription.deleted` | Set `tier = FREE`, clear Stripe IDs |
| `invoice.payment_failed` | Notify owner, downgrade to FREE after 3 failed retries (Stripe handles retry schedule) |

---

## Backend Module: `SubscriptionModule`

### Controller — `SubscriptionController`

Base path: `/api/subscription`

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/status` | JWT | Current tier + features for dashboard |
| POST | `/checkout` | JWT | Create Stripe Checkout Session, return URL |
| POST | `/portal` | JWT | Create Stripe Billing Portal Session, return URL |
| POST | `/webhook` | None (raw body) | Stripe webhook receiver |

### Guard — `RequireFeature`

```typescript
@RequireFeature(FeatureFlag.POS)
@UseGuards(JwtAuthGuard, FeatureGuard)
@Post('orders')
```

Guard resolves restaurant from JWT user, checks `FeatureService.hasFeature(restaurant.tier, requiredFeature)`. Throws `ForbiddenException` with `{ code: 'FEATURE_LOCKED', requiredFeature }` if denied.

### Service — `FeatureService`

```typescript
getFeatures(tier: SubscriptionTier): FeatureFlag[]
hasFeature(tier: SubscriptionTier, feature: FeatureFlag): boolean
```

---

## Frontend

### Hook — `useFeature(feature: FeatureFlag): boolean`

Used everywhere: conditional rendering, route guards, component visibility.

### New Components

- **`PricingPage.tsx`** — Public `/pricing` route. 4-column feature comparison. "Start Free" / "Upgrade" CTAs.
- **`SubscriptionBanner.tsx`** — Dashboard notification: current tier, upgrade prompt.
- **`UpgradeModal.tsx`** — Triggered when clicking locked feature. Tier comparison + upgrade CTA.
- **`BillingView.tsx`** — Settings tab: current tier, "Manage Billing" → Stripe Portal, invoice history.

### Modify

- `PublicMenuPage.tsx` — `useFeature('orders:receive')` → hide cart on FREE tier.
- `DashboardPage.tsx` — `useFeature()` guards on sidebar nav items. Add `SubscriptionBanner`.
- `SettingsView.tsx` — Add "Subscription" tab with `BillingView`.
- `App.tsx` — Conditionally register `/staff/pos`, `/staff/kitchen` routes based on tier.
- `RestaurantContext.tsx` — Expose `tier` field from restaurant fetch.

---

## Demo Restaurants

Seed script creates 4 demo accounts:

| Demo Account | Tier | Pre-built Content |
|-------------|------|-------------------|
| `demo-free@qrmenu.com` | FREE | Menu with categories + items, QR codes. No cart on public menu. |
| `demo-starter@qrmenu.com` | STARTER | Full menu, QR ordering, basic analytics data, imported menu items. |
| `demo-pro@qrmenu.com` | PROFESSIONAL | Payments enabled, loyalty points, 3 languages, custom branding, dayparting. |
| `demo-enterprise@qrmenu.com` | ENTERPRISE | POS configured, KDS, staff roles, multi-location preset. |

All share password `demo123`. Restaurant names: "Demo Free Bistro", "Demo Starter Kitchen", "Demo Professional Restaurant", "Demo Enterprise Group".

---

## Downgrade Behavior

When restaurant downgrades: data preserved, features soft-locked. If restaurant re-upgrades, all data returns as before. No data deletion. No time limit on data retention.

Public menu enforcement: if tier lacks `orders:receive` → no cart rendered. No limit on items/tables displayed (they're shown on menu regardless of tier — ordering is what's gated).

---

## Files to Create / Modify

### Create

- `apps/backend/src/subscription/subscription.module.ts`
- `apps/backend/src/subscription/subscription.service.ts`
- `apps/backend/src/subscription/subscription.controller.ts`
- `apps/backend/src/subscription/feature.service.ts`
- `apps/backend/src/subscription/feature.guard.ts`
- `apps/backend/src/subscription/require-feature.decorator.ts`
- `apps/backend/src/subscription/dto/checkout.dto.ts`
- `apps/frontend/src/pages/PricingPage.tsx`
- `apps/frontend/src/components/subscription/SubscriptionBanner.tsx`
- `apps/frontend/src/components/subscription/UpgradeModal.tsx`
- `apps/frontend/src/components/subscription/BillingView.tsx`
- `apps/frontend/src/hooks/useFeature.ts`
- `apps/backend/prisma/seed-demo-restaurants.ts`

### Modify

- `apps/backend/prisma/schema.prisma` — add `SubscriptionTier` enum, fields on `Restaurant`
- `apps/backend/src/app.module.ts` — register `SubscriptionModule`
- `apps/backend/src/orders/orders.service.ts` — add `@RequireFeature(ORDERS_RECEIVE)`
- `apps/backend/src/payment/payment.controller.ts` — add `@RequireFeature(PAYMENTS_STRIPE)`
- `apps/backend/src/loyalty/loyalty.service.ts` — add `@RequireFeature(LOYALTY)`
- `apps/backend/src/translation/translation.service.ts` — add `@RequireFeature(LANGUAGES_MULTI)`
- `apps/frontend/src/context/RestaurantContext.tsx` — expose `tier`
- `apps/frontend/src/App.tsx` — add `/pricing`, conditionally register tier-gated routes
- `apps/frontend/src/pages/PublicMenuPage.tsx` — hide cart on FREE tier
- `apps/frontend/src/pages/DashboardPage.tsx` — tier-gated sidebar + `SubscriptionBanner`
- `apps/frontend/src/pages/Dashboard/SettingsView.tsx` — add Subscription tab

---

## Out of Scope

- Annual billing discount
- Per-restaurant feature overrides (hybrid tier + override model)
- Free trial (not needed at launch — 4 demo restaurants serve the sales function)
- Admin panel for manual tier overrides
- Usage-based billing (per-order fees, etc.)
- Thermal printer hardware procurement (Plan: `expressive-watching-lollipop.md` covers the agent + protocol)
