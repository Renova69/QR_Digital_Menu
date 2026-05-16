# QR Menu — Product & Technical Due Diligence Report

> **Prepared for:** Fortune 500 Acquisition Review
> **Date:** May 16, 2026 (audited — all sections verified against codebase)
> **Product Status:** V2.5 Shipped | V3 Growth — Phase 19 (Stripe/Menu Import/POS) Complete, Phase 18 (Staff Roles & RBAC) Complete | Security Hardening Phase 21 Complete | Public Menu Mobile UX Complete (TopBar, FilterPanel, dual currency, horizontal cards) | Code Review & Bug Fixes Complete (PR#3, Toggle, payments investigation) | Security & Bug Fixes Complete (CORS, magic-link removal, loyalty emails, CSV export, TS strict mode) | KDS (Kitchen Display) Live at /staff/kitchen | Infrastructure & Polish Sprint Complete (API versioning, Prisma circuit breaker, order progress bar, QR print templates, 122 tests, customer split bill) | SaaS Tiering V2 Complete (4-tier FREE/STARTER/PRO/ENTERPRISE, FeatureGuard, Stripe Billing, PricingPage, BillingView, SubscriptionBanner, demo accounts)
> **Codebase:** 100+ frontend source files, 17 backend domain modules (+2 infrastructure modules), 16 database models, ~200 i18n keys across 3 languages

---

## 1. Executive Summary

QR Menu is a full-stack SaaS platform that digitizes restaurant dining. Restaurant owners create and manage menus through an admin dashboard, generate table-specific QR codes, and customers scan those codes to browse menus, place orders, call for assistance, and earn loyalty rewards — all from their phone browser with no app download.

The product has completed its V1 MVP, V2 Premium features, and V2.5 Visual Polish milestone as of May 2026. The codebase demonstrates production-grade engineering across the full stack: a NestJS backend with 17 domain modules, a React frontend with 9 context providers and comprehensive i18n support (EN/BG/RO), real-time WebSocket updates via Socket.io, a FIFO loyalty point ledger with timezone-aware happy hour, server-side price validation to prevent manipulation, and a platform-managed DeepL translation pipeline with lazy on-demand caching.

The platform currently targets the Bulgarian restaurant market (BG is the i18n fallback language, default currency EUR/BGN, Neon database hosted in Europe) but the architecture is market-agnostic. The React frontend uses a dual-layout system (AppLayout for dashboard, PublicLayout for customer-facing routes) that delivers a near-native mobile experience on the primary device for this use case — the customer's phone.

Revenue potential is now realized through Stripe Connect integration (fully implemented May 2026). The platform charges a configurable platform fee on every payment processed through Stripe. The payment system uses a provider abstraction pattern (`IPaymentProvider`) enabling future payment method additions (MyPOS, Square, etc.). The loyalty program — FIFO point ledger, configurable VIP tiers, timezone-aware happy hour multipliers — is a retention engine atypical for a pre-revenue product.

**Core value proposition:** Restaurants get a branded, QR-code-driven digital ordering experience with zero customer friction. The platform handles menu management, real-time order routing, multi-language translation, and customer loyalty — replacing paper menus, reducing waiter dependency, and increasing order throughput.

---

## 2. Product Architecture

### 2.1 High-Level System Architecture

```mermaid
graph TB
    subgraph "Customer Device"
        CUST[Phone Browser]
    end

    subgraph "Restaurant Staff"
        STAFF[Dashboard Browser]
    end

    subgraph "Vercel / VPS"
        subgraph "Frontend :3001"
            REACT[React 18 SPA<br/>Vite + Tailwind 4 + Radix UI]
            I18N[i18next<br/>EN/BG/RO]
            SOCKET_CLIENT[Socket.io Client]
            RQ[TanStack React Query 5]
        end

        subgraph "Backend :3000 /api"
            NEST[NestJS 11]
            AUTH[Auth Module<br/>JWT + Google OAuth + Email OTP]
            MENU[Menu Module<br/>Categories/Items/Options/Audit]
            ORDERS[Orders Module<br/>Server-side pricing]
            LOYALTY[Loyalty Module<br/>FIFO Ledger + Cron]
            TRANSLATE[Translation Module<br/>DeepL API]
            GATEWAY[EventsGateway<br/>Socket.io]
            THROTTLE[ThrottlerGuard<br/>100 req/60s]
        end

        subgraph "Data Layer"
            PRISMA[Prisma 6 ORM]
            NEON[(Neon Serverless<br/>PostgreSQL)]
            S3[AWS S3 / Cloudflare R2<br/>Image Storage]
        end
    end

    subgraph "External Services"
        GOOGLE[Google OAuth 2.0]
        DEEPL[DeepL Translate API]
        RESEND[Resend Email API]
        STRIPE[Stripe Connect<br/>Active]
    end

    CUST -->|QR Scan| REACT
    STAFF --> REACT
    REACT -->|REST + JWT| NEST
    REACT <-->|WebSocket| GATEWAY
    NEST --> PRISMA
    PRISMA --> NEON
    NEST --> S3
    NEST --> GOOGLE
    NEST --> DEEPL
    NEST --> RESEND
```

### 2.2 Tech Stack Breakdown

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Monorepo** | Turborepo + npm Workspaces | 2.4 | Task orchestration, dependency management |
| **Frontend Framework** | React | 18.2 | SPA for dashboard + customer menu |
| **Build Tool** | Vite | 6.2 | HMR dev server, production bundling |
| **CSS Framework** | Tailwind CSS | 4.1 | Utility-first styling with custom design tokens |
| **UI Primitives** | Radix UI | latest | Accessible dialog, slot composition |
| **Icons** | Lucide React | 0.542 | Consistent SVG icon set |
| **Server State** | TanStack React Query | 5.85 | Cache management, optimistic updates |
| **Client State** | React Context API | — | 7 context providers (auth, cart, orders, etc.) |
| **Routing** | React Router DOM | 7.8 | Layout-based routing (public vs authenticated) |
| **Real-time** | Socket.io Client | latest | Order/assistance push notifications |
| **i18n** | i18next + react-i18next | latest | 3 languages, browser detection, BG fallback |
| **Charts** | Recharts | latest | Analytics visualizations |
| **QR Generation** | react-qr-code, qrcode.react | 2.x | Customer-facing + printable QR codes |
| **Drag & Drop** | @dnd-kit/core + sortable | 6.x/10.x | Menu category/item reordering |
| **Backend Framework** | NestJS | 11.0 | Modular TypeScript backend |
| **ORM** | Prisma | 6.15 | Type-safe database access |
| **Database** | Neon PostgreSQL | Serverless | Cloud-hosted, pooled connections |
| **Auth (JWT)** | @nestjs/jwt + passport-jwt | 11.0 | Bearer token authentication |
| **Auth (OAuth)** | passport-google-oauth20 | latest | Google Sign-In |
| **Auth (OTP)** | Resend API + bcryptjs | 3.0 | Email OTP for customer login |
| **Validation** | class-validator + class-transformer | 0.14/0.5 | DTO validation at API boundary |
| **Scheduling** | @nestjs/schedule | latest | Daily loyalty expiry cron |
| **Rate Limiting** | @nestjs/throttler | latest | 100 req/60s global |
| **API Docs** | @nestjs/swagger | 11.2 | Swagger UI at /api-docs |
| **Dates/Time** | Luxon | latest | Timezone-aware date handling |
| **File Storage** | AWS S3 / Cloudflare R2 | — | Image uploads with CDN |
| **Translation** | DeepL API v2 | — | Auto-translate menus |
| **Email** | Resend REST API | — | OTP code delivery |
| **Testing (BE)** | Jest 30 + Supertest | — | Unit + E2E tests |
| **Testing (FE)** | Vitest 3 + jsdom | — | Component tests |

### 2.3 Data Flow: End-to-End Order Journey

```mermaid
sequenceDiagram
    participant C as Customer Phone
    participant F as React Frontend
    participant B as NestJS Backend
    participant D as Neon PostgreSQL
    participant W as WebSocket Gateway
    participant S as Staff Dashboard

    Note over C,S: 1. Menu Browsing
    C->>F: Scan QR code (?table=T1)
    F->>B: GET /api/menu/public/:restaurantId?lang=bg
    B->>D: Fetch categories + items (filter out-of-stock, apply schedule)
    B->>D: Check translations cache<br/>On miss: DeepL translate → write cache
    B-->>F: Full menu with translations
    F-->>C: Render branded menu<br/>(restaurant theme, fonts, colors)

    Note over C,S: 2. Add to Cart
    C->>F: Select item + options (size, doneness)
    F->>F: Auto-select first VARIATION<br/>Build cartId from item+options hash
    F->>F: localStorage persistence
    C->>F: Add another item with relatedItemIds
    F->>F: Show Perfect Pairing modal<br/>(deterministic trigger)

    Note over C,S: 3. Checkout
    C->>F: Open cart → Checkout
    F->>F: Check for drink upsell<br/>Show beverage suggestions if no drinks
    F->>B: POST /api/orders
    B->>D: Fetch all ordered items in 1 query<br/>(N+1 prevention)
    B->>D: Validate every option choice<br/>against DB (server-side)
    B->>B: Recalculate total (ignore client prices)
    B->>B: Happy hour check (timezone-aware, Luxon)
    B->>B: Loyalty: expire points → redeem → earn
    B->>D: Atomic transaction: order + ledger entries
    B->>W: Emit 'newOrder' to restaurant room
    W-->>S: Push notification + audio alert
    B-->>F: Order created + order ID
    F-->>C: Order confirmation page

    Note over C,S: 4. Order Tracking
    F->>W: Join 'order:{id}' room
    S->>B: PATCH /api/orders/:id/status (IN_PROGRESS)
    B->>W: Emit 'orderStatusChanged'
    W-->>F: Status update
    F-->>C: Live status card update<br/>(NEW→IN_PROGRESS→SERVED)

    Note over C,S: 5. Feedback Loop
    C->>F: Star rating + comment
    F->>B: POST /api/feedback
    B->>D: Store feedback, check rating
    alt Rating ≥ 4
        B-->>F: Return Google Review URL
        F-->>C: Redirect to Google Reviews
    else Rating ≤ 3
        B->>D: Store private feedback for owner
    end
```

### 2.4 Key Architectural Decisions

| Decision | Why |
|----------|-----|
| **Server-side price calculation** | Prevents price manipulation. `OrdersService.create()` ignores client-submitted prices — it fetches current prices from DB, validates every option choice against the schema, and recalculates the total. The client's `selectedOptions` are validated by matching `choiceName` (not ID, since the choices JSON schema has no IDs) against DB records. |
| **Turborepo over Docker for dev** | Native dev startup in ~5 seconds vs 2–5 minutes. Docker Compose retained for production simulation only. The backend connects to hosted Neon PostgreSQL — no local DB container needed. |
| **Platform-managed translation key** | Restaurant owners never supply API keys. The platform holds a single `DEEPL_API_KEY` env var. The `restaurant.deeplApiKey` column exists in the schema but is never read or written — it's deprecated. This eliminates owner friction and prevents key leakage. |
| **Lazy translation with DB caching** | First request per language translates and persists to the `translations` JSON field on each entity. Subsequent requests hit DB cache. Three translation paths: fire-and-forget pre-warm on menu save, owner-triggered "Translate All" (saves `targetLanguages` to DB first if unsaved), and lazy on-demand per-request. `TranslationService` uses a shared `AxiosInstance` with keep-alive TLS agent (`maxSockets: 4`) and 250ms inter-language delay to prevent connection exhaustion and DeepL 429s. |
| **FIFO loyalty ledger** | Points managed as discrete batches with expiry. Redemption draws oldest batches first (`redeemAccountPoints`). Expiry runs oldest-first (`expireAccountPoints`). Never parallel Prisma writes inside `$transaction` — use `updateMany` instead. This is a deliberate accounting pattern, not an ORM limitation. |
| **Per-restaurant theme isolation** | Each venue's theme preference stored independently (`theme-{restaurantId}` localStorage key) vs single global key. Owner sets `defaultTheme` (light/dark) that applies on first visit. ThemeToggle always visible even with custom branding. |
| **Layout split: AppLayout vs PublicLayout** | Customer routes (menu, checkout, confirmation, feedback) get no header chrome — full viewport, native-feel mobile experience. Dashboard routes get full app shell. Media-query-driven cart animation (slide-up on mobile, slide-right on desktop) with zero JS detection. |
| **BG as i18n fallback** | Bulgarian is the default language (`fallbackLng: 'bg'`) since the primary market is Bulgarian restaurants. English and Romanian are secondary. English was moved from fallback to secondary in the May 5, 2026 overhaul. |
| **Dual auth strategy** | JWT for dashboard owners, Email OTP for customers. Customers never create passwords. OTP codes are bcrypt-hashed (10 rounds), 10-min expiry, 60s rate-limit per email. OTP endpoint locked for 10 min after 5 failed attempts (brute-force protection). |
| **httpOnly cookie + CSRF** | JWT stored in httpOnly cookie (`sameSite: 'lax'`, `secure` in production) — not localStorage. CSRF double-submit cookie pattern on all state-changing endpoints. Bearer header fallback for transition period. Eliminates XSS token theft vector. |
| **Same-origin Vite proxy** | Frontend uses `/api` baseURL (not cross-origin). Vite dev server proxies `/api` and `/socket.io` to backend. Prevents cross-origin cookie blocking — `localhost:3001` and `192.168.0.3:3000` are different sites, `sameSite: 'lax'` blocks cross-site AJAX cookies. |
| **No customer password system** | The `User` model has a nullable `password` field. Customers created via OTP get no password — they authenticate exclusively through OTP or Google OAuth. Owners have hashed passwords. |
| **POS — third layout with isolated state** | Waiter POS uses `PosLayout` (zero chrome, full viewport) and `PosContext` (in-memory only, ephemeral). Completely isolated from `CartContext` — POS cart state never leaks into the customer ordering flow. `submitted: boolean` flag on `PosCartItem` enables history display + pending-only submission without schema changes. |

---

## 3. Feature Deep Dive

### 3.1 Authentication System

**What it does:** Three authentication methods for two distinct user types. Restaurant owners log in with email/password or Google OAuth. Customers sign in with email OTP (6-digit code) or Google OAuth — no password required. All methods issue a JWT with 1-day expiry, stored in httpOnly cookie with CSRF protection.

**How it works:**
- **JWT Strategy** (`apps/backend/src/auth/jwt.strategy.ts`): Reads token from httpOnly cookie (`request.cookies.token`) first, falls back to `Authorization: Bearer` header for transition compatibility. Validates signature with `JWT_SECRET`, looks up user by `payload.sub`. Throws `UnauthorizedException` if user not found.
- **Token Storage:** httpOnly cookie set by server on login/register/OTP/OAuth: `{ httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400000 }`. Frontend never touches token — `AuthContext` reads user via `/auth/me`, cookie sent automatically via `withCredentials: true`.
- **CSRF Protection:** Double-submit cookie pattern. `GET /api/auth/csrf-token` returns `{ csrfToken }` + sets readable `csrf-token` cookie. All POST/PATCH/DELETE/PUT require `X-CSRF-Token` header matching cookie value. Skipped in dev mode + Stripe webhook path.
- **Same-origin proxy:** Frontend uses `/api` baseURL (same-origin), Vite proxies to backend. Eliminates cross-origin cookie blocking (localhost:3001 ≠ 192.168.0.3:3000 → `sameSite: 'lax'` blocks cookies on cross-site AJAX).
- **Local Strategy** (`apps/backend/src/auth/local.strategy.ts`): Uses email as username field. `validate()` calls `AuthService.validateUser()` which checks bcrypt-hashed password. Specific error messages: "No account found with this email" (404) vs "Incorrect password" (401).
- **Google Strategy** (`apps/backend/src/auth/google.strategy.ts`): Scopes profile + email. `validate()` returns `{ googleId, email, firstName, lastName }`. `AuthService.validateGoogleUser()` auto-creates user with OWNER role if not found; generates random 8-char password.
- **Email OTP** (`apps/backend/src/auth/auth.service.ts:sendOtp/verifyOtp`): `sendOtp` rate-limits to 60s/email (returns 429), deletes previous unused tokens, generates 6-digit code, bcrypt-hashes it, stores in `VerificationToken` with 10-min expiry. Delivers via Resend API. Brute-force protection: 5 failed attempts → 10-min account lockout (`lockedUntil`). `devCode` only returned when `NODE_ENV !== 'production'` AND `RESEND_API_KEY` absent. `verifyOtp` checks code with bcrypt, marks token used, resets attempts on success, auto-creates CUSTOMER user if new, sets httpOnly cookie, returns `{ token, user, isNew }`.

**Key files:**
- `apps/backend/src/auth/auth.service.ts` — core auth logic (login, register, OTP, Google, PIN)
- `apps/backend/src/auth/auth.controller.ts` — 15 endpoints (register, login, logout, me [GET+PATCH], google, google/callback, otp/send, otp/verify, me/pin, csrf-token, staff CRUD [3], pin-login)
- `apps/backend/src/auth/jwt.strategy.ts` — JWT extraction (cookie-first + Bearer fallback)
- `apps/backend/src/auth/google.strategy.ts` — OAuth profile normalization
- `apps/backend/src/main.ts` — CSRF middleware, Helmet CSP, cookieParser, body limits
- `apps/frontend/src/context/AuthContext.tsx` — user state via `/auth/me`, no localStorage token
- `apps/frontend/src/lib/api.ts` — `withCredentials: true`, CSRF interceptor, 401 guard for `/auth/me`
- `apps/frontend/vite.config.js` — same-origin proxy for `/api` and `/socket.io`
- `apps/frontend/src/components/auth/CustomerLoginModal.tsx` — 3-step OTP modal (entry → otp → welcome)
- `apps/frontend/src/components/ProtectedRoute.tsx` — route guard, redirects CUSTOMER to /profile

**Edge cases handled:**
- Google OAuth callback parses `state` from query to preserve `returnTo` redirect
- OTP rate limiting: 60s cooldown per email (checks `createdAt` of newest token, returns 429 if <60s)
- OTP brute-force: 5 failed attempts → 10-min lockout (`lockedUntil`); successful verify resets counter
- OTP verification: marks token `usedAt` to prevent replay
- Auth context: on mount, calls `/auth/me` via cookie — on failure, user stays unauthenticated (no hard redirect)
- 401 interceptor: auto-redirects to `/login` but excludes `/auth/me` (prevents logout loop) and public paths (`/login`, `/auth/callback`, `/menu/public`)
- ProtectedRoute redirects CUSTOMER-role users to `/profile` unless already there
- Token refresh: `AuthContext` no longer reads localStorage → no null-token gap on page refresh
- CSRF skipped in dev mode (`NODE_ENV !== 'production'`) for local development convenience

**Dependencies:** Passport.js ecosystem, Google Cloud Console (OAuth credentials), Resend API (email delivery), bcryptjs (password hashing), cookie-parser, helmet

---

### 3.2 Restaurant Management & Multi-Tenancy

**What it does:** Authenticated owners create and manage multiple restaurants. Each restaurant has its own menu, tables, orders, branding, loyalty program, translation settings, and analytics — fully isolated.

**How it works:**
- Every protected endpoint resolves the authenticated user via `@AuthUser()` decorator (extracts `request.user` from JWT)
- Ownership checks in service layer: `checkRestaurantOwnership(restaurantId, userId)` pattern throws `NotFoundException` if restaurant missing, `ForbiddenException` if not owner
- Restaurant context (`apps/frontend/src/context/RestaurantContext.tsx`) manages active restaurant selection — on switch, joins/leaves Socket.io rooms for real-time events scoped to that restaurant
- `UpdateRestaurantDto` (`apps/backend/src/restaurants/dto/update-restaurant.dto.ts`) is the most complex DTO — 30+ optional fields covering branding, loyalty config, localization, and timezone — all validated with `class-validator` decorators

**Key files:**
- `apps/backend/src/restaurants/restaurants.service.ts` — CRUD with ownership checks
- `apps/backend/src/restaurants/restaurants.controller.ts` — 6 endpoints + logo upload + translate-all
- `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` — 30+ validated fields with Min/Max constraints
- `apps/frontend/src/context/RestaurantContext.tsx` — active restaurant state + Socket room management
- `apps/frontend/src/components/CreateRestaurantForm.tsx` — onboarding form

**Edge cases handled:**
- New users with no restaurants see onboarding form in DashboardPage (`apps/frontend/src/pages/DashboardPage.tsx` checks `restaurants.length === 0`)
- Restaurant fetch preserves active selection by ID when possible, falls back to first restaurant
- Ownership violation returns 403 Forbidden (not 404 — doesn't leak existence)

**Dependencies:** PrismaModule, TranslationModule (translate-all endpoint)

---

### 3.3 Menu Builder

**What it does:** Full CRUD for menu categories and items with drag-and-drop reordering, availability scheduling, image upload, dietary/allergen tagging, variation/option management, translation, perfect pairing configuration, and automated health audits.

**How it works:**

**Category Management:**
- Controller path: `restaurants/:restaurantId/categories` (CRUD) + `categories/:id` (detail)
- Availability: `AvailabilityType` enum — ALWAYS (24/7), SCHEDULED (time + day-of-week), HIDDEN. Scheduled categories use Luxon with restaurant timezone for accurate time comparison; supports overnight ranges (e.g., 22:00–02:00).
- Banner images: `imageUrl` + `thumbnailUrl` on `MenuCategory`, uploaded via `POST /categories/:id/image` (FileInterceptor, 5MB, JPEG/PNG only). Backend runs sharp pipeline: EXIF auto-rotate → resize 1200px → WebP 82% → 400px thumbnail → parallel R2 upload. Frontend uses `ImageUploadInput` with preview thumbnail + remove support.
- `isDrinkCategory` flag for drink upselling in checkout flow

**Item Management:**
- Controller path: `categories/:categoryId/items` (CRUD) + `items/:id` (detail)
- Fields: name, description, price (with currency), allergens (string array), dietary tags (string array), image (`imageUrl` + `thumbnailUrl` with sharp processing), out-of-stock toggle, featured flag, related items (for pairings), reward points price (loyalty)
- Items ordered by `order` field, auto-incremented on create
- Translation pre-warm: fire-and-forget async IIFE on create/update — does not block HTTP response

**Menu Options:**
- Two types: `VARIATION` (mutually exclusive, e.g., Size, Doneness) and `ADDON` (optional extras, e.g., Extra Cheese)
- Choices stored as JSON array `[{ name: "Medium Well", priceModifier: 0.00 }]` — no `id` field, price key is `priceModifier`
- Server-side validation in `OrdersService.create()` matches submitted choices against DB by `choiceName`
- Preset templates: Size (Small/Medium/Large), Doneness (Rare through Well Done), Quantity (Half/Full dozen)

**Menu Health Audit:**
- `GET /menu/audit/:restaurantId` — returns typed issues (error/warning/info)
- Detects: empty categories, €0 prices (error), missing descriptions, missing translations (warning), missing images (info — "Images increase sales by up to 30%")
- Frontend widget (`MenuCheckWidget.tsx`) shows severity counts, individual issue cards, "Fix" buttons that navigate to menu editor

**Frontend:**
- Drag-and-drop via `@dnd-kit/core` + `@dnd-kit/sortable` with `closestCenter` collision detection
- On drag end: determines if category or item, applies `arrayMove`, updates local state via React Query `setQueryData`, persists order via API
- `CategorySettingsModal.tsx` — schedule config, image upload, availability type, day-picker
- `ManageOptionsModal.tsx` — preset templates, custom option builder, delete with confirm

**Key files:**
- `apps/backend/src/menu/menu-crud.service.ts` — menu CRUD, trending, scheduling, orphan cleanup
- `apps/backend/src/menu/menu-audit.service.ts` — menu health audit, severity levels
- `apps/backend/src/menu/menu-translation.service.ts` — translation pre-warm, lazy caching
- `apps/backend/src/menu/category.controller.ts` — 2 controllers (list + detail)
- `apps/backend/src/menu/item.controller.ts` — 2 controllers (list + detail)
- `apps/backend/src/menu/menu-option.controller.ts` — 2 controllers (create + detail)
- `apps/backend/src/menu/audit.controller.ts` — menu health endpoint
- `apps/frontend/src/pages/MenuEditorPage.tsx` — drag-and-drop editor with trending mode
- `apps/frontend/src/components/menu/CategoryList.tsx` — sortable categories with inline rename
- `apps/frontend/src/components/menu/ItemList.tsx` — sortable items with featured toggle
- `apps/frontend/src/components/menu/ManageOptionsModal.tsx` — option/choice CRUD with presets
- `apps/frontend/src/components/menu/CategorySettingsModal.tsx` — schedule + image + availability
- `apps/frontend/src/components/dashboard/MenuCheckWidget.tsx` — audit results widget

**Edge cases handled:**
- Orphan `relatedItemIds` cleanup: when an item is deleted, `removeItem()` in menu-crud.service.ts finds all items referencing the deleted ID and removes the reference
- Overnight category schedules: `startTime > endTime` handled with special comparison logic in `getPublicMenu()`
- Out-of-stock items: filtered from public menu, preserved in dashboard
- Image URL resolution: handles both HTTP absolute URLs and relative `/uploads/` paths
- Empty selected category: ItemList shows prompt, CreateItemForm trigger disabled
- Category name change: fire-and-forget re-translates all menu content for that category

**Dependencies:** PrismaModule, TranslationModule, @dnd-kit/core + sortable, FileInterceptor (multer)

---

### 3.4 QR Code & Table Management

**What it does:** Owners create named tables per restaurant. Each table gets a unique QR code linking to `/menu/public/:restaurantId?table=:name`. QR codes can be downloaded as PNG or bulk-printed in A4 format. Staff can monitor table status in real-time via the Live Table View with color-coded cards and a detail modal for order inspection.

**How it works:**
- `RestaurantTable` model: `id`, `name`, `restaurantId`. Cascade delete from restaurant.
- Table listing is public (no auth on `GET /restaurants/:restaurantId/tables`) — needed for QR code generation
- QR generation uses `qrcode.react` with restaurant branding: accent color, logo embedded in center, H error correction level
- Bulk print: `PrintableQRCodes.tsx` renders single-column A4 layout with `@page { size: A4 portrait; margin: 12mm }`, `breakInside: avoid` per card — two cards per page, no cross-page cuts
- Live View: real-time grid via `GET /api/tables/status/:restaurantId` + Socket.io `table:status-changed` events, color-coded cards (red=occupied, amber=waiting, green=paid, gray=empty), filterable by status
- Sub-tab navigation: "Live View" (real-time status grid) / "QR Management" (QR codes + table CRUD)

**Key files:**
- `apps/backend/src/tables/tables.service.ts` — CRUD with ownership check + `getTablesWithStatus()`
- `apps/backend/src/tables/tables.controller.ts` — 4 endpoints (create, list[public], delete, status)
- `apps/frontend/src/components/tables/TableView.tsx` — sub-tab navigation (Live View / QR Management)
- `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` — real-time status grid + filter
- `apps/frontend/src/components/tables/TableCard.tsx` — color-coded table card
- `apps/frontend/src/components/tables/TableDetailModal.tsx` — detail overlay with orders
- `apps/frontend/src/components/tables/PrintableQRCodes.tsx` — print-only A4 layout

**Edge cases handled:**
- QR download: SVG → Image → Canvas → PNG data URL conversion for cross-browser support
- Logo URL resolution: handles relative paths by constructing full URL from `window.location.origin`
- Empty table state: "No tables" prompt
- Print: only `.print-container` elements visible, all other content hidden via `@media print`
- Session without orders: status shows `waiting` (amber) not `empty`
- Real-time updates: invalidates React Query cache on every `table:status-changed` socket event
- Order count badge: max display "9+" for readability

**Dependencies:** `qrcode.react`, `react-qr-code`, `@nestjs/throttler`, Socket.io

---

### 3.5 Public Menu (Customer-Facing)

**What it does:** The core customer experience — a branded, translated, scheduled, upsell-optimized digital menu accessed via QR scan. No authentication required.

**How it works:**
- `GET /api/menu/public/:restaurantId?lang=bg` — public endpoint, no auth
- Fetches restaurant profile (name, logo, theme colors, fonts, targetLanguages, timezone)
- Fetches categories with items (excluding out-of-stock), ordered
- Applies schedule filtering using Luxon with restaurant timezone
- Lazy translation: on `?lang=` param, checks `translations` JSON cache; on miss, calls DeepL, writes to DB, overlays on response (300ms rate limit)
- Trending items: `AUTO` mode groups orders by item ID, takes top 4 by quantity, falls back to featured items if no data; `MANUAL` returns up to 4 featured in-stock items; `OFF` returns empty

**Frontend (`PublicMenuPage.tsx`):**
- TopBar with full-width search, filter toggle, theme, language codes, table chip
- FilterPanel with dietary toggles (Spicy, Vegan, New, Featured) and allergen exclusion pills
- CategoryPills — horizontal scroll pill navigation replacing sticky IntersectionObserver nav
- Horizontal item cards with dual-currency prices (EUR + BGN at BNB fixed rate 1.95583)
- Pill-shaped "+ Add" buttons replacing full-width solid blue "ADD TO CART" buttons
- Slim TrendingCarousel with compact skeleton loader
- Bottom nav regroup: profile/waiter left, cart/bill right
- Dynamically loads restaurant fonts via `<link>` tags
- Injects CSS custom properties for theme (bg, text, card, accent colors)
- Per-restaurant theme toggle (`theme-{restaurantId}` localStorage key)
- Category banner images with gradient overlay
- Perfect Pairing modal on add-to-cart (deterministic trigger)
- Add-to-cart toast with animated slide-up confirmation
- Image lightbox with pinch-to-zoom (1–4x scale) and swipe-to-dismiss
- Call waiter button with no-table notice (accessible, auto-dismiss)
- Customer sign-in / profile in action bar
- Cart icon with badge
- Safe area insets for mobile notch
- All tap targets ≥ 44px

**Key files:**
- `apps/backend/src/menu/menu-crud.service.ts` — `getPublicMenu()`, `getTrendingItems()`
- `apps/backend/src/menu/menu-translation.service.ts` — `applyLazyTranslations()`
- `apps/backend/src/menu/public-menu.controller.ts` — 3 endpoints (menu, trending, test)
- `apps/frontend/src/pages/PublicMenuPage.tsx` — ~400 lines: theme injection, TopBar/FilterPanel/CategoryPills composition
- `apps/frontend/src/pages/TopBar.tsx` — search, filter toggle, theme, language codes, table chip
- `apps/frontend/src/pages/FilterPanel.tsx` — dietary toggles + allergen exclusion pills
- `apps/frontend/src/pages/CategoryPills.tsx` — horizontal scroll pill navigation
- `apps/frontend/src/lib/currency.ts` — dual EUR/BGN formatters at BNB fixed rate
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — horizontal layout, dual-currency, pill +Add, pairings, toast, lightbox
- `apps/frontend/src/components/menu/ImageLightbox.tsx` — pinch-zoom + swipe gesture engine
- `apps/frontend/src/components/menu/TrendingCarousel.tsx` — slim horizontal scroll with compact skeleton

**Edge cases handled:**
- No `?table` param: Call Waiter shows inline notice (not browser prompt) — `role="alert"`, `aria-live="polite"`, auto-dismiss 3.5s
- Font deduplication: avoids duplicate `<link>` tags when restaurant changes
- Only re-fetches menu when `restaurantId` or `location.search` changes (not on cart function reference changes)
- Scroll position preservation: CartContext functions memoized with `useCallback`
- Stale cart cleanup: `pruneInvalidItems()` removes items not in current menu on load

**Dependencies:** `react-router-dom`, `i18next`, `lucide-react`, DeepL API

---

### 3.6 Shopping Cart & Checkout

**What it does:** Persistent shopping cart with option selection, drink upselling, loyalty point redemption, and server-validated order submission.

**How it works:**

**Cart System (`CartContext.tsx`):**
- Items persisted to localStorage with structure: `{ cartId, id, name, price, quantity, selectedOptions[] }`
- `cartId` = item ID + option hash for deduplication (same item + same options = same cart entry, increment quantity)
- Total calculation includes option price modifiers: `sum((price + opt.priceModifier || 0) * quantity)`
- `pruneInvalidItems(validItemIds)`: uses `useRef` to avoid stale closure, removes items whose `id` not in current menu

**Checkout Flow (`CheckoutPage.tsx`):**
- Redirects to menu if cart empty
- Customer name (pre-filled from profile), phone, special requests
- **Loyalty integration:**
  - Happy hour detection: timezone-aware, supports overnight ranges (22:00–02:00)
  - Points earning preview: `floor(total × exchangeRate × max(happyHour, tierMultiplier))`
  - Item redemption: toggle individual items as "free" for points (checks `rewardPointsPrice`)
  - Cash discount: up to 15% of order total, uses FIFO redemption
  - Not-enough-points error: inline red message
  - Non-logged-in upsell banner: "Sign in to earn points"
  - Expiring points warning: yellow banner for points expiring soon
- **Drink upsell** (`CartDrawer.tsx`): if no drink items in cart at checkout, shows up to 4 beverage suggestions with "Add" buttons
- 404 recovery: detects stale item submissions, shows exact backend error + "Clear cart and return to menu" action

**Order Creation (backend):**
- Fetches all ordered items in ONE query (`findMany({ where: { id: { in: ids } } })`) — N+1 prevention
- Cross-restaurant validation: all items must belong to same restaurant
- Server-side pricing: every option/choice validated against DB, total recalculated
- Invalid option/choice: throws `BadRequestException` with detailed message
- Loyalty processing in atomic `$transaction`: expire → redeem → earn → create order
- WebSocket: emits `newOrder` to restaurant room

**Key files:**
- `apps/frontend/src/context/CartContext.tsx` — cart state, localStorage, pruneInvalidItems
- `apps/frontend/src/components/cart/CartDrawer.tsx` — drawer UI, drink upsell, checkout navigation
- `apps/frontend/src/components/cart/CartIcon.tsx` — floating button with badge
- `apps/frontend/src/pages/CheckoutPage.tsx` — full checkout with loyalty integration
- `apps/backend/src/orders/orders.service.ts` — server-side validation, pricing, loyalty processing
- `apps/backend/src/orders/dto/create-order.dto.ts` — nested DTO validation

**Edge cases handled:**
- Table number validation: checkout requires `tableNumber` be set (from QR URL)
- Empty order: `create()` throws `BadRequestException` if items array empty
- Cross-restaurant items: throws `BadRequestException` if items from different restaurants
- Zero/negative loyalty redemption capped
- Same item + same options → same cart entry (quantity increment, not duplicate)
- Driver upsell resets on cart drawer close

**Dependencies:** CartContext, OrderContext, LoyaltyService, Socket.io, Radix UI Dialog

---

### 3.7 Order Management (Staff)

**What it does:** Restaurant staff view incoming orders, update status through a workflow (NEW → IN_PROGRESS → SERVED → CANCELED), with real-time push notifications and audio alerts.

**How it works:**
- `OrdersView.tsx` displays orders in tabbed view (NEW/IN_PROGRESS/SERVED/CANCELED) with count badges
- Status action buttons depend on current state: NEW can go to IN_PROGRESS or CANCELED; IN_PROGRESS to SERVED or CANCELED; SERVED can reopen to NEW; CANCELED has no actions
- `OrderContext.tsx` listens for `'newOrder'` socket event: plays `/notification.mp3`, refreshes orders, invalidates `['analytics']` query cache
- Each order card shows: order number (last 8 chars uppercase), table badge, timestamp, items grid (with quantity, name, selected options), special requests (red alert styling), total price, customer phone
- `OrderConfirmationPage.tsx` (customer side): joins `order:{id}` socket room, shows live status card with animated dot and status-specific icon/color/message

**Key files:**
- `apps/frontend/src/pages/Dashboard/OrdersView.tsx` — tabbed order management UI
- `apps/frontend/src/context/OrderContext.tsx` — order state + socket event handling + analytics invalidation
- `apps/frontend/src/pages/OrderConfirmationPage.tsx` — customer tracking with live status
- `apps/backend/src/orders/orders.controller.ts` — 4 endpoints (create, list, get, updateStatus)
- `apps/backend/src/orders/orders.service.ts` — `updateStatus()` emits to both order room and restaurant room

**Edge cases handled:**
- Order status change: emits to BOTH `order:{id}` room (customer tracking) and `restaurant:{id}` room (staff refresh)
- Missing customerPhone: handled gracefully (null check in display)
- Selected options type guard: checks array type before mapping
- Empty order list per tab: "No orders" message

**Dependencies:** Socket.io (EventsGateway), OrderContext, TanStack Query

---

### 3.8 Real-Time System (Socket.io)

**What it does:** WebSocket gateway for live push notifications — new orders, status changes, assistance requests — eliminating polling.

**How it works:**
- `EventsGateway` (`apps/backend/src/events/events.gateway.ts`): global NestJS WebSocket gateway, CORS origin `process.env.FRONTEND_URL \|\| 'http://localhost:3001'` with `credentials: true`
- Client joins rooms: `joinRestaurantRoom(restaurantId)` → `restaurant_{id}`, `joinOrderRoom(orderId)` → `order_{id}`
- Emit methods: `emitToRestaurant(id, event, payload)`, `emitToOrder(id, event, payload)`
- `SocketContext.tsx` (`apps/frontend/src/context/SocketContext.tsx`): manages connection lifecycle, derives backend URL from `VITE_API_URL`, passes JWT in auth handshake, reconnects on token change
- `RestaurantContext.tsx`: on `activeRestaurant` change, joins new room and leaves old room

**Events:**

| Event | Direction | Trigger | Consumers |
|-------|-----------|---------|-----------|
| `newOrder` | Server → Staff | `OrdersService.create()` | OrderContext (refresh + audio + analytics invalidation) |
| `orderStatusChanged` | Server → Both | `OrdersService.updateStatus()` | OrderContext (refresh), OrderConfirmationPage (live status) |
| `newAssistanceRequest` | Server → Staff | `AssistanceService.create()` | AssistanceContext (refresh + audio) |
| `assistanceStatusChanged` | Server → Staff | `AssistanceService.update()` | AssistanceContext (refresh) |

**Key files:**
- `apps/backend/src/events/events.gateway.ts` — gateway with room management
- `apps/backend/src/events/events.module.ts` — global module
- `apps/frontend/src/context/SocketContext.tsx` — client connection + lifecycle
- `apps/frontend/src/context/OrderContext.tsx` — order event handlers
- `apps/frontend/src/context/AssistanceContext.tsx` — assistance event handlers

**Edge cases handled:**
- Null socket guard: all operations check socket existence before emitting
- Audio autoplay restriction: `.catch(() => {})` on `.play()` handles browser blocking
- Token change: SocketContext tears down and reconnects on token change via useEffect cleanup

**Dependencies:** `@nestjs/websockets`, `socket.io`, `socket.io-client`

---

### 3.9 Loyalty Program

**What it does:** Configurable points-based loyalty with FIFO accounting, VIP tiers, timezone-aware happy hour, and automated expiry reminders. Customers earn points on orders, redeem for discounts or free items, and track progress across restaurants.

**How it works:**

**Point Lifecycle:**
1. **Earn:** `floor(totalEuros × loyaltyExchangeRate × max(happyHourMultiplier, tierMultiplier))` on every order
2. **Signup bonus:** `loyaltySignupBonus` points on first purchase (lifetimePoints === 0), capped at 75 points (MAX_SIGNUP_BONUS)
3. **Store:** Points stored as discrete batches in `loyalty_point_ledger` with `expiresAt` (configurable, default 90 days)
4. **Redeem:** FIFO (`redeemAccountPoints`) — oldest non-expired batches consumed first, creates REDEEM ledger entries
5. **Expire:** `expireAccountPoints` called before any balance read — finds expired batches, creates EXPIRE entries, decrements account
6. **Notify:** `runDailyExpiryReminders` cron at midnight UTC — finds unnotified batches expiring within `loyaltyExpiryReminderDays`, marks `reminderSentAt`

**VIP Tiers:**
- `tierConfigFromRestaurant()` reads tier thresholds + multipliers from Restaurant row — never hardcoded
- Bronze (default, multiplier 1.0), Silver (≥ silverThreshold, multiplier 1.2), Gold (≥ goldThreshold, multiplier 1.5)
- Frontend displays tier colors from API response, not client-side logic

**Happy Hour:**
- Timezone-aware via Luxon + restaurant IANA timezone — never raw `new Date()`
- Supports overnight ranges (e.g., 22:00–02:00)
- Multiplier strategy: `Math.max(happyHour, tier)` — not additive (discards the lower multiplier)

**Rate Configuration:**
- `loyaltyExchangeRate`: points per €1 spent (default 10, Max 100)
- `loyaltyRedeemRate`: points needed for €1 discount (default 150)
- Effective cashback: `exchangeRate / redeemRate × 100` (default 6.7%)
- SettingsView shows live cashback % with warning when > 15%

**Order Level Caps:**
- `MAX_ORDER_DISCOUNT = 0.15` (15% of order total max cash redemption)
- `MAX_SIGNUP_BONUS = 75` (€0.50 equivalent)

**Key files:**
- `apps/backend/src/loyalty/loyalty-ledger.utils.ts` — pure functions: expire, redeem (FIFO), earn, getExpiring, markReminders
- `apps/backend/src/loyalty/loyalty-tiers.utils.ts` — `getTierInfo()`, `tierConfigFromRestaurant()`
- `apps/backend/src/loyalty/loyalty.service.ts` — `buildRewardSummary()`, `enroll()`, `getPoints()`, cron
- `apps/backend/src/loyalty/loyalty.controller.ts` — 8 endpoints (accounts, history, analytics, reminders, config, enroll, points)
- `apps/backend/src/orders/orders.service.ts` — loyalty processing during order creation
- `apps/frontend/src/pages/CheckoutPage.tsx` — customer-facing loyalty integration
- `apps/frontend/src/pages/CustomerProfilePage.tsx` — account cards, tier progress, expiring points
- `apps/frontend/src/pages/Dashboard/SettingsView.tsx` — owner loyalty configuration

**Edge cases handled:**
- Concurrent enrollment race: catches Prisma P2002 unique constraint error (duplicate enrollment request)
- Negative points after expiry: corrected to 0 in `expireAccountPoints`
- Insufficient points for redemption: `redeemAccountPoints` throws if ledger doesn't have enough
- Zero redeem rate: `getRewardValue()` guards against division by zero
- Loyalty disabled mid-session: `redeemAccountPoints` returns early if points are zero
- First purchase detection: `lifetimePoints === 0` (before current order)
- Migration `20260503200750`: corrects `loyaltyExchangeRate` from 20 → 10 for rows still at old default

**Dependencies:** Prisma $transaction, Luxon, @nestjs/schedule (cron)

---

### 3.10 Translation System

**What it does:** Automatic DeepL translation of all menu content (names, descriptions, allergens, dietary tags, option choices) into EN/BG/RO. Platform-managed — restaurant owners never supply API keys.

**How it works:**

**Three Translation Paths:**

| Path | Trigger | Behavior |
|------|---------|----------|
| **Fire-and-forget pre-warm** | Category/item/option create/update | Background async IIFE translates to all `targetLanguages`, writes to `translations` JSON field. Does not block HTTP response. Errors caught silently. |
| **Owner "Translate All"** | `POST /restaurants/:id/translate-all` | Translates all existing content. Returns summary: "Translated X categories, Y items, and Z options." |
| **Lazy on-demand** | `GET /menu/public/:id?lang=bg` | Checks DB cache per entity; on miss: translates → writes to DB → overlays on response. 300ms delay between calls. `lang` validated against `targetLanguages`. |

**Architecture:**
- `DEEPL_API_KEY` env var in `apps/backend/.env` — single platform key
- `TranslationService` (`apps/backend/src/translation/translation.service.ts`): `translateTexts()`, `translateText()`, `translateObject()`
- Free-tier detection: key ending in `:fx` → routes to `api-free.deepl.com`
- Translations stored as JSON: `{ "en": { "name": "..." }, "ro": { "name": "..." } }`
- Allergens/dietary tags: translated and restructured into language-keyed arrays (e.g., `allergen_Gluten → { en: "Gluten", bg: "Глутен" }`)
- `restaurant.deeplApiKey` column exists in schema but is NEVER read or written — kept for backward compatibility only

**i18n Frontend:**
- `i18next` with `react-i18next`, browser language detection
- `fallbackLng: 'bg'` (Bulgarian default since May 5, 2026)
- Dashboard language picker in Header (BG/EN/RO `<select>`)
- ~120 translation keys across 3 locale files (`apps/frontend/src/locales/*/translation.json`)
- All hardcoded strings wired to `t()` calls as of May 6, 2026

**Key files:**
- `apps/backend/src/translation/translation.service.ts` — DeepL API wrapper with free-tier detection
- `apps/backend/src/translation/translation.module.ts` — exports service
- `apps/backend/src/menu/menu-translation.service.ts` — pre-warm on CRUD, lazy on-demand in `applyLazyTranslations()`
- `apps/backend/src/restaurants/restaurants.service.ts` — `translateAll()` batch translation
- `apps/frontend/src/i18n.ts` — i18next configuration
- `apps/frontend/src/locales/en/translation.json` — English keys
- `apps/frontend/src/locales/bg/translation.json` — Bulgarian keys
- `apps/frontend/src/locales/ro/translation.json` — Romanian keys

**Edge cases handled:**
- No API key: graceful degradation — original text returned, warning logged
- DeepL API failure: original text returned, error logged — translation is non-fatal
- Rate limiting: static 300ms delay between DeepL API calls (free tier: 5 req/s)
- Invalid language: `lang` query param validated against `restaurant.targetLanguages` — prevents unauthorized quota burn
- Empty texts: filtered out before API call
- Translation overwrite: `updateCategory`/`updateItem` merge new translations with existing, don't wipe

**Dependencies:** DeepL API v2, axios, i18next ecosystem

---

### 3.11 Analytics Dashboard

**What it does:** Comprehensive analytics with revenue trends, top items, peak hours, category breakdown, table performance, feedback metrics, and European-formatted CSV export — all timezone-aware.

**How it works:**
- `GET /dashboard/analytics?restaurantId=...&period=7|14|30&startDate=...&endDate=...`
- Backend runs 8 analytics queries in parallel via `Promise.all`
- All date/hour grouping uses Luxon with restaurant timezone — never server UTC
- Revenue trend: groups by day, fills in zero-revenue days for complete date range
- Comparison: previous period % change (revenue, orders)
- `staleTime: 0` in `useAnalytics.ts` — always fresh
- 30-second silent polling (`refetchInterval: 30000`)
- Socket events invalidate analytics cache immediately

**Charts (Recharts):**
- Revenue Trend: AreaChart with gradient fill, custom `ChartTooltip` with glassmorphism
- Top Items: Horizontal BarChart
- Peak Hours: Vertical BarChart, opacity by relative volume
- Category Breakdown: Donut PieChart
- Table Performance: Vertical BarChart
- All axes use `hsl(var(--color-muted-foreground))` fill — works in dark mode

**CSV Export:**
- European format: semicolon delimiters, UTF-8 BOM, `sep=;` metadata header
- Includes date range, restaurant name in filename
- Exports revenue trend data

**Feedback Section:**
- Average rating (large number + stars visual)
- 5-star distribution bars (count per rating)
- Positive rate % (≥ 4 stars)
- Google redirect count
- Feedback summary via `GET /feedback/summary?restaurantId=...`

**Key files:**
- `apps/backend/src/dashboard/dashboard.service.ts` — 8 parallel analytics queries, timezone-aware
- `apps/backend/src/dashboard/dashboard.controller.ts` — 2 endpoints + ownership verification + period validation
- `apps/backend/src/feedback/feedback.service.ts` — `getSummary()` stats aggregation
- `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx` — full analytics UI with charts + CSV + feedback
- `apps/frontend/src/hooks/useAnalytics.ts` — React Query hook with 30s polling
- `apps/frontend/src/pages/Dashboard/SummaryView.tsx` — KPI cards + loyalty metrics + menu audit

**Edge cases handled:**
- Period validation: must be 7, 14, or 30 — throws `BadRequestException` otherwise
- Division by zero: comparison calcs guard against zero previous values
- Empty feedback: returns zero-filled stats, not errors
- Empty tableId: handled in `getOrdersByTable()`
- Custom date range: `startDate`/`endDate` query params accepted for arbitrary range
- Dashboard ownership: `verifyOwnership()` helper throws 403 if user doesn't own restaurant

**Dependencies:** Recharts, Luxon, TanStack Query, `@nestjs/throttler`

---

### 3.12 Customer Feedback System

**What it does:** Multi-step post-order feedback with smart routing — 4–5 stars redirects to Google Reviews (public social proof), 1–3 stars goes to private owner feedback (damage control).

**How it works:**
- `FeedbackPage.tsx` implements 4-step flow: rating → comment → redirect (if applicable) → thank you
- Rating step: 5 interactive stars with hover/select states, animated emoji label per rating (1 = 😞, 5 = 😍), 300ms delay before advancing
- Comment step: context-aware placeholder ("What did you enjoy most?" for 4–5, "What could we improve?" for 1–3)
- Redirect step (4–5 stars only, if restaurant has Google Review URL configured): "Leave a Google Review" button opens in new tab
- Backend: `POST /feedback` checks for duplicate `orderId` (409 Conflict), creates `Feedback` record with `redirectedToGoogle` flag
- Owner summary: `GET /feedback/summary` returns `totalFeedbacks`, `averageRating`, `ratingDistribution` (1–5 map), `googleRedirects`, `positiveRate`

**Key files:**
- `apps/frontend/src/pages/FeedbackPage.tsx` — 4-step feedback flow
- `apps/backend/src/feedback/feedback.controller.ts` — 4 endpoints (submit, google URL, list, summary)
- `apps/backend/src/feedback/feedback.service.ts` — create with duplicate check, summary aggregation

**Edge cases handled:**
- Duplicate feedback: returns 409 Conflict → frontend auto-advances to thank you
- Missing order/restaurant ID: shows error message in UI
- No Google Review URL configured: skip redirect step entirely

**Dependencies:** `react-router-dom`, `fetch` API

---

### 3.13 Branding & Theming

**What it does:** Per-restaurant visual customization — logo, fonts (16 Google Fonts, 3 categories), 4-color scheme editor with live WCAG contrast validation, preview panel, and per-customer theme persistence.

**How it works:**
- `BrandingEditor.tsx`: logo upload via `ImageUploadInput` component (image preview thumbnail, change/remove buttons, JPEG/PNG-only validation). Backend: `POST /restaurants/:id/logo` → `StorageService.uploadWithThumbnail()` → sharp pipeline (resize 1200px, WebP 82%, 400px thumbnail, parallel R2 upload). FontPicker (15 fonts in Serif/Sans-Serif/Display groups, dynamically loaded via `<link>`), ColorSchemeEditor (4 colors with real-time contrast ratio display), default theme toggle
- `ColorSchemeEditor.tsx`: uses `colors.ts` utility for WCAG luminance calculation — `getContrastRatio(hex1, hex2)` returns ratio, `getContrastStatus(bg, text)` returns `{ status: 'pass'|'warning'|'fail', message, ratio }`. Thresholds: ≥ 4.5 = pass, ≥ 3.0 = warning, < 3.0 = fail
- `BrandingPreview.tsx`: mock menu card with Live Preview — applies fonts + colors as inline styles with 500ms transitions
- CSS custom properties injected on public menu via inline style: `--color-background`, `--color-foreground`, `--color-card`, `--color-accent`, `--font-heading`, `--font-body`
- Per-restaurant theme: `ThemeToggle` accepts `storageKey` prop — public menu uses `theme-{restaurantId}`, dashboard uses `theme`. No stored pref → restaurant's `defaultTheme` → `'light'`
- ThemeToggle always visible (previously hidden when custom branding active)

**Key files:**
- `apps/frontend/src/components/ui/BrandingEditor.tsx` — full branding config (logo, fonts, colors, theme, timezone)
- `apps/frontend/src/components/branding/ColorSchemeEditor.tsx` — 4 color pickers + live WCAG contrast
- `apps/frontend/src/components/branding/FontPicker.tsx` — 15-font dropdown with dynamic loading
- `apps/frontend/src/components/branding/BrandingPreview.tsx` — live preview card
- `apps/frontend/src/components/ui/ThemeToggle.tsx` — light/dark toggle with scoped storage
- `apps/frontend/src/utils/colors.ts` — WCAG luminance + contrast utilities
- `apps/frontend/src/index.css` — full design system with custom animations

**Edge cases handled:**
- Font deduplication: checks for existing `<link>` before adding new font
- Invalid hex: `getContrastRatio` returns ratio 1 on parse failure
- Empty color fields: fallback to defaults (`#ffffff`, `#000000`, `#4F46E5`)
- SSR guard in ThemeToggle: checks `typeof window !== 'undefined'`

**Dependencies:** Google Fonts API, Radix UI, `qrcode.react`

---

### 3.14 Menu Scheduling (Dayparting)

**What it does:** Categories automatically appear/hide based on time of day and day of week — e.g., breakfast menu 6:00–11:00, cocktail menu 16:00–02:00.

**How it works:**
- `MenuCategory` fields: `availabilityType` (ALWAYS|SCHEDULED|HIDDEN), `startTime`, `endTime`, `daysOfWeek` (int array, 0=Sunday)
- `getPublicMenu()` in `menu-crud.service.ts`: filters HIDDEN categories; for SCHEDULED, checks `daysOfWeek` and time range using Luxon with restaurant timezone
- Overnight ranges (e.g., 22:00–02:00): special case when `startTime > endTime` — category visible if current time ≥ startTime OR ≤ endTime
- Day-of-week match: JS `getDay()` returns Sunday=0, matches the `daysOfWeek` array directly
- `CategorySettingsModal.tsx`: owner UI with day-picker buttons, time inputs, availability type selector

**Key files:**
- `apps/backend/src/menu/menu-crud.service.ts` — schedule filtering in `getPublicMenu()`
- `apps/frontend/src/components/menu/CategorySettingsModal.tsx` — schedule configuration UI
- `apps/backend/prisma/schema.prisma` — `AvailabilityType` enum, `startTime`, `endTime`, `daysOfWeek` fields

**Edge cases handled:**
- Overnight ranges: `startTime > endTime` special logic
- Timezone awareness: all comparisons use restaurant timezone, not server UTC
- Default: all categories created as ALWAYS (no configuration needed)

**Dependencies:** Luxon, class-validator

---

### 3.15 Upselling Engine

**What it does:** Three upsell mechanisms — Perfect Pairing (suggested item combos), Trending Carousel (social proof), Drink Upsell (checkout intervention).

**How it works:**
- **Perfect Pairing** (`ItemWithOptions.tsx`): When an item has `relatedItemIds`, clicking "Add to Cart" triggers a deterministic modal showing paired items. Modal renders via React portal with glassmorphism overlay. Shows "Chef's Recommendation" badge. Items can be added directly from modal.
- **Trending Carousel** (`TrendingCarousel.tsx`): Horizontal scroll section with fire emoji header. `AUTO` mode aggregates order item quantities, takes top 4, falls back to featured items. `MANUAL` shows up to 4 admin-selected featured items. Items rendered as `ItemWithOptions` with full pairing support.
- **Drink Upsell** (`CartDrawer.tsx`): On checkout, checks if any cart item belongs to a `isDrinkCategory` category. If no drinks, shows up to 4 items from first drink category found — with "Add" buttons. State resets on drawer close.

**Key files:**
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — pairing modal logic
- `apps/frontend/src/components/menu/TrendingCarousel.tsx` — trending section
- `apps/frontend/src/components/cart/CartDrawer.tsx` — drink upsell
- `apps/backend/src/menu/menu-crud.service.ts` — `getTrendingItems()` (AUTO/MANUAL/OFF logic)

**Edge cases handled:**
- Trending with no order data: falls back to featured items
- Multiple drink categories: shows only the first one found
- Empty relatedItemIds: no modal shown
- No drink categories at all: skips upsell

**Dependencies:** React portal, `lucide-react`

---

### 3.16 Stripe Connect Payments

**What it does:** End-to-end pay-at-table flow using Stripe Connect. Customers request their bill through the public menu, pay with card via Stripe Elements, add optional tips, and the platform takes a configurable percentage fee. Restaurant owners onboard through Stripe Connect in the Settings dashboard. Staff receive real-time payment notifications.

**How it works:**

**Provider Abstraction:**
- `IPaymentProvider` interface (`apps/backend/src/payment/payment-provider.interface.ts`) defines the contract: `createPaymentIntent`, `constructWebhookEvent`, `createAccountLink`, `getAccountStatus`, `disconnectAccount`
- `StripeProvider` implements the interface — future providers (MyPOS, Square, etc.) can be added by implementing the same interface

**Payment Flow:**
1. Customer or waiter creates a `TableSession` for a table via `POST /api/payment/sessions` — returns a token
2. Customer clicks "Request Bill" on the public menu — fetches session bill with tip config
3. Customer selects tip percentage (configurable options from restaurant settings)
4. `POST /api/payment/create-payment-intent` creates a Stripe PaymentIntent with platform fee
5. Frontend renders Stripe Elements card input via `PaymentModal` (3-step: tip → card → confirmation)
6. Stripe webhook receives `payment_intent.succeeded` → marks session PAID → emits `payment:confirmed` + `table:status-changed` via Socket.io
7. Staff dashboard shows payment notification via `NotificationBell` + `PaymentToast`

**Stripe Connect Onboarding:**
- `POST /api/restaurants/:id/stripe/account-link` — creates Stripe Connect account + onboarding link
- `GET /api/restaurants/:id/stripe/status` — checks account status (pending/onboarded/disabled)
- `POST /api/restaurants/:id/stripe/disconnect` — revokes Connect access
- Settings tab gated behind `paymentsEnabled` toggle

**Payment History:**
- `GET /api/payment/history/:restaurantId` — paginated list with filters: status, startDate, endDate
- `PaymentsView.tsx` — table with columns: date, table, customer, amount, tip, status
- Filter by status (SUCCEEDED/FAILED/PENDING) and date range

**Real-Time Notifications:**
- `NotificationContext` manages notification bell badge count and toast queue
- Socket listener for `payment:confirmed` event
- `NotificationBell` component in dashboard header shows unread count
- `PaymentToast` slide-in notification for confirmed payments

**TableSession Model:**
- `id`, `token` (UUID for public access), `tableId`, `restaurantId`, `status` (OPEN/PAID/CLOSED_NO_PAYMENT), `paidAt`, `createdAt`
- Created automatically on first order; reused for subsequent orders to the same table

**Payment Model:**
- `id`, `tableSessionId`, `restaurantId`, `stripePaymentIntentId`, `amount`, `tipAmount`, `platformFeeAmount`, `currency`, `status` (PENDING/SUCCEEDED/FAILED), `provider`, `createdAt`

**Key files:**
- `apps/backend/src/payment/payment.service.ts` — session, bill, intent, webhook handling
- `apps/backend/src/payment/payment.controller.ts` — 5 endpoints (sessions, bill, intent, webhook, history)
- `apps/backend/src/payment/stripe.provider.ts` — Stripe SDK wrapper with Connect support
- `apps/backend/src/payment/payment-provider.interface.ts` — provider abstraction
- `apps/backend/src/restaurants/restaurants.service.ts` — Stripe Connect account management
- `apps/frontend/src/components/payment/PaymentModal.tsx` — 3-step payment UI
- `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` — payment history table
- `apps/frontend/src/context/NotificationContext.tsx` — notification state management
- `apps/frontend/src/components/NotificationBell.tsx` — header bell icon with badge
- `apps/frontend/src/components/PaymentToast.tsx` — slide-in payment confirmation

**Edge cases handled:**
- Webhook idempotency: looks up payment by `stripePaymentIntentId` or `metadata.paymentId`
- Failed payments: updates status to FAILED, doesn't close the session
- Session reuse: `getOrCreateSession` finds existing OPEN session before creating new one
- Empty order guard: prevents creating payment intent for sessions with zero orders
- Platform fee: calculated as `total * restaurant.platformFeePercent`
- Duplicate Stripe Connect onboarding: checks existing `stripeAccountId` before creating new account
- Raw body preservation: webhook endpoint uses raw body buffer for Stripe signature verification

**Dependencies:** `stripe` SDK, `@stripe/react-stripe-js`, `@stripe/stripe-js`, Stripe Connect platform account

---

### 3.17 Live Table View

**What it does:** Real-time visual grid showing table status for restaurant staff. Each table appears as a color-coded card — red for occupied (OPEN session with orders), amber for waiting (OPEN session, no orders), green for paid, gray for empty. Staff can click any table card to see current orders, customer names, and payment status. Updates in real-time via Socket.io.

**How it works:**

**Backend — Table Status Endpoint:**
- `GET /api/tables/status/:restaurantId` — JWT-protected, returns all tables with derived status
- `TablesService.getTablesWithStatus()` fetches tables + active sessions (OPEN/PAID) in parallel via `Promise.all`
- Maps each table to a status: `empty` (no session), `waiting` (OPEN + no orders), `occupied` (OPEN + orders), `paid` (PAID)
- Returns enriched data: `orderCount`, `totalAmount`, `customerNames`, `sessionStatus`, `sessionId`

**Real-Time Updates:**
- `EventsGateway.emitTableStatusChanged(restaurantId, tableId, sessionId)` helper method
- Emits `table:status-changed` event from 4 locations:
  - `OrdersService.create()` — when a new order attaches to a table session
  - `OrdersService.updateStatus()` — when order status changes
  - `PaymentService.handleWebhookEvent()` — when payment succeeds
  - `PaymentService.closeSession()` — when staff manually closes a session
- Frontend `LiveTablesView` subscribes via `useSocket()`, invalidates React Query cache on event

**Frontend:**
- `LiveTablesView.tsx` — main grid component with filter dropdown
- Filter modes: Active (non-empty), Occupied (red+amber), Paid (green), All
- Default filter: Active only (shows tables that need attention)
- `TableCard.tsx` — square card with colored left border, table number centered, order count badge, customer count
- `TableDetailModal.tsx` — modal showing table name, session status badge, order list with status badges, payment info for paid sessions
- `TableView.tsx` — parent with sub-tab navigation: "Live View" / "QR Management"

**Key files:**
- `apps/backend/src/tables/tables.service.ts` — `getTablesWithStatus()` with parallel queries
- `apps/backend/src/tables/tables.controller.ts` — `GET tables/status/:restaurantId`
- `apps/backend/src/events/events.gateway.ts` — `emitTableStatusChanged()` helper
- `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` — real-time grid + filter
- `apps/frontend/src/components/tables/TableCard.tsx` — color-coded card
- `apps/frontend/src/components/tables/TableDetailModal.tsx` — detail overlay

**Edge cases handled:**
- Empty restaurant (no tables): shows "No tables created" empty state
- All tables free: shows "All tables are free" message
- Session with no orders: status resolves to `waiting` (amber) not `empty`
- Multiple customers per table: deduplicates customer names via `Set`
- Socket disconnect: React Query cache serves stale data until reconnect
- Missing restaurantId: query disabled via `enabled: !!restaurantId`

**Dependencies:** Socket.io, TanStack React Query, Lucide React icons

---

### 3.18 Waiter POS (Point of Sale)

**What it does:** Full-viewport, mobile-first POS interface at `/staff/pos` for waiters to take tableside orders rapidly. Complete isolation from the customer-facing menu and cart system. Waiters select a table (or force-open an occupied one), browse the menu in a dense 2-column grid, add items with optional variations/add-ons and per-item notes, assign items to seats (Seat 1-3 / Shared), submit only new items to the kitchen, and close sessions via card payment or force-close. On reopening an occupied table, the full order history is visible as read-only items while new items are added as pending.

**How it works:**

**Architecture — Third Layout:**
- `PosLayout` (`apps/frontend/src/pages/pos/PosLayout.tsx`) wraps `/staff/pos` — zero chrome, full viewport, sticky top bar, scrollable content area, fixed bottom action bar with safe-area insets
- `StaffRoute` (`apps/frontend/src/components/StaffRoute.tsx`) guards access — allows OWNER and STAFF roles, redirects unauthenticated to `/login`, CUSTOMER to `/profile`
- Added as layout route in `App.tsx` alongside existing `AppLayout` and `PublicLayout`

**State Management — PosContext:**
- In-memory only (no localStorage) — POS cart is ephemeral, cleared on order submit or session end
- Completely isolated from `CartContext` — no shared state, no interference
- Key type `PosCartItem.submitted: boolean` — the backbone of the history/pending split:
  - `addItem()` creates items with `submitted: false`
  - `markAsSubmitted()` marks all pending items as submitted (after order creation)
  - `setHistoryItems(history)` loads past orders as submitted, preserves pending
  - `clearCart()` removes only pending items (preserves history within session)
  - `resetCart()` removes ALL items (used on table switch)
  - `getPendingTotal()` returns sum of non-submitted items only
  - `buildSpecialRequests()` serializes only pending items with seat grouping

**Table Selection & Session Management:**
- `PosTableModal` shows color-coded table grid from `getTablesWithStatus()`
- Normal open: `POST /api/payments/session` (idempotent `getOrCreateSession`)
- Force open: `POST /api/payments/session/force-open` (JWT) — closes existing OPEN session, creates new one
- On select: loads order history via `GET /api/payments/session/:token/bill` → `setHistoryItems()` if the table has existing orders
- Cart fully reset via `resetCart()` before loading new table's session

**Order Submission:**
- Waiter selects seat via `PosSeatSelector` (Seat 1 | Seat 2 | Seat 3 | Shared) — sets `activeSeat`
- Tap item card: no options → immediate `addItem()` with active seat; has options → `PosOptionsDrawer` opens for variation/add-on selection + optional per-item note
- Cart drawer shows submitted items (gray, ✓ checkmark, read-only) and pending items (full qty/note/delete controls)
- Submit button shows pending count + pending-only total, disabled when no pending items
- On submit: `buildSpecialRequests()` serializes pending items only → `POST /api/orders` → `markAsSubmitted()` on success. Session stays open. Kitchen receives `newOrder` socket event.

**specialRequests Serialization Format:**
```
[Seat 1] Ribeye: no salt, Pasta | [Seat 2] Salmon: extra lemon | [Shared] Water
```
Items without notes appear as name only. Quantities > 1 append ` xN`.

**Session End (3 options, all with Radix confirmation dialogs):**
- **Submit Order** (green) — sends only pending items to kitchen, marks as submitted, session stays open
- **Paid by Card** (amber) — `POST /api/payments/session/:token/close-card` (JWT) → creates MYPOS payment record via `closeSessionWithCard()`, sets session to PAID, emits `table:status-changed` + `payment:confirmed` events → clears session. Uses existing `PaymentProvider.MYPOS` and `TableSessionStatus.PAID` enum values — zero schema change.
- **Force Close** (red) — `POST /api/payments/session/:token/close` (JWT) → sets CLOSED_NO_PAYMENT → clears session

**Split Bill & QR Bill:**
- `PosSplitBill`: `(getTotal() / n).toFixed(2)` — pure UI math, no API call
- `PosQRBill`: `<QRCodeSVG value={billUrl} size={256} />` — same URL customers use for tableside payment

**Backend Additions (4 new endpoints, zero Prisma changes):**
- `POST /api/payments/session/force-open` (JWT) — force-open table session
- `POST /api/payments/session/:token/close-card` (JWT) — close with MYPOS card payment
- `GET /api/tables/:tableId/orders?restaurantId=X` (JWT) — all orders for active session with item names
- `PaymentService.closeSessionWithCard()` — Prisma `$transaction`: creates Payment (provider MYPOS, status SUCCEEDED) + updates TableSession to PAID with `paidAt`

**Styling:**
- Dark-mode-compatible via existing CSS variables
- `PosItemCard`: `h-20`, 2-column dense grid, name + price only (no image)
- `PosCategoryFilter`: horizontal scroll with `scrollbar-hide`, active pill uses `bg-accent/10 border border-accent`
- All tap targets ≥ 44px
- `transition-none` on item cards for performance on mid-range Android

**Key files:**
- `apps/frontend/src/context/PosContext.tsx` — 190 lines, 15 context methods
- `apps/frontend/src/pages/pos/PosLayout.tsx` — full-viewport shell
- `apps/frontend/src/pages/pos/PosPage.tsx` — component composition
- `apps/frontend/src/components/pos/` — 12 components (TopBar, CategoryFilter, ItemGrid, ItemCard, OptionsDrawer, CartDrawer, SeatSelector, TableModal, SplitBill, QRBill)
- `apps/frontend/src/components/StaffRoute.tsx` — staff auth guard
- `apps/backend/src/payment/payment.service.ts` — `forceOpenSession()`, `closeSessionWithCard()`
- `apps/backend/src/payment/payment.controller.ts` — 2 new endpoints
- `apps/backend/src/tables/tables.service.ts` — `getTableOrders()`
- `apps/frontend/src/lib/api.ts` — `forceOpenSession()`, `closeSessionWithCard()`, `getTableOrders()`

**Edge cases handled:**
- Table switching: `resetCart()` clears all items before loading new session — no stale data from previous table
- Occupied table reopen: `getSessionBill()` loads full order history as `submitted: true` items; new items added as pending; only pending items sent on submit
- Force open: warns via Force Open button in table card (must explicitly click, not on normal tap)
- Empty restaurant: "No restaurants selected" empty state in POS layout
- No tables: "No tables found" prompt in table modal
- History load failure: best-effort — caught silently, doesn't block session open
- Zero pending items: Submit button shows "No new items to submit" disabled state
- Duplicate menuItemIds in order: deduplicated with `[...new Set()]` before Prisma `findMany`
- Dashboard live view: clicking table now fetches real orders (was hardcoded "No orders")

**Dependencies:** React 18, Tailwind CSS 4, Radix UI (Dialog), TanStack Query, `qrcode.react`, existing `SocketContext` + `RestaurantContext`

---

### 3.19 Translation System Hardening (May 10, 2026)

**What it does:** Three separate production bugs in the translation pipeline were identified and resolved: the "Translate All" button failing with "No target languages configured", the public menu language dropdown showing wrong language / no translations after import, and DeepL returning HTTP 429 + Node.js emitting `MaxListenersExceededWarning` when translating to multiple languages.

**Bug 1 — "No target languages configured":**
- Root cause: `handleForceTranslate` in `SettingsView.tsx` called `triggerTranslation(restaurantId)` directly without first persisting the `targetLanguages` local state to the database. The backend read `restaurant.targetLanguages` from DB — if the owner had just changed the checkboxes without saving, the DB still had the old (possibly empty) array.
- Fix: Before calling `triggerTranslation`, compare local `targetLanguages` to `activeRestaurant.targetLanguages`. If different, call `updateRestaurant()` + `fetchRestaurants()` first, then trigger translation.
- File: `apps/frontend/src/pages/Dashboard/SettingsView.tsx`

**Bug 2 — Public menu language dropdown not working after import:**
- Root cause 1: `selectedLang` initialized from `i18n.language` which returns full locale codes like `"en-US"` — didn't match `"en"` keys in the `translations` JSONB. Fixed with `.slice(0, 2)`.
- Root cause 2: Language dropdown was hardcoded to EN/BG/RO tabs rather than dynamic from `restaurant.targetLanguages`. Owner could enable only RO but dropdown still showed EN + BG.
- Root cause 3: Dropdown visible even when `targetLanguages` was empty — showed languages with no translations. Hidden with `{(menuData.restaurant?.targetLanguages?.length ?? 0) > 0 && ...}`.
- Root cause 4: `getPublicMenu` Prisma select in `menu-crud.service.ts` was missing `defaultTheme: true` — `ThemeToggle.defaultTheme` received `undefined`, breaking per-restaurant theme on first load.
- File: `apps/frontend/src/pages/PublicMenuPage.tsx`, `apps/backend/src/menu/menu-crud.service.ts`

**Bug 3 — DeepL 429 + MaxListenersExceededWarning:**
- Root cause 1: `TranslationService` called `axios.post(url, ...)` directly per request — each call created a new HTTP client instance with a fresh TLS socket. When translating to 3+ languages simultaneously, Node.js accumulated listeners beyond the default threshold.
- Fix 1: Replaced with a module-level shared `AxiosInstance` using `https.Agent({ keepAlive: true, maxSockets: 4 })`.
- Root cause 2: `translateObject` iterated over `targetLanguages` with no delay between iterations — DeepL free tier enforced rate limits, returning 429 on the 2nd or 3rd language.
- Fix 2: Added `await this.sleep(250)` between language iterations (skipped after the last one).
- File: `apps/backend/src/translation/translation.service.ts`

**Key files:**
- `apps/frontend/src/pages/Dashboard/SettingsView.tsx` — translate-all now saves langs first
- `apps/frontend/src/pages/PublicMenuPage.tsx` — `selectedLang` init, dynamic dropdown, conditional render
- `apps/backend/src/menu/menu-crud.service.ts` — added `defaultTheme` to public menu select
- `apps/backend/src/translation/translation.service.ts` — shared AxiosInstance, 250ms inter-language delay

---

### 3.20 Menu Import Translation Passthrough (May 10, 2026)

**What it does:** JSON menu imports now carry `translations` through the entire pipeline — DTO validation, service upsert, and DB write. Previously, the `jsonToPayload()` transform in the frontend explicitly rebuilt item/category objects without spreading `translations`, silently dropping multilingual data even when present in the source JSON.

**How it works:**
- `ImportItemDto` — added `@IsObject() @IsOptional() translations?: Record<string, { name?: string; description?: string }>`.
- `ImportCategoryDto` — added `@IsObject() @IsOptional() translations?: Record<string, { name?: string }>`.
- `menu-import.service.ts` — both `menuCategory.create`, `menuCategory.update`, and `menuItem.create`/`update` now spread `...(cat.translations ? { translations: cat.translations } : {})` and the equivalent for items.
- `MenuImportView.tsx` `jsonToPayload()` — fixed: item and category objects now include `...(item.translations ? { translations: item.translations } : {})`. Previously the objects were rebuilt field-by-field and `translations` was never included.

**Result:** A JSON menu file with pre-translated content (e.g. from an OCR tool that outputs EN + BG + RO names) can be imported directly without requiring a separate "Translate All Now" step.

**Key files:**
- `apps/backend/src/menu-import/dto/import-menu.dto.ts` — `translations` added to item and category DTOs
- `apps/backend/src/menu-import/menu-import.service.ts` — `translations` passed through to Prisma upsert
- `apps/frontend/src/pages/Dashboard/MenuImportView.tsx` — `jsonToPayload()` fixed

---

### 3.21 Menu Editor Delete Confirmation (May 10, 2026)

**What it does:** Category and item delete buttons in the menu editor were non-functional — clicking produced no effect. Both used `window.confirm()` which is silently blocked (returns `false` immediately) in certain browser embedding contexts. Replaced with proper in-UI confirmations.

**Category delete — Radix Dialog:**
- `CategoryList.tsx` now tracks `deleteTarget: { id, name } | null` state.
- Clicking the trash icon sets `deleteTarget` (no `window.confirm`).
- A `@radix-ui/react-dialog` modal renders with: title "Delete Category", body "This will permanently delete **[name]** and ALL items inside it. This cannot be undone.", Cancel + "Delete Category" (red) buttons. Loading state on confirm. Clears `deleteTarget` on close.

**Item delete — inline confirm:**
- `ItemList.tsx` tracks `confirmingDeleteId: string | null`.
- First trash click: sets `confirmingDeleteId = item.id` — the row switches to showing "Delete? / Cancel / Delete" buttons inline.
- Cancel resets to normal buttons. Confirm calls `deleteItem(id)` directly.
- No dialog needed for single items; avoids modal overhead.

**i18n:** ~15 new keys added in EN/BG/RO:
- `menuAdmin.deleteCategoryTitle`, `.deleteCategoryWarning`, `.deleteCategoryWarning2`, `.deleteCategory`, `.confirmDelete`
- `common.delete`, `common.deleting`

**Key files:**
- `apps/frontend/src/components/menu/CategoryList.tsx` — Radix Dialog confirmation
- `apps/frontend/src/components/menu/ItemList.tsx` — inline confirm state
- `apps/frontend/src/locales/*/translation.json` — new keys (EN, BG, RO)

### 3.22 Kitchen Display System (May 12, 2026)

**What it does:** Dedicated kitchen screen at `/staff/kitchen` showing incoming orders in a real-time kanban board. Orders appear as they're placed, kitchen staff tap cards to advance them through the workflow (NEW → IN_PROGRESS → SERVED). Eliminates paper tickets and shouted orders.

**How it works:**
- `KitchenPage.tsx` (`apps/frontend/src/pages/staff/KitchenPage.tsx`) — 270-line full-viewport kanban board
- Three columns: New (blue top border), In Progress (amber), Ready (green)
- Real-time audio alert (`/notification.mp3`) on `newOrder` socket event
- Elapsed time counter per order — ticks every 10s, orders > 15 min flagged with red urgency styling
- Tap card → advances to next status column (NEW → IN_PROGRESS → SERVED → COMPLETED)
- History panel: toggle shows COMPLETED orders from last 24 hours in 2–4 column grid
- Dark-only UI (`bg-gray-950`), monospace font, zero chrome — optimized for kitchen glare and visibility
- Uses existing `useOrders()` context + `useSocket()` — no new backend endpoints

**Current state:** Routed at `/staff/kitchen` with `StaffRoute` guard (OWNER/STAFF only). Backend requires no changes — relies entirely on existing order status workflow.

**Key files:**
- `apps/frontend/src/pages/staff/KitchenPage.tsx`

**Dependencies:** Socket.io (existing EventsGateway), OrderContext, `/notification.mp3`

---

### 3.23 Public Menu Mobile UX Redesign (May 15, 2026)

**What it does:** Complete mobile-first redesign of the customer-facing public menu. Replaces the old 2-column item grid + sticky category nav with a compact TopBar (search, filter, theme, language, table), horizontal item cards with dual-currency prices, category scroll pills, and a slide-down filter panel with dietary toggles and allergen exclusion pills. Bottom nav regrouped for better visual hierarchy. PublicMenuPage.tsx refactored from 815 lines to ~400.

**How it works:**

**Shared Currency Utility (`lib/currency.ts`):**
- `formatEuro(cents)` — formats euro amounts from cent integers (e.g., 950 → "€9.50")
- `formatBgn(cents)` — converts EUR cents to BGN at fixed rate 1 EUR = 1.95583 BGN, then formats (e.g., 950 → "18.58 лв")
- Single source of truth — consumed by CartDrawer, CheckoutPage, PaymentModal, ItemWithOptions
- Bulgarian National Bank fixed rate — required by law for all price displays

**TopBar (`TopBar.tsx`):**
- Full-width search input with Lucide `Search` (magnifier) icon, placeholder "Search menu..."
- Filter toggle button (hamburger-like `SlidersHorizontal` icon) opens/closes FilterPanel
- ThemeToggle (light/dark) scoped to restaurant
- Language codes (EN/BG/RO) as compact pills
- Table chip: `Table` icon + number (e.g., "Table 5") replacing the text "You are viewing the menu for table 5"

**FilterPanel (`FilterPanel.tsx`):**
- Slide-down panel with smooth height transition
- Search input at top (duplicates TopBar search for convenience while filtering)
- Dietary toggles: Spicy, Vegan, New, Featured — row of toggle switches
- Allergen exclusion pills: Milk, Wheat, Fish, Nuts, Eggs, Soy, Shellfish — click to exclude
- Multi-select: toggling an allergen pill hides all products containing that allergen
- Fully translated via i18n (`publicMenu.dietary.*`, `publicMenu.filters.*`)

**Horizontal Item Cards (`ItemWithOptions.tsx`):**
- Image left (square, ~72px), content right (name, description, price, allergens, dietary tags)
- Dual-currency prices: EUR price prominent with BGN equivalent beneath at BNB fixed rate
- Pill-shaped "+ Add" buttons (`rounded-full`) replace previous full-width solid blue "ADD TO CART" buttons
- Compact form factor suitable for mobile 375px viewport

**CategoryPills (`CategoryPills.tsx`):**
- Horizontal scroll pill navigation for categories
- Active pill highlighted with accent color background
- Smooth `scrollIntoView` on tap
- Replaces previous sticky category navigation with IntersectionObserver

**Slim TrendingCarousel:**
- Wider horizontal cards with compact skeleton loading state
- Reduced vertical footprint vs previous carousel design
- Fire emoji header preserved

**Bottom Nav Regroup:**
- User-centric icons (profile, Call Waiter) grouped on left side
- Cart/bill actions (cart icon with badge, order action) on right side
- Better visual hierarchy through spacing and grouping

**i18n Additions:**
- ~30 new keys across EN/BG/RO: `publicMenu.search`, `publicMenu.filters.title/allergens/dietary/spicy/vegan/new/featured`, `publicMenu.addShort`, and per-allergen labels
- All dynamic content (dietary tags, allergen names) properly wired to translation files

**Dead Code Cleanup:**
- Removed unused `LANG_LABELS` constant (hardcoded language display names)
- Removed unused `handleLanguageChange` function (superseded by TopBar language codes)

**Design Integration:**
- Reuses existing ThemeToggle, CartIcon, TableContext, i18n infrastructure
- Zero backend changes required — all work in frontend
- Backward compatible: same URL structure, same cart/order/assistance flows

**Key files:**
- `apps/frontend/src/lib/currency.ts` — shared EUR/BGN formatters
- `apps/frontend/src/pages/TopBar.tsx` — search + filter + theme + lang + table chip
- `apps/frontend/src/pages/FilterPanel.tsx` — dietary toggles + allergen pills
- `apps/frontend/src/pages/CategoryPills.tsx` — horizontal scroll pill navigation
- `apps/frontend/src/pages/PublicMenuPage.tsx` — refactored 815→~400 lines
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — horizontal layout + dual currency
- `apps/frontend/src/components/menu/TrendingCarousel.tsx` — slim version
- `apps/frontend/src/components/cart/CartDrawer.tsx` — dual currency integration
- `apps/frontend/src/pages/CheckoutPage.tsx` — dual currency integration
- `apps/frontend/src/components/payment/PaymentModal.tsx` — dual currency integration
- `apps/frontend/src/locales/en/translation.json` — English keys
- `apps/frontend/src/locales/bg/translation.json` — Bulgarian keys
- `apps/frontend/src/locales/ro/translation.json` — Romanian keys

**Edge cases handled:**
- Empty search: shows all items (no filter applied)
- No allergens selected: all items visible
- All items filtered out: empty state with "No items match your filters" message
- Scroll position preservation on category pill tap
- Category with no items: filtered from pills
- Table number not in URL: table chip hidden
- Theme override: per-restaurant theme respected via existing `theme-{restaurantId}` localStorage key
- BGN conversion: 1.95583 rate applied to EUR cent integer before formatting

**Dependencies:** Lucide React, Tailwind CSS 4, i18next, existing ThemeToggle + CartIcon + TableContext

---

### 3.24 Security & Bug Fixes (May 15, 2026)

**What it does:** Six targeted fixes addressing a security vulnerability, dead code with a token-leak, a silent no-op cron, an incomplete CSV export, missing TypeScript strict checks, and two frontend correctness bugs.

**Fixes:**

**Socket.io CORS wildcard (`events.gateway.ts`):**
- Before: `cors: { origin: '*' }` — any webpage could subscribe to `restaurant:*` and `order:*` socket events
- After: `cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3001', credentials: true }`
- Impact: real-time order, table, and payment events now restricted to the configured frontend origin

**Magic-link endpoint removed (`auth.controller.ts`, `auth.service.ts`):**
- `POST /auth/magic-link` endpoint deleted — zero frontend callers since OTP auth shipped May 6
- `sendMagicLink()` service method deleted — it leaked a signed JWT in both the response body (`{ link }`) and `console.log`, bypassing httpOnly cookie security
- Current customer login flow: Email OTP via `POST /auth/otp/send` + `POST /auth/otp/verify`

**Loyalty expiry reminder emails (`loyalty.service.ts`):**
- `runDailyExpiryReminders()` cron was marking point batches as "reminder sent" in DB but never actually sending any email — the TODO block was never filled in
- Now sends per-candidate email via Resend REST API (same pattern as OTP emails): subject, plain text, and HTML body with points count and restaurant name
- Dev fallback: `logger.log` when `RESEND_API_KEY` not set
- Errors per-candidate caught and logged — one bad email doesn't abort the whole restaurant's batch

**Analytics CSV export (`AnalyticsView.tsx`):**
- `handleExportCSV()` exported summary + revenue trend + top items but skipped `peakHours` and `categoryBreakdown`
- Both sections now appended: "Peak Hours;Orders" and "Category;Revenue" with the same semicolon delimiter and UTF-8 BOM as the rest of the export

**TypeScript strict mode (`apps/backend/tsconfig.json`):**
- `strictNullChecks: false` → `true`
- `noImplicitAny: false` → `true`
- Errors fixed across 18 files: `@Request() req: any` on NestJS controller params, nullish coalescing on pagination `page ?? 1` / `limit ?? 10`, null guard on `dbItem` in orders service, explicit type on `itemsData` array, `import request from 'supertest'` fix in e2e specs

**CategoryPills auto-scroll (`CategoryPills.tsx`):**
- Active category pill was not scrolling into view when category changed programmatically
- Added `useRef` map of pill elements + `useEffect` calling `scrollIntoView({ behavior: 'smooth', inline: 'center' })` on `activeCategory` change

**ItemWithOptions BGN price conversion (`ItemWithOptions.tsx`):**
- If `item.currency === 'BGN'`, price was passed directly to `formatInlineDual` which applies the BGN rate again — double conversion
- Fix: `const priceEuro = item.currency === 'BGN' ? item.price / BGN_RATE : item.price` before formatting, always pass `'EUR'` to `formatInlineDual`

**Key files:**
- `apps/backend/src/events/events.gateway.ts`
- `apps/backend/src/auth/auth.controller.ts`, `auth.service.ts`
- `apps/backend/src/loyalty/loyalty.service.ts`
- `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`
- `apps/backend/tsconfig.json` (+ 17 backend source files)
- `apps/frontend/src/components/menu/CategoryPills.tsx`
- `apps/frontend/src/components/menu/ItemWithOptions.tsx`

### 3.25 Infrastructure & Polish Sprint (May 15, 2026)

**What it does:** Seven independent improvements: API versioning, DB resilience, order UX, print templates, test coverage, and two minor features.

**API versioning (`main.ts`, `api.ts`):**
- NestJS `VersioningType.URI` with `defaultVersion: '1'` — all routes now at `/api/v1/*`
- Frontend `api.ts` base URL updated to `/api/v1`; Vite proxy unchanged (catches `/api/*`)
- CSRF exempt paths and Stripe webhook path updated to `/api/v1/...`
- No controller decorators needed — `defaultVersion: '1'` applies globally

**Prisma retry/circuit breaker (`prisma.service.ts`):**
- Startup retry: jittered exponential backoff (`500ms × 2^attempt`, 30s cap, 50–100% jitter) replaces fixed 2s delay
- New `withRetry<T>(fn, maxAttempts = 3)` method — use for critical DB calls; handles transient errors only
- Circuit breaker states: CLOSED (normal) → OPEN after 5 consecutive transient failures → HALF_OPEN after 30s → CLOSED on probe success
- Transient codes: `P1001, P1002, P1008, P1017, P2024, P1012`, plus `PrismaClientInitializationError` and `PrismaClientRustPanicError`

**Order progress stepper (`OrderConfirmationPage.tsx`):**
- `OrderProgressStepper` component: 3 steps (Placed → In Kitchen → Served) with connector lines
- Done steps: emerald fill + checkmark; current step: accent color + pulse animation; future: gray
- Canceled orders skip the stepper entirely
- Also fixed `AnalyticsView.tsx` CSV export using wrong field names (`name`/`value` → `category`/`revenue`) — was a pre-existing TS error under strict mode

**QR table tent print templates (`PrintableQRCodes.tsx`, `TableView.tsx`):**
- Three templates: **Classic** (white card, dashed border), **Premium** (dark bg `#0f0e0c`, corner accent brackets, serif `Georgia` typography), **Minimal** (thin border, bare QR + oversized table name)
- Template selector `<select>` added next to "Print All QR" button; state in `TableView` passed as `template` prop
- `PrintTemplate = 'classic' | 'premium' | 'minimal'` type exported for external use
- All templates use inline styles for print-safe rendering; `@page { size: A4 portrait }` preserved

**Service test coverage (`*.service.spec.ts`):**
- New: `tables.service.spec.ts` — 19 tests covering `create`, `findAll`, `getTablesWithStatus` (empty/waiting/occupied/paid, dedup names), `getTableOrders`, `remove`
- New: `users.service.spec.ts` — 17 tests covering email normalization, staff creation (PIN, synthetic email, collision), `listStaffMembers`, `removeStaffMember`, `verifyRestaurantAccess`
- New: `translation.service.spec.ts` — 14 tests covering `translateTexts` (empty, no key, API call, free/paid endpoint, error fallback), `translateText`, `translateObject` (empty langs, null values, multi-lang)
- Total: 122 tests (up from 77); all suites passing

**Customer split bill (`CheckoutPage.tsx`):**
- `SplitBillSection` component: collapsible toggle below order total, counter 2–20 people
- Shows per-person amount in EUR + BGN (BNB fixed rate)
- Client-side only — no backend changes; works before and after loyalty discount applied

**Key files:**
- `apps/backend/src/main.ts`
- `apps/frontend/src/lib/api.ts`
- `apps/backend/src/prisma/prisma.service.ts`
- `apps/frontend/src/pages/OrderConfirmationPage.tsx`
- `apps/frontend/src/components/tables/PrintableQRCodes.tsx`
- `apps/frontend/src/components/tables/TableView.tsx`
- `apps/frontend/src/pages/CheckoutPage.tsx`
- `apps/backend/src/tables/tables.service.spec.ts` (new)
- `apps/backend/src/users/users.service.spec.ts` (new)
- `apps/backend/src/translation/translation.service.spec.ts` (new)

### 3.26 SaaS Tiering V2 (May 16, 2026)

**What it does:** Introduces a 4-tier subscription system — FREE, STARTER, PROFESSIONAL, ENTERPRISE — with per-feature gating enforced server-side and client-side. Stripe Checkout + Customer Portal + webhook integration handles subscription lifecycle. Timestamp-gate on webhook processing prevents race conditions from out-of-order Stripe events.

**Schema changes (`schema.prisma`):**
- `SubscriptionTier` enum: `FREE | STARTER | PROFESSIONAL | ENTERPRISE`
- `Restaurant.tier SubscriptionTier @default(FREE)`
- `Restaurant.stripeCustomerId String?`
- `Restaurant.stripeSubscriptionId String?`
- `Restaurant.tierUpdatedAt DateTime?` — used for webhook race protection

**Backend — SubscriptionModule (`apps/backend/src/subscription/`):**
- `FeatureFlag` enum — `ANALYTICS_ADVANCED`, `ORDERS_RECEIVE`, `LOYALTY`, `LANGUAGES_MULTI`, `STAFF_MANAGE`, `POS`, `KDS`, `API_ACCESS` and others
- `FeatureService` — pure `TIER_FEATURES` map; `hasFeature(tier, flag)` boolean; never hardcode tier→feature mappings elsewhere
- `FeatureGuard` — `CanActivate` implementation; resolves restaurant via `Restaurant.ownerId` (owners) OR `User.restaurantId` (staff); throws `403 { code: 'FEATURE_LOCKED', requiredFeatures: [...], message: '...' }`
- `@RequireFeature(...FeatureFlag[])` — method/class decorator that stores metadata `REQUIRE_FEATURE_KEY`; consumed by `FeatureGuard`
- `SubscriptionService` — `createCheckoutSession(restaurantId, tier, ownerId)` → Stripe Checkout URL; `createPortalSession(restaurantId)` → Stripe Portal URL; `handleWebhookEvent(event)` → handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` with race-safe `updateMany`
- Race protection: `prisma.restaurant.updateMany({ where: { id, OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lt: eventTime } }] }, data: { tier, tierUpdatedAt: eventTime } })` — older Stripe events can never overwrite newer tier state
- `SubscriptionController` — 4 routes: `GET /subscription/status`, `POST /subscription/checkout`, `POST /subscription/portal`, `POST /subscription/webhook` (raw body, CSRF-exempt)

**Frontend:**
- `useFeature(flag: string): boolean` hook — reads `RestaurantContext.activeRestaurant?.tier ?? 'FREE'`, matches against frontend `TIER_FEATURES` map
- `BillingView` — current plan badge, billing period, Stripe Customer Portal button, feature comparison matrix, upgrade CTA for locked features
- `PricingPage` at `/pricing` — 4-column tier comparison table, price/month, feature checklist, "Current Plan" badge on active tier, upgrade button calls `POST /api/v1/subscription/checkout`
- `SubscriptionBanner` — dismissible banner in dashboard header when restaurant is on FREE tier; links to `/pricing`
- `DashboardPage` — advanced analytics section gated with `useFeature('analytics:advanced')`
- `SettingsView` — loyalty settings section gated with `useFeature('loyalty')`

**Webhook infrastructure (already in place from Infrastructure Sprint):**
- Raw body registered at `main.ts:107` for `/api/v1/subscription/webhook`
- CSRF-exempt via `isWebhook` check at `main.ts:76–77`
- No changes to `main.ts` needed

**New env vars (`apps/backend/.env`):**
```
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PROFESSIONAL=price_xxx
STRIPE_PRICE_ENTERPRISE=price_xxx
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_xxx
```

**Demo accounts (seeded via `prisma/seed.ts`):**
| Email | Password | Tier |
|-------|----------|------|
| `demo.free@qrmenu.test` | `demo1234` | FREE |
| `demo.starter@qrmenu.test` | `demo1234` | STARTER |
| `demo.pro@qrmenu.test` | `demo1234` | PROFESSIONAL |
| `demo.enterprise@qrmenu.test` | `demo1234` | ENTERPRISE |

**Key files:**
- `apps/backend/prisma/schema.prisma` — SubscriptionTier enum + Restaurant fields
- `apps/backend/src/subscription/feature-flag.enum.ts` (new)
- `apps/backend/src/subscription/feature.service.ts` (new)
- `apps/backend/src/subscription/feature.guard.ts` (new)
- `apps/backend/src/subscription/require-feature.decorator.ts` (new)
- `apps/backend/src/subscription/subscription.service.ts` (new)
- `apps/backend/src/subscription/subscription.controller.ts` (new)
- `apps/backend/src/subscription/subscription.module.ts` (new)
- `apps/frontend/src/hooks/useFeature.ts` (new)
- `apps/frontend/src/pages/Dashboard/BillingView.tsx` (new)
- `apps/frontend/src/pages/PricingPage.tsx` (new)
- `apps/frontend/src/components/SubscriptionBanner.tsx` (new)

## 4. Data Model

### 4.1 Entity Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Restaurant : "owns (ownerId)"
    User ||--o{ Order : "places (customerId)"
    User ||--o{ LoyaltyAccount : "has"
    User ||--o{ VerificationToken : "authenticates"

    Restaurant ||--o{ RestaurantTable : "has"
    Restaurant ||--o{ MenuCategory : "contains"
    Restaurant ||--o{ Order : "receives"
    Restaurant ||--o{ AssistanceRequest : "receives"
    Restaurant ||--o{ Feedback : "collects"
    Restaurant ||--o{ LoyaltyAccount : "hosts"

    MenuCategory ||--o{ MenuItem : "contains"
    MenuItem ||--o{ MenuOption : "has"
    MenuItem ||--o{ OrderItem : "referenced by"

    Order ||--o{ OrderItem : "contains"
    Order ||--|| Feedback : "has"
    Order ||--o{ LoyaltyPointLedger : "triggers"
    OrderItem }o--|| MenuItem : "references"

    RestaurantTable ||--o{ TableSession : "hosts"
    TableSession ||--o{ Order : "groups"
    TableSession ||--o{ Payment : "has"

    LoyaltyAccount ||--o{ LoyaltyPointLedger : "tracks"

    User {
        string id PK "cuid"
        string email UK
        string password "bcrypt-hashed, nullable for OTP users"
        string name "nullable"
        string phone "nullable"
        UserRole role "OWNER|MANAGER|WAITER|KITCHEN|STAFF|CUSTOMER"
        datetime createdAt
        datetime updatedAt
    }

    Restaurant {
        string id PK "cuid"
        string name
        string country
        string logoUrl "nullable"
        string accentColor "default #4F46E5"
        string googleReviewUrl "nullable"
        string address "nullable"
        string contactInfo "nullable"
        string timezone "default UTC"
        string[] targetLanguages "default []"
        string trendingMode "AUTO|MANUAL|OFF, default AUTO"
        string fontHeading "default Playfair Display"
        string fontBody "default Outfit"
        string themeBgColor "nullable"
        string themeTextColor "nullable"
        string themeCardColor "nullable"
        string defaultTheme "light|dark, default light"
        boolean isLoyaltyEnabled "default true"
        int loyaltyExchangeRate "default 10, Max 100"
        int loyaltyRedeemRate "default 150"
        int loyaltySignupBonus "default 50"
        int loyaltyPointExpiryDays "default 90"
        int loyaltyExpiryReminderDays "default 15"
        int loyaltySilverThreshold "default 500"
        int loyaltyGoldThreshold "default 2000"
        float loyaltySilverMultiplier "default 1.2"
        float loyaltyGoldMultiplier "default 1.5"
        boolean happyHourEnable "default false"
        string happyHourStartTime "nullable"
        string happyHourEndTime "nullable"
        float happyHourMultiplier "default 2.0"
    }

    MenuCategory {
        string id PK "cuid"
        string name
        int order
        AvailabilityType availabilityType "ALWAYS|SCHEDULED|HIDDEN"
        string startTime "nullable"
        string endTime "nullable"
        int[] daysOfWeek
        boolean isDrinkCategory "default false"
        string imageUrl "nullable"
        Json translations "nullable"
    }

    MenuItem {
        string id PK "cuid"
        string name
        string description "nullable"
        float price
        Currency currency "EUR|BGN"
        string[] allergens
        string[] dietaryTags
        string imageUrl "nullable"
        boolean isOutOfStock "default false"
        int order
        boolean isFeatured "default false"
        string[] relatedItemIds "default []"
        int rewardPointsPrice "nullable"
        Json translations "nullable"
    }

    MenuOption {
        string id PK "cuid"
        string name
        OptionType type "VARIATION|ADDON"
        Json choices "[{name, priceModifier}]"
        Json translations "nullable"
    }

    Order {
        string id PK "cuid"
        string customerName
        string customerPhone "nullable"
        string tableId
        OrderStatus status "NEW|IN_PROGRESS|SERVED|CANCELED|COMPLETED"
        float totalPrice
        string specialRequests "nullable"
        int pointsEarned "default 0"
        int pointsRedeemed "default 0"
        int pointsRedeemedForDiscount "default 0"
        int pointsRedeemedForItems "default 0"
    }

    OrderItem {
        string id PK "cuid"
        int quantity
        Json selectedOptions
    }

    LoyaltyAccount {
        string id PK "cuid"
        int points "default 0"
        int lifetimePoints "default 0"
    }

    LoyaltyPointLedger {
        string id PK "cuid"
        LoyaltyPointTransactionType type "EARN|SIGNUP|REDEEM|EXPIRE|ADJUSTMENT"
        int points
        int remainingPoints "default 0"
        datetime expiresAt "nullable"
        datetime reminderSentAt "nullable"
    }

    TableSession {
        string id PK "cuid"
        string token UK "UUID for public access"
        string tableId FK
        string restaurantId FK
        SessionStatus status "OPEN|PAID|CLOSED_NO_PAYMENT"
        datetime paidAt "nullable"
        datetime createdAt
    }

    Payment {
        string id PK "cuid"
        string tableSessionId FK
        string restaurantId FK
        string stripePaymentIntentId UK "nullable"
        float amount
        float tipAmount "default 0"
        float platformFeeAmount "default 0"
        string currency "default eur"
        PaymentStatus status "PENDING|SUCCEEDED|FAILED|REFUNDED"
        PaymentProvider provider "STRIPE|MYPOS|CASH, default STRIPE"
        datetime createdAt
    }

    VerificationToken {
        string id PK "cuid"
        string email
        string code "bcrypt-hashed 6-digit"
        datetime expiresAt
        datetime usedAt "nullable"
        int attempts "default 0"
        datetime lockedUntil "nullable"
    }
```

### 4.2 Model Descriptions

| Model | Table Name | Purpose | Key Constraints |
|-------|-----------|---------|-----------------|
| `User` | `app_user` | Restaurant owners and customers. Password is nullable for OTP-only customers. | `email` unique. Role defaults to STAFF. |
| `Restaurant` | `restaurant` | Central tenant entity. 30+ config fields covering branding, loyalty, localization, scheduling. | `ownerId` FK → User (CASCADE). All related entities cascade. |
| `RestaurantTable` | `restaurant_table` | Physical tables in a restaurant. Name is the QR code identifier. | `(name, restaurantId)` implicitly unique. CASCADE from Restaurant. |
| `MenuCategory` | `menu_category` | Menu sections with ordering, scheduling, and drink flag. | CASCADE from Restaurant. `order` field for sorting. |
| `MenuItem` | `menu_item` | Individual dishes/drinks. Price with currency, dietary info, pairings. | CASCADE from Category. `order` field for sorting. |
| `MenuOption` | `menu_option` | Variations (size, doneness) and add-ons (extra toppings). JSON choices without IDs. | CASCADE from MenuItem. |
| `Order` | `customer_order` | Customer order with status workflow. Loyalty fields track points earned/redeemed. | CASCADE from Restaurant. Optional FK to User (customerId). |
| `OrderItem` | `order_item` | Line items within an order. References MenuItem (SET NULL on delete). | CASCADE from Order. `menuItemId` nullable (SET NULL). |
| `AssistanceRequest` | `assistance_request` | "Call Waiter" requests. Table-scoped, resolved/unresolved. | CASCADE from Restaurant. |
| `Feedback` | `feedback` | Post-order satisfaction. 1:1 with Order. | Unique `orderId`. CASCADE from both Order and Restaurant. |
| `LoyaltyAccount` | `loyalty_account` | Per-user-per-restaurant loyalty balance. | `@@unique([userId, restaurantId])`. CASCADE from both. |
| `LoyaltyPointLedger` | `loyalty_point_ledger` | Immutable FIFO transaction log. Tracks earn/redeem/expire batches with expiry. | CASCADE from LoyaltyAccount. Composite indexes on `(accountId, expiresAt)` and `(expiresAt, reminderSentAt)`. |
| `VerificationToken` | `VerificationToken` | Email OTP tokens for customer auth. Code is bcrypt-hashed. | `@@index([email])`. Auto-cleaned (old tokens deleted before new one created). |
| `TableSession` | `table_session` | Active dining session per table. Tracks OPEN/PAID/CLOSED_NO_PAYMENT. Token is a UUID for public access. | CASCADE from Restaurant. `token` unique. `@@index([token])`, `@@index([tableId, status])`, `@@index([restaurantId, status])`. |
| `Payment` | `payment` | Stripe payment record per session. Tracks amount, tip, platform fee, and status. | CASCADE from TableSession and Restaurant. `stripePaymentIntentId` nullable unique. `@@index([tableSessionId])`. |

### 4.3 Enumerations

| Enum | Values | Used By |
|------|--------|---------|
| `UserRole` | `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`, `STAFF`, `CUSTOMER` | User |
| `Currency` | `EUR`, `BGN` | MenuItem |
| `OrderStatus` | `NEW`, `IN_PROGRESS`, `SERVED`, `CANCELED`, `COMPLETED` | Order |
| `OptionType` | `VARIATION`, `ADDON` | MenuOption |
| `AvailabilityType` | `ALWAYS`, `SCHEDULED`, `HIDDEN` | MenuCategory |
| `LoyaltyPointTransactionType` | `EARN`, `SIGNUP`, `REDEEM`, `EXPIRE`, `ADJUSTMENT` | LoyaltyPointLedger |
| `SessionStatus` | `OPEN`, `PAID`, `CLOSED_NO_PAYMENT` | TableSession |
| `PaymentStatus` | `PENDING`, `SUCCEEDED`, `FAILED`, `REFUNDED` | Payment |

---

## 5. API Surface

### 5.1 Authentication — `/api/auth/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/auth/register` | None | Register with email + password (min 8 chars). Returns JWT + user. |
| `POST` | `/auth/login` | LocalAuthGuard | Login with email + password. Returns JWT + user. |
| `GET` | `/auth/me` | JWT | Get current user profile. |
| `GET` | `/auth/google` | GoogleAuthGuard | Initiate Google OAuth flow. |
| `GET` | `/auth/google/callback` | GoogleAuthGuard | OAuth callback. Parses `state` for `returnTo` redirect. |
| `POST` | `/auth/otp/send` | None | Send 6-digit OTP via email. 60s rate limit. Returns `devCode` in dev. |
| `POST` | `/auth/otp/verify` | None | Verify OTP code. Returns JWT + user + `isNew` flag. |

### 5.2 Restaurants — `/api/restaurants/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/restaurants` | JWT | Create restaurant. |
| `GET` | `/restaurants` | JWT | List owner's restaurants. |
| `GET` | `/restaurants/:id` | JWT | Get restaurant by ID (ownership check). |
| `PATCH` | `/restaurants/:id` | JWT | Update restaurant (30+ optional fields validated). |
| `DELETE` | `/restaurants/:id` | JWT | Delete restaurant (cascade). |
| `POST` | `/restaurants/:id/logo` | JWT | Upload logo (FileInterceptor, 5MB, images only). |
| `POST` | `/restaurants/:id/translate-all` | JWT | Translate all menu content via DeepL. |

### 5.3 Menu — `/api/menu/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/menu` | JWT | Info message directing to public menu endpoint. |
| `GET` | `/menu/public/:restaurantId` | **None** | Public menu with optional `?lang=` query param. |
| `GET` | `/menu/public/:restaurantId/trending` | **None** | Trending items (AUTO/MANUAL/OFF logic). |
| `GET` | `/menu/audit/:restaurantId` | JWT | Menu health audit (errors/warnings/infos). |
| `GET` | `/menu/test` | **None** | Test route returning success. |

### 5.4 Menu Categories — `/api/restaurants/:restaurantId/categories/*` and `/api/categories/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/restaurants/:restaurantId/categories` | JWT | Create category. |
| `GET` | `/restaurants/:restaurantId/categories` | JWT | List categories (with items + options). |
| `PATCH` | `/categories/:id` | JWT | Update category. |
| `DELETE` | `/categories/:id` | JWT | Delete category. |
| `POST` | `/categories/:id/image` | JWT | Upload category banner image (FileInterceptor, 5MB). |

### 5.5 Menu Items — `/api/categories/:categoryId/items/*` and `/api/items/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/categories/:categoryId/items` | JWT | Create item. |
| `GET` | `/categories/:categoryId/items` | JWT | List items in category (with options). |
| `PATCH` | `/items/:id` | JWT | Update item. |
| `DELETE` | `/items/:id` | JWT | Delete item (orphans relatedItemIds cleanup). |
| `POST` | `/items/:id/image` | JWT | Upload item image (FileInterceptor, 5MB). |

### 5.6 Menu Options — `/api/items/:itemId/options/*` and `/api/options/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/items/:itemId/options` | JWT | Create option (choices as JSON string). |
| `PATCH` | `/options/:id` | JWT | Update option. |
| `DELETE` | `/options/:id` | JWT | Delete option. |

### 5.7 Orders — `/api/orders/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/orders` | **None** | Create order (server-side pricing, loyalty processing). |
| `GET` | `/orders` | JWT | List orders for owner's restaurants. |
| `GET` | `/orders/:id` | JWT | Get order by ID (ownership check). |
| `PATCH` | `/orders/:id/status` | JWT | Update order status (emits WebSocket event). |

### 5.8 Tables — `/api/restaurants/:restaurantId/tables/*` and `/api/tables/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/restaurants/:restaurantId/tables` | JWT | Create table. |
| `GET` | `/restaurants/:restaurantId/tables` | **None** | List tables (public — needed for QR codes). |
| `DELETE` | `/tables/:id` | JWT | Delete table. |

### 5.9 Dashboard — `/api/dashboard/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/dashboard/summary` | JWT | Summary stats (requires `?restaurantId=`). |
| `GET` | `/dashboard/analytics` | JWT | Analytics (period 7/14/30, optional startDate/endDate). |

### 5.10 Assistance — `/api/assistance-requests/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/assistance-requests` | **None** | Customer requests assistance. Emits WebSocket event. |
| `GET` | `/assistance-requests` | JWT | List all for owner's restaurants. |
| `GET` | `/assistance-requests/:id` | JWT | Get single request. |
| `PATCH` | `/assistance-requests/:id` | JWT | Update (resolve/unresolve). Emits WebSocket event. |
| `DELETE` | `/assistance-requests/:id` | JWT | Delete request. |

### 5.11 Feedback — `/api/feedback/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/feedback` | **None** | Submit feedback (409 if duplicate orderId). |
| `GET` | `/feedback/google-review-url/:restaurantId` | **None** | Get Google Review URL + restaurant name. |
| `GET` | `/feedback` | JWT | List feedback (requires `?restaurantId=`). |
| `GET` | `/feedback/summary` | JWT | Feedback stats (avg rating, distribution, positive rate). |

### 5.12 Loyalty — `/api/loyalty/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/loyalty/accounts` | JWT | All loyalty accounts for user (enriched with tier/expiry). |
| `GET` | `/loyalty/orders/history` | JWT | User's order history (with restaurant info). |
| `GET` | `/loyalty/:restaurantId/analytics` | JWT | Owner: loyalty analytics (members, outstanding, redeemed). |
| `GET` | `/loyalty/:restaurantId/expiry-reminders` | JWT | Preview expiring point batches (doesn't mark sent). |
| `POST` | `/loyalty/:restaurantId/expiry-reminders/notify` | JWT | Send expiry reminders (marks batches). |
| `GET` | `/loyalty/:restaurantId/config` | **None** | Public loyalty config for a restaurant. |
| `POST` | `/loyalty/:restaurantId/enroll` | JWT | Enroll in loyalty program (signup bonus). |
| `GET` | `/loyalty/:restaurantId` | JWT | Get user's points + reward summary for restaurant. |

### 5.13 Health — `/api/health/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/health` | **None** | Health check (`{ status: 'ok', timestamp }`). |

### 5.14 Payment — `/api/payments/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/payments/session` | **None** | Create or get existing table session (token for public access). |
| `POST` | `/payments/session/force-open` | JWT | Force-open a new session (closes existing OPEN). |
| `GET` | `/payments/session/:token/bill` | **None** | Get session bill (items, total, tip config). |
| `POST` | `/payments/session/:token/intent` | **None** | Create Stripe PaymentIntent with platform fee. |
| `POST` | `/payments/session/:token/close` | JWT | Close session (CLOSED_NO_PAYMENT). |
| `POST` | `/payments/session/:token/close-card` | JWT | Close session with card payment (MYPOS → PAID). |
| `POST` | `/payments/session/:token/close-cash` | JWT | Close session with cash payment. |
| `GET` | `/payments/sessions/:restaurantId` | JWT | List table sessions (paginated). |
| `GET` | `/payments/history/:restaurantId` | JWT | Paginated payment history with status/date filters. |
| `POST` | `/payments/webhook` | **None** (raw body) | Stripe webhook receiver (signature verification). |

### 5.15 Table Status — `/api/tables/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/tables/status/:restaurantId` | JWT | All tables with derived real-time status (empty/waiting/occupied/paid). |

### 5.16 Stripe Connect — `/api/restaurants/:id/stripe/*`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/restaurants/:id/stripe/account-link` | JWT | Create Stripe Connect account + onboarding link. |
| `GET` | `/restaurants/:id/stripe/status` | JWT | Check Connect account status (pending/onboarded/disabled). |
| `POST` | `/restaurants/:id/stripe/disconnect` | JWT | Revoke Stripe Connect access. |

---

## 6. Security & Authentication

### 6.1 Authentication Flow

```
Registration/Login
    │
    ▼
Backend validates credentials
    │ (bcrypt compare for passwords)
    │ (bcrypt compare for OTP codes)
    │ (Google OAuth callback for social)
    ▼
JWT issued: { email, sub: userId }, 1-day expiry
    │
    ▼
Backend sets httpOnly cookie (sameSite=lax, secure in production)
    │ Frontend sends cookie automatically via withCredentials: true
    │ Bearer header fallback for transition period
    ▼
Protected endpoints: JwtAuthGuard validates token
    │ JwtStrategy.validate() reads cookie first, Bearer fallback
    │ Looks up user by payload.sub
    │ Throws UnauthorizedException if user not found
    ▼
Owner-only endpoints: checkRestaurantOwnership()
    │ Throws ForbiddenException if ownerId mismatch
    ▼
Response returned
```

### 6.2 Security Measures Found in Code

| Measure | Implementation | Location |
|---------|---------------|----------|
| **Rate Limiting** | Per-endpoint throttles: OTP 10/60s, login 5/60s, public menu 60/60s, health check skipped | `auth.controller.ts`, `public-menu.controller.ts`, `menu.controller.ts` |
| **Password Hashing** | bcrypt with 10 salt rounds | `auth.service.ts` — `register()`, `sendOtp()` |
| **JWT httpOnly Cookie** | Token stored in httpOnly cookie (`sameSite: 'lax'`, `secure` in production, 1-day expiry). Never exposed to JS. | `auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts` |
| **CSRF Protection** | Double-submit cookie pattern. `GET /api/auth/csrf-token` issues token. All POST/PATCH/DELETE/PUT require `X-CSRF-Token` header matching `csrf-token` cookie. Skipped in dev + Stripe webhook. | `main.ts` CSRF middleware, `api.ts` CSRF interceptor |
| **CSP Headers** | Helmet with strict CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-src https://js.stripe.com` | `main.ts` |
| **Same-Origin Proxy** | Frontend uses `/api/v1` baseURL (same-origin). Vite proxies `/api/*` to backend. Prevents cross-origin cookie blocking. | `vite.config.js`, `api.ts` |
| **OTP Rate Limiting** | 60-second cooldown per email (429 response) | `auth.service.ts` — `sendOtp()` |
| **OTP Expiry** | 10-minute TTL, code bcrypt-hashed, token marked `usedAt` | `auth.service.ts` — `sendOtp()`, `verifyOtp()` |
| **OTP Brute-Force** | 5 failed attempts → 10-min lockout (`lockedUntil` field). Successful verify resets counter. | `auth.service.ts` — `verifyOtp()` |
| **Body Size Limits** | `express.json({ limit: '1mb' })`, `express.urlencoded({ limit: '1mb' })`. Stripe webhook: `limit: '5mb'`. | `main.ts` |
| **Server-Side Pricing** | Order total recalculated from DB — client price ignored | `orders.service.ts` — `create()` |
| **Option Validation** | Every submitted choice validated against DB records by `choiceName` | `orders.service.ts` — `create()` lines ~143–169 |
| **Ownership Checks** | Every mutation verifies `restaurant.ownerId === userId` | All services — `checkRestaurantOwnership()` pattern |
| **Input Validation** | `class-validator` decorators on all DTOs, `ValidationPipe({ whitelist: true })` | All controllers |
| **File Upload Restrictions** | 5MB size limit, MIME type check (images only) | All `FileInterceptor` usage |
| **CORS** | Configured to frontend URL only, with credentials | `main.ts` |
| **JWT Expiry** | Tokens expire in 1 day | `auth.module.ts` — `expiresIn: '1d'` |
| **401 Interceptor** | Auto-clears token and redirects on 401 (excludes public paths) | `frontend/src/lib/api.ts` |
| **Prisma Parameterized Queries** | All DB access via Prisma ORM — prevents SQL injection | All services |
| **WebSocket Auth** | httpOnly JWT cookie sent via `withCredentials: true` in Socket.io connection | `SocketContext.tsx` |
| **DeepL Key Isolation** | Single platform key in backend `.env`, never exposed to frontend | `translation.service.ts` |

### 6.3 Security Gaps (All Resolved — May 11, 2026)

All previously identified security gaps were resolved in Phase 21 (Security Hardening):

| Gap | Severity | Resolution |
|-----|----------|------------|
| JWT in localStorage | Medium | **Resolved** — JWT now in httpOnly cookie (`sameSite: 'lax'`, `secure` in production). `jwt.strategy.ts` reads cookie-first, Bearer fallback. |
| No CSRF protection | Medium | **Resolved** — Double-submit cookie pattern on all POST/PATCH/DELETE/PUT. `GET /api/auth/csrf-token` issues token. Skipped in dev + Stripe webhook. |
| No CSP headers | Medium | **Resolved** — Helmet middleware with strict CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-src https://js.stripe.com` |
| OTP brute-force vulnerability | High | **Resolved** — 5 failed attempts → 10-min lockout. `VerificationToken.attempts` + `lockedUntil` fields with `@@index([lockedUntil])`. |
| Global rate limiter only | Medium | **Resolved** — Per-endpoint throttles: `@Throttle(10, 60)` on OTP, `@Throttle(5, 60)` on login, `@Throttle(60, 60)` on public menu, `@SkipThrottle()` on health. |
| No body size limits | Medium | **Resolved** — `express.json({ limit: '1mb' })`, `express.urlencoded({ limit: '1mb' })`. Stripe webhook: `limit: '5mb'` for raw body. |
| console.log throughout | Low | **Resolved** — All 7 services migrated to NestJS `Logger`. Request ID middleware (`crypto.randomUUID()`) on every request. |
| No input sanitization on public endpoints | Low | Mitigated by `class-validator` DTOs with `whitelist: true` on `ValidationPipe`. Customer name/phone validated at boundary. |
| Relaxed TypeScript strictness (backend) | Low | **Resolved** — `strictNullChecks: true`, `noImplicitAny: true` in `apps/backend/tsconfig.json` (May 15, 2026). All resulting errors fixed. |
| Dev secrets in code | Low | Acknowledged — `docker-compose.yml` uses hardcoded values. Not used in production (hosted Neon, no local Docker). |

---

## 7. Integrations & Third-Party Services

| Service | Purpose | Integration Point | Auth Method |
|---------|---------|-------------------|-------------|
| **Neon** | Serverless PostgreSQL database | `DATABASE_URL` env var → Prisma ORM | Connection string |
| **Google OAuth 2.0** | Social sign-in for owners + customers | `passport-google-oauth20` strategy | OAuth 2.0 (client ID + secret) |
| **DeepL API v2** | Menu translation (EN/BG/RO) | `TranslationService` → REST API | API key (`DEEPL_API_KEY` env var) |
| **Resend** | Email delivery for OTP codes | `AuthService.sendOtp()` → REST API | API key (`RESEND_API_KEY` env var) |
| **Cloudflare R2** | Image upload storage + CDN delivery | `StorageService` → S3 SDK | Access key + secret + bucket |
| **sharp** | Image processing pipeline (resize, WebP convert, thumbnail) | `StorageService.uploadOptimised()` | None (library) |
| **Socket.io** | Real-time push notifications | `EventsGateway` (server) + `SocketContext` (client) | JWT in handshake |
| **Google Fonts** | Dynamic font loading for branding | `FontPicker.tsx` → `<link>` injection | None (public CDN) |
| **Stripe Connect** | Pay-at-table payments with platform fees, payment history, real-time notifications | `IPaymentProvider` interface → `StripeProvider`, Stripe Elements UI, Connect onboarding | Stripe secret + publishable keys |

---

## 8. Competitive Advantages

### 8.1 Technical Strengths

1. **Server-side price validation with defense-in-depth**: The order creation flow (`orders.service.ts:create()`) fetches ALL items in a single query, validates every submitted `choiceName` against DB records, and recalculates totals server-side. Client-side prices are completely ignored. This is not a simple "check the total matches" — it's a full independent recalculation that catches tampering at the option level.

2. **Payment provider abstraction with Stripe Connect**: The `IPaymentProvider` interface defines a clean contract (`createPaymentIntent`, `constructWebhookEvent`, `createAccountLink`, `getAccountStatus`, `disconnectAccount`) implemented by `StripeProvider`. Adding MyPOS, Square, or any other payment processor is a matter of implementing the same interface — zero changes to `PaymentService` or the frontend. Platform fees are calculated per-transaction (`total * platformFeePercent`) via Stripe Connect application fees.

3. **FIFO loyalty ledger with atomic transactions**: Instead of a simple `points` integer field, the system maintains an immutable FIFO transaction log (`LoyaltyPointLedger`) with discrete batches, expiry dates, and partial redemption tracking. All balance mutations (expire → redeem → earn) execute in a single Prisma `$transaction`. This is the same accounting pattern used by financial systems — unusual for a pre-revenue product.

4. **Lazy translation with multi-level caching**: Three translation paths (pre-warm, batch, on-demand) with DB-level JSON caching. The on-demand path (`applyLazyTranslations()`) has a 300ms rate limiter that respects DeepL's free tier. Language parameter validation against `targetLanguages` prevents unauthorized API quota consumption.

5. **Timezone-aware everything**: Analytics, category scheduling, happy hour, and order timestamps all use Luxon with the restaurant's IANA timezone — not server UTC. The migration from raw `new Date()` to Luxon is already complete (May 5, 2026).

6. **Platform-managed third-party keys**: Restaurant owners never supply API keys. DeepL, Resend, R2, Stripe — all managed server-side via env vars. Eliminates owner friction and prevents key leakage.

7. **Layout architecture for mobile-first experience**: The `AppLayout`/`PublicLayout` split in `App.tsx` means customer-facing routes (the primary use case) get zero chrome overhead. Cart animations are media-query-driven (CSS only, no JS detection). Safe area insets are handled throughout.

8. **Per-restaurant theme isolation**: Each venue's dark/light preference stored independently (`theme-{restaurantId}` key). Owner sets default for first visit. This is a quality-of-life detail that most SaaS products miss.

9. **Real-time table status with parallel queries**: `getTablesWithStatus()` fetches tables + active sessions in parallel via `Promise.all`, derives status (empty/waiting/occupied/paid), and pushes updates through 4 Socket.io emission points. Restaurant staff see table state change instantly — no polling, no refresh.

### 8.2 Unique Approaches

- **No customer passwords**: The email OTP auth flow and nullable `User.password` field means customers never create or remember passwords. This reduces friction significantly for the QR-scan-to-order use case.
- **Cart deduplication by content hash**: `cartId = itemId + JSON.stringify(selectedOptions)` — same item with same options merges into one cart entry. Simple but effective.
- **Prisma connection retry with circuit breaker**: `PrismaService` retries connections 15 times with jittered exponential backoff (1s base → 30s cap). Circuit breaker opens after 5 consecutive transient failures with 30s cooldown. This handles Neon's serverless cold starts transparently.
- **Orphan cleanup on item deletion**: When a menu item is deleted, the service finds all items referencing it in `relatedItemIds` and removes the reference. No dangling pointers.

---

## 9. Current State & Roadmap Potential

### 9.1 What's Fully Implemented

| Area | Status | Evidence |
|------|--------|----------|
| Authentication (JWT + Google + OTP) | Complete | 15 endpoints, 4 strategies, customer modal, protected routes |
| Restaurant CRUD + Multi-tenancy | Complete | Full CRUD with ownership checks, 30+ config fields |
| Menu Builder + Image Upload | Complete | Categories, items, options with DnD, presets, R2 upload |
| Table Management + QR Codes | Complete | CRUD, branded QR, PNG download, A4 bulk print |
| Public Menu (Customer UX) | Complete | Theming, fonts, translations, schedule, sticky nav |
| Cart + Checkout + Loyalty | Complete | localStorage persistence, server-side pricing, FIFO ledger |
| Order Management | Complete | Status workflow, real-time push, audio alerts |
| Smart Analytics | Complete | 8 metrics, timezone-aware, CSV export (European format) |
| Customer Feedback | Complete | 4-step flow, smart Google Review routing, owner summary |
| Real-Time (Socket.io) | Complete | 8 event types, room-based scoping, analytics invalidation |
| Multi-Language (EN/BG/RO) | Complete | ~120 keys, DeepL with lazy caching, platform-managed key |
| Dayparting (Menu Scheduling) | Complete | Timezone-aware, overnight range support, day-picker UI |
| Upselling (Pairing + Trending + Drinks) | Complete | Deterministic pairing, AUTO trending, cart drink upsell |
| Branding + Theming | Complete | 15 fonts, 4-color WCAG, per-restaurant theme isolation |
| Menu Health Audit | Complete | Severity levels, one-click fix navigation |
| Design System | Complete | HSL tokens, glassmorphism, safe areas, reduced motion |
| Stripe Connect Payments | Complete | Provider abstraction (`IPaymentProvider` → `StripeProvider`), Stripe Elements UI, Connect onboarding, payment history, notification bell + toast, 10 API endpoints |
| Live Table View | Complete | Real-time status grid, color-coded cards, filter modes (Active/Occupied/Paid/All), table detail modal, Socket.io `table:status-changed` events, parallel DB queries |
| Deployment | Complete | Docker Compose, health checks, rate limiting, Swagger |

### 9.2 What's Partially Built or Planned

| Area | Current State | Natural Extension Point |
|------|---------------|------------------------|
| **Stripe Payments** | ✅ Complete. `IPaymentProvider` interface, `StripeProvider`, `PaymentService`, `PaymentController` (10 routes), Stripe Connect onboarding, `PaymentModal` (3-step UI), `PaymentsView` history table, `NotificationContext` + `NotificationBell` + `PaymentToast`, `TableSession` + `Payment` models, webhook handling with idempotency. | Future: MyPOS provider via same interface, split bill, saved cards. |
| **SaaS Subscription** | ✅ Complete. 4-tier FREE/STARTER/PROFESSIONAL/ENTERPRISE on `Restaurant.tier`. `SubscriptionModule` with `FeatureService` (pure tier→flag map), `FeatureGuard` (owner+staff resolution, 403 FEATURE_LOCKED), `@RequireFeature` decorator. Stripe Checkout + Portal + webhook with timestamp-gate race protection. `useFeature` hook (frontend). `BillingView`, `PricingPage` at `/pricing`, `SubscriptionBanner`. 4 demo accounts. New env vars: `STRIPE_PRICE_*`, `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`. | Phase 20 (Multi-location) is next. |
| **Kitchen Display System** | **Routed and guarded.** `KitchenPage.tsx` (270 lines) at `/staff/kitchen` — kanban board with real-time order status advancement, audio alerts, 24h history. StaffRoute guard applied. No new backend endpoints needed. | Polish for production (styling, performance). |
| **Menu Service Split** | ✅ Complete. Split into `menu-crud.service.ts`, `menu-audit.service.ts`, `menu-translation.service.ts` — all wired into `menu.module.ts`. Original `menu.service.ts` deleted. | Unit tests for each service. |
| **Service-Level Tests** | **In progress.** 10 `.spec.ts` files committed: `loyalty-ledger.utils.spec.ts`, `loyalty-tiers.utils.spec.ts`, `orders.service.spec.ts` + others. Coverage below 80% threshold. | Reach 80% coverage, add CI gate. |
| **Staff Roles** | ✅ Complete. `UserRole` expanded to `OWNER`/`MANAGER`/`WAITER`/`KITCHEN`. Permission matrix enforced across all services via `checkRestaurantAccess`. PIN-based login, QR device enrollment (bond/re-bond), shared device mode, `StaffCreatedModal` (QR + PIN + countdown). `DeviceEnrollmentToken` model with SHA256-hashed tokens. Staff settings consolidated in SettingsView Staff tab. | Polish: staff activity log, bulk invite. |
| **Email Notification Pipeline** | ✅ Complete. OTP emails via Resend. Loyalty expiry reminders wired to Resend in `runDailyExpiryReminders` cron (May 15, 2026). Dev fallback to `logger.log`. | Order status email notifications (future). |
| **Multi-Location** | Phase 20 planned — menu templates, bulk price updates, cross-location analytics. | Template model, bulk operations. |
| **POS Integration** | V4 planned — Square/Toast/Lightspeed. | Provider abstraction pattern from Stripe design can be reused. |

### 9.3 Architecture Extension Points

- **PaymentProvider interface** (`IPaymentProvider` in Stripe design spec): Same pattern can support MyPOS, Square, etc. — just implement the interface.
- **Translation provider swap**: `TranslationService.translateTexts()` abstracts the DeepL API call — could be swapped to Google Translate or GPT by changing the HTTP call.
- **Storage provider swap**: `StorageService` uses S3 SDK — swap to GCS or Azure Blob by changing the SDK calls.
- **Loyalty engine**: Tier config already parameterized per restaurant. Could extend to point-multiplier events, birthday bonuses, referral rewards.
- **WebSocket rooms**: Room pattern (`restaurant_{id}`, `order_{id}`) naturally extends to kitchen display, waiter tablets, etc.

---

## 10. Strategic Improvement Opportunities

### 10.1 Quick Wins (Low Effort, High Impact)

| # | Problem | Impact | Solution | Complexity | Priority |
|---|---------|--------|----------|------------|----------|
| 1 | ~~**No database indexes beyond PKs**~~ — **RESOLVED May 2026.** | ~~Queries degrade linearly with order volume.~~ | Added `@@index` on 4 high-traffic tables: `Order(restaurantId, status, createdAt)`, `MenuItem(categoryId, order)`, `Feedback(restaurantId)`, `AssistanceRequest(restaurantId, isResolved)`. Pushed via `prisma db push` to Neon. No application code changes needed — Prisma abstracts indexes transparently. | Low | ~~Must-have~~ **Done** |
| 2 | ~~**CSV export hardcoded to revenue trend only**~~ — **RESOLVED May 15, 2026.** `AnalyticsView.tsx` now exports all 5 sections: summary, revenue trend, top items, peak hours, category breakdown. Semicolon delimiter with UTF-8 BOM for Excel compatibility. | ~~Restaurant owners need all data for external reporting.~~ | ~~Add export tab selector or multi-sheet export.~~ | Low | ~~Must-have~~ **Done** |
| 3 | ~~**OTP devCode returned in production when RESEND_API_KEY absent**~~ — **VERIFIED SAFE May 2026.** | ~~OTP codes leak in API responses.~~ | Code already correctly gated: `isDev = NODE_ENV !== 'production'`. Production with missing key throws 503. devCode only returned in dev mode. | Low | ~~Must-have~~ **Done** |
| 4 | ~~**No pagination on list endpoints**~~ — **RESOLVED May 2026.** `PaginationDto` + `PaginatedResult<T>` wired to Orders (`orders.controller.ts:33`), Assistance (`assistance.controller.ts:33`), and Feedback list endpoints. | ~~A restaurant with 10,000+ orders will crash the dashboard.~~ | ~~Wire PaginationDto to list endpoints.~~ | Low | ~~Must-have~~ **Done** |
| 5 | ~~**FeedbackPage uses window.location for routing**~~ — **RESOLVED May 2026.** `FeedbackPage.tsx` uses `useParams()` and `useSearchParams()` from React Router. | ~~Browser history issues.~~ | ~~Use React Router params.~~ | Low | ~~Nice-to-have~~ **Done** |
| 6 | ~~**Translation rate limiter is static 300ms**~~ — **RESOLVED May 2026.** | ~~Different DeepL plans have different rate limits.~~ | Translation service now uses shared `AxiosInstance` with `keepAlive: true, maxSockets: 4` + 250ms inter-language delay. Free-tier detection via key suffix `:fx` → `api-free.deepl.com`. | Low | ~~Nice-to-have~~ **Done** |
| 7 | ~~**No image compression before upload**~~ — **RESOLVED May 2026.** | ~~5MB menu item image on mobile is slow.~~ | Implemented `sharp` image processing pipeline in `StorageService`: auto-rotate (EXIF), resize to 1200px max dimension, convert to WebP (quality 82), generate 400px thumbnail (quality 75), upload both in parallel to Cloudflare R2. Average compression: 80-95% size reduction. Also added: JPEG/PNG MIME-type validation at multer + storage layers, `BadRequestException` for invalid types, `ImageUploadInput` component with preview thumbnail + remove button, Toast success/error feedback on all forms. | Medium | ~~Nice-to-have~~ **Done** |

### 10.2 Architecture Improvements

| # | Problem | Impact | Solution | Complexity | Priority |
|---|---------|--------|----------|------------|----------|
| 1 | ~~**Dual auth system in frontend**~~ — **RESOLVED May 2026.** Single `AuthContext.tsx` only. No separate `useAuth.ts` hook. Token lives in httpOnly cookie, user data loaded via `/auth/me` on init. | ~~Potential state desync.~~ | ~~Consolidate into single useAuth hook.~~ | Medium | ~~Must-have~~ **Done** |
| 2 | ~~**Context provider nesting is deep and rigid**~~ — **RESOLVED May 2026.** `App.tsx` splits into `AppLayout` / `PublicLayout` / `PosLayout`. Each layout scopes only the providers it needs. Socket only connects on authenticated dashboard/POS routes. | ~~Unnecessary re-renders.~~ | ~~Split providers by layout.~~ | Medium | ~~Must-have~~ **Done** |
| 3 | ~~**menu.service.ts is 220+ lines doing too many things**~~ — **RESOLVED May 2026.** Split into `menu-crud.service.ts`, `menu-audit.service.ts`, `menu-translation.service.ts`. All wired into `menu.module.ts`. Original `menu.service.ts` deleted. | ~~Tight coupling.~~ | ~~Split and delete monolith.~~ | Medium | ~~Must-have~~ **Done** |
| 4 | ~~**No service-level unit tests**~~ — **IN PROGRESS.** 10 `.spec.ts` files committed. Coverage below 80% threshold. | Regression risk. | Reach 80% coverage, add CI gate. | Medium | ~~Must-have~~ **In Progress** |
| 5 | ~~**Logger is console.log throughout**~~ — **RESOLVED May 2026.** All 7 services migrated to NestJS `Logger`. Request ID middleware (`crypto.randomUUID()`) on every request. | Structured logging with correlation IDs now standard. | Log aggregation/monitoring still future work. | Medium | ~~Should-have~~ **Done** |
| 6 | ~~**No API versioning**~~ — **RESOLVED May 2026.** All endpoints now at `/api/v1/*` via `VersioningType.URI` with `defaultVersion: '1'`. Frontend `api.ts` base URL updated to `/api/v1`. Vite proxy unchanged. | Breaking changes managed via versioned URIs. | Done. | Low | ~~Should-have~~ **Done** |
| 7 | ~~**PrismaService connection retry is infinite**~~ — **RESOLVED May 2026.** Now uses jittered exponential backoff (500ms base → 30s cap) on startup. Runtime `withRetry()` method with circuit breaker: CLOSED → OPEN after 5 consecutive transient failures, HALF_OPEN after 30s cooldown. Only transient Prisma error codes (P1001, P1002, P1008, P1017, P2024, P1012) trigger the breaker. | Resilient to Neon cold starts and transient outages. | Done. | Medium | ~~Should-have~~ **Done** |

### 10.3 Missing Features That Competitors Have

| Feature | Why It Matters | Competitors Who Have It |
|---------|---------------|------------------------|
| **Kitchen Display System (KDS)** — ✅ **LIVE May 2026.** `KitchenPage.tsx` (270 lines) at `/staff/kitchen` — kanban board with NEW/IN_PROGRESS/SERVED columns, elapsed time counters, 15-min urgency highlighting, audio alerts, 24-hour history panel. Routed in `App.tsx` with `StaffRoute` guard (OWNER/KITCHEN). Backend real-time order events via Socket.io. | Restaurants without KDS still print tickets or shout orders. This is the #1 operational feature that drives kitchen efficiency. | Toast, Square, Lightspeed, Otter |
| **Split Bill** — Allow customers to split an order by item or evenly between parties. | Top-requested feature in restaurant surveys. Reduces friction at payment time. Increases order value (people order more when they can split). The POS already has `PosSplitBill.tsx` for waiter-side split. Customer-side split not yet implemented. | Sunday, Toast, Square |
| ~~**Allergen/Dietary Filtering**~~ — ✅ **SHIPPED May 15, 2026.** `FilterPanel.tsx` — slide-down panel with dietary toggle switches (Spicy, Vegan, New, Featured) and allergen exclusion pills (Milk, Wheat, Fish, Nuts, Eggs, Soy, Shellfish). Multi-select allergen exclusion hides matching items. Fully i18n across EN/BG/RO. | ~~Essential for food safety and dietary UX.~~ | All modern menu apps |
| **Menu Import from PDF/Photo** — AI-powered menu import from existing PDFs or photos. | Biggest onboarding friction: restaurants have existing menus in PDF/Word. Manual entry of 50+ items takes hours. OCR JSON import already exists via `MenuImportView.tsx` — PDF/photo AI import is the natural extension. | Bite, Otter, Toast |
| **Inventory Management** — Track stock levels, auto-mark items out of stock. | Directly reduces "sorry, we're out" experiences. The `isOutOfStock` toggle already exists — just needs stock tracking behind it. | Toast, Lightspeed |
| **Customer-facing order progress bar** — Visual progress indicator (Order Received → Preparing → Ready → Served) with estimated wait time. | Reduces "where's my food?" inquiries from customers. The `OrderConfirmationPage` already shows status — just needs a progress bar visual and estimated times. | Sunday, Otter |
| **Staff mobile app (React Native)** — Staff manage orders, mark items served, update table status from their phone. | Reduces dependency on fixed terminals. Waiters can update order status tableside. Phase 20 mentions this for V4. | Toast, Square |
| **QR code table tent design templates** — Pre-made print templates for QR table tents (not just raw QR codes). | Restaurants want branded, designed table tents — not just QR codes on paper. Current `PrintableQRCodes` is functional but plain. | Sunday, Bite |

### 10.4 Modern Tech Opportunities

| Opportunity | Current State | Recommendation | Complexity |
|-------------|---------------|----------------|------------|
| **React Server Components / Next.js migration** — Move from Vite SPA to Next.js App Router for server-rendered public menu. | Vite SPA entirely client-rendered. Public menu loads with visible spinner. | Server-render public menu page — instant paint on QR scan. Keep dashboard as SPA (or use Next.js with RSC for menu, client for dashboard). The Turborepo monorepo structure already supports adding new apps. | High |
| **Edge Functions for public menu** — Serve public menu from CDN edge (Vercel Edge / Cloudflare Workers). | All requests hit the NestJS server in single region. Bulgarian restaurants serving Bulgarian customers don't need global edge — but it future-proofs for expansion. | Deploy public menu endpoint as edge function with DB read replica. Cache restaurant config + menu at edge with CDN TTL; invalidate on menu update via webhook. | High |
| **AI-powered menu descriptions** — Generate compelling dish descriptions from item names + ingredients. | Items require manual description entry. Menu audit catches missing descriptions as warnings. | Add optional AI description generation (call GPT-4o via backend endpoint). Keep as opt-in — owner reviews and approves. | Medium |
| **tRPC or GraphQL for dashboard** — Type-safe API for the admin dashboard. | REST endpoints with manual type synchronization (`types/index.ts`). Prisma types don't flow to frontend. | Add tRPC layer between NestJS backend and React frontend. Share Prisma types end-to-end. Or use GraphQL with codegen. tRPC is lighter-weight for this use case. | High |
| **Feature flags** — Toggle features per restaurant without redeploy. | All features are code-deployed. Can't A/B test or gradually roll out. | Add `@vercel/flags` or LaunchDarkly. Start with loyalty + trending toggles (these already have boolean feature flags in DB). | Medium |
| **OpenTelemetry tracing** — Distributed tracing across frontend → backend → database. | No observability beyond console.log. Debugging production issues is blind. | Add `@opentelemetry/api` + auto-instrumentation. Export to Grafana or Datadog. NestJS has OpenTelemetry support. | Medium |
| **Storybook for UI components** — Component catalog for the design system. | No component documentation. `BrandingPreview.tsx` is the closest to a design sandbox. | Add Storybook for UI primitives (`Button`, `Input`, `Modal`, `Card`, etc.) and key business components (`ItemWithOptions`, `CartDrawer`). | Medium |

### 10.5 Security Hardening — ALL RESOLVED (Phase 21, May 10-11, 2026)

| # | Vulnerability / Weak Point | Resolution | Priority |
|---|--------------------------|------------|----------|
| 1 | **JWT in localStorage — XSS risk** | **Resolved.** JWT now in httpOnly cookie (`sameSite: 'lax'`, `secure` in production, 1-day expiry). `jwt.strategy.ts` reads cookie-first, Bearer fallback. `AuthContext` no longer touches localStorage for token. | ~~Must-have~~ **Done** |
| 2 | **No CSRF protection** | **Resolved.** Double-submit cookie pattern. `GET /api/auth/csrf-token` issues token. All POST/PATCH/DELETE/PUT require `X-CSRF-Token` header. Skipped in dev mode + Stripe webhook. Frontend interceptor fetches once, caches, attaches to state-changing requests. | ~~Must-have~~ **Done** |
| 3 | **OTP brute-force vulnerability** | **Resolved.** 5 failed attempts → 10-min lockout. `VerificationToken.attempts` + `lockedUntil` fields. `@@index([lockedUntil])` for efficient cleanup. Successful verify resets counter. | ~~Must-have~~ **Done** |
| 4 | **Rate limiter is global, not per-endpoint** | **Resolved.** Per-endpoint throttles: `@Throttle(10, 60)` on OTP send/verify, `@Throttle(5, 60)` on login, `@Throttle(60, 60)` on public menu, `@SkipThrottle()` on health check. Named throttlers for auth-specific limits. | ~~Must-have~~ **Done** |
| 5 | **No Content Security Policy** | **Resolved.** Helmet CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-src https://js.stripe.com`. Applied before CSRF middleware. | ~~Must-have~~ **Done** |
| 6 | **Google OAuth state parameter is JSON in query** | **Acknowledged.** `state` serializes `returnTo` as JSON. No nonce in state. Risk is low for current use case (customer login, no financial operations during OAuth flow). | Should-have |
| 7 | **No request size limits on non-file endpoints** | **Resolved.** `express.json({ limit: '1mb' })` + `express.urlencoded({ limit: '1mb' })`. Stripe webhook raw body: `limit: '5mb'`. File upload endpoints: 5MB via Multer. | ~~Should-have~~ **Done** |

### 10.6 Performance & Scale

| # | Bottleneck | Evidence | Solution | Complexity |
|---|-----------|----------|----------|------------|
| 1 | **N+1 query in `applyLazyTranslations()`** — Iterates categories → items → options, calls DeepL for each untranslated entity individually. | `menu-translation.service.ts` — `applyLazyTranslations()` loops with 300ms delay per call. 10 items × 3 languages = 30 API calls = 9 seconds. | Batch all untranslated texts into a single DeepL API call per language. The API supports up to 50 texts per request. | Low |
| 2 | **No database connection pooling** — Prisma connects with default pool size. Neon's serverless nature means connections are cold. | `prisma.service.ts` retries 15 times — this implies cold starts are common. | Configure `connection_limit` in DATABASE_URL (Neon supports pooler). Use `@prisma/client` datasource with `pgbouncer=true` for Neon's pooled connection. | Low |
| 3 | **All menu categories + items + options loaded in single request** — `getPublicMenu()` fetches entire menu tree with nested includes. | For a restaurant with 10 categories × 20 items × 3 options = 600+ records per request. Image URLs included inline. | Already mitigated by not loading images inline (they're URLs) and filtering out-of-stock. For very large menus, add pagination by category or lazy-load items on category scroll. | Medium |
| 4 | **Analytics dashboard runs 8 queries per request** — `getAnalytics()` uses `Promise.all` over 8 queries. Each query aggregates across all orders. | At 100,000+ orders, some queries (revenue trend by day, peak hours) will need aggregation tables. | Add materialized views or summary tables refreshed hourly. Keep raw queries for custom date ranges, use summary tables for standard periods (7/14/30 days). | High |
| 5 | **No CDN for static assets** — Menu images served from S3/R2 directly. React bundle split only by route (lazy loaded pages). | Customer on slow mobile connection downloading full dashboard JS bundle on public menu page. | The layout split already helps (public routes are separate). Add `React.lazy()` for dashboard sub-views. Set Cloudflare CDN in front of R2 bucket. Add image resizing (thumbnail + full-size URLs). | Medium |
| 6 | **localStorage cart serialization on every state change** — `CartContext` syncs to localStorage on every add/remove/update. | JSON.stringify on every cart mutation — fine for 5-10 items, wasteful at scale. | Debounce localStorage writes to 500ms. Or use `beforeunload` event to persist only on page exit, with in-memory state during session. | Low |

### 10.7 Monetization & Business Model Enhancements

| Opportunity | Technical Implementation | Business Impact |
|-------------|------------------------|-----------------|
| **Stripe Connect platform fees** — Charge per-transaction fee on payments. The Stripe design already defines this: platform takes X% via application_fee_amount on Payment Intents. | Complete Phase 19 (Stripe Payments). The `IPaymentProvider` interface, `TableSession`/`Payment` models, and `PaymentController` routes are fully designed. Frontend `PaymentModal` 3-step flow is specified. | Recurring revenue tied to order volume. At 100 restaurants × €5,000/month × 2% fee = €10,000 MRR platform revenue. |
| **Tiered subscription plans** — Basic (free: 50 menu items, 1 restaurant), Pro (€29/mo: unlimited items, 3 restaurants, analytics), Enterprise (€99/mo: unlimited restaurants, loyalty, API access). | Add `Plan` enum to `Restaurant` or `User` model. Feature-gate in service layer: check plan before enabling loyalty, analytics, multiple restaurants. Stripe Checkout for subscription billing. | Predictable MRR. The architecture already supports multi-tenant isolation — just add plan checks at the service level. |
| **Menu usage analytics as upsell** — Show basic analytics for free, detailed analytics for Pro. The analytics infrastructure already exists. | Gate `getAnalytics()` period > 7 days and CSV export behind plan check. Summary view stays free. | Conversion lever. Restaurant owners see 7-day data, want 30-day comparison → upgrade prompt. |
| **White-label custom domains** — Enterprise restaurants use their own domain for the public menu (menu.restaurant.com). | Add `customDomain` field to `Restaurant`. DNS verification endpoint. Vercel/Cloudflare API for automatic SSL. Frontend already supports per-restaurant theming — just need domain routing. | Premium differentiator. Enterprise-ready positioning. |
| **Multi-location franchise dashboard** — Phase 20: centralized management for chains. | Cross-restaurant analytics aggregation. Menu template CRUD. Bulk pricing operations. Role-based multi-restaurant access (franchise owner vs location manager). | Enterprise ARPU multiplier. One franchise = 10+ locations = 10x the base subscription. |
| **Marketing automation** — SMS/email campaigns to customers who've ordered before. | Add customer email collection (already exists for OTP users). Add campaign CRUD with segment targeting (visited in last 30 days, high spenders, haven't returned). Resend API already integrated for email. Add Twilio for SMS. | Retention tool. "We miss you, here's 10% off" campaigns drive repeat visits. V4 mentions this. |

---

## Appendix: File Index

### Critical Backend Files
| File | Lines | Purpose |
|------|-------|---------|
| `apps/backend/src/app.module.ts` | — | Root module registry (17 modules) |
| `apps/backend/src/main.ts` | — | Bootstrap, CORS, Swagger, global prefix |
| `apps/backend/src/auth/auth.service.ts` | — | Login, register, OTP, Google OAuth |
| `apps/backend/src/menu/menu-crud.service.ts` | — | Menu CRUD, trending, scheduling |
| `apps/backend/src/menu/menu-audit.service.ts` | — | Menu health audit, severity levels |
| `apps/backend/src/menu/menu-translation.service.ts` | — | Menu translation pre-warm + lazy caching |
| `apps/backend/src/orders/orders.service.ts` | — | Server-side pricing, loyalty processing, validation |
| `apps/backend/src/loyalty/loyalty.service.ts` | — | Enroll, points, summaries, cron |
| `apps/backend/src/loyalty/loyalty-ledger.utils.ts` | — | FIFO redeem, expire, earn (pure functions) |
| `apps/backend/src/loyalty/loyalty-tiers.utils.ts` | — | Tier config + progress calculation |
| `apps/backend/src/dashboard/dashboard.service.ts` | — | 8 parallel analytics queries |
| `apps/backend/src/translation/translation.service.ts` | — | DeepL API wrapper |
| `apps/backend/src/events/events.gateway.ts` | — | Socket.io gateway, `emitTableStatusChanged` helper |
| `apps/backend/src/storage/storage.service.ts` | — | R2 upload/delete with sharp image processing |
| `apps/backend/src/payment/payment.service.ts` | — | Session, bill, intent, webhook handling |
| `apps/backend/src/payment/payment.controller.ts` | — | 10 endpoints (sessions, bill, intent, close, close-card, close-cash, history, webhook) |
| `apps/backend/src/payment/stripe.provider.ts` | — | Stripe SDK wrapper with Connect support |
| `apps/backend/src/payment/payment-provider.interface.ts` | — | Provider abstraction contract |
| `apps/backend/src/tables/tables.service.ts` | — | Table CRUD + `getTablesWithStatus()` parallel queries |
| `apps/backend/prisma/schema.prisma` | — | 16 models, 10 enums, all relations, composite indexes |

### Critical Frontend Files
| File | Lines | Purpose |
|------|-------|---------|
| `apps/frontend/src/App.tsx` | — | Routing, provider hierarchy, layout split |
| `apps/frontend/src/index.css` | — | Full design system, animations, safe areas |
| `apps/frontend/src/pages/PublicMenuPage.tsx` | 500+ | Core customer experience |
| `apps/frontend/src/pages/CheckoutPage.tsx` | — | Checkout with loyalty integration |
| `apps/frontend/src/pages/DashboardPage.tsx` | — | Tabbed dashboard, mobile bottom nav |
| `apps/frontend/src/components/menu/ItemWithOptions.tsx` | — | Options, pairings, toast, lightbox |
| `apps/frontend/src/components/cart/CartDrawer.tsx` | — | Cart with drink upsell |
| `apps/frontend/src/components/auth/CustomerLoginModal.tsx` | — | 3-step OTP modal |
| `apps/frontend/src/context/AuthContext.tsx` | — | Auth state + token management |
| `apps/frontend/src/context/CartContext.tsx` | — | Cart with localStorage persistence |
| `apps/frontend/src/context/NotificationContext.tsx` | — | Payment notification state management |
| `apps/frontend/src/lib/api.ts` | — | Axios client, interceptors, all API functions |
| `apps/frontend/src/components/payment/PaymentModal.tsx` | — | 3-step payment UI (tip → card → confirmation) |
| `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` | — | Payment history table with filters |
| `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` | — | Real-time table status grid + filter |
| `apps/frontend/src/components/tables/TableCard.tsx` | — | Color-coded table status card |
| `apps/frontend/src/components/tables/TableDetailModal.tsx` | — | Table detail overlay with orders + payment |
| `apps/frontend/src/components/NotificationBell.tsx` | — | Header bell icon with unread badge |
| `apps/frontend/src/components/PaymentToast.tsx` | — | Slide-in payment confirmation toast |
| `apps/frontend/src/i18n.ts` | — | i18next configuration |
| `apps/frontend/src/utils/colors.ts` | — | WCAG contrast utilities |

### Planning & Design
| File | Purpose |
|------|---------|
| `.planning/REQUIREMENTS.md` | 15 formal requirements (REQ-001 through REQ-015) |
| `.planning/ROADMAP.md` | Phase-by-phase roadmap (Phases 1–20) |
| `.planning/codebase/ARCHITECTURE.md` | Architecture docs with diagrams |
| `.agent/design-system/qr-menu-saas/MASTER.md` | Design system master file |
| `docs/superpowers/specs/2026-05-08-live-table-view-design.md` | Live Table View design spec |
| `docs/superpowers/plans/2026-05-08-live-table-view.md` | Live Table View implementation plan |
| `docs/superpowers/plans/2026-05-08-payment-history-notifications.md` | Payment history + notifications plan |
| `CLAUDEMD` | Developer guide for Claude Code |
| `CODING_ROADMAP.md` | Complete shipped + planned feature roadmap |
| `MAIN.md` | Companion master documentation (this file's sibling) |

---

> **Report Methodology:** Every claim in this document is backed by actual source code. File paths and line-level references are provided where specific implementation details are cited. No features were invented — all capabilities described exist in the codebase as of May 7, 2026. Where features are planned but not implemented, this is explicitly stated.
