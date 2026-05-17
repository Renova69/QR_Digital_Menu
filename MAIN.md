# QR Menu App — Master Documentation

> **Last Updated:** May 17, 2026
> **Status:** V2.5 Complete — V3 Growth Features (Stripe Payments ✅, Live Table View ✅, OCR Import ✅, Waiter POS ✅, Staff Roles & RBAC ✅) — Security Hardening ✅ (httpOnly cookies, CSRF, same-origin proxy, CSP) — Public Menu Mobile UX ✅ (top bar, filters, dual currency, horizontal cards, category pills) — Bug Fixes & Polish ✅ (PR#3 findings, code review fixes, dead code cleanup, payments investigation) — Security & Bug Fixes ✅ (CORS wildcard, magic-link removed, loyalty emails, CSV export, TS strict mode) — Infrastructure & Polish ✅ (API versioning /api/v1, Prisma circuit breaker, order progress stepper, QR print templates, 122 tests) — SaaS Tiering V2 ✅ (4-tier FREE/STARTER/PRO/ENTERPRISE, FeatureGuard, Stripe Billing, PricingPage, BillingView, demo accounts) — Production Deployment ✅ (Vercel frontend + Cloud Run backend, cross-origin cookies, CSRF fixed) — Tier Enforcement Sweep Round 2 ✅ (all 22 feature flags enforced, 454 tests passing) — **Super-Admin Dashboard ✅ (internal ops panel, tier override, suspend/reactivate, soft delete, live tier propagation via TanStack Query)**
> **Stack:** Turborepo Monorepo — React 18 + NestJS 11 + Prisma 6 + Neon (Serverless PostgreSQL)

---

## 1. Executive Summary

**QR Menu** is a full-stack digital menu platform for restaurants. Restaurant owners create and manage menus, generate QR codes for each table, and customers scan to browse, order, call for assistance, and pay — all from their phone, no app download required.

### Target Audience
- **Restaurant owners and staff** — admin dashboard for menu management, order tracking, analytics, and branding
- **Restaurant patrons** — customer-facing public menu accessed via QR code scan

### Key Metrics
- **Zero-cost development stack** — Neon Free Tier (0.5GB), Vercel Hobby, Supabase Free (5GB)
- **Startup time** — ~5 seconds (native dev) vs 2-5 minutes (old Docker workflow)
- **Languages** — EN, BG, RO (DeepL auto-translation, BG as fallback)
- **Fonts** — Outfit (body) + Playfair Display (headings)

---

## 2. Tech Stack

### Core

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo + npm Workspaces (`apps/*`) |
| **Frontend** | React 18, Vite 6, TypeScript 5.9, Tailwind CSS 4, Radix UI, TanStack Query 5, i18next, socket.io-client |
| **Backend** | NestJS 11, TypeScript, Prisma 6 ORM, `@nestjs/websockets`, `@nestjs/throttler`, `@nestjs/schedule` |
| **Database** | **Neon** (Serverless PostgreSQL, pooled connection) |
| **Auth** | JWT + Google OAuth 2.0 + Email OTP (Resend API) — via Passport.js |
| **Translation** | DeepL API — platform-managed key, lazy on-demand caching to DB |
| **Storage** | Cloudflare R2 (image uploads + CDN), sharp image processing pipeline |
| **Realtime** | Socket.io via `@nestjs/websockets` (`EventsGateway`) |
| **Payments** | Stripe Connect (Active — provider abstraction, Connect onboarding, payment history, real-time notifications) |
| **API Docs** | Swagger/OpenAPI at `/api-docs` |
| **Testing** | Jest (backend), Vitest + jsdom (frontend), Supertest (E2E) |

### Key Libraries

| Category | Packages |
|----------|----------|
| **UI** | `@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-icons`, `lucide-react` |
| **Styling** | `tailwindcss-animate`, `class-variance-authority`, `clsx`, `tailwind-merge` |
| **State/Data** | `@tanstack/react-query`, React Context API |
| **Drag & Drop** | `@dnd-kit/core`, `@dnd-kit/sortable` |
| **QR Code** | `react-qr-code`, `qrcode.react` |
| **Charts** | Recharts |
| **Dates** | Luxon (timezone-aware) |
| **Currency** | Dual EUR/BGN formatter at BNB fixed rate 1.95583 |
| **Validation** | `class-validator`, `class-transformer` |
| **Email** | Resend REST API |

---

## 3. Architecture

### High-Level System Design

```
Customer Phone (Browser)
        |
    QR Code Scan
        |
        v
+----------------------+     +----------------------+
|  Frontend (React)    |---->|  Backend (NestJS)    |
|  Vercel (Static)     |     |  Cloud Run (Docker)  |
|  /api/v1 cross-origin|     |  /api/v1 prefix      |
+----------------------+     +----------+-----------+
                                        |
                                        v
                              +------------------+
                              |  Neon PostgreSQL |
                              |  (Serverless)    |
                              +------------------+
```

### Monorepo Structure

```
/
├── apps/
│   ├── backend/               # NestJS API (Prisma + PostgreSQL)
│   │   ├── prisma/            # Schema, migrations, seed
│   │   └── src/               # API logic (modules)
│   └── frontend/              # Vite + React (Dashboard + Public Menu)
│       └── src/               # UI logic (pages, components, contexts, hooks)
├── packages/
│   └── ts-config/             # Shared TypeScript configuration
├── package.json               # Root workspace config
├── turbo.json                 # Turborepo orchestration
└── .planning/                 # Planning docs (phases, codebase docs)
```

### Backend Architecture — NestJS Modules

```
AppModule
├── ConfigModule (global)
├── PrismaModule (shared DB access, retry logic, graceful shutdown)
├── AuthModule (JWT + Google OAuth + Email OTP)
├── UsersModule
├── RestaurantsModule (CRUD, branding, translation triggers)
├── MenuModule (categories, items, options, public menu, audit)
├── OrdersModule (server-side pricing, status workflow)
├── TablesModule (QR code generation, bulk print)
├── DashboardModule (summary stats, analytics, revenue trends)
├── AssistanceModule ("Call Waiter" requests)
├── EventsModule (Socket.io gateway for realtime pushes)
├── TranslationModule (DeepL, fire-and-forget pre-warm, lazy on-demand)
├── StorageModule (Cloudflare R2 image uploads + sharp image processing)
├── LoyaltyModule (FIFO point ledger, VIP tiers, expiry cron)
├── PaymentModule (Stripe Connect, provider abstraction, webhooks, payment history)
├── SubscriptionModule (SaaS tiering: FeatureService, FeatureGuard, SubscriptionService, Stripe Checkout/Portal/webhook) [@Global]
├── MenuImportModule (OCR JSON → menu upsert, API key auth + JWT auth, 60s transaction)
├── HealthModule
└── FeedbackModule
```

**Global middleware:** `ThrottlerGuard` (100 requests / 60s), `ValidationPipe({ whitelist: true })`, CORS for `FRONTEND_URL`.

**Layer pattern per module:**
```
Controller (HTTP, validated DTOs)
    → Service (business logic, ownership checks)
        → PrismaService (database access, retry on connect)
            → Neon PostgreSQL
```

### Frontend Architecture — React SPA

**State management:** React Context API (6 domains) + TanStack Query (server state)

| Context | Purpose |
|---------|---------|
| `AuthContext` | User auth state, login/register/logout, JWT management |
| `RestaurantContext` | Active restaurant selection, list |
| `MenuContext` | Menu editor state (CRUD) |
| `CartContext` | Shopping cart with localStorage persistence |
| `OrderContext` | Order management, socket event handling |
| `SocketContext` | Socket.io connection, room joining |
| `PosContext` | POS cart state (in-memory, isolated from CartContext), seat selection, submitted/pending item tracking |
| `NotificationContext` | Payment notification state, bell badge count, toast queue |

**Routing (React Router v7):**

| Path | Component | Access | Layout |
|------|-----------|--------|--------|
| `/` | `HomePage` | Public | AppLayout |
| `/login` | `LoginPage` | Public | AppLayout |
| `/register` | `RegisterPage` | Public | AppLayout |
| `/oauth/callback` | `OAuthCallbackPage` | Public | AppLayout |
| `/menu/public/:restaurantId` | `PublicMenuPage` | Public | **PublicLayout** (no chrome) |
| `/checkout` | `CheckoutPage` | Public | **PublicLayout** |
| `/order-confirmation` | `OrderConfirmationPage` | Public | **PublicLayout** |
| `/feedback` | `FeedbackPage` | Public | **PublicLayout** |
| `/profile` | `CustomerProfilePage` | Customer | **PublicLayout** |
| `/dashboard` | `DashboardPage` | Protected | AppLayout |
| `/dashboard/menu` | `MenuEditorPage` | Protected | AppLayout |
| `/staff/pos` | `PosPage` | Staff | **PosLayout** (full-viewport) |

**Layout split:** `AppLayout` (Header + container) for dashboard/auth routes; `PublicLayout` (bare) for all customer-facing routes — enables native-feel mobile experience.

### Data Model (Prisma Schema)

```
User (owner/customer)
  ├── id, email, password, name, phone, role (OWNER/MANAGER/WAITER/KITCHEN/CUSTOMER)
  │
  └── 1:N → Restaurant
       ├── id, name, country, timezone, branding (logo, colors, fonts)
       ├── tier (FREE|STARTER|PROFESSIONAL|ENTERPRISE), stripeCustomerId, stripeSubscriptionId, tierUpdatedAt
       ├── loyaltyExchangeRate, loyaltyRedeemRate
       ├── defaultTheme ("light"|"dark"), targetLanguages (JSON)
       ├── translations (JSON field for DeepL cache)
       │
       ├── 1:N → RestaurantTable (name, QR code URL)
       ├── 1:N → MenuCategory (name, order, availability, banner, translations)
       │    └── 1:N → MenuItem (name, description, price, allergens, dietary tags,
       │              imageUrl, outOfStock, order, translations, relatedItemIds)
       │         └── 1:N → MenuOption (type: VARIATION|ADDON, required, choices JSON)
       │                   choices: [{ name: "Medium Well", priceModifier: 0.00 }]
       │
       ├── 1:N → Order (status: NEW→IN_PROGRESS→SERVED→CANCELED, tableId, customer info)
       │    └── 1:N → OrderItem (menuItemId, quantity, selectedOptions, priceSnapshot)
       │
       ├── 1:N → AssistanceRequest (table, status, resolvedAt)
       ├── 1:N → Feedback (rating, comment, orderId)
       └── 1:N → LoyaltyAccount (customerId, points, tier)

VerificationToken (email, code bcrypt-hashed, expiresAt, usedAt)
TableSession (token, restaurantId, tableId, status: ACTIVE|PAID|CANCELED, totalAmount)
Payment (sessionId, stripePaymentIntentId, amount, tip, status, method)
```

**Critical schema rules:**
- MenuOption.choices has **no `id` field** — shape is `{ name, priceModifier }` everywhere (DB, seed, frontend, order validation)
- Never reference `choice.id` or `choice.price` — they don't exist
- Loyalty rates: `loyaltyExchangeRate` = points earned per €1; `loyaltyRedeemRate` = points per €1 discount; `@Max(100)` enforced on exchangeRate
- `restaurant.deeplApiKey` column exists but is **never read or written** — platform key via `DEEPL_API_KEY` env var

---

## 4. Features — Complete Inventory

### V1 — MVP (Shipped April 9, 2026)

| Phase | Feature | Details |
|-------|---------|---------|
| 1 | Project Setup | Turborepo, NestJS, React, Prisma, Neon DB |
| 2 | Authentication | JWT tokens, Google OAuth, protected routes, Error Boundary |
| 3 | Restaurant Management | CRUD, multi-restaurant per owner, onboarding flow |
| 4 | Menu Builder | Categories, items, options (variations/add-ons), image upload, drag-and-drop reorder, out-of-stock toggle |
| 5 | Table Management | Table CRUD, QR code generation per table (`?table=<name>`), QR download, print layout |
| 6 | Contactless Ordering | Server-side price calculation, cart with table tracking, checkout flow, order status workflow |
| 7 | Dashboard & Polish | Summary stats, branding editor, responsive design, loading/error states |
| 8 | Production Readiness | Docker Compose, health checks, rate limiting, Swagger docs, DB migration strategy |

### V2 — Premium Features (Shipped)

| Phase | Feature | Details |
|-------|---------|---------|
| 9 | Smart Analytics | Revenue trends, top items, peak hours heatmap, AOV, period comparison (7/14/30 days), CSV export (European format) |
| 10 | Customer Feedback | Post-order star rating, smart routing: 4-5★ → Google Reviews, 1-3★ → private feedback |
| 11 | Automated Dayparting | `AvailabilityType`: ALWAYS/SCHEDULED/HIDDEN, timezone-aware per restaurant, days-of-week scheduling |
| 12 | Multi-Language | EN/BG/RO, DeepL auto-translation, JSON `translations` field, manual override |
| 13 | Real-Time Updates | Socket.io WebSocket gateway, live order/assistance push notifications, audio alerts |
| 14 | Upselling Engine | Perfect Pairing (relatedItemIds), Trending Carousel, add-to-cart toast, drink upselling |

### V2.5 — Visual Polish & Mobile UX (Shipped)

| Phase | Feature | Details |
|-------|---------|---------|
| 15 | Image Experience | Square aspect ratio, pinch-to-zoom lightbox (1-4x scale, swipe-to-dismiss), category banners, mobile sizing |
| 16 | Advanced Branding | Google Fonts picker (16 fonts), 4-color scheme editor, WCAG contrast validator (>=4.5:1), live preview panel, per-restaurant CSS custom properties |
| 17 | Menu Check | Automated audit widget (`MenuCheckWidget`), severity levels (error/warning/info), one-click fix navigation, detects: missing descriptions/images/translations, empty categories, €0 prices |

### Post-Roadmap Additions (Shipped May 2026)

| Feature | Details |
|---------|---------|
| **Loyalty Program** | FIFO point ledger, configurable VIP tiers (thresholds + multipliers from Restaurant row), timezone-aware happy hour (`Math.max(happyHour, tier)` not additive), expiry reminder cron at midnight UTC, loyalty accounts per customer |
| **Customer Auth (Email OTP)** | `VerificationToken` model, 6-digit bcrypt-hashed codes, 10-min expiry, 60s rate-limit, Resend API, 3-step modal (`entry → otp → welcome`) |
| **Customer Profile** | Order history, loyalty accounts, VIP tiers, points balance, expiring points, fully translated |
| **Cart Language Sync** | `resolveItemName()` resolves live translated names by item ID + selected language |
| **Options Pre-selection** | First VARIATION choice auto-selected on item open — prevents ordering base item without required variant |
| **QR Print Fix** | Single-column A4 layout, `breakInside: avoid`, `@page { size: A4 portrait; margin: 12mm }` |
| **Analytics Dark Mode** | Recharts axes use `hsl(var(--color-muted-foreground))`, custom ChartTooltip with theme-aware classes |
| **Platform Translation Key** | DeepL key managed by backend env var only, removed from UI/DTO, 3 translation paths (pre-warm, translate-all, lazy on-demand) |
| **i18n Completeness** | ~120 keys added across EN/BG/RO, all hardcoded strings wired to `t()` |
| **UI/UX Audit (May 4)** | Design system rewrite (warm HSL palette), font reduction, CSS bug fixes (invalid `hsla()`, global transition removal), a11y fixes, per-restaurant theme scoping, owner default theme |

### V3 — Growth Features

| Phase | Feature | Goal | Status |
|-------|---------|------|--------|
| 18 | Staff Roles | OWNER/MANAGER/WAITER/KITCHEN roles, permission matrix, PIN-based device login, QR enrollment, shared device mode | **✅ Complete** |
| 19 | Stripe Payments | Pay-at-table via Payment Intents, split payment, tips, Stripe Connect for platform fees | **✅ Complete** |
| 20 | Multi-Location | Menu templates, bulk price updates, cross-location analytics | Planned |

### Post-Roadmap Additions (Shipped May 8, 2026)

| Feature | Details |
|---------|---------|
| **Live Table View** | Real-time color-coded table status grid, filter modes (Active/Occupied/Paid/All), table detail modal with orders + payment info, Socket.io `table:status-changed` events from 4 emission points, parallel DB queries via `Promise.all` |
| **Payment History & Notifications** | `PaymentsView` with status/date filters, `NotificationContext` + `NotificationBell` (badge count), `PaymentToast` slide-in, `payment:confirmed` socket event |
| **Code Review Fixes** | Parallel DB queries replacing sequential awaits, `emitTableStatusChanged` helper deduplication, removed unused fields (`label` from statusStyles), `enabled: !!restaurantId` query guard, dead code removal |

### Post-Roadmap Additions (Shipped May 9, 2026)

| Feature | Details |
|---------|---------|
| **OCR Menu Import** | `MenuImportModule` — upserts categories + items + options from OCR JSON into the owner's live menu. Dual auth: API key bearer (OCR tool push) + JWT (dashboard confirm). `ImportItemDto` fields: `allergens[]`, `dietaryTags[]`, options with `VARIATION`/`ADDON` types. Prisma transaction timeout raised to 60s for large menus (~260 queries for 82-item menus over Neon cloud). `jsonToPayload()` in `MenuImportView.tsx` transforms OCR internal schema to import DTO. |

### Post-Roadmap Additions (Shipped May 9-10, 2026)

| Feature | Details |
|---------|---------|
| **Waiter POS** | Full-viewport, mobile-first Point-of-Sale at `/staff/pos`. New `PosLayout` + `PosContext` (in-memory, isolated from CartContext). Seat-level ordering (Seat 1-3 / Shared). Table selection modal with color-coded status grid + Force Open. Per-item notes aggregated into `Order.specialRequests`. Submitted/pending item tracking — reopening table shows full order history, submitting only sends new items to kitchen. Three session-end actions: Submit Order (pending only), Paid by Card (MYPOS payment record), Force Close (CLOSED_NO_PAYMENT). All 3 have Radix confirmation dialogs. Split bill (pure UI math) and QR bill sharing. 4 new backend endpoints. Zero Prisma schema changes. |
| **POS Bug Fixes** | Duplicate menuItemId deduplication (`[...new Set()]`), cart reset on table switch, dashboard live view real order data (was hardcoded "No orders"), order history isolation (submitted items visible but not re-sent) |

### Post-Roadmap Additions (Shipped May 10, 2026)

| Feature | Details |
|---------|---------|
| **Translation Bug Fixes** | Three root causes fixed: (1) `handleForceTranslate` in `SettingsView` now saves `targetLanguages` to DB before calling translate-all — prevented "No target languages configured" 400 error when local state differed from DB. (2) `selectedLang` init in `PublicMenuPage` uses `.slice(0, 2)` to strip browser locale codes like "en-US" to "en"; dropdown is now dynamic from `restaurant.targetLanguages`, hidden when none configured. (3) `menu.service.ts` `getPublicMenu` select now includes `defaultTheme` — was missing, breaking per-restaurant theme on public menu load. |
| **DeepL Rate Limit & Connection Fix** | `TranslationService`: replaced per-call `axios.post()` with shared `AxiosInstance` using `https.Agent({ keepAlive: true, maxSockets: 4 })` — eliminates `MaxListenersExceededWarning` from TLS listener accumulation. Added 250ms delay between language iterations in `translateObject` — eliminates DeepL 429 errors when translating to multiple languages back-to-back. |
| **Menu Import Translation Passthrough** | `ImportItemDto` and `ImportCategoryDto` now accept `translations: Record<string, { name?, description? }>`. `menu-import.service.ts` passes `translations` through to Prisma `create`/`update` for both categories and items. Root cause: `jsonToPayload()` in `MenuImportView.tsx` explicitly rebuilt item/category objects without spreading `translations` — now passes through if present. Enables importing multilingual menus from JSON without a separate translate step. |
| **Menu Editor Delete Buttons** | `window.confirm()` was silently blocked in some browser contexts, making category/item delete buttons non-functional. `CategoryList.tsx`: replaced with Radix `Dialog` confirmation showing "This will permanently delete [name] and ALL items inside it. This cannot be undone." with Cancel + Delete buttons and loading state. `ItemList.tsx`: replaced with inline `confirmingDeleteId` state — first click shows "Delete? / Cancel / Delete" buttons inline on the row, second click executes. ~15 new i18n keys added in EN/BG/RO (`menuAdmin.deleteCategoryTitle/Warning/Warning2/deleteCategory/confirmDelete`, `common.delete/deleting`). |

### Post-Roadmap Additions (Shipped May 12-14, 2026)

| Feature | Details |
|---------|---------|
| **Staff Roles & RBAC** | `UserRole` expanded to `OWNER`/`MANAGER`/`WAITER`/`KITCHEN`. Permission matrix enforced across all services: `checkRestaurantAccess` allowing owner OR assigned staff. `User.restaurantId` links staff to restaurant. Auth responses include `restaurantId` for frontend resolution. Role-based access: Orders (owner+assigned staff), Dashboard (owner+MANAGER), Restaurant management (owner+MANAGER except delete+Stripe), Assistance (owner+staff). |
| **PIN-Based Staff Login** | `POST /auth/pin-login` endpoint. Staff set 4-digit PIN (SHA256-hashed) on enrollment. Device login page at `/device-login` clears existing session first, shows PIN keypad. Role-based redirect: WAITER→`/staff/pos`, KITCHEN→`/staff/kitchen`. Wrong PIN stays on keypad (no redirect). 401 interceptor skips `/auth/pin-login`. |
| **Device Enrollment (Bond a Device)** | `DeviceEnrollmentToken` model with SHA256-hashed tokens, 10-min TTL. Manager creates enrollment → QR code + enrollment URL generated. Staff scans QR or opens link to set PIN. Re-bond flow: re-issue enrollment for existing staff. `POST /:id/device-enrollment` endpoint. Fixed 500 error from missing `device_enrollment_token` table via `prisma db push`. |
| **StaffCreatedModal** | 172-line React component. QR code display (`QRCodeSVG`), raw PIN with copy-to-clipboard (Clipboard API + `execCommand` fallback), expiry countdown timer (mm:ss), invalid date guard, enrollment error banner. i18n support across EN/BG/RO. Used for initial enrollment and re-bond. |
| **Shared Device Mode** | Toggle in Settings → Staff tab. Stores restaurant config in `localStorage.sharedDevice`. Device login page clears owner/manager/staff session before PIN entry. PIN buttons disabled during session clearing. |
| **Staff Settings Consolidation** | Shared Device Mode + QR Code Management moved from General to Staff tab. Staff table: name, email (`.local` synthetic emails hidden with "—"), role badge, re-bond button, delete action. |
| **Provider Fetch Noise Fix** | `OrderProvider` + `AssistanceProvider` only fetch when authenticated. `SocketProvider` no longer depends on nonexistent `token` field. Both removed from public/customer routes. |
| **Updated Docs** | CLAUDE.md, MAIN.md, CODING_ROADMAP.md, MAIN_FEATURES.md, HOW_TO.md, fixed_issues_main.md updated with RBAC/staff details. `RBAC_Fixed_issues.md` documents all RBAC and shared-device fixes. |

### Post-Roadmap Additions (Shipped May 15, 2026)

| Feature | Details |
|---------|---------|
| **Shared Currency Utility** | `lib/currency.ts` — `formatEuro()` and `formatBgn()` formatters at Bulgarian National Bank fixed rate 1 EUR = 1.95583 BGN. Dual-currency display throughout checkout, cart, and payment flows. Bulgarian law compliance (all prices must show both currencies). |
| **TopBar** | Full-width search with Lucide magnifier icon, filter toggle button, theme toggle (light/dark), language codes (EN/BG/RO), table chip replacing "You are viewing the menu for table X" text. Compact horizontal layout using ~48px height. |
| **FilterPanel** | Slide-down filter panel with dietary toggle switches (Spicy, Vegan, New, Featured) and allergen exclusion pills (Milk, Wheat, Fish, Nuts, Eggs, Soy, Shellfish). Clicking an allergen pill hides all products containing that allergen. Fully translated EN/BG/RO. |
| **Horizontal Item Cards** | `ItemWithOptions` redesigned to horizontal layout (image left, content right). Dual-currency prices: EUR price with BGN equivalent beneath at fixed rate. Pill-shaped "+ Add" buttons (`rounded-full`) replace full-width solid blue "ADD TO CART" buttons. Compact form factor suitable for mobile 375px viewport. |
| **CategoryPills** | Horizontal scroll pill navigation replacing previous sticky category nav. Active pill highlighted with accent color background. Smooth scroll-to-category on tap. |
| **Slim TrendingCarousel** | Wider horizontal cards with compact skeleton loader. Reduced vertical footprint vs previous carousel. |
| **Bottom Nav Regroup** | Profile and Call Waiter icons grouped on left side, cart/bill actions on right. Better visual hierarchy and spacing. |
| **i18n Keys** | ~30 new keys across EN/BG/RO for search placeholder, filter labels, dietary tags, allergen names, add-to-cart button (`publicMenu.search`, `publicMenu.filters.*`, `publicMenu.dietary.*`, `publicMenu.addShort`). |
| **Dead Code Cleanup** | Removed unused `LANG_LABELS` constant and `handleLanguageChange` function from `PublicMenuPage.tsx`. |
| **HomePage.tsx Fixes** | PR#3 findings resolved: 3 unused Lucide imports removed, 3 `as any` type casts fixed, `featureIcons` Record type tightened to `keyof featureKeys[number]`, non-standard Tailwind durations replaced. |
| **RestaurantContext Fix** | TS error on line 82 fixed: non-null assertion on `user.restaurantId` after guard check. |
| **CheckoutPage Toggle** | Sr-only checkbox hack replaced with `<Toggle>` component (Radix `role="switch"`, `aria-checked`, keyboard navigation). |
| **Code Review Fixes** | Typed translations (no `as any`), shared utils deduplication, Toggle component adoption, i18n gaps filled. |
| **Payments Investigation** | Confirmed NO code bug. `paymentsEnabled Boolean @default(false)` in schema means new restaurants default to off. Both affected restaurants enabled via DB update. |

### Post-Roadmap Additions (Shipped May 16, 2026)

| Feature | Details |
|---------|---------|
| **Menu Export** | `MenuImportExportView.tsx` — combined Import/Export dashboard tab with sub-tab navigation (Import / Export). Import sub-tab contains existing OCR JSON upload + preview + confirm flow. Export sub-tab offers three actions: Download JSON, Download CSV, Copy JSON to clipboard. Backend `GET /api/restaurants/:id/menu/export` endpoint already existed (JWT-guarded) — exports full menu with categories, items, options, translations. CSV export via `menuToCSV()` with BOM + European locale support. `exportMenu()` added to `api.ts` with lazy fetch (`enabled: false` on `useQuery`). Tab label changed from "Import" to "Import/Export" across EN/BG/RO locales. |

### V4 — Enterprise (Future)
- AWS RDS / GCP Cloud SQL migration
- ~~S3 / GCS for uploads~~ ✅ **(Done — Cloudflare R2 with CDN)**
- Redis for caching & message queues
- ~~CDN for static assets~~ ✅ **(R2 public CDN active + WebP compression)**
- POS integration (Square, Toast, Lightspeed)
- Inventory management & waste tracking
- SMS/Email marketing campaigns
- React Native staff app

---

## 5. Design System

### Color Palette (HSL-based, warm restaurant tones)

| Role | CSS Variable | Notes |
|------|-------------|-------|
| Accent | `--color-accent: hsl(0 72% 51%)` | Restaurant red |
| Background | Warm white / near-black | Light/dark adaptive |
| Text | High contrast | WCAG 4.5:1 minimum |
| Card | Subtle elevation | Glassmorphism panels |

### Typography

| Role | Font | Weight Range |
|------|------|-------------|
| Headings | Playfair Display | 400-700 |
| Body | Outfit | 300-700 |

### Style: Glassmorphism
- Backdrop blur: 10-20px
- Subtle border: `1px solid rgba(255,255,255,0.2)`
- Light reflection, Z-depth layering
- Card hover: translateY(-2px) + shadow increase (200ms transition)

### Spacing Scale
`--space-xs` (4px) → `--space-sm` (8px) → `--space-md` (16px) → `--space-lg` (24px) → `--space-xl` (32px) → `--space-2xl` (48px) → `--space-3xl` (64px)

### Mobile-First Patterns
- `viewport-fit=cover` + iOS PWA metas
- `pt-safe` / `pb-safe` utilities (`env(safe-area-inset-*)`)
- Bottom sheet cart on mobile (`fixed bottom-0 h-[88vh] rounded-t-[2.5rem]`), right drawer on desktop
- Mobile bottom nav on dashboard (6 items: Home/Orders/Requests/Tables/Settings/Stats)
- All tap targets >= 44px
- Public menu spacing tightened for 375px

### Anti-Patterns (Prohibited)
- Emojis as icons → use SVG (Lucide/Heroicons)
- Missing `cursor:pointer` on clickable elements
- Layout-shifting hovers (avoid scale transforms)
- Low contrast text (<4.5:1)
- Instant state changes → always transition (150-300ms)
- Invisible focus states
- Dark mode by default (per-restaurant `defaultTheme` controls initial state)

---

## 6. Authentication System

### Three Auth Methods

| Method | Flow | Use Case |
|--------|------|----------|
| Email/Password | `POST /api/auth/login` → JWT | Restaurant owners |
| Google OAuth 2.0 | `GET /api/auth/google` → callback → JWT | Quick sign-up |
| Email OTP | `POST /api/auth/otp/send` → `POST /api/auth/otp/verify` → JWT | Customers (no password) |

### JWT Strategy
- Payload: `{ email, sub: userId }`
- **Primary storage:** httpOnly cookie (`sameSite: 'none'` in production with `secure: true`, `sameSite: 'lax'` in dev, 1-day expiry)
- **Fallback:** `Authorization: Bearer` header (Axios interceptor) for transition period
- **CSRF protection:** Double-submit cookie pattern — `GET /api/auth/csrf-token` returns token; state-changing requests require `X-CSRF-Token` header
- **Dev proxy:** Frontend uses `/api/v1` baseURL (same-origin via Vite proxy). `sameSite: 'lax'` works because all requests are same-origin through the proxy.
- **Production:** Frontend on Vercel uses `VITE_API_URL` env (cross-origin to Cloud Run). `sameSite: 'none'` + `secure: true` cookies required. `COOKIE_SAMESITE` env-driven, defaults to `'none'` in production.
- Guard: `JwtAuthGuard` on protected endpoints
- Owner-only routes: ownership check via `checkRestaurantOwnership()` in service layer
- 401 auto-redirect with public path exclusions + `/auth/me` guard (prevents logout loop)

### Customer OTP Flow
1. Customer enters email + optional phone in `CustomerLoginModal`
2. Backend generates 6-digit code, bcrypt-hashes it, stores in `VerificationToken` (10-min TTL)
3. Resend API delivers code to email (dev mode: `devCode` in response + console.log)
4. Customer enters code (60s resend cooldown)
5. Backend verifies, returns JWT + user
6. Frontend stores JWT, shows welcome card for new users

---

## 7. Menu System — Deep Dive

### Category Management
- CRUD with drag-and-drop reordering (`order` field)
- Availability: ALWAYS / SCHEDULED (startTime, endTime, daysOfWeek) / HIDDEN
- Timezone-aware scheduling per restaurant
- Banner images (`imageUrl` on `MenuCategory`)
- Translations stored in JSON field (EN/BG/RO)

### Item Management
- Name, description, price (EUR/BGN), allergens (JSON array), dietary tags
- Image upload (S3, local fallback)
- Out-of-stock toggle (hides from public menu, preserves in dashboard)
- Related items (`relatedItemIds` string array) for Perfect Pairing feature
- Trending mode: AUTO (based on order frequency)

### Menu Options System

Two types:
- **VARIATION** — mutually exclusive, one must be selected (e.g., Small/Medium/Large, Rare/Medium/Well Done). First choice auto-selected in UI.
- **ADDON** — optional extras (e.g., Extra Cheese, Bacon). Default unselected.

```json
// Choices schema — CRITICAL: no id field, price is priceModifier
[{ "name": "Medium Well", "priceModifier": 0.00 }]
```

**Server-side price validation:** `OrdersService` validates every submitted choice against DB by matching `choiceName` (not ID). Client-side price is ignored — server recalculates from DB. This prevents price manipulation.

### Translation Architecture

Three paths:
1. **Fire-and-forget pre-warm** — after menu item/category/option create/update, background IIFE translates to all `targetLanguages`, writes to `translations` JSON field
2. **Owner "Translate All Now"** — `POST /api/restaurants/:id/translate-all`. Dashboard saves `targetLanguages` to DB first if local state differs from saved, then triggers translate-all.
3. **Lazy on-demand** — `GET /api/menu/public/:id?lang=<code>` checks DB cache per entity; on miss, translates → writes to DB → overlays on response

`lang` param validated against `restaurant.targetLanguages` — prevents unauthorized DeepL quota burn. Free-tier key detection: key ending in `:fx` → routes to `api-free.deepl.com`.

**Rate-limit & connection management:** `TranslationService` uses a shared `AxiosInstance` with `https.Agent({ keepAlive: true, maxSockets: 4 })` — prevents TLS listener accumulation (`MaxListenersExceededWarning`) from per-call connection creation. 250ms delay inserted between language iterations in `translateObject` — prevents DeepL 429 when translating to multiple languages back-to-back.

### Menu Check (Smart Audit)

`GET /menu/audit/:restaurantId` → scans for:
- Items without descriptions
- Missing images
- Empty categories
- €0 prices
- Missing translations

Severities: error / warning / info with color-coded icons. Dashboard widget with one-click fix navigation.

---

## 8. Ordering System

### Customer Flow
```
Scan QR → Public Menu → Browse → Add to Cart (with options)
→ Checkout (name, phone, special requests) → Submit Order
→ Order Confirmation (live status tracking)
→ Feedback (star rating → Google Review or private)
```

### Cart System
- `CartContext` with localStorage persistence
- Server-side price calculation on checkout
- Option price modifiers included in totals (`opt.priceModifier || 0`)
- Table context from QR URL (`?table=<name>`)
- Stale cart cleanup: `pruneInvalidItems()` on public menu load removes items from removed menu items
- 404 recovery: checkout detects stale submissions, shows backend error + "Clear cart and return to menu" path

### Order Status Workflow
```
NEW → IN_PROGRESS → SERVED → CANCELED
```

Staff manage via `OrdersView.tsx`. Real-time push notifications via Socket.io. Audio alert (`notification.mp3`) for new events.

### Upselling Flows
- **Perfect Pairing:** When item has `relatedItemIds`, clicking "Add to Cart" triggers a modal suggesting pairings (deterministic, not random)
- **Trending Carousel:** "Popular right now" section on public menu from AUTO trending mode
- **Drink Upsell:** Alcoholic pairings suggested with appropriate translations
- **Toast Confirmation:** Animated inline toast on menu card when item added

---

## 9. Loyalty Program

### Core Concepts
- **Points earned:** `floor(totalEuros × loyaltyExchangeRate × multiplier)`
- **Points redeemed:** Discount = `points / loyaltyRedeemRate` euros
- **Default cashback:** 6.7% (10 earn rate / 150 redeem rate)
- **Rate cap:** `@Max(100)` on `loyaltyExchangeRate` — SettingsView warns when cashback exceeds 15%

### VIP Tiers
Configurable per restaurant via `Restaurant` row:
- Thresholds and multipliers read from `tierConfigFromRestaurant()` — never hardcoded
- Customer profile shows tier colors from `acc.tier` (not hardcoded comparisons)

### FIFO Point Ledger
- Points expire oldest-first (`expireAccountPoints`)
- Redemption draws oldest non-expired batches first (`redeemAccountPoints`)
- Expiry reminder cron: midnight UTC, only for un-notified batches (`getExpiringPointBatches(onlyUnnotified: true)`)
- **Never use `Promise.all` over Prisma writes inside `$transaction`** — use `updateMany` instead

### Happy Hour
- Timezone-aware via Luxon + restaurant IANA `timezone` field
- Multiplier strategy: `Math.max(happyHourMultiplier, tierMultiplier)` — not additive

---

## 10. Realtime System (Socket.io)

### Architecture
- `EventsGateway` (NestJS WebSocket gateway) handles connections
- `SocketContext.tsx` on frontend manages connection lifecycle
- Restaurant rooms: `restaurant:<id>` for staff, `order:<id>` for customer order tracking

### Events
| Event | Direction | Purpose |
|-------|-----------|---------|
| `newOrder` | Server → Staff | New order notification |
| `orderStatusChanged` | Server → Customer | Order status updates |
| `newAssistanceRequest` | Server → Staff | "Call Waiter" alert |
| `assistanceResolved` | Server → Customer | Waiter response confirmation |
| `table:status-changed` | Server → Staff | Table session status changed (empty/waiting/occupied/paid) |
| `payment:confirmed` | Server → Staff | Payment succeeded — triggers notification bell + toast |

Analytics cache invalidation: `OrderContext` invalidates `['analytics']` TanStack Query on every incoming socket event. `LiveTablesView` invalidates `['tableStatuses']` on `table:status-changed` events.

---

## 11. Analytics System

### Metrics
- **Revenue trends:** Daily/weekly/monthly charts (timezone-aware via Luxon)
- **Top items:** Best-selling items with revenue contribution
- **Peak hours:** Heatmap in restaurant local time
- **Average order value (AOV):** Period tracking
- **Category breakdown:** Donut chart (revenue by category)
- **Table performance:** Bar chart (revenue/orders per table)
- **Period comparison:** 7/14/30 days

### Timezone Correctness
| Problem Fixed | Solution |
|---------------|----------|
| UTC day grouping for non-UTC restaurants | `DateTime.fromJSDate(date, { zone: tz }).toISODate()` |
| UTC hour bucketing | `DateTime.fromJSDate(date, { zone: tz }).hour` |
| UTC "today" for summary | `DateTime.now().setZone(tz).startOf('day').toJSDate()` |

### Export
- CSV export with European locale support (semicolon delimiters)
- UTF-8 BOM + `sep=;` metadata for Excel/Numbers compatibility
- All fields properly quoted for data integrity

### Data Freshness
- `staleTime: 0` in `useAnalytics.ts`
- Socket events trigger cache invalidation
- All charts use theme-aware colors via CSS variables, including dark mode

---

## 12. Branding & Theming

### Owner Controls (`BrandingEditor.tsx`)
- **Logo:** `ImageUploadInput` with preview thumbnail, JPEG/PNG validation, remove support. Backend: sharp pipeline (auto-rotate, resize 1200px, WebP, 400px thumbnail, parallel R2 upload). Toast success/error feedback on save.
- **Fonts:** Google Fonts picker — 16 curated fonts (Serif / Sans-Serif / Display) loaded dynamically
- **Colors:** 4-color scheme editor (`ColorSchemeEditor.tsx`)
  - Background, text, card, accent
  - WCAG contrast validator with ratio display (≥4.5:1 pass, ≥3.0:1 warning, below = fail)
- **Default theme:** Light/Dark pill toggle — sets `restaurant.defaultTheme`, customers see this on first visit

### Per-Restaurant Theme Scoping
- Public menu uses per-restaurant localStorage key: `theme-{restaurantId}`
- No stored preference → restaurant's `defaultTheme` → fallback `'light'`
- Dashboard `ThemeToggle` uses separate `'theme'` key
- ThemeToggle always visible on public menu (even when custom branding active)

### CSS Custom Properties
Branding applied to public menu via inline style injection:
```css
--color-background, --color-foreground, --color-card, --color-accent
--font-heading, --font-body
```

---

## 13. Mobile UX

### PWA-Ready
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

### Layout Split
- `AppLayout`: Header + container — for dashboard and auth pages
- `PublicLayout`: bare, no chrome — for all customer-facing routes (QR scan target)

### Key Mobile Adaptations
- **Cart:** Bottom sheet on mobile (`h-[88vh] rounded-t-[2.5rem]`), right drawer on desktop — CSS animation `cart-panel-enter` (media-query-driven, no JS)
- **Dashboard nav:** Desktop horizontal tabs → mobile `fixed bottom-0` bottom nav (6 items, active indicator bar, red badges, safe-area padding)
- **Public menu:** Hero `mb-10 md:mb-20`, category gaps `space-y-14 md:space-y-24`, grid `gap-5 md:gap-8`, all tap targets >= 44px
- **Checkout:** Panels `p-5 md:p-8`, safe-area bottom padding
- **Order confirmation:** Full premium redesign with live status card, action buttons, feedback CTA

### Safe Area Insets
```css
.pt-safe { padding-top: env(safe-area-inset-top); }
.pb-safe { padding-bottom: env(safe-area-inset-bottom); }
```

---

## 14. Accessibility

- All interactive elements have visible focus states
- `prefers-reduced-motion` respected (`.animate-float` disabled)
- Logo images have descriptive alt text (`${name} logo`)
- Language select has associated `<label>`
- Call Waiter notices use `role="alert"` / `aria-live="polite"`
- ThemeToggle has descriptive `aria-label` reflecting current action
- Loading states use `opacity-60` instead of `animate-pulse` (continuous motion violates a11y)
- Color contrast: minimum 4.5:1 for text (WCAG AA)

---

## 15. API Summary

| Prefix | Auth | Description |
|--------|------|-------------|
| `POST /api/auth/register` | Public | Email/password registration |
| `POST /api/auth/login` | Public | Email/password login → JWT |
| `GET /api/auth/google` | Public | Google OAuth initiation |
| `GET /api/auth/google/callback` | Public | OAuth callback |
| `POST /api/auth/otp/send` | Public | Send OTP code to email |
| `POST /api/auth/otp/verify` | Public | Verify OTP code → JWT |
| `GET /api/auth/me` | JWT | Current user profile |
| `CRUD /api/restaurants` | JWT (owner) | Restaurant management |
| `POST /api/restaurants/:id/translate-all` | JWT (owner) | Trigger full menu translation |
| `CRUD /api/restaurants/:id/tables` | JWT (owner) | Table management |
| `CRUD /api/menu/categories` | JWT (owner) | Category CRUD |
| `CRUD /api/menu/items` | JWT (owner) | Item CRUD |
| `CRUD /api/menu/options` | JWT (owner) | Option CRUD |
| `GET /api/menu/public/:id` | Public | Public menu (customer-facing) |
| `GET /api/menu/audit/:id` | JWT (owner) | Menu health audit |
| `POST /api/orders` | Public | Create order |
| `GET /api/orders` | JWT | List orders |
| `PATCH /api/orders/:id/status` | JWT | Update order status |
| `POST /api/assistance-requests` | Public | Call waiter |
| `GET /api/assistance-requests` | JWT | List assistance requests |
| `PATCH /api/assistance-requests/:id` | JWT | Resolve request |
| `GET /api/dashboard/summary` | JWT | Dashboard statistics |
| `GET /api/dashboard/analytics` | JWT | Analytics data |
| `POST /api/feedback` | Public | Submit feedback |
| `GET /api/loyalty/accounts/:id` | JWT | Loyalty account details |
| `POST /api/payment/sessions` | Public | Create/get table session (returns token) |
| `GET /api/payment/sessions/:token/bill` | Public | Get session bill (items, total, tip config) |
| `POST /api/payment/create-payment-intent` | Public | Create Stripe PaymentIntent |
| `POST /api/payment/webhook` | Public | Stripe webhook (signature verification) |
| `GET /api/payment/history/:restaurantId` | JWT | Payment history (paginated, filterable) |
| `GET /api/tables/status/:restaurantId` | JWT | All tables with real-time derived status |
| `POST /api/restaurants/:id/stripe/account-link` | JWT | Stripe Connect onboarding |
| `GET /api/restaurants/:id/stripe/status` | JWT | Connect account status |
| `POST /api/restaurants/:id/stripe/disconnect` | JWT | Revoke Connect access |
| `POST /api/restaurants/:id/menu/import` | API Key | OCR tool push — upsert menu from JSON |
| `POST /api/restaurants/:id/menu/import/confirm` | JWT | Dashboard confirm import |
| `GET /api/restaurants/:id/menu/import/api-key` | JWT | Get/create import API key (masked) |
| `POST /api/restaurants/:id/menu/import/api-key/regenerate` | JWT | Regenerate import API key |
| `GET /api/restaurants/:id/menu/export` | JWT | Export full menu as JSON (categories, items, options, translations) |
| `POST /api/payments/session/force-open` | JWT | Force-open table session (replaces existing OPEN session) |
| `POST /api/payments/session/:token/close-card` | JWT | Close session with MYPOS card payment |
| `GET /api/tables/:tableId/orders` | JWT | All orders for a table's active session |
| `GET /api/v1/subscription/status` | JWT | Current plan + feature list for restaurant |
| `POST /api/v1/subscription/checkout` | JWT | Create Stripe Checkout session for plan upgrade |
| `POST /api/v1/subscription/portal` | JWT | Create Stripe Customer Portal session |
| `POST /api/v1/subscription/webhook` | Public | Stripe subscription webhook (raw body, CSRF-exempt) |

Full interactive docs at `/api-docs` (Swagger UI).

---

## 16. Development Workflow

### Quick Start
```bash
npm install                    # Root — installs all workspaces
cd apps/backend
cp .env.example .env           # Set DATABASE_URL, JWT_SECRET, DEEPL_API_KEY, RESEND_API_KEY
npx prisma db push             # Sync schema to Neon
cd ../..
npm run dev                    # Starts both apps via Turborepo
```

### Access Points
| Service | URL |
|---------|-----|
| Frontend (Dashboard) | http://localhost:3001 |
| Backend API | http://localhost:3000/api |
| API Documentation | http://localhost:3000/api-docs |

### Vite Proxy Architecture (Dev Same-Origin, Prod Cross-Origin)

**Development:**
- `api.ts` uses `/api/v1` as baseURL (same-origin)
- `vite.config.js` proxies `/api` → backend (target from `.env` `VITE_API_URL`)
- `vite.config.js` proxies `/socket.io` → backend with WebSocket support
- `SocketContext` connects via `io()` with no URL (same-origin default)
- httpOnly cookies with `sameSite: 'lax'` work because all requests are same-origin through the proxy

**Production (Vercel → Cloud Run):**
- `api.ts` uses `VITE_API_URL` env directly (cross-origin: `vercel.app` → `run.app`)
- No Vite proxy available on static hosting
- `sameSite: 'none'` + `secure: true` required on all cookies (auth + CSRF)
- CORS backend allows all `.vercel.app` origins + `localhost` ports
- `COOKIE_SAMESITE` env-driven, defaults to `'none'` in production

**Why two modes:** httpOnly cookies with `sameSite: 'lax'` are blocked by browsers on cross-site AJAX. In dev, `localhost:3001` and `192.168.0.3:3000` are different sites — the Vite proxy fixes this. In production, Vercel and Cloud Run are different origins — `sameSite: 'none'` is required.

### Key Commands

**Root:**
```bash
npm run dev        # Turbo: runs both apps
npm run build      # Turbo: builds both apps
npm run lint       # Turbo: lints both apps
npm run format     # Prettier on all .ts/.tsx/.md
```

**Backend (`apps/backend`):**
```bash
npm run start:dev   # NestJS watch mode
npm test            # Jest unit tests
npm run test:e2e    # E2E tests (run test:prepare first)
npm run seed        # Seed demo data
npx prisma db push  # Push schema changes (preferred over migrate dev)
```

**Frontend (`apps/frontend`):**
```bash
npm run dev     # Vite --host (strictPort)
npm test        # Vitest with jsdom
npm run build   # Production build
```

---

## 17. Production Deployment

### Infrastructure

| Component | Platform | URL |
|-----------|----------|-----|
| **Frontend** | Vercel (Static) | `https://qr-digital-menu-ivory.vercel.app` |
| **Backend** | Google Cloud Run (Docker) | `https://qr-menu-backend-822584248302.europe-west1.run.app` |
| **Database** | Neon PostgreSQL | Serverless, auto-scaling |

### Cross-Origin Architecture

Frontend on Vercel (`vercel.app`) and backend on Cloud Run (`run.app`) are different origins. This requires:

1. **Cookies:** `sameSite: 'none'` + `secure: true` on auth (`token`) and CSRF (`csrf-token`) cookies. Default in production via `COOKIE_SAMESITE` env (override with `COOKIE_SAMESITE=lax` for same-origin deploys).
2. **CORS:** Backend allows all `.vercel.app` origins, `localhost:3001`, `localhost:3002`, `127.0.0.1:3001`, `127.0.0.1:3002`. `credentials: true` for cookie support.
3. **API base URL:** `api.ts` uses `VITE_API_URL` env directly in production (no Vite proxy on static hosts): `VITE_API_URL=https://qr-menu-backend-822584248302.europe-west1.run.app/api/v1`.
4. **SPA routing:** `vercel.json` rewrites all paths to `/index.html` for client-side routing.
5. **CSRF:** Cross-origin compatible — `csrf-token` cookie uses `sameSite: 'none'` so `X-CSRF-Token` header validation works. POST orders (public endpoint) now succeeds cross-origin.

### Auth Flow (Production)
1. User logs in → backend sets httpOnly `token` cookie with `sameSite: 'none'`, `secure: true`
2. Backend returns `{ user, token }` in response body
3. Frontend stores token in memory via `setAuthToken(token)` for Bearer fallback
4. Subsequent requests: cookie auto-attached via `withCredentials: true`, Bearer header as fallback
5. `/auth/me` verifies cookie on page refresh — no localStorage involved

## 18. Environment Variables

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | Backend | Neon PostgreSQL connection string (include `?sslmode=require`) |
| `JWT_SECRET` | Backend | JWT signing secret |
| `GOOGLE_CLIENT_ID` | Backend | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Backend | Google OAuth 2.0 client secret |
| `GOOGLE_CALLBACK_URL` | Backend | OAuth redirect URL |
| `DEEPL_API_KEY` | Backend | DeepL translation API key (platform-managed) |
| `RESEND_API_KEY` | Backend | Resend email API key (OTP delivery) |
| `RESEND_FROM_EMAIL` | Backend | Sender email for OTP |
| `FRONTEND_URL` | Backend | CORS origin (`http://localhost:3001`) |
| `R2_ACCOUNT_ID` | Backend | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | Backend | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Backend | R2 secret key |
| `R2_BUCKET_NAME` | Backend | R2 bucket name |
| `R2_PUBLIC_URL` | Backend | R2 CDN public base URL |
| `VITE_API_URL` | Frontend | Backend origin for Vite proxy target (`http://192.168.0.3:3000/api` or `http://localhost:3000/api`) — api.ts uses `/api` baseURL (same-origin), proxy forwards to this target |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Frontend | Stripe publishable key for Elements |
| `STRIPE_SECRET_KEY` | Backend | Stripe secret key for PaymentIntents |
| `STRIPE_WEBHOOK_SECRET` | Backend | Stripe webhook signing secret (Connect payments) |
| `STRIPE_CONNECT_CLIENT_ID` | Backend | Stripe Connect platform client ID |
| `STRIPE_PRICE_STARTER` | Backend | Stripe price ID for Starter plan |
| `STRIPE_PRICE_PROFESSIONAL` | Backend | Stripe price ID for Professional plan |
| `STRIPE_PRICE_ENTERPRISE` | Backend | Stripe price ID for Enterprise plan |
| `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` | Backend | Stripe webhook secret for subscription events |

---

## 19. Key Architectural Decisions

1. **Server-side pricing** — Order total recalculated from DB on checkout. Client-side price is ignored. Prevents price manipulation.
2. **Platform-managed translation** — Restaurant owners never supply API keys. Platform holds single DeepL key. `restaurant.deeplApiKey` column deprecated at DB level.
3. **Per-restaurant theme isolation** — Each venue's theme preference stored independently (`theme-{restaurantId}`) vs single global key.
4. **Lazy translation with DB caching** — First request per language translates and persists to `translations` JSON field. Subsequent requests hit DB cache.
5. **BG as i18n fallback** — Bulgarian is default language (`fallbackLng: 'bg'`) since target market is primarily Bulgarian restaurants.
6. **Layout split for mobile UX** — Customer routes use `PublicLayout` (no header chrome), dashboard routes use `AppLayout`. Enables native-feel experience on customer side.
7. **FIFO loyalty ledger** — Points managed as batches with expiry. Redemption draws oldest first. Never parallel writes inside `$transaction`.
8. **Turborepo over Docker for dev** — Native dev server startup in ~5 seconds vs 2-5 minutes. Docker Compose kept for production simulation only.
9. **BNB fixed exchange rate** — All dual-currency displays use Bulgarian National Bank fixed rate 1 EUR = 1.95583 BGN. Single source of truth in `currency.ts` utility, never duplicated across components.
10. **SaaS tiering at the service layer, not routes** — `FeatureGuard` uses `@RequireFeature` decorator on controller methods. Public endpoints (orders, assistance) must add service-level tier checks via `FeatureService.hasFeature(tier, flag)` since guards require JWT. Frontend `useFeature` hook is UI-only; server is the authoritative gating boundary.

---

## 20. Known Technical Debt & Constraints

| Item | Severity | Notes |
|------|----------|-------|
| ~~JWT in localStorage~~ | ~~Medium~~ | ✅ Fixed May 10, 2026 — migrated to httpOnly cookies with `sameSite: 'lax'`, Bearer header fallback |
| ~~No CSRF protection~~ | ~~Medium~~ | ✅ Fixed May 10, 2026 — double-submit cookie pattern, `X-CSRF-Token` header on all state-changing requests |
| ~~No pagination on list endpoints~~ | ~~Medium~~ | ✅ Fixed May 10, 2026 — orders, feedback, assistance-requests paginated (50/page, max 100) |
| ~~No CSP headers~~ | ~~Medium~~ | ✅ Fixed May 10, 2026 — Helmet CSP with `default-src 'self'`, Stripe frame-src, Tailwind style-src |
| ~~No per-endpoint rate limits~~ | ~~Medium~~ | ✅ Fixed May 10, 2026 — OTP: 10/min, login: 5/min, public menu: 60/min, health: skip |
| Minimal test coverage | Medium | Only basic unit/E2E tests. No service-level tests for orders, loyalty, menu |
| ~~Relaxed TS strictness (backend)~~ | ~~Low~~ | ✅ Fixed May 15, 2026 — `strictNullChecks: true`, `noImplicitAny: true` enabled in `apps/backend/tsconfig.json` |
| `any` types in frontend contexts | Low | `CartContext.selectedOptions: any[]`, etc. |

---

## 21. File Index — Key Locations

| What | Where |
|------|-------|
| **App routing** | `apps/frontend/src/App.tsx` |
| **API client** | `apps/frontend/src/lib/api.ts` |
| **Design tokens / CSS** | `apps/frontend/src/index.css` |
| **Currency utility** | `apps/frontend/src/lib/currency.ts` |
| **i18n config** | `apps/frontend/src/i18n.ts` |
| **Locale files** | `apps/frontend/src/locales/*/translation.json` |
| **Database schema** | `apps/backend/prisma/schema.prisma` |
| **Seed data** | `apps/backend/prisma/seed.ts` |
| **Backend module registry** | `apps/backend/src/app.module.ts` |
| **Auth logic** | `apps/backend/src/auth/auth.service.ts` |
| **Menu business logic** | `apps/backend/src/menu/menu.service.ts` |
| **Order validation** | `apps/backend/src/orders/orders.service.ts` |
| **Analytics** | `apps/backend/src/dashboard/dashboard.service.ts` |
| **Loyalty logic** | `apps/backend/src/loyalty/loyalty.service.ts` |
| **Translation service** | `apps/backend/src/translation/translation.service.ts` |
| **Payment service** | `apps/backend/src/payment/payment.service.ts` |
| **Stripe provider** | `apps/backend/src/payment/stripe.provider.ts` |
| **Payment provider interface** | `apps/backend/src/payment/payment-provider.interface.ts` |
| **Socket gateway** | `apps/backend/src/events/events.gateway.ts` |
| **Table status logic** | `apps/backend/src/tables/tables.service.ts` |
| **Tier config** | `apps/backend/src/loyalty/loyalty-tiers.utils.ts` |
| **FIFO ledger** | `apps/backend/src/loyalty/loyalty-ledger.utils.ts` |
| **DTO validation** | `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` |
| **Type definitions** | `apps/frontend/src/types/index.ts` |
| **Subscription module** | `apps/backend/src/subscription/` (feature.service.ts, feature.guard.ts, feature-flag.enum.ts, require-feature.decorator.ts, subscription.service.ts, subscription.controller.ts) |
| **useFeature hook** | `apps/frontend/src/hooks/useFeature.ts` |
| **Billing view** | `apps/frontend/src/pages/Dashboard/BillingView.tsx` |
| **Pricing page** | `apps/frontend/src/pages/PricingPage.tsx` |
| **Subscription banner** | `apps/frontend/src/components/SubscriptionBanner.tsx` |
| **Payment UI** | `apps/frontend/src/components/payment/PaymentModal.tsx` |
| **Live table grid** | `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` |
| **Table status card** | `apps/frontend/src/components/tables/TableCard.tsx` |
| **Table detail modal** | `apps/frontend/src/components/tables/TableDetailModal.tsx` |
| **Notification bell** | `apps/frontend/src/components/NotificationBell.tsx` |
| **Payment toast** | `apps/frontend/src/components/PaymentToast.tsx` |
| **Payment history view** | `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` |
| **Menu import/export view** | `apps/frontend/src/pages/Dashboard/MenuImportExportView.tsx` |
| **POS context** | `apps/frontend/src/context/PosContext.tsx` |
| **POS page + layout** | `apps/frontend/src/pages/pos/PosPage.tsx`, `PosLayout.tsx` |
| **POS components** | `apps/frontend/src/components/pos/` (12 components) |
| **Staff auth guard** | `apps/frontend/src/components/StaffRoute.tsx` |
| **Public menu TopBar** | `apps/frontend/src/pages/TopBar.tsx` |
| **Public menu FilterPanel** | `apps/frontend/src/pages/FilterPanel.tsx` |
| **Category pills** | `apps/frontend/src/pages/CategoryPills.tsx` |
| **Planning docs** | `.planning/` |
| **Design system** | `.agent/design-system/qr-menu-saas/MASTER.md` |
| **Coding roadmap** | `CODING_ROADMAP.md` |

---

## 22. Tier Enforcement Sweep Round 2 (May 17, 2026)

Closes all remaining gaps between `TIER_FEATURES` definitions and actual enforcement. Every flag in `FeatureService` is now honored at both controller-decorator level (backend) and UI-render level (frontend).

### Backend Changes

| File | Change |
|------|--------|
| `feature.service.ts` | `getAllowedStaffRoles(tier)` — FREE/STARTER → `[]`, PRO → `['MANAGER']`, ENT → all roles |
| `dashboard.controller.ts` | `GET /summary` gated `ANALYTICS_BASIC`; `GET /analytics` gated `ANALYTICS_FULL` |
| `payment.controller.ts` | 6 authenticated routes gated `PAYMENTS_STRIPE` |
| `restaurants.controller.ts` | 3 Stripe Connect routes gated `PAYMENTS_STRIPE` |
| `users.service.ts` | Role-tier matrix via `getAllowedStaffRoles`; `getStaffLimit` replaces inline switch |
| `menu-crud.service.ts` | DAYPARTING: strip schedule fields on write for non-PRO; treat SCHEDULED as ALWAYS in `filterByAvailability`. UPSELLING: return `[]` from `getTrendingItems`; strip pairings from `getPublicMenuMeta` |

### Frontend Changes

| File | Change |
|------|--------|
| `AnalyticsView.tsx` | Advanced charts (Top Items, Peak Hours, Category, Tables, Feedback) gated `analytics:full`; upgrade card shown to STARTER- |
| `PublicMenuPage.tsx` | `TrendingCarousel` + pairings gated `upselling`; `CustomerLoginModal` + sign-in gated `customers:auth`; `PaymentModal` gated `payments:stripe` |
| `CheckoutPage.tsx` | `CustomerLoginModal` gated `customers:auth` |
| `CategorySettingsModal.tsx` | Schedule UI gated `dayparting`; downgrade badge for stale SCHEDULED categories |
| `PosPage.tsx` | Early-return upgrade redirect if tier lacks `pos` flag |
| `KitchenPage.tsx` | Early-return upgrade redirect if tier lacks `kds` flag |
| `SettingsView.tsx` (staff tab) | Role dropdown filtered by `canRbac`/`canPos`/`canKds`; staff count display; locked card on FREE/STARTER |

### i18n (EN/BG/RO)

11 new keys: `tierLocked.upgrade`, `tierLocked.analyticsTitle`, `tierLocked.analyticsDesc`, `tierLocked.kds`, `tierLocked.pos`, `tierLocked.dayparting`, `tierLocked.customers`, `tierLocked.upselling`, `staff.staffCount`, `staff.noRolesAvailable`, `staff.noRolesDesc`

### Test Count: 454 passing (up from 122)
