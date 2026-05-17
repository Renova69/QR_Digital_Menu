# QR Menu App — Coding Roadmap

> **Last Updated:** May 16, 2026  
> **MVP Status:** ✅ Complete  
> **V2 Status:** ✅ Phases 9–14 Complete  
> **V2.5 Status:** ✅ Phases 15–17 + Mobile UX Overhaul + UI/UX Audit & Theme Polish Complete  
> **Bug Fixes & Polish (May 6, 2026):** ✅ Customer auth OTP, cart language sync, options pre-selection, QR print, analytics dark mode, translation gaps, menu health false positive  
> **V3 Growth (May 8, 2026):** ✅ Phase 19 (Stripe Connect Payments) Complete — Phase 18 & 20 paused  
> **OCR Import Integration (May 9, 2026):** ✅ Prisma P2028 fix, schema alignment (allergens/dietaryTags), zero-price fix  
> **Waiter POS (May 9-10, 2026):** ✅ Full POS interface at /staff/pos — 15 files created, 4 modified, zero schema changes  
> **Security Hardening (May 10-11, 2026):** ✅ Phase 21 — JWT → httpOnly cookies, CSRF protection, same-origin Vite proxy, CSP headers, per-endpoint rate limits, OTP brute-force protection, body size limits  
> **Staff Roles & RBAC (May 12-14, 2026):** ✅ Phase 18 Complete — OWNER/MANAGER/WAITER/KITCHEN roles, PIN-based device login, QR enrollment (bond/re-bond), shared device mode, staff settings consolidation, StaffCreatedModal, RBAC across all services  
> **Public Menu Mobile UX (May 15, 2026):** ✅ TopBar, FilterPanel, CategoryPills, horizontal item cards with dual-currency, slim TrendingCarousel, bottom nav regroup, ~30 i18n keys, dead code cleanup, PublicMenuPage refactored 815→~400 lines  
> **Code Review & Bug Fixes (May 15, 2026):** ✅ PR#3 findings (HomePage imports, i18n casts, Tailwind durations), RestaurantContext TS error, CheckoutPage Toggle, payments investigation (not a bug — schema default)  
> **Security & Bug Fixes (May 15, 2026):** ✅ Socket.io CORS wildcard fix, magic-link endpoint removed (token-leak), loyalty expiry emails now sent via Resend, CSV export all 5 sections, TS strict mode (strictNullChecks + noImplicitAny), CategoryPills auto-scroll, ItemWithOptions BGN double-conversion  
> **Infrastructure & Polish Sprint (May 15, 2026):** ✅ API versioning `/api/v1/*`, Prisma jittered-backoff retry + circuit breaker (CLOSED→OPEN after 5 failures, HALF_OPEN after 30s), order progress stepper, 3 QR print templates (Classic/Premium/Minimal), 122 tests (up from 77), customer split bill  
> **SaaS Tiering V2 (May 16, 2026):** ✅ 4-tier FREE/STARTER/PROFESSIONAL/ENTERPRISE on `Restaurant.tier`, SubscriptionModule (FeatureService + FeatureGuard + @RequireFeature decorator), Stripe Checkout + Portal + webhook with timestamp-gate race protection, `useFeature` hook, BillingView, PricingPage, SubscriptionBanner, 4 demo accounts  
> **Menu Import/Export (May 16, 2026):** ✅ Combined Import/Export dashboard tab with sub-tab navigation (Import / Export). Export offers Download JSON, Download CSV, Copy JSON. Backend endpoint already existed — frontend `exportMenu()` + `MenuImportExportView.tsx` added. CSV export with BOM + European locale support. Tab label changed to "Import/Export" across EN/BG/RO.  
> **Production Deployment & Cross-Origin Fixes (May 16, 2026):** ✅ Frontend on Vercel, backend on Cloud Run. Cross-origin cookie fix (`COOKIE_SAMESITE` default `'none'` in production). CheckoutPage useEffect hang fix (useRef guard). Missing orderId in navigate state fix. CSRF cross-origin compatibility. SPA rewrites in vercel.json.  
> **Tier Enforcement Sweep Round 2 (May 17, 2026):** ✅ All 22 feature flags now enforced. Backend: `getAllowedStaffRoles(tier)` in FeatureService, dashboard/payment/Stripe controller gates, users.service role-tier matrix, menu-crud DAYPARTING strip-on-write + filter, UPSELLING strip-on-read. Frontend: AnalyticsView basic/full split, PublicMenuPage upselling/customers-auth/payments gates, CheckoutPage customers-auth gate, CategorySettingsModal dayparting gate, PosPage/KitchenPage tier redirect, staff role dropdown filtered by tier. i18n: 11 new keys EN/BG/RO. Tests: 454 passing.  
> **Current Focus:** Phase 20 (Multi-location) — planned

---

## 🟢 V1 — MVP (Complete)

All foundational phases were completed on **April 9, 2026**. The application is fully functional with digital menu management, QR code ordering, and a restaurant admin dashboard.

### Phase 1: Project Setup ✅

- NestJS backend with TypeScript
- Prisma ORM with PostgreSQL 15
- React 18 + Vite + TypeScript frontend
- Tailwind CSS, Radix UI, TanStack Query, dnd-kit
- Axios API client with interceptors
- Docker Compose for local development (backend, frontend, postgres)

### Phase 2: Authentication ✅

- JWT authentication with Passport.js
- Google OAuth sign-in (full end-to-end flow)
- Auth endpoints: `/api/auth/register`, `/api/auth/login`, `/api/auth/google`, `/api/auth/me`
- **JWT in httpOnly cookies** with SameSite=lax (May 2026 security upgrade — migrated from localStorage)
- **CSRF double-submit cookie protection** on all state-changing endpoints
- Bearer token header fallback for transition period
- Protected routes with JWT guard (backend) and `<ProtectedRoute>` (frontend)
- 401 auto-redirect with public path exclusions + `/auth/me` guard
- React Error Boundary for graceful error handling

### Phase 3: Restaurant Management ✅

- Restaurant CRUD (`/api/restaurants`)
- Users can own and manage multiple restaurants
- Owner-only auth guards
- Restaurant context with active restaurant switching
- Create restaurant onboarding flow for new users

### Phase 4: Menu Builder & Image Upload ✅

- Category CRUD with ordering
- Menu item CRUD (name, description, price in EUR, allergens, dietary tags)
- Image upload for menu items (Cloudflare R2 + sharp processing pipeline: resize 1200px, WebP, 400px thumbnail)
- Drag-and-drop reorder for categories and items (dnd-kit)
- "Out of Stock" toggle
- Variations & add-ons (MenuOption model with VARIATION/ADDON types)
- Side-by-side live preview in menu editor
- Options management modal

### Phase 5: Table Management & QR Codes ✅

- `RestaurantTable` model with CRUD endpoints
- Table management UI in dashboard
- QR code generation per table (react-qr-code)
- QR codes link to `/menu/public/:restaurantId?table=:tableName`
- QR code download as PNG
- Public menu captures table context from URL

### Phase 6: Contactless Ordering ✅

- Order creation with server-side price calculation (prevents manipulation)
- Option price modifiers included in total calculation
- Cart context with table number tracking
- Checkout flow (customer name + phone + special requests)
- Staff order management with status workflow: `NEW → IN_PROGRESS → SERVED → CANCELED`
- Order notification badge on dashboard

### Phase 7: Dashboard & Polish ✅

- Dashboard summary: orders today, total revenue, open assistance requests, recent orders
- Restaurant branding editor (logo upload, accent color)
- Restaurant branding applied to public menu
- Tabbed dashboard (Summary, Orders, Assistance, Tables, Menu Editor)
- Loading spinners and error states across all pages
- Responsive design

### Phase 8: Deployment & Production Readiness ✅

- Docker Compose with backend, frontend, postgres, test-app services
- Health check endpoints
- Rate limiting via `@nestjs/throttler`
- Swagger/OpenAPI documentation at `/api-docs`
- Environment variable configuration with `.env.example`
- Upload volume persistence
- Database migration strategy with Prisma

---

## 🔵 V2 — Premium Features (Complete)

### Phase 9: Smart Analytics Dashboard ✅

- Revenue trends chart (daily, weekly, monthly) via `AnalyticsView.tsx`
- Top best-selling items with revenue contribution
- Peak ordering hours heatmap
- Average order value (AOV) tracking
- Period comparison (7/14/30 days)
- Guest satisfaction metrics from feedback data

### Phase 10: Customer Feedback & Google Review Redirect ✅

- Post-order feedback form via `FeedbackPage.tsx`
- Star rating + optional comment
- Smart routing: 4-5 stars → redirect to Google Reviews page
- Smart routing: 1-3 stars → private feedback to owner
- `Feedback` Prisma model linked to orders and restaurants

### Phase 11: Automated Dayparting (Scheduled Menus) ✅

- `AvailabilityType` enum: `ALWAYS`, `SCHEDULED`, `HIDDEN`
- `startTime`, `endTime`, `daysOfWeek` fields on `MenuCategory`
- Admin UI for setting schedule per category
- Timezone support per restaurant (`timezone` field on `Restaurant`)
- Categories auto-show/hide on public menu based on schedule

### Phase 12: Multi-Language Menu ✅

- Language selector on public menu (EN, BG, RO)
- JSON `translations` field on `MenuCategory` and `MenuItem`
- DeepL API integration for auto-translation
- Manual override for translations
- Dashboard localized with i18next (EN, BG, RO)

### Phase 13: Real-Time Updates (WebSockets) ✅

- WebSocket gateway via `@nestjs/websockets` + Socket.io (`EventsGateway`)
- `SocketContext.tsx` on frontend with restaurant room joining
- Real-time order push notifications to staff dashboard
- Real-time "Call Waiter" alerts
- Audio notification (`notification.mp3`) for new events
- Order room support for customer-side tracking

### Phase 14: Upselling & Smart Suggestions ✅

- Item pairing system via `relatedItemIds` on `MenuItem`
- Perfect Pairing modal (deterministic trigger on Add to Cart)
- Trending Carousel on public menu ("Popular right now")
- `trendingMode` on Restaurant (AUTO mode)
- Add-to-cart toast confirmation with localized text

---

## 🔷 V2.5 — Visual Polish, Branding & Menu Intelligence ✅

### Phase 15: Image Experience Upgrade ✅
**Goal:** Make menu item images more impactful and interactive.

**Shipped:**
- Square aspect ratio for item images (portrait photos display correctly)
- Click-to-zoom lightbox with pinch-to-zoom (scale 1–4×) and swipe-to-dismiss (mobile)
- Swipe-down backdrop fade and 80px threshold to close (`ImageLightbox.tsx` full rewrite)
- Category banner images (`imageUrl` + `thumbnailUrl` on `MenuCategory`) with upload in dashboard Menu Editor + sharp WebP processing
- Mobile quality fixes: banner `aspect-[2/1] md:aspect-[3/1]`, item cards capped at `h-48` on mobile, padding `p-4 md:p-6`

**Selling Point:** *"Every dish looks its best — customers eat with their eyes first."*

---

### Phase 16: Advanced Branding & Theming ✅
**Goal:** Full brand customization with smart guardrails.

**Shipped:**
- Google Fonts integration with live preview — 16 curated fonts (Serif / Sans-Serif / Display) loaded dynamically from Google Fonts (`FontPicker.tsx`)
- Full color scheme editor: background, text, card, accent colors (`ColorSchemeEditor.tsx`)
- WCAG contrast validator with ratio display — pass ≥4.5:1, warning ≥3.0:1, fail below (`colors.ts` + `ColorSchemeEditor`)
- Live theme preview panel in branding editor (`BrandingPreview.tsx`)
- Per-restaurant theme applied to public menu via CSS custom properties (`PublicMenuPage.tsx`)
- Schema fields: `fontHeading`, `fontBody`, `themeBgColor`, `themeTextColor`, `themeCardColor`, `accentColor`

**Selling Point:** *"Your brand, your colors, your fonts — with built-in safeguards so it always looks great."*

---

### Phase 17: Menu Check (Smart Assistant) ✅
**Goal:** Automated menu quality audit — catch issues before customers see them.

**Shipped:**
- Dashboard widget scanning menu completeness (`MenuCheckWidget.tsx` in `SummaryView`)
- Backend audit endpoint `GET /menu/audit/:restaurantId` (`audit.controller.ts` + `menu.service.ts`)
- Detects: items without descriptions, missing images, empty categories, €0 prices, missing translations
- Severity levels: error / warning / info with color-coded icons
- One-click navigation to fix each issue
- Auto-refresh after fixes

**Selling Point:** *"Your menu is always complete, accurate, and ready for customers."*

---

### Mobile UX Overhaul ✅
**Goal:** App feels native on mobile — the primary device for both customers (QR scan) and restaurant owners (in-service management).

**Shipped:**
- `index.html`: `viewport-fit=cover`, `apple-mobile-web-app-capable`, `black-translucent` status bar, title "QR Menu"
- `App.tsx`: layout routes — `AppLayout` (Header + container) for dashboard/auth, `PublicLayout` (bare) for all customer-facing routes (`/menu/public`, `/checkout`, `/order-confirmation`, `/feedback`)
- `index.css`: `pt-safe / pb-safe` utilities (`env(safe-area-inset-*)`), `cart-panel-enter` CSS animation (slides up from bottom on mobile, right on desktop — media-query-driven, no JS)
- `CartDrawer.tsx`: bottom sheet on mobile (`fixed bottom-0 h-[88vh] rounded-t-[2.5rem]`), right drawer on desktop — safe area on footer padding
- `PublicMenuPage.tsx`: hero `mb-20→mb-10 md:mb-20`, category gaps `space-y-24→space-y-14 md:space-y-24`, grid `gap-8→gap-5 md:gap-8`, bottom action bar full-width with `env(safe-area-inset-bottom)`, all tap targets ≥ 44px
- `CheckoutPage.tsx`: glass panels `p-8→p-5 md:p-8`, safe-area bottom padding
- `OrderConfirmationPage.tsx`: full premium redesign — live status card (Clock/ChefHat/CheckCircle2/XCircle), order reference, feedback CTA, safe area
- `DashboardPage.tsx`: desktop keeps horizontal tab nav; mobile gets `fixed bottom-0 md:hidden` bottom nav (6 items: Home/Orders/Requests/Tables/Settings/Stats) with active indicator bar, red badges, safe-area padding

**Key files:**
- `apps/frontend/src/App.tsx` — layout route split
- `apps/frontend/src/components/cart/CartDrawer.tsx` — bottom sheet
- `apps/frontend/src/pages/DashboardPage.tsx` — mobile bottom nav
- `apps/frontend/src/index.css` — safe-area utilities + cart animation

---

---

### UI/UX Audit & Theme Polish ✅ — May 4, 2026
**Goal:** Address design debt, fix UX bugs, harden accessibility, improve dark/light mode integration with custom branding.

**Shipped:**

**Design system (`index.css` full rewrite):**
- Warm restaurant color palette — all colors via HSL CSS custom properties (`--color-accent: hsl(0 72% 51%)` restaurant red, warm whites/near-blacks)
- Dropped Plus Jakarta Sans — fonts reduced from 3 → 2 (Outfit body, Playfair Display headings)
- Fixed `.text-glow` — was using invalid `hsla(var(--color-accent), 0.25)` syntax; corrected to `color-mix(in srgb, var(--color-accent) 25%, transparent)`
- Fixed `.premium-bg` — same invalid `hsla()` issue corrected
- Removed `html { @apply transition-colors duration-500 }` — caused 500ms global delay on all color transitions; replaced with targeted `body { transition: background-color 200ms ease }`
- Added `@media (prefers-reduced-motion: reduce)` for `.animate-float`
- Font preconnect added to `index.html`

**QR table / assistance flow fixes (`PublicMenuPage.tsx`):**
- Removed browser `prompt()` for table number — table is always in QR URL (`?table=<name>`), no user input required
- Call Waiter: shows inline `role="alert"` / `aria-live="polite"` glass panel notice (3.5s) when no table context, rather than prompting
- Call Waiter button properly disabled during `assistanceLoading` state
- Fixed invalid `group-disabled:scale-100` Tailwind modifier (not a valid group modifier — removed)
- Removed decorative `animate-pulse` from loading text (accessibility — continuous motion without user trigger)
- Fixed logo alt text (`${name} logo` instead of empty string)
- Added `<label htmlFor>` + `id` on language select for screen reader association

**Dark/light mode + branding integration:**
- New `defaultTheme String? @default("light")` field on `Restaurant` (schema pushed to Neon, DTO updated)
- `ThemeToggle.tsx` refactored — accepts `storageKey?: string` + `defaultTheme?: 'light' | 'dark'`; improved `aria-label` reflects current action
- Public menu uses per-restaurant localStorage key (`theme-{restaurantId}`) — each venue's preference stored independently from dashboard
- ThemeToggle always visible on public menu (previously hidden when custom branding active — now customers can always toggle)
- Public menu uses restaurant's `defaultTheme` as initial fallback (no stored preference → owner default → light)
- `BrandingEditor.tsx` — Light/Dark pill toggle UI for owners; `defaultTheme` included in PATCH payload

**Key files changed:**
- `apps/frontend/src/index.css`
- `apps/frontend/index.html`
- `apps/frontend/src/pages/PublicMenuPage.tsx`
- `apps/frontend/src/components/ui/ThemeToggle.tsx`
- `apps/frontend/src/components/ui/BrandingEditor.tsx`
- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`

---

### Planned: Translation — Platform-Managed API
**Decision:** Owners will NOT need their own DeepL API key. The platform provides a single `DEEPL_API_KEY` env var on the backend.

**Migration scope (when ready):**
- `TranslationService` reads `process.env.DEEPL_API_KEY` instead of accepting `apiKey` param — drop the `apiKey` argument from `translateTexts`, `translateText`, `translateObject`
- All callers (menu translation endpoints) stop passing `restaurant.deeplApiKey`
- `restaurant.deeplApiKey` column stays in schema (existing data) but is deprecated — remove the input from `SettingsView.tsx`
- `restaurant.googleTranslateApiKey` is already marked deprecated in schema — remove from settings UI at the same time

**Do NOT add any new code that reads `restaurant.deeplApiKey` until this migration is complete.**

---

### Bug Fixes & Translation Gaps ✅ — May 6, 2026

**Customer Auth — Email OTP Sign-in:**
- `VerificationToken` model: 6-digit code bcrypt-hashed, 10-min expiry, 60s rate-limit, `@@index([email])`
- `User.phone String?` field added
- `POST /api/auth/otp/send` + `POST /api/auth/otp/verify` (public routes, no guard)
- Resend REST API for email delivery; dev mode returns `devCode` in response + console.log when `RESEND_API_KEY` absent
- `CustomerLoginModal` rewritten: 3-step state machine (`entry → otp → welcome`), Google button, 60s resend countdown, welcome card for new users
- `AuthContext.loginWithToken(token, user)` — no extra API call, mirrors existing `login()` pattern
- Profile chip + logout icon in public menu action bar; profile page navigates back via `?returnTo` param
- `CustomerProfilePage` fully translated, tier colors from `acc.tier` (not hardcoded thresholds)

**UI Bug Fixes:**
- **Cart language sync** — `resolveItemName()` in `CartDrawer` resolves live translated name by item ID + `selectedLang`; prop chain `PublicMenuPage → CartIcon → CartDrawer`
- **Options pre-selection** — `ItemWithOptions` auto-selects first `VARIATION` choice on item open; eliminates base-item-without-variant orders
- **QR print layout** — single column, `@page { size: A4 portrait; margin: 12mm }`, `breakInside: avoid` per card
- **Analytics dark mode** — Recharts axes use `hsl(var(--color-muted-foreground))` fill; custom `ChartTooltip` with theme-aware classes
- **Menu health false positive** — category-image audit rule removed (no UI to add category images)

**Translation Gaps (~120 new keys, EN/BG/RO):**
- `auth.otp.*` — full OTP flow (20 keys)
- `publicMenu.signIn`, `myProfile`, `calling`, `scanQrForAssistance`, `selectLanguage`, `pairing.*`, `drinkUpsell.*`
- `profile.*` — full profile page (22 keys)

---

## 🟢 Phase 21 — Security Hardening ✅ (May 10-11, 2026)

**Goal:** Eliminate XSS token theft, add CSRF protection, fix cross-origin cookie blocking, add defense-in-depth.

### JWT → httpOnly Cookies ✅
- JWT moved from localStorage to httpOnly cookie (`sameSite: 'lax'`, `secure` in production, 1-day expiry)
- Backend sets cookie on login/register/OTP/OAuth; clears on logout
- `jwt.strategy.ts` reads from `request.cookies.token` first, Bearer header fallback
- `AuthContext.tsx` no longer touches localStorage for token
- Response still includes `{ token }` in body for transition period (dual auth)

### CSRF Double-Submit Cookie Protection ✅
- `GET /api/auth/csrf-token` returns `{ csrfToken }` + sets `csrf-token` cookie
- All state-changing requests require `X-CSRF-Token` header matching cookie
- Skipped in dev mode + Stripe webhook path
- Frontend interceptor fetches token once, caches, attaches to POST/PATCH/DELETE/PUT

### Same-Origin Vite Proxy ✅
- `api.ts` uses `/api` baseURL (same-origin) — Vite proxy forwards to backend
- `vite.config.js` uses `loadEnv` to read `VITE_API_URL` for proxy target
- `SocketContext` connects same-origin via `io()` with no URL
- Eliminates cross-origin cookie blocking (localhost:3001 ≠ 192.168.0.3:3000)

### 401 Interceptor Guard ✅
- 401 handler skips redirect when `error.config.url === '/auth/me'`
- AuthContext handles auth check failures silently; StaffRoute uses `<Navigate>`
- Prevents logout loop navigating to `/staff/pos` or `/staff/kitchen`

### Per-Endpoint Rate Limiting ✅
- `@Throttle(10, 60)` on OTP send/verify (10/min each)
- `@Throttle(5, 60)` on login
- `@Throttle(60, 60)` on public menu (generous)
- `@SkipThrottle()` on health check
- Named throttlers for auth-specific limits

### OTP Brute-Force Protection ✅
- `VerificationToken` model: `attempts Int @default(0)`, `lockedUntil DateTime?`
- 5 failed attempts → 10-minute lockout
- Successful verify resets attempts counter
- `@@index([lockedUntil])` for efficient cleanup

### Content Security Policy Headers ✅
- Helmet middleware with CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: wss:; frame-src https://js.stripe.com`
- Applied before CSRF middleware (ordering critical)

### Request Body Size Limits ✅
- `express.json({ limit: '1mb' })` + `express.urlencoded({ limit: '1mb', extended: true })`
- Stripe webhook raw body: `limit: '5mb'`
- Prevents OOM from malicious large payloads

### Structured Logging ✅
- All 7 services migrated from `console.log` to NestJS `Logger`
- Request ID middleware (`crypto.randomUUID()`) on every request

**Key files changed:** `main.ts`, `auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, `api.ts`, `vite.config.js`, `AuthContext.tsx`, `SocketContext.tsx`, `schema.prisma`

---

## 🔶 V3 — Growth Features (Planned)

### Phase 18: Staff Role Management & Permissions ✅ COMPLETE (May 12-14, 2026)
**Goal:** Multi-user access with role-based permissions.

**Scope (all delivered):**
- `UserRole` expanded: `OWNER`, `MANAGER`, `WAITER`, `KITCHEN`
- Permission matrix enforced in all service layers
- PIN-based staff login (`POST /auth/pin-login`, SHA256-hashed)
- Device enrollment via QR code (bond + re-bond)
- `DeviceEnrollmentToken` model with expiring tokens (10-min TTL)
- `StaffCreatedModal` with QR display, PIN copy, expiry countdown
- Shared Device Mode (localStorage-based, PIN keypad)
- Staff settings consolidation (Staff tab in SettingsView)
- RBAC access: orders, dashboard, restaurants, assistance all gated
- Provider fetch noise fixes (OrderProvider, AssistanceProvider, SocketContext)

**Selling Point:** *"Give your staff exactly the access they need — nothing more."*

---

### Phase 19: Digital Payment Integration (Stripe) ✅ COMPLETE
**Goal:** Tableside payment without waiting for the check.

**Scope:**
- Stripe Payment Intents API integration
- Pay-at-table flow after ordering
- Tip suggestions (configurable % buttons, custom tip)
- Stripe Connect for platform fee (SaaS revenue model)
- TableSession tracking via localStorage token
- Payment webhook handling (Stripe → DB sync)
- Restaurant dashboard: Payments settings tab, table session indicators

**Implementation:**
- `PaymentModule` with `IPaymentProvider` interface (future MyPOS)
- `StripeProvider` — PaymentIntent creation, webhook verification, Connect onboarding
- `PaymentService` — session management, bill calculation, webhook handling
- `PaymentController` — public routes + raw-body webhook
- `RestaurantsService` — Stripe Connect account link, status, disconnect
- `PaymentModal` — 3-step UI: tip → Stripe Elements → confirmation
- `SettingsView` — Payments tab with Connect onboarding + tips config
- `TableView` — session status dots (orange=OPEN, green=PAID)
- i18n: EN, BG, RO locale keys

**Selling Point:** *"Customers pay at the table. No waiting. Tips go up. Tables turn faster."*

---

### Phase 20: Multi-Location / Franchise Management
**Goal:** Centralized management for restaurant chains.

**Scope:**
- Menu templates (create once, deploy to multiple locations)
- Bulk price updates across locations
- Cross-location analytics comparison
- Organization-level user management

**Selling Point:** *"Manage all your restaurants from one screen."*

---

## 🔷 Post-Roadmap — Live Table View & Payment History ✅ (May 8, 2026)

### Live Table View
**Goal:** Real-time visual grid showing table status for restaurant staff.

**Shipped:**
- `GET /api/tables/status/:restaurantId` — all tables with derived status (empty/waiting/occupied/paid), enriched with `orderCount`, `totalAmount`, `customerNames`, `sessionStatus`, `sessionId`
- `TablesService.getTablesWithStatus()` — fetches tables + active sessions in parallel via `Promise.all`
- `EventsGateway.emitTableStatusChanged()` helper — emits `table:status-changed` from 4 locations (`OrdersService.create`, `OrdersService.updateStatus`, `PaymentService.handleWebhookEvent`, `PaymentService.closeSession`)
- `LiveTablesView.tsx` — real-time grid with filter modes (Active/Occupied/Paid/All), defaults to Active
- `TableCard.tsx` — color-coded card (red=occupied, amber=waiting, green=paid, gray=empty), order count badge, customer count
- `TableDetailModal.tsx` — modal with table name, session status badge, order list with status badges, payment info
- `TableView.tsx` — parent with sub-tab navigation: Live View / QR Management
- Socket listener invalidates React Query `['tableStatuses']` cache on `table:status-changed` events
- `enabled: !!restaurantId` guard on `useQuery`

### Payment History & Notifications
**Goal:** Staff can view payment history and receive real-time payment confirmations.

**Shipped:**
- `PaymentsView.tsx` — table with columns: date, table, customer, amount, tip, status; filters by status + date range
- `GET /api/payment/history/:restaurantId` — paginated, filterable payment history
- `NotificationContext` — manages notification bell badge count + toast queue
- `NotificationBell` — dashboard header bell icon with unread count badge
- `PaymentToast` — slide-in notification for confirmed payments
- `payment:confirmed` socket event emitted on successful payment

### Code Review Fixes (May 8, 2026)
- Parallel `Promise.all` for tables + sessions queries (was sequential awaits)
- `emitTableStatusChanged` helper deduplication across 4 call sites
- Removed unused `label` field from `statusStyles` Record in `TableCard.tsx`
- Added `enabled: !!restaurantId` guard on `useQuery` in `TableView.tsx`
- Removed dead code + unnecessary existence checks

**Key files:**
- `apps/backend/src/tables/tables.service.ts` — `getTablesWithStatus()` parallel queries
- `apps/backend/src/tables/tables.controller.ts` — `GET tables/status/:restaurantId`
- `apps/backend/src/events/events.gateway.ts` — `emitTableStatusChanged()` helper
- `apps/backend/src/payment/payment.service.ts` — webhook → emit events
- `apps/backend/src/payment/payment.controller.ts` — history endpoint
- `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` — real-time grid
- `apps/frontend/src/components/tables/TableCard.tsx` — color-coded card
- `apps/frontend/src/components/tables/TableDetailModal.tsx` — detail modal
- `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` — payment history
- `apps/frontend/src/context/NotificationContext.tsx` — notification state
- `apps/frontend/src/components/NotificationBell.tsx` — bell icon
- `apps/frontend/src/components/PaymentToast.tsx` — toast notification

---

---

## 🟤 OCR Import Integration ✅ (May 9, 2026)

**Goal:** Allow restaurant owners to upload scanned/photographed menus via the offline OCR tool and push the structured result directly into their SaaS menu — no manual re-entry.

**Shipped:**

### Prisma Transaction Timeout Fix
- Root cause: Large menus (82 items / 14 categories ≈ 260 DB queries) exceeded the 5-second default Prisma interactive transaction timeout when running against Neon cloud (20–50 ms/query over network).
- Fix: `{ timeout: 60000 }` added to `prisma.$transaction()` in `menu-import.service.ts`.
- Added `Logger` + try-catch to `MenuImportService` for permanent error visibility.

### OCR Schema Alignment
- `ImportItemDto` / Prisma schema use `allergens: String[]` + `dietaryTags: String[]` (separate arrays).
- OCR tool previously exported a single `tags: []` field — now exports `allergens[]` and `dietaryTags[]` separately.
- `price || 0` → `price ?? 0`: zero-priced items no longer treated as falsy.
- `jsonToPayload()` in `MenuImportView.tsx` reads `allergens`/`dietaryTags` directly from OCR JSON.

### End-to-End Flow
1. Offline OCR tool scans menu → exports JSON with `allergens[]`, `dietaryTags[]`, `options[]` shape
2. Owner opens dashboard Import tab, pastes/uploads JSON → `MenuImportView.tsx` previews data
3. Owner clicks Confirm → `jsonToPayload()` transforms to `ImportMenuDto` shape → `POST /api/restaurants/:id/menu/import/confirm` (JWT)
4. `MenuImportService.upsertMenu()` upserts categories + items + options inside a 60-second Prisma transaction

**Key files:**
- `apps/backend/src/menu-import/menu-import.service.ts` — timeout fix + Logger
- `apps/backend/src/menu-import/dto/import-menu.dto.ts` — `allergens`/`dietaryTags` fields
- `apps/frontend/src/pages/Dashboard/MenuImportView.tsx` — `jsonToPayload()` transformation
- `F:\PROGRAMING\OFFLINE_OCR\public\js\screens\export.js` — OCR export shape updated

---

## 🔷 Waiter POS — Tableside Ordering Interface ✅ (May 9-10, 2026)

**Goal:** Full-viewport, mobile-first Point-of-Sale at `/staff/pos` for waiters to take tableside orders rapidly with full order history visibility.

**Shipped:**

### Core Architecture
- New `PosLayout` (third layout alongside AppLayout and PublicLayout) — zero chrome, full viewport
- `PosContext` — in-memory state (no localStorage), isolated from customer `CartContext`
- `PosCartItem.submitted: boolean` — distinguishes history (read-only, gray, ✓) from pending items (full controls)
- `StaffRoute.tsx` auth guard — allows OWNER and STAFF roles, redirects CUSTOMER to /profile
- Seat-level ordering: Seat 1 | Seat 2 | Seat 3 | Shared (local frontend grouping, no DB persistence)

### Component Tree (15 new files)
- `PosLayout.tsx` — full-viewport shell: sticky top bar, scrollable content, fixed bottom action bar
- `PosPage.tsx` — composes all pos/ components
- `PosTopBar.tsx` — search input + active table chip
- `PosCategoryFilter.tsx` — sticky horizontal category pills
- `PosItemGrid.tsx` — 2-col dense grid, filtered by category + search
- `PosItemCard.tsx` — tap to add item (no options) or open options drawer (has MenuOptions)
- `PosOptionsDrawer.tsx` — Radix Dialog (bottom), VARIATION/ADDON selection + item note input
- `PosCartDrawer.tsx` — slide-up cart: items grouped by seat, 3 action buttons with confirmation dialogs
- `PosSeatSelector.tsx` — pill row setting `activeSeat`
- `PosTableModal.tsx` — Radix Dialog, table grid from `getTablesWithStatus`, Force Open button
- `PosSplitBill.tsx` — integer input → per-person amount (pure UI math)
- `PosQRBill.tsx` — QRCodeSVG pointed at session bill URL

### Backend Additions (4 new endpoints, zero schema changes)
- `POST /api/payments/session/force-open` (JWT) — force-open table session
- `POST /api/payments/session/:token/close-card` (JWT) — MYPOS card payment record
- `GET /api/tables/:tableId/orders` (JWT) — real order data for dashboard live view
- `PaymentService.closeSessionWithCard()` — creates MYPOS payment, sets session to PAID, emits socket events

### Data Flow
| Action | Behavior |
|--------|----------|
| **Table selection** | `getOrCreateSession()` → if occupied, `getSessionBill()` loads history as submitted items |
| **Order submission** | Only `submitted: false` items sent → `markAsSubmitted()` marks them as history |
| **Paid by Card** | `closeSessionWithCard()` → MYPOS payment record → session PAID → clear session |
| **Force Close** | `closeSession()` → CLOSED_NO_PAYMENT → clear session |

### Bug Fixes (5 commits, May 10, 2026)
- **Duplicate menuItemId** — deduplicated with `[...new Set()]` before Prisma `findMany`
- **Session order history** — `submitted` flag pattern: re-opening table shows past orders, submit only sends new items
- **Dashboard live view** — new backend endpoint + frontend async fetch on table click
- **Cart reset on table switch** — `resetCart()` clears all items before loading new session
- **Paid by Card + confirmation dialogs** — all 3 session-end actions have Radix confirmation modals

**Key files:**
- `apps/frontend/src/context/PosContext.tsx` — 190 lines, 15 context methods
- `apps/frontend/src/pages/pos/PosLayout.tsx` — full-viewport shell
- `apps/frontend/src/pages/pos/PosPage.tsx` — component composition
- `apps/frontend/src/components/pos/PosCartDrawer.tsx` — cart + 3 action buttons + confirmations
- `apps/frontend/src/components/pos/PosTableModal.tsx` — table selection with history loading
- `apps/frontend/src/components/StaffRoute.tsx` — staff auth guard
- `apps/backend/src/payment/payment.service.ts` — `forceOpenSession()`, `closeSessionWithCard()`
- `apps/backend/src/payment/payment.controller.ts` — 2 new endpoints
- `apps/backend/src/tables/tables.service.ts` — `getTableOrders()`
- `apps/backend/src/tables/tables.controller.ts` — `GET /tables/:tableId/orders`
- `apps/frontend/src/lib/api.ts` — `forceOpenSession()`, `closeSessionWithCard()`, `getTableOrders()`
- `apps/frontend/src/App.tsx` — PosLayout + /staff/pos route
- `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` — async table click handler
- `apps/frontend/src/components/tables/TableDetailModal.tsx` — `ordersLoading` prop

---

## 🟢 Public Menu Mobile UX Redesign (Complete — May 15, 2026)

Design spec: `docs/superpowers/specs/2026-05-15-public-menu-mobile-ux-design.md`
Implementation plan: `docs/superpowers/plans/2026-05-15-public-menu-mobile-ux.md`

10 tasks across 14 files. Refactored `PublicMenuPage.tsx` from 815 lines to ~400 by extracting TopBar, FilterPanel, and CategoryPills into standalone components.

### Task 1: Shared Currency Utility
- `apps/frontend/src/lib/currency.ts` — `formatEuro()` and `formatBgn()` using BNB fixed rate 1 EUR = 1.95583 BGN
- Single source of truth, never duplicated across components

### Task 2: TopBar Component
- `apps/frontend/src/pages/TopBar.tsx` — full-width search with Lucide `Search` icon, Filter toggle button, ThemeToggle, language codes (EN/BG/RO), Table chip (`Table` icon + number replacing "You are viewing the menu for table X" text)

### Task 3: FilterPanel Component
- `apps/frontend/src/pages/FilterPanel.tsx` — slide-down panel with dietary toggle switches (Spicy, Vegan, New, Featured) and allergen exclusion pills (Milk, Wheat, Fish, Nuts, Eggs, Soy, Shellfish). Clicking an allergen pill excludes matching products. Multi-select search remains functional inside panel.

### Task 4: Horizontal Item Cards
- `ItemWithOptions.tsx` redesigned to horizontal layout: image left, content right, dual-currency prices (EUR primary, BGN secondary at fixed rate), pill-shaped "+ Add" buttons replacing full-width solid blue "ADD TO CART" buttons

### Task 5: CategoryPills
- `apps/frontend/src/pages/CategoryPills.tsx` — horizontal scroll pill navigation replacing sticky category nav. Active pill highlighted with accent color.

### Task 6: Slim TrendingCarousel
- Wider horizontal cards with compact skeleton loader. Reduced vertical footprint.

### Task 7: Bottom Nav Regroup
- Profile and Call Waiter icons grouped left, cart/bill actions right.

### Task 8: i18n Keys
- ~30 new keys across EN/BG/RO: `publicMenu.search`, `publicMenu.filters.*`, `publicMenu.dietary.*`, `publicMenu.addShort`

### Task 9: Dual-Currency Integration
- CartDrawer, CheckoutPage, PaymentModal wired to `formatEuro()`/`formatBgn()`. EUR+BGN display at BNB fixed rate.

### Task 10: Dead Code Cleanup
- Removed unused `LANG_LABELS` constant and `handleLanguageChange` function from `PublicMenuPage.tsx`.

### Key files:
- `apps/frontend/src/lib/currency.ts` — dual formatters
- `apps/frontend/src/pages/TopBar.tsx` — search + filter + theme + lang + table chip
- `apps/frontend/src/pages/FilterPanel.tsx` — dietary toggles + allergen pills
- `apps/frontend/src/pages/CategoryPills.tsx` — horizontal scroll pill nav
- `apps/frontend/src/pages/PublicMenuPage.tsx` — refactored 815→~400 lines
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — horizontal layout + dual currency
- `apps/frontend/src/components/menu/TrendingCarousel.tsx` — slim version
- `apps/frontend/src/components/cart/CartDrawer.tsx` — dual currency
- `apps/frontend/src/pages/CheckoutPage.tsx` — dual currency
- `apps/frontend/src/components/payment/PaymentModal.tsx` — dual currency
- `apps/frontend/src/locales/*/translation.json` — ~30 new keys

---

## 🟢 Code Review & PR#3 Findings Fixes (Complete — May 15, 2026)

Plan: `.claude/plans/snappy-tumbling-peach.md` (6 changes across 4 files)

### HomePage.tsx (4 fixes)
- Removed 3 unused Lucide imports (`TrendingUp`, `Users`, `Layers`)
- Fixed 3 `as any` type casts on i18n keys → `t(key, fallback)` pattern
- Tightened `featureIcons` Record type to `keyof featureKeys[number]`
- Replaced non-standard Tailwind durations (`duration-400`→`duration-300`, `duration-1200`→`duration-1000`)

### RestaurantContext.tsx
- Fixed TS error on line 82: non-null assertion on `user.restaurantId` after guard check

### CheckoutPage.tsx
- Replaced sr-only checkbox hack with `<Toggle>` component (Radix `role="switch"`, `aria-checked`, keyboard navigation)

### Code Review Fixes
- Typed translations (removed `as any`), shared utils deduplication, Toggle component adoption, i18n gaps

### Payments "Not Enabled" Investigation
- Confirmed NOT a code bug. `paymentsEnabled Boolean @default(false)` in Prisma schema
- `PaymentService` correctly checks `restaurant.paymentsEnabled` before allowing payment intent creation
- Both affected restaurants had `paymentsEnabled = false` in DB — enabled via direct DB update

---

## 🌐 Production Deployment & Cross-Origin Fixes ✅ (May 16, 2026)

**Goal:** Deploy frontend to Vercel and backend to Cloud Run. Fix cross-origin cookie blocking that prevented order placement.

### Production Infrastructure

| Component | Platform | URL |
|-----------|----------|-----|
| **Frontend** | Vercel (Static) | `https://qr-digital-menu-ivory.vercel.app` |
| **Backend** | Google Cloud Run (Docker) | `https://qr-menu-backend-822584248302.europe-west1.run.app` |
| **Database** | Neon PostgreSQL | Serverless, auto-scaling |

### Cross-Origin Cookie Fix (COOKIE_SAMESITE)

- **Bug**: `sameSite: 'lax'` default in production blocked all cookies on cross-site requests (Vercel → Cloud Run). Orders failed with 403 CSRF, auth failed with 401.
- **Fix**: Changed `COOKIE_SAMESITE` default from `'lax'` to `'none'` in production (both `main.ts` and `auth.controller.ts`). `secure: true` already set. Env var still overridable for same-origin deploys.
- **Files**: `apps/backend/src/main.ts`, `apps/backend/src/auth/auth.controller.ts`

### CheckoutPage Screen Hang Fix

- **Bug**: After order submission, screen stuck on "Submitting order..." permanently. Backend received order immediately. Refresh went to public menu, not order confirmation.
- **Root cause**: `useEffect([items, navigate])` detected `items.length === 0` after `clearCart()` and fired `navigate(-1)`, undoing the `navigate("/order-confirmation")` that was just called.
- **Fix**: Added `useRef(false)` flag set to `true` before `clearCart()`. useEffect checks flag before navigating back.
- **Files**: `apps/frontend/src/pages/CheckoutPage.tsx`

### Missing orderId in Navigate State

- **Bug**: Order confirmation page couldn't join WebSocket room for real-time status updates.
- **Fix**: Added `orderId: newOrder.id` to navigate state object.
- **Files**: `apps/frontend/src/pages/CheckoutPage.tsx`

### Production Auth Architecture

- **Dev**: Same-origin Vite proxy (`/api/v1` baseURL, `sameSite: 'lax'` cookies)
- **Production**: Cross-origin (`VITE_API_URL` env, `sameSite: 'none'` + `secure: true` cookies)
- **api.ts**: Auto-selects baseURL — `/api/v1` in dev, `VITE_API_URL` in production
- **CORS**: Backend allows all `.vercel.app` origins + `localhost` ports
- **SPA**: `vercel.json` rewrites all paths to `/index.html`

**Key files:** `main.ts`, `auth.controller.ts`, `CheckoutPage.tsx`, `api.ts`, `vercel.json`

---

## 🔷 Menu Import/Export — Combined Dashboard Tab ✅ (May 16, 2026)

**Goal:** Combine the existing OCR JSON import flow with a new menu export feature under a single dashboard tab with sub-tab navigation.

**Shipped:**
- `MenuImportExportView.tsx` — parent component with sub-tab state (`activeSubTab: 'import' | 'export'`), Upload icon for Import, Download icon for Export
- `ImportTab` — all existing import functionality preserved (ApiKeyPanel, FileImporter, PreviewTable, confirm import with mutation)
- `ExportTab` — three action buttons: Download JSON, Download CSV, Copy JSON. Lazy fetch via `useQuery({ enabled: false })` — data fetched on button click only. Item/category count shown after fetch. Error handling.
- `menuToCSV()` helper — converts menu JSON to CSV with UTF-8 BOM + European locale support (`sep=;`)
- `exportMenu()` in `api.ts` — `GET /api/restaurants/:id/menu/export` (JWT-guarded, backend endpoint already existed)
- Tab label changed from "Import" to "Import/Export" across EN/BG/RO locales

**Key files:**
- `apps/frontend/src/pages/Dashboard/MenuImportExportView.tsx` (new, ~380 lines)
- `apps/frontend/src/pages/DashboardPage.tsx` — import changed to `MenuImportExportView`
- `apps/frontend/src/lib/api.ts` — `exportMenu()` function
- `apps/frontend/src/locales/*/translation.json` — `dashboard.tabs.importExport` keys

---

## 🟡 V4 — Scale & Enterprise (Future)

- Move database to AWS RDS / GCP Cloud SQL
- Move file uploads to S3 / GCS ✅ **(Done — moved to Cloudflare R2 with CDN delivery)**
- Deploy backend to AWS ECS / GCP Cloud Run
- Redis for caching and real-time queues
- CDN for static assets and menu images ✅ **(R2 public CDN active + WebP compression)**
- POS system integration (Square, Toast, Lightspeed)
- Inventory management and waste tracking
- Advanced loyalty program with points/tiers
- SMS/Email marketing campaigns
- Native mobile app for staff (React Native)
- Kubernetes orchestration for enterprise scale
