# FUTURE.MD — Competitive Gap Analysis + Build Roadmap

> Source: plan generated 2026-05-19. Strategic roadmap, not a single executable plan. Pick one phase or one Tier-1 item per implementation round.

## Context

QR Digital Menu ships dine-in QR ordering, loyalty (FIFO ledger, tiered), Stripe pay-at-table, KDS, Waiter POS, OCR menu import, multi-language (EN/BG/RO + 9 more via DeepL), 4-tier SaaS billing, super-admin dashboard, GDPR module. Target market: Bulgarian/EU restaurants.

This document answers: **what do competitors have that we don't, and which gaps are must-have?**

Competitor sets compared:
- **EU QR-menu SaaS** — MenuTiger, GloriaFood, FineDine, Flipdish, UpMenu
- **US table-ordering / POS** — Toast, Square for Restaurants, Mr Yum, Otter
- **Local BG/RO** — Smart Menu, Tabesto, Bulgarian fiscal-device POS vendors

Must-have lenses (all three applied per gap):
- **R** = Revenue-blocking (prospects walk without it)
- **P** = Table-stakes parity (every competitor ships it; missing it loses demos)
- **B** = Bulgarian/EU market fit (legal/regulatory or local-payment requirements)

## Current state baseline (what we have)

**Have**: Menu CRUD + drag-reorder, OCR import, options/choices (VARIATION + ADDON), 12-lang translations, allergens + dietary tags, image upload+thumbnail (R2), per-item upselling/pairings, restaurant-wide happy-hour multiplier, customer auth (OTP email/SMS/Google), loyalty (3-tier, FIFO ledger, daily expiry cron), Stripe Connect pay-at-table + tips, Stripe Subscription billing (monthly+yearly), KDS w/ audio alerts, Waiter POS w/ split-bill + per-seat, RBAC (OWNER/MANAGER/WAITER/KITCHEN) w/ PIN+device enrollment, branding (logo/colors/fonts/theme), analytics (revenue, top items, peak hours, table breakdown, feedback), GDPR export/delete + retention cron, super-admin tenant management, Socket.IO live updates, feedback w/ conditional Google review redirect, audit log, soft-delete tenants.

**Feature flags present but NOT implemented**: `multilocation`, `printers:thermal` (KDS exists but no printer driver).

**Schema gaps (no model)**: reservations, delivery, inventory/stock, suppliers, gift cards, marketing campaigns, promo codes, customer reviews (only single-order Feedback), Location entity, fiscal receipt records.

---

## Gap matrix (ranked)

### TIER 1 — Must ship next (legal + revenue blockers)

| # | Gap | Who has it | Lens | Effort | Why must-have |
|---|---|---|---|---|---|
| 1 | **BG fiscal device integration** (Datecs / Tremol / Eltrade + NRA reporting) | Every BG POS vendor | **B** | L | Bulgarian law — every cash/card sale must hit a fiscal device. Without it the product is illegal to operate as a payment terminal in BG. Hard blocker for BG market. |
| 2 | **86'd / out-of-stock item toggle** | All EU + US competitors | **R, P** | S | Daily-use need. Owners must flip "sold out" on items mid-service. We have no `isAvailable`/`stockStatus` field — already a top demo objection. |
| 3 | **In-app refunds** | Toast, Square, Mr Yum, MenuTiger | **R, P** | S | Owners refuse to bounce to Stripe dashboard for refunds. Currently no refund button in `PaymentsView`. Needs `POST /payments/:id/refund` + UI. |
| 4 | **Thermal KOT printer** (ESC/POS over network + Bluetooth) | All POS competitors, most EU QR-menu | **R, P** | M | Flag (`PRINTERS_THERMAL`) exists, no driver. Kitchens that aren't fully digital need printed tickets. Common spec in BG. |
| 5 | **Email + SMS order receipts** | Every competitor | **P** | S | After payment, customer expects an email/SMS receipt. We have on-screen only. Resend already wired for OTP — reuse. SMS via Twilio or local BG provider. |
| 6 | **Delivery + Pickup flow** (dine-in / takeaway / delivery toggle at checkout, address form, ETA) | GloriaFood, UpMenu, Flipdish, MenuTiger | **R, P** | L | We're dine-in only. Half the EU SMB-restaurant market wants takeaway/delivery. Without it we lose entire prospect category. |

### TIER 2 — Table-stakes parity (next quarter)

| # | Gap | Who has it | Lens | Effort | Why |
|---|---|---|---|---|---|
| 7 | **Reservations / table booking** | OpenTable, FineDine, Flipdish, every full-service POS | **P** | M | Full-service restaurants book tables. We have `RestaurantTable` but no time-slot booking. Even basic "book a table" form lifts close-rate. |
| 8 | **Promo / coupon codes** | All competitors | **P** | S | Single textarea-style code at checkout. No model exists. Common ask. |
| 9 | **Real PWA** (proper manifest, service worker, offline menu cache, installable) | MenuTiger, Mr Yum, FineDine | **P** | S | `public/manifest.json` is unmodified CRA default. No service worker. Diners can't install. Hurts repeat usage. |
| 10 | **Multi-location** (Location entity + selector + aggregated reporting) | Toast, Square, Flipdish, UpMenu | **R, P** | L | Flag exists, no schema. Chains can't onboard. Currently each Restaurant row is a separate tenant. |
| 11 | **Reorder previous order** | UberEats-style competitors, Mr Yum | **P** | S | One-tap "order the same again" on `CustomerProfilePage`. Customer model + Order rows already exist. |
| 12 | **Per-item happy-hour / dayparting** (item-level availability windows, not just restaurant-wide multiplier) | Toast, Square, GloriaFood | **P** | M | `DAYPARTING` flag exists. `MenuCategory` has `availabilityType/startTime/endTime/daysOfWeek` but `MenuItem` doesn't. Extend schema. |
| 13 | **Marketing tools** — email blast to loyalty members, push to opted-in customers, segment-based (e.g., "lost customers 30d+") | Toast, Square, Mr Yum loyalty add-ons | **P** | M | Loyalty ledger gives us segments for free. Resend sends. Wire a campaign sender + opt-in flag on `LoyaltyAccount`. |
| 14 | **Gift cards** | Toast, Square, most US POS | **P** | M | Common SMB upsell. Stripe Issuing or internal balance ledger. |
| 15 | **Customer retention / cohort analytics** (repeat-customer %, churn rate, RFM segments) | Mr Yum, Toast | **P** | M | We have order+customer data, just don't compute it. Adds to `AnalyticsView`. |
| 16 | **Group Ordering (Real-time Shared Cart)** | Mr Yum, Mr Tomato, Tabesto | **R, P** | L | Diners in groups scan the QR code and want to see what others are adding to the table's cart in real-time, preventing duplicate orders and enabling collective checkout. |
| 17 | **Context-Aware Assistance (Summon Options)** | Mr Yum, MenuTiger | **P** | S | Instead of a single generic call-waiter bell, let customers select reasons like "Request Cutlery", "Request Water", "Bring Card Terminal", "Other", saving staff from making multiple diagnostic trips. |

### TIER 3 — Growth / differentiation (later)

| # | Gap | Who has it | Lens | Effort | Why |
|---|---|---|---|---|---|
| 18 | **Inventory tracking** (stock counts, low-stock alerts, recipe-based depletion) | Toast, Square (full-fat), Lightspeed | **P** | L | Beyond 86'd toggle (#2). Real stock ledger. Big lift; only ENTERPRISE customers ask. |
| 19 | **Local payment methods** — ePay, Easypay, Borica BNP, MyPOS | Local BG POS vendors | **B** | M | `PaymentProvider.MYPOS` enum exists, no impl. BG cards have lower acceptance via Stripe than via Borica. |
| 20 | **BG VAT-compliant invoices** (ДДС фактура format) | Every BG accounting-integrated POS | **B** | M | Different from fiscal receipt (#1). Invoice for B2B customers. |
| 21 | **Custom domain / white-label** | Toast (with partner), enterprise QR-menu vendors | **P** | M | ENTERPRISE-only differentiator. Vercel domain API + per-tenant DNS verification. |
| 22 | **Staff performance metrics** (orders per waiter, avg serve time, tips per waiter) | Toast, Square | **P** | S | All data already in `Order` + `User`. Pure analytics work. |
| 23 | **Two-way tableside chat** (customer ↔ waiter via socket) | Mr Yum | nice-to-have | M | Current Assistance is one-shot bell. Chat thread per session. |
| 24 | **Aggregator passthrough** (DoorDash, UberEats, Glovo, Wolt orders into KDS) | Toast, Otter, Deliverect | **R** for delivery-heavy prospects | XL | Skip until #6 (delivery) ships and EU market validates. |
| 25 | **A/B testing** (price/name/image variants) | Mr Yum | nice-to-have | L | Differentiator, not parity. |
| 26 | **AI menu recommendations** (per-diner upsells based on order history) | Mr Yum, Toast Tabs | nice-to-have | L | We have data; needs model + endpoint. |
| 27 | **Offline-Resilient POS (Local Queue Sync)** | Toast, Square, local BG POS vendors | **R, P** | L | Waiters using POS devices on tablet/mobile often hit Wi-Fi dead zones in gardens or basements. Offline caching of POS cart + local DB lookup ensures service continuity, syncing orders once connection is restored. |
| 28 | **WhatsApp Notification Integration** | GloriaFood, UpMenu, local BG/RO competitors | **B** | M | High WhatsApp penetration in Bulgaria and Romania means customer receipts, order updates, and marketing blasts are far more effective via WhatsApp than email/SMS. |
| 29 | **Smart Feedback Rotator** | Mr Yum, local feedback tools | **P** | S | Rotates high-rating redirects between Google Reviews, TripAdvisor, and Facebook to build uniform public presence, rather than only driving Google Reviews. |

### OUT-OF-SCOPE (don't build)

- **Full POS hardware** (Square-tier terminal/cash drawer/card reader). Needs hardware partner; not feasible solo.
- **Native iOS/Android apps**. Real PWA (#9) covers 90% of value at 5% of cost.
- **Reservation marketplace** (OpenTable-style aggregator). Building reservations for our own tenants (#7) is enough.

---

## Phased build roadmap

### Phase 1 (Tier 1) — ~6 weeks

**Goal: unblock BG sales + close top demo objections.**

**1A. Out-of-stock toggle (#2)** — 2 days
- Schema: `MenuItem.isAvailable Boolean @default(true)`. Migration: additive.
- Backend: `PATCH /menu/items/:id/availability` (already in `menu-crud.service.ts` scope). Filter from `public-menu` GET.
- Frontend: Toggle in `ItemEditorModal`; "Sold out" badge on public menu; greyed-out card.
- Files: `apps/backend/prisma/schema.prisma`, `apps/backend/src/menu/items.controller.ts`, `apps/frontend/src/components/menu/ItemEditorModal.tsx`, `apps/frontend/src/components/menu/ItemCard.tsx`.

**1B. In-app refunds (#3)** — 3 days
- Backend: `POST /payments/:id/refund` in `payment.controller.ts` (full + partial). Calls `stripe.refunds.create()`. Updates `Payment.status` to `REFUNDED`, emits socket event.
- Frontend: Refund button in `PaymentsView`, confirmation modal w/ amount + reason. Admin-only (gated by `payments:stripe` + role check).
- Files: `apps/backend/src/payment/payment.service.ts` (+`refundPayment` method), `apps/backend/src/payment/payment.controller.ts`, `apps/frontend/src/pages/Dashboard/PaymentsView.tsx`.

**1C. Email + SMS receipts (#5)** — 4 days
- Backend: New `notifications/` module. `NotificationsService.sendReceiptEmail()` (Resend) + `sendReceiptSms()` (Twilio or BG provider — start with Twilio). Triggered from `PaymentService.handleWebhookEvent` on `payment_intent.succeeded`.
- Templates: HTML receipt w/ restaurant logo + branding colors. SMS = plain text w/ short link.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
- Files: `apps/backend/src/notifications/notifications.module.ts` (new), `notifications.service.ts` (new), update `payment.service.ts` to call after success.

**1D. Thermal KOT printer (#4)** — 1 week
- Backend: New `printers/` module. `PrinterService` with ESC/POS driver (use `node-thermal-printer` or `escpos` npm). Per-restaurant printer config (IP + port or Bluetooth MAC). On `OrdersService.create`, queue print job.
- Schema: `Printer` model (id, restaurantId, name, type [KITCHEN | BAR], connection [NETWORK | BLUETOOTH], host, port, encoding, isActive).
- Frontend: Printer settings tab under `SettingsView` (ENTERPRISE-gated by `printers:thermal`). Test-print button.
- Note: Network printers only in v1 (Bluetooth needs OS-level pairing, ship later).
- Files: `apps/backend/src/printers/*` (new), `apps/backend/prisma/schema.prisma`, `apps/frontend/src/components/settings/PrintersTab.tsx`.

**1E. BG fiscal device integration (#1)** — 2 weeks
- Decision required: cloud-printer-aggregator (e.g., Eltrade Cloud) vs direct serial/USB to fiscal device. Recommend cloud aggregator (no local agent on owner's machine).
- Backend: New `fiscal/` module. `FiscalService` with provider interface (`IFiscalProvider`). Implement `EltradeProvider` first. On payment success, send fiscal receipt request, store fiscal number on `Payment.fiscalReceiptNumber`.
- Schema: `Payment.fiscalReceiptNumber String?`, `Payment.fiscalReceiptUrl String?`, `Restaurant.fiscalDeviceId String?`, `Restaurant.fiscalProvider FiscalProvider?` (enum: ELTRADE, DATECS, TREMOL).
- Frontend: Fiscal device setup in `SettingsView` (BG tenants only — gate by `country == 'BG'`). Show fiscal number on order confirmation.
- Daily Z-report cron + monthly NRA reporting export.
- Files: `apps/backend/src/fiscal/*` (new), schema, `apps/frontend/src/components/settings/FiscalTab.tsx` (new).

**1F. Delivery + Pickup flow (#6)** — 2 weeks
- Schema: `Order.fulfillmentType FulfillmentType` enum (DINE_IN | TAKEAWAY | DELIVERY). `Order.deliveryAddress`, `Order.deliveryFee`, `Order.scheduledFor DateTime?`. `Restaurant.fulfillmentTypes FulfillmentType[]` (which they support).
- Backend: `OrdersService.create` accepts fulfillmentType; validates against restaurant's supported types; delivery fee calculation (flat or distance-based stub).
- Frontend: `CheckoutPage` adds fulfillment radio (only types restaurant enabled), conditional delivery address form, scheduled-time picker, ETA display.
- Public menu: For takeaway/delivery, customer doesn't need to scan QR — landing page direct-link.
- KDS: Order card shows fulfillment badge.
- Files: schema, `apps/backend/src/orders/orders.service.ts`, `apps/backend/src/orders/dto/create-order.dto.ts`, `apps/frontend/src/pages/CheckoutPage.tsx`, `apps/frontend/src/pages/staff/KitchenPage.tsx`.

### Phase 2 (Tier 2) — ~8 weeks

**Goal: parity with EU QR-menu competitors.**

**2A. Promo codes (#8)** — 3 days
- Schema: `PromoCode` model (code, restaurantId, type [PERCENT | FIXED], value, minOrderAmount, maxUses, usedCount, validFrom, validUntil, isActive).
- Backend: `POST /promo-codes/validate` (public), `CRUD /restaurants/:id/promo-codes` (owner). `OrdersService` applies discount on order create.
- Frontend: Code input field in `CheckoutPage` + `PromoCodesView` in dashboard.

**2B. Real PWA (#9)** — 3 days
- Replace `manifest.json` (proper name, icons 192/512, theme color from restaurant branding — server-rendered).
- Add service worker via `vite-plugin-pwa` (Workbox). Cache menu API responses w/ stale-while-revalidate.
- Install prompt UI on `PublicMenuPage` after first order.

**2C. Reorder previous order (#11)** — 2 days
- Frontend: "Reorder" button on each order in `CustomerProfilePage`. Hydrates `CartContext` from `OrderItem[]`, validates against current menu (skip 86'd/deleted items, warn user).

**2D. Reservations (#7)** — 2 weeks
- Schema: `Reservation` model (id, restaurantId, tableId, customerName, customerPhone, customerEmail, partySize, scheduledFor, durationMinutes, status [PENDING | CONFIRMED | SEATED | NO_SHOW | CANCELED], notes). `Restaurant.reservationsEnabled Boolean`, `Restaurant.reservationSlotMinutes Int @default(30)`.
- Backend: New `reservations/` module. CRUD + availability check (no double-book on same table+slot). Owner approve/decline. Confirmation email via Resend.
- Frontend: Public booking form on landing page (`/r/:slug/book`). Owner dashboard `ReservationsView`.

**2E. Per-item dayparting (#12)** — 3 days
- Schema: add `availabilityType/startTime/endTime/daysOfWeek` fields to `MenuItem` (mirror `MenuCategory`). Migration: additive.
- Backend: `public-menu` filter hides items outside their availability window. Owner editor UI in `ItemEditorModal`.

**2F. Multi-location (#10)** — 2 weeks
- Schema: New `Location` model (id, restaurantId, name, address, timezone, phone, isActive). Migrate `Order.restaurantId` to `Order.locationId`, derive restaurant via location. Same for `Table`, `Staff` assignments.
- Backend: All endpoints accept location context (header `X-Location-Id` or path param). `RestaurantContext` on frontend becomes location-aware.
- Frontend: Location switcher in `TopBar` (next to language). Multi-location analytics aggregation in `AnalyticsView`.
- This is the riskiest migration — gate behind `multilocation` feature flag, ENTERPRISE-only.

**2G. Marketing campaigns (#13)** — 1 week
- Schema: `Campaign` model (id, restaurantId, type [EMAIL | PUSH], subject, body, segmentFilter JSON, scheduledFor, status [DRAFT | SCHEDULED | SENT], sentCount). `LoyaltyAccount.marketingOptIn Boolean @default(false)` (GDPR — explicit consent).
- Backend: New `campaigns/` module. Segment filter SDL (e.g., "tier == GOLD AND lastOrderAt < 30 days ago"). Cron processes scheduled campaigns.
- Frontend: `CampaignsView` in dashboard. Composer w/ template variables (`{{firstName}}`, `{{points}}`). Web-push needs VAPID keys + subscription endpoint.

**2H. Gift cards (#14)** — 1 week
- Schema: `GiftCard` model (id, code, restaurantId, initialBalance, currentBalance, purchasedBy, recipientEmail, expiresAt, isActive).
- Backend: Purchase flow (Stripe Checkout for the gift-card amount → email code to recipient). Redemption at checkout (apply against `Order.total`).
- Frontend: Gift-card section on public landing + `GiftCardsView` in dashboard.

**2I. Retention / cohort analytics (#15)** — 4 days
- Backend: `dashboard.service.ts` adds `getRetentionMetrics()`: repeat-customer % (customers with ≥2 orders / total), 30/60/90-day churn, RFM-segmented counts.
- Frontend: New section in `AnalyticsView` w/ cohort heatmap (signup-month × month-since-signup retention %).

**2J. Group Ordering (Real-time Shared Cart) (#16)** — 1.5 weeks
- Schema: `CartSession` to track dynamic customer group carts, linked to `TableSession`.
- Backend: Socket.io room events (`cart:item-added`, `cart:item-removed`, `cart:quantity-changed`) to synchronize cart operations.
- Frontend: Avatars in cart drawer showing active table members; live drawer state updates on remote mutations.

**2K. Context-Aware Assistance (Summon Options) (#17)** — 3 days
- Schema: Update `AssistanceRequest` model to include `type` enum (WATER, CUTLERY, BILL_CARD, BILL_CASH, OTHER).
- Backend: API endpoint accepts request type; gateway emits structured assistance events.
- Frontend: Summon Waiter button presents option selection overlay; KDS shows custom icons/text per type.

### Phase 3 (Tier 3) — opportunistic

Treat as a backlog, prioritize by deal demand. Each #18–#29 is a standalone 1–4 week feature. Don't build speculatively.

---

## Files & critical paths to modify (Phase 1 + 2 summary)

| Phase | Files |
|---|---|
| 1A | `prisma/schema.prisma`, `menu/items.controller.ts`, `ItemEditorModal.tsx`, `ItemCard.tsx`, public menu rendering |
| 1B | `payment.service.ts`, `payment.controller.ts`, `PaymentsView.tsx` |
| 1C | `notifications/*` (new), `payment.service.ts`, `.env.example` |
| 1D | `printers/*` (new), schema, `SettingsView.tsx` printer tab |
| 1E | `fiscal/*` (new), schema, `SettingsView.tsx` fiscal tab |
| 1F | schema, `orders.service.ts`, `create-order.dto.ts`, `CheckoutPage.tsx`, `KitchenPage.tsx` |
| 2A | schema, `promo-codes/*` (new), `CheckoutPage.tsx`, `PromoCodesView.tsx` (new) |
| 2B | `vite.config.js`, `manifest.json`, service worker, install-prompt UI |
| 2C | `CustomerProfilePage.tsx`, `CartContext.tsx` reorder method |
| 2D | schema, `reservations/*` (new), `ReservationsView.tsx`, public booking page |
| 2E | schema, `menu/items.service.ts` availability filter, `ItemEditorModal.tsx` |
| 2F | schema (Location), every service that queries by `restaurantId`, `RestaurantContext.tsx`, `TopBar.tsx` |
| 2G | schema, `campaigns/*` (new), `CampaignsView.tsx` (new), VAPID push setup |
| 2H | schema, `gift-cards/*` (new), Stripe gift-card purchase flow, redemption in `CheckoutPage` |
| 2I | `dashboard.service.ts`, `AnalyticsView.tsx` retention section |
| 2J | schema (CartSession), `events.gateway.ts`, `CartContext.tsx` Socket listeners/emitters, `CartDrawer.tsx` |
| 2K | schema (AssistanceRequest type), `assistance/*` endpoints, `PublicMenuPage.tsx` overlay, KDS page |

---

## Reused / existing pieces

- **Resend** (currently OTP-only) → reuse for receipts (#5), campaigns (#13), reservation confirmations (#7), gift-card delivery (#14).
- **Stripe Connect** → reuse for refunds (#3) and gift-card Stripe Checkout (#14).
- **Socket.IO** (`EventsGateway`) → reuse for refund-success event, reservation-status updates, campaign-sent counters, and **Group Ordering / real-time shared cart updates (#16)**.
- **Audit log** (`AdminAuditLog`) → already has actor/action/target — extend for refund, fiscal receipt void, campaign send.
- **GDPR retention cron** → extend to include reservations, campaigns, gift-card recipient PII.
- **Loyalty segment data** → marketing campaigns query directly from `LoyaltyAccount` + `Order`, no new model needed for segmentation.
- **DeepL translations** → extend to promo-code descriptions, reservation confirmation emails, gift-card messages.
- **`@nestjs/schedule`** → already registered in `loyalty.module.ts`; extend cron host module pattern for campaigns + fiscal daily Z-report.

## Decisions needed before Phase 1 starts

1. **Fiscal provider** — Eltrade Cloud (recommended), Datecs Cloud, or build all three? Eltrade has the largest BG installed base.
2. **SMS provider** — Twilio (global, premium price) vs local BG provider (cheaper, BG numbers only). Start Twilio.
3. **Multi-location migration risk** — soft-launch (Location FK nullable, dual-read) vs hard cutover. Recommend dual-read for 1 release.
4. **Gift card balance ledger** — internal balance or use Stripe Issuing? Internal is simpler; Stripe Issuing means real prepaid cards (overkill for v1).

## Verification per phase

- **Phase 1**: BG tenant onboards, prints kitchen ticket, takes a fiscal-receipted card payment, refunds it from dashboard, customer gets SMS + email receipt, can order takeaway delivery.
- **Phase 2**: Diner installs the menu as PWA, scans QR, sees correct dayparting (lunch menu hidden after 16:00), reorders last order, applies promo code, books a table for tomorrow, gets reservation confirmation email. Owner sends a loyalty-segment email blast and tracks 30-day retention.
- **Phase 3**: pick from backlog based on actual deal pipeline.

---

## How to use this plan

This is a strategic build roadmap, not a single executable plan. Pick one phase or one Tier-1 item to scope into a full implementation plan via a separate planning round. Tier 1 items are independent — can ship in any order. Phase 2 has some ordering: #10 (multi-location) is risky; do it last in Phase 2 or push to Phase 3.

Out-of-scope items above are intentional — not "build later", but "decide deliberately if and when". POS hardware in particular is a partnership move, not a build.
