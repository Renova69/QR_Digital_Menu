# QR Menu App — Coding Roadmap

> **Last Updated:** September 2, 2026
> **MVP Status:** ✅ Complete
> **V2 Status:** ✅ Phases 9–14 Complete
> **V2.5 Status:** ✅ Phases 15–17 + Mobile UX Overhaul + UI/UX Audit & Theme Polish Complete
> **V3 Growth:** ✅ Phases 18–19 (Staff Roles, Stripe Payments) Complete
> **Security Hardening:** ✅ P0–P3 engineering complete
> **V3.5 Platform:** ✅ Phases 22–36 Complete (Payment Providers, Print Station, Reservations, Split Bill, Service Points, Web Push, Translation Rework, Allergen Tags, Loyalty Checkout, Dashboard Polish)
> **Current Focus:** operational close-out: disposable local restore proof and
> the remaining P3-1/P3-6 manual checks. Final-domain, isolated-staging and
> credential-retirement gates remain deliberately deferred pre-launch.

---

## Current security track

- **P3 engineering close-out:** PR #68 merged P3-4 through P3-10 with green CI.
  The production image for `445afc6d` contains the complete P3 batch.
  [Close-out evidence](ops/security/P3_CLOSEOUT.md).
- **P2 development close-out:** complete. Do not cycle back through completed
  P2 items without a regression or new evidence.
- **P2-4:** signed Resend delivery receipts shipped in PR #75 and are configured
  in production. Bulgarian/English confirmation and update emails passed manual
  checks. DMARC remains deferred until the final product domain is active.
- **Pre-launch gates:** P2-8 isolated staging activation, remaining P2-10
  credential-retirement checks, DMARC, and final-domain edge controls.
- **P3-1:** merged and deployed. Two simultaneous browser sessions were manually
  confirmed; the revocation/socket/legacy remainder stays on
  [the rollout checklist](ops/db-safety/P3_SESSION_ROLLOUT.md).
- **P3-2:** shared 25-second HTTP deadline, cancellation propagated to foreground
  provider calls/retries, and explicit background-work separation are merged
  and deployed. See [the request-budget contract](ops/runtime/REQUEST_BUDGETS.md).
- **P3-3 MERGED/COMPLETE:** PR #59–#63, ending at `32fdc9e6`, with green
  PR and post-merge CI. The final 16 service-management and 25 payment/subscription
  routes merged together in PR #63: 132 guarded of 245.
  The 113 public/account/admin/token routes are permanently classified separately;
  no temporary management-migration entries remain. No new URLs, schema or
  business workflow; existing service/child checks remain. The batch is
  deployed; only the shared manual release checklist remains. See
  [the policy and close-out evidence](ops/security/RESTAURANT_ACCESS.md).
- **P3-4 complete/merged/deployed:** member-scoped operational queries,
  tenant-management writes, payment/session transactions, imports and
  translation overrides are constrained at their authoritative query boundary.
  Existing role/provider/idempotency contracts are preserved. RLS was evaluated
  and remains a separate future architecture decision.
  [Scope and evidence](ops/security/TENANT_QUERY_SCOPING.md).
- **P3-7 manual verification:** timezone-aware restricted hours, disabled-state
  login and overnight summaries passed after PRs #70/#71.
- **Backup operations:** the read-only Cloud Run job runs twice daily to a
  versioned off-host GCS bucket and deployment requires a fresh verified
  archive. The remaining recovery evidence is a disposable local restore drill.
- **Next gate:** finish the local restore drill and the remaining P3-1/P3-6
  manual checks, then choose the next product slice. Phase 20 multi-location /
  franchise management remains the named unbuilt product phase.

The detailed evidence and per-item status live in
[`SECURITY_AUDIT_VERDICT_22082026.md`](./SECURITY_AUDIT_VERDICT_22082026.md).

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

**Selling Point:** _"Every dish looks its best — customers eat with their eyes first."_

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

**Selling Point:** _"Your brand, your colors, your fonts — with built-in safeguards so it always looks great."_

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

**Selling Point:** _"Your menu is always complete, accurate, and ready for customers."_

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

**Selling Point:** _"Give your staff exactly the access they need — nothing more."_

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

**Selling Point:** _"Customers pay at the table. No waiting. Tips go up. Tables turn faster."_

---

### Phase 20: Multi-Location / Franchise Management

**Goal:** Centralized management for restaurant chains.

**Scope:**

- Menu templates (create once, deploy to multiple locations)
- Bulk price updates across locations
- Cross-location analytics comparison
- Organization-level user management

**Selling Point:** _"Manage all your restaurants from one screen."_

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

| Action               | Behavior                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- |
| **Table selection**  | `getOrCreateSession()` → if occupied, `getSessionBill()` loads history as submitted items |
| **Order submission** | Only `submitted: false` items sent → `markAsSubmitted()` marks them as history            |
| **Paid by Card**     | `closeSessionWithCard()` → MYPOS payment record → session PAID → clear session            |
| **Force Close**      | `closeSession()` → CLOSED_NO_PAYMENT → clear session                                      |

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

| Component    | Platform                  | URL                                                         |
| ------------ | ------------------------- | ----------------------------------------------------------- |
| **Frontend** | Vercel (Static)           | `https://qr-digital-menu-ivory.vercel.app`                  |
| **Backend**  | Google Cloud Run (Docker) | `https://qr-menu-backend-822584248302.europe-west1.run.app` |
| **Database** | Neon PostgreSQL           | Serverless, auto-scaling                                    |

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

## 🔷 GDPR / Legal Module ✅ (May 18, 2026)

**Goal:** Super-admin-controlled compliance layer for GDPR Art. 17 (right to erasure) and Art. 20 (data portability), cookie consent, and customisable legal text pages.

**Shipped:**

- `PlatformSettings` DB model — singleton row with 8 boolean feature toggles, per-locale JSON content fields (privacy/terms/cookies in EN/BG/RO), retention settings, data-controller metadata
- `PlatformSettingsModule` — public `GET /platform-settings` (no auth, 30s in-memory cache) + super-admin `GET/PATCH` with full field access
- `UsersDataModule` — `POST /users-data/erasure` (Art. 17): anonymise-in-place on `Order` rows for tax retention, cascade delete of `LoyaltyAccount`/`DeviceEnrollmentToken`/`VerificationToken` in single `$transaction`. `GET /users-data/export` (Art. 20): full JSON dump of all user data
- Retention cron (`0 3 * * *`): deletes expired `VerificationToken` rows + anonymises old `Order` PII; gated by `retentionCronEnabled` toggle
- `LegalSettingsPage` — super-admin panel with toggle switches + per-locale textarea editors (EN/BG/RO tabs) + retention inputs + controller metadata fields; sticky save bar with unsaved-state indicator
- `CookieConsentBanner` — localStorage-dismissed consent banner, reads public platform-settings API
- `/privacy`, `/terms`, `/cookies` customer-facing routes with platform-managed content
- `DataPrivacyTab` in customer profile — data export + erasure request UI
- 5 new `api.ts` helpers; i18n keys in EN/BG/RO

**Key files:**

- `apps/backend/src/platform-settings/platform-settings.service.ts`
- `apps/backend/src/platform-settings/platform-settings.controller.ts`
- `apps/backend/src/users-data/users-data.service.ts`
- `apps/backend/src/users-data/users-data.controller.ts`
- `apps/backend/src/users-data/retention.service.ts`
- `apps/frontend/src/pages/super-admin/LegalSettingsPage.tsx`
- `apps/frontend/src/components/legal/CookieConsentBanner.tsx`
- `apps/frontend/src/pages/legal/PrivacyPolicyPage.tsx`, `TermsPage.tsx`, `CookiePolicyPage.tsx`
- `apps/frontend/src/pages/profile/DataPrivacyTab.tsx`

---

## 🔷 Dashboard Vertical Sidebar ✅ (May 18, 2026)

**Goal:** Replace the horizontal tab bar (which overflowed and hid tabs on Pro/Enterprise) with a permanent vertical sidebar.

**Shipped:**

- All dashboard tabs always visible in a left-side vertical sidebar on desktop
- Menu Editor, POS, Kitchen permanently accessible — no more click-through overflow menu
- Mobile bottom nav unchanged (horizontal, ≤5 items)
- Theme-aware borders (`border-border/50`) work in both light and dark mode
- Single file change: `apps/frontend/src/pages/DashboardPage.tsx`

---

## 🔷 Super-Admin Dark OLED Redesign ✅ (May 18, 2026)

**Goal:** Full visual overhaul of all 5 super-admin pages for a professional internal tools aesthetic.

**Shipped:**

- `SuperAdminLayout`: emerald accent color, Shield branding, user avatar initials, `slate-950` background
- `OverviewPage`: colored stat cards with icon badges, donut chart with dark tooltip
- `TenantsPage`: polished table with badge tiers, Stripe indicator dots, chevron affordance
- `TenantDetailPage`: `SectionCard` component system, consistent `slate-900` dialogs, sticky danger zone
- `LegalSettingsPage`: sticky save bar with unsaved-state indicator, faded inactive sections when GDPR toggle off, locale editor with emerald active tab, toggle rows with visible focus rings

---

## 🔷 Pricing Page Redesign + Subscription Checkout Fix ✅ (May 19, 2026)

**Goal:** Replace the shallow, inaccurate `/pricing` page with a full-featured redesign, fix "Could not start checkout" error caused by missing Stripe env vars, and add annual billing support.

**Root cause of checkout failure:** `STRIPE_PRICE_*` env vars were unset → service threw a plain `Error` (returns 500 with no body) → frontend `catch {}` swallowed it and showed a generic message. Fixed with `BadRequestException` (400 with `{ message }` body) and dev-mode real error surfacing.

**Shipped:**

### Frontend — PricingPage.tsx (full rewrite)

- 4 tier cards: FREE €0 / STARTER €15 / PROFESSIONAL €25 / ENTERPRISE €45 monthly
- Annual billing toggle: 15% off, yearly prices shown as `€X.XX/mo · €Y/yr`, "Save 15%" badge
- Feature bullets sync'd to actual backend `FeatureFlag` enum (22 flags, accurate per tier)
- Feature comparison table: all 22 flags as rows, 4 tiers as columns, ✓ / — cells, section headers, mobile horizontal scroll
- FAQ accordion: 6 entries (VAT, cancellation, downgrade, free trial, transaction fees, billing-period switching)
- "Most Popular" badge: `whitespace-nowrap` prevents 2-row wrap in BG/RO
- All strings via `t(key, englishDefault)` — fully i18n-wired in EN/BG/RO

### Backend — Subscription module

- `PRICE_MAP` replaced with monthly+yearly lookup: `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`, `STRIPE_PRICE_PROFESSIONAL_MONTHLY`, `STRIPE_PRICE_PROFESSIONAL_YEARLY`, `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_YEARLY`
- `createCheckoutSession(restaurantId, tier, billingPeriod, ownerId)` — new `billingPeriod: 'monthly' | 'yearly'` param
- All `throw new Error(...)` → `throw new BadRequestException(...)` for proper HTTP 400 responses
- `CreateCheckoutDto` — new optional `billingPeriod` enum field (`'monthly'` | `'yearly'`, defaults to `'monthly'`)
- `subscription.service.spec.ts` — updated test calls to 4-arg signature
- `.env.example` — new 6 price env vars documented with setup instructions

### Frontend — Error surfacing

- `PricingPage.tsx` `catch` block: in `import.meta.env.DEV`, shows real backend `e?.response?.data?.message`; in production shows generic localized message
- `api.ts createCheckoutSession` — accepts `billingPeriod` param, passes to backend

### i18n (EN/BG/RO)

- `pricing.tiers.{free,starter,professional,enterprise}.b1-b10` — tier bullet points
- `pricing.features.*` — 23 feature comparison table row labels
- `pricing.sections.*` — 8 section header labels
- `pricing.faq.q1-q6.{question,answer}` — FAQ accordion content
- `pricing.billing.{monthly,yearly,saveAnnual}`, `pricing.popular`, etc.

**Key files:**

- `apps/frontend/src/pages/PricingPage.tsx` (full rewrite, ~320 lines)
- `apps/backend/src/subscription/subscription.service.ts` (PRICE_MAP + billingPeriod + BadRequestException)
- `apps/backend/src/subscription/subscription.controller.ts` (pass billingPeriod)
- `apps/backend/src/subscription/dto/checkout.dto.ts` (BillingPeriod enum)
- `apps/backend/src/subscription/subscription.service.spec.ts` (4-arg calls)
- `apps/backend/.env.example` (6 new STRIPE*PRICE*\* vars)
- `apps/frontend/src/lib/api.ts` (billingPeriod param)
- `apps/frontend/src/locales/{en,bg,ro}/translation.json` (pricing.\* keys)

**Analytics tab — STARTER gating:**

- `DashboardPage.tsx`: Analytics tab now uses `useFeature('analytics:full')` (was `analytics:basic`) — STARTER users no longer see the Analytics tab at all (consistent with STARTER having only basic analytics, full analytics being PRO+).

**Cloud Run redeployed:** revision `qr-menu-backend-00025-8qt`

---

## 🔷 Subscription UX Fixes ✅ (May 19, 2026)

**Goal:** Prevent duplicate subscriptions, add current-plan detection on pricing page, wire annual billing, display subscription details in BillingView, and fix password-reset error handling in super-admin.

**Shipped:**

### Duplicate Subscription Prevention

- `SubscriptionService.createCheckoutSession` now checks for active Stripe subscription before creating checkout — throws `BadRequestException('ALREADY_SUBSCRIBED')` if customer has active sub
- Frontend `PricingPage`: detects current tier → shows "Current Plan" badge (disabled button); lower tiers → "Manage in Billing Portal"; `ALREADY_SUBSCRIBED` error → auto-redirect to Stripe Portal
- Auto-renew caption shown near billing toggle

### Subscription Details in BillingView

- `getSubscriptionDetails()` retrieves period dates, interval, cancel status from Stripe
- BillingView plan card now shows `subscriptionStart`, `subscriptionEnd`, and billing interval
- Upgrade buttons route to `/pricing` for billing-period selection
- `SubscriptionsController.getStatus()` merges subscription detail into response

### Password Reset Error Handling

- `TenantDetailPage.tsx`: `resetPwMutation` gained `onError` handler — backend 400/500 now surfaces as visible error
- Client password validation tightened to match backend DTO regex (uppercase + lowercase + digit + 8+ chars)

**Key files:**

- `apps/backend/src/subscription/subscription.service.ts` — active-sub guard, getSubscriptionDetails
- `apps/backend/src/subscription/subscription.controller.ts` — getStatus merge
- `apps/frontend/src/pages/PricingPage.tsx` — current-plan detection, re-checkout guard
- `apps/frontend/src/components/subscription/BillingView.tsx` — upgrade routing, dates
- `apps/frontend/src/pages/super-admin/TenantDetailPage.tsx` — pw reset error handling
- `apps/frontend/src/lib/api.ts` — SubscriptionDetails interface

---

## 🔷 Stripe Type Cast Fix ✅ (May 19, 2026)

**Problem:** Stripe's dahlia API version returned untyped subscription objects. Passing them directly to Prisma `updateMany` caused silent type mismatches.

**Fix:** 4 explicit type casts (`subscription.status as string`, `subscription.id as string`) in `subscription.service.ts`.

**Key files:** `apps/backend/src/subscription/subscription.service.ts`

---

## 🔷 Analytics XLSX Export ✅ (May 19, 2026)

**Goal:** Replace single-sheet CSV with multi-sheet XLSX workbook, add BGN dual-currency columns, fix column header bugs.

**Shipped:**

- New `lib/analyticsExport.ts` (217 lines) — multi-sheet XLSX generation
- 5 sheets: Summary, Revenue Trend, Top Items, Peak Hours, Category Breakdown
- BGN dual-currency columns on all monetary sheets
- Excel auto-sizing columns + styled headers
- CSV field name bug fixed (was `name`/`value`, now `category`/`revenue`)
- `AnalyticsView.tsx` updated with new export function and header colors fix

**Key files:**

- `apps/frontend/src/lib/analyticsExport.ts`
- `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`

---

## 🔷 QR Code Print Layout Fixes ✅ (May 19, 2026)

**Problem:** Printable QR code templates had inconsistent margins and hardcoded English labels.

**Fix:** Refactored all 3 templates (Classic, Premium, Minimal) with consistent margins, proper padding, and i18n-wired labels in EN/BG/RO.

**Key files:**

- `apps/frontend/src/components/tables/PrintableQRCodes.tsx` (190 lines changed)
- `apps/frontend/src/components/tables/TableView.tsx`

---

## 🔷 Landing FAQ on Home Page ✅ (May 21, 2026)

**Goal:** Add a pre-sale FAQ section to the landing/home page between the CTA and footer to answer common customer questions before sign-up.

**Shipped:**

- `LandingFAQ.tsx` component with 8 FAQ items in accordion layout
- Smooth expand/collapse transitions + keyboard navigation + ARIA labels
- ~30 i18n keys under `landing.faq.*` in EN/BG/RO
- Help link moved from dashboard tabs to sidebar footer (less prominent, more appropriate)
- FAQ section inserted between CTA and footer on HomePage

**Key files:**

- `apps/frontend/src/components/landing/LandingFAQ.tsx`
- `apps/frontend/src/pages/HomePage.tsx`
- `apps/frontend/src/pages/DashboardPage.tsx`
- `apps/frontend/src/locales/{en,bg,ro}/translation.json`

---

## 🔷 Help Center CMS ✅ (May 22, 2026)

**Goal:** Move all Help/FAQ content from hardcoded i18n JSON into a Prisma-backed CMS with full CRUD. Integrate into super-admin dashboard for easy text editing and new FAQ creation.

**Backend — HelpContentModule:**

- `HelpContent` model: `id`, `section` (landing/dashboard), `categoryKey`, `itemKey`, `sortOrder`, `locale` (EN/BG/RO), `title`, `body`, `active`, timestamps
- `HelpContentService`: `findBySection`, `findBySectionAndLocale`, `create`, `update`, `delete`, `reorder`
- `HelpContentController`: 6 endpoints — public `GET /help-content/:section`, super-admin CRUD + reorder (all JWT + SuperAdmin guarded)
- DTOs: `CreateHelpContentDto`, `UpdateHelpContentDto`, `ReorderHelpContentDto` with class-validator
- Tests: `help-content.service.spec.ts` (118 lines), `help-content.controller.spec.ts` (96 lines)

**Frontend — HelpCenterPage CMS:**

- `HelpCenterPage.tsx` (507 lines) — super-admin page with sub-tabs (Landing FAQ / Dashboard Help), locale tabs (EN/BG/RO), inline create/edit/delete with modal forms, category grouping
- `LandingFAQ.tsx` — home page component now fetches from API via `useQuery(['help-content', 'landing', i18n.language])`
- `HelpView.tsx` (310 lines) — dashboard Help tab now fetches from API instead of hardcoded i18n
- `api.ts` — 6 functions: `getHelpContent`, `getAdminHelpContent`, `createHelpContent`, `updateHelpContent`, `deleteHelpContent`, `reorderHelpContent`
- `SuperAdminLayout.tsx` — Help Center nav item (`MessageCircleQuestion` icon)
- `App.tsx` — lazy route for `/super-admin/help`

**Seed:**

- `seed-help-content.ts` (581 lines) — 50+ items across landing FAQ + dashboard help in EN/BG/RO, idempotent (checks existing count)
- `seed-help-only.ts` (23 lines) — single-purpose help content seed, zero destructive operations

**Key files:**

- `apps/backend/prisma/schema.prisma` — HelpContent model
- `apps/backend/src/help-content/*` — 7 files (module, service, controller, 3 DTOs, 2 specs)
- `apps/backend/prisma/seed-help-content.ts`, `seed-help-only.ts`
- `apps/frontend/src/pages/super-admin/HelpCenterPage.tsx`
- `apps/frontend/src/components/landing/LandingFAQ.tsx`
- `apps/frontend/src/pages/Dashboard/HelpView.tsx`
- `apps/frontend/src/lib/api.ts`

---

## 🔷 Seed Safety Guards ✅ (May 22, 2026)

**Goal:** Prevent `npm run seed` from accidentally wiping production or populated databases.

**Shipped:**

- `seed.ts`: 3-layer guard — (1) `NODE_ENV === 'production'` check, (2) remote DB host check, (3) user count > 5 check (refuses unless `FORCE_SEED_WIPE=true`)
- `seed-help-content.ts`: checks `helpContent.count() > 0` before inserting — idempotent, never deletes
- `seed-help-only.ts`: single-purpose script, zero destructive ops — only calls `seedHelpContent()`
- `seed-demo-restaurants.ts`: upsert pattern throughout — `findUnique` before `create`, `findFirst` before `update`

**Key files:**

- `apps/backend/prisma/seed.ts`
- `apps/backend/prisma/seed-help-content.ts`
- `apps/backend/prisma/seed-help-only.ts`
- `apps/backend/prisma/seed-demo-restaurants.ts`

---

## 🔷 Prisma PgBouncer Connection Pool Fix ✅ (May 21, 2026)

**Problem:** Prisma's default connection pool settings conflicted with Neon's PgBouncer transaction mode, causing sporadic connection errors under load.

**Fix:** Configured PgBouncer-compatible connection parameters in `PrismaService`. Added `super({ log: ['warn', 'error'] })` for pool exhaustion visibility in Cloud Run logs.

**Key files:** `apps/backend/src/prisma/prisma.service.ts`

---

## 🔶 V3.5 — Platform Expansion (Complete — June–July 2026)

### Phase 22: Payment Provider Expansion ✅ (June 2026)

**Goal:** Support Bulgarian payment methods beyond Stripe — BORICA EMV-3DS (direct card processing) and ePay.bg (hosted checkout).

**Shipped:**

- **BORICA** (`payment/borica.provider.ts`) — RSA-SHA256 MAC signing, TRTYPE=90 protocol, EMV-3DS authentication, EUR enforcement, ADDENDUM support, certificate validation
- **ePay.bg** (`payment/epay.provider.ts`) — HMAC-signed hosted checkout, callback verification, merchant config, invoice lifecycle management, expired-invoice recovery
- **MyPOS** (`payment/mypos.provider.ts`) — Card terminal integration, demo/live mode, settlement workflow
- All behind `IPaymentProvider` interface — no provider-specific logic outside providers
- Independent feature flags per provider; `paymentsEnabled` gates public menu payment visibility
- Provider status labels + cards in PaymentsView dashboard

**Selling Point:** _"Every Bulgarian payment method — one unified checkout."_

---

### Phase 23: Print Station System ✅ (June 2026)

**Goal:** Thermal receipt printing for kitchen/bar — orders route to correct print station based on item category.

**Shipped:**

- `PrintStation` model — per-category assignment, health status tracking
- `PrintAgentToken` model — device authentication tokens
- `PrintJob` model — PENDING/PRINTING/COMPLETED/FAILED reliability states with retry logic
- ESC/POS ticket builder — Cyrillic encoding support, customizable receipt template per station
- Expo Android printer agent (`PRINT EMULATOR/escpresso/`) — socket-based job delivery
- EventsGateway routing — agent auth, `emitPrintJob`, `print:ack` handler
- `PrintStationsView` dashboard tab — station management, health badges, token generation modal
- Printer agent QR setup scanner

**Selling Point:** _"Orders print instantly where they're needed — kitchen, bar, or counter."_

---

### Phase 24: Analytics Deep-Dive v2/v3 ✅ (June 2026)

**Goal:** Professional-grade analytics with advanced metrics, revenue reconciliation, and loading polish.

**Shipped:**

- **Phase 2 metrics:** Refund rate, payment split breakdown, repeat customer rate, revenue per hour
- **Revenue reconciliation strip:** Ordered vs collected comparison
- **Completion rate:** Replaced misleading Served-rate KPI
- **Phase 3:** Layout-matched loading skeleton
- At-order price snapshots for accurate historical revenue
- DB-side aggregations for large datasets; bounded cache
- DST-correct peak hours analysis
- XLSX export gated to PRO tier; includes all new metrics
- STARTER tier: basic KPIs + revenue trend visible

**Selling Point:** _"Know exactly how your restaurant is performing — down to the hour."_

---

### Phase 25: i18n Expansion — 12 Locales ✅ (June 2026)

**Goal:** Expand from 3 languages (EN/BG/RO) to 12 for EU market readiness.

**Shipped:**

- New locales: DE, ES, FR, IT, ZH, EL, JA, RU, AR (RTL)
- DeepL-generated locale files with manual QA pass
- All public menu UI chrome + dashboard fully translated
- lazy-loaded translation bundles (183→54 KB gz per language)
- i18next interpolation for dynamic values (FR/DE grammar)
- RTL-aware layout adjustments for AR

**Selling Point:** _"Your menu speaks every customer's language."_

---

### Phase 26: Split Bill ✅ (June 2026)

**Goal:** Staff can split a table bill multiple ways — per item, evenly, or custom partial amounts.

**Shipped:**

- `SplitMode` enum: PER_ITEM, EVEN, CUSTOM_PARTIAL
- `SplitProvider` — allocation calculation, item count draw-down
- Multiple settlements per session with balance tracking
- Theme-aware `PosSplitDrawer` component
- Even split uses people-left model; locks after first payment
- Settlement lock ordering to prevent race conditions
- Cash request settlement flow for partial cash payments

**Selling Point:** _"Tables settle however they want — item by item, evenly, or custom."_

---

### Phase 27: Service Points ✅ (June 2026)

**Goal:** Non-table QR ordering for bar counters, pickup windows, and service locations.

**Shipped:**

- `ServicePoint` model with unique QR codes
- Public ordering flow parallel to table ordering
- Dashboard management in `LiveTablesView`
- Service point session isolation + IDOR hardening
- QR code download for each service point

**Selling Point:** _"QR ordering works for every spot in the restaurant — not just tables."_

---

### Phase 28: Web Push Notifications ✅ (June 2026)

**Goal:** Push notifications for dashboard users — new orders, assistance requests, payment confirmations.

**Shipped:**

- VAPID-based push via `web-push` library
- `PushSubscription` model — per-user device subscriptions
- Service worker via `vite-plugin-pwa`
- Notification click opens correct dashboard page
- VAPID key rotation with auto-resubscribe
- Prod-guarded: keys in Google Secret Manager
- SSRF-hardened push fetch

**Selling Point:** _"Staff get notified even when the dashboard isn't open."_

---

### Phase 29: Context-Aware Upselling ✅ (June 2026)

**Goal:** Smarter item suggestions based on weather, time of day, and menu context.

**Shipped:**

- WeatherAPI integration — weather-context item suggestions
- AUTO mode trending with bounded queries, batched public-menu endpoint
- Deterministic perfect-pairing triggers
- Base-score scaling with input array length; negative-score prevention
- Scan retention tracking for trending accuracy

**Selling Point:** _"Suggest the right dish for the moment — hot soup on a cold day."_

---

### Phase 30: Staff Device Management ✅ (June 2026)

**Goal:** Secure device enrollment with shared device mode for kitchen/bar stations.

**Shipped:**

- Device enrollment hardening — token lifecycle, session version
- Shared device mode enforcement
- Device count limits per staff member
- PIN login audit trail
- Staff usage tracking in device sessions
- CSPRNG PIN generation (`crypto.randomInt`)

**Selling Point:** _"Every staff device is secure, tracked, and always ready."_

---

### Phase 31: Reservations System ✅ (July 2026)

**Goal:** Full restaurant reservation management — public booking, dashboard CRUD, SMS notifications, self-service.

**Shipped:**

- Public `BookingPage` — date/time picker, guest count, seating preferences, allergens, accessibility needs
- `BookingConfirmationPage` + `BookingManagePage` — customer self-service (modify/cancel)
- Dashboard `ReservationsView` — calendar, list, analytics, manual reservation creation
- Seating zones with capacity tracking; configurable duration
- Blackout dates; atomic capacity enforcement
- SMS notifications (Twilio + SIM-based SMS gateway provider abstraction)
- Self-service manage links (short in-house URL in SMS)
- 12-lang i18n with localized date pickers (`react-datepicker`)
- Real-time status sync via socket
- Tier-gated (PROFESSIONAL+); full feature-gate enforcement
- Reservation analytics dashboard

**Selling Point:** _"Guests book their own table. Restaurant stays full. No phone tag."_

---

### Phase 32: Branding/Theme Consolidation ✅ (July 2026)

**Goal:** Eliminate theme FOUC, unify theme state, and harden branding across all surfaces.

**Shipped:**

- `ThemeContext` — shared theme state across dashboard + public menu
- `PosThemeContext` — POS-specific theme (always dark)
- FOUC fix: per-restaurant theme check before global in inline script
- Light default enforcement; theme persistence per storage key
- Theme-aware cart, checkout, POS cart sheet
- Press-twice bug fix on public menu theme toggle

**Selling Point:** _"Your brand looks perfect — first paint, every time."_

---

### Phase 33: Loyalty Checkout & Redemption ✅ (July 2026)

**Goal:** Customers see and redeem loyalty rewards directly during checkout.

**Shipped:**

- Tier progress bar in CheckoutPage showing progress toward next tier
- Reward redemption with deterministic per-line `redeemCartIds`
- Automated menu reward pricing
- FOR UPDATE locking on loyalty ledger writes
- Guest checkout guard for tier progress row
- Clamped progress bar width (0–100%)

**Selling Point:** _"Customers see their rewards grow — and spend them immediately."_

---

### Phase 34: Translation Pipeline Rework ✅ (July 2026)

**Goal:** Replace the fragile glossary-only gate with a robust job-queue pipeline.

**Shipped:**

- `TranslationJob` sidecar table — progress tracking, quota management
- Job queue with retry/backoff for DeepL API calls
- Native DeepL glossary support (not dish-stuffed workaround)
- Per-restaurant quota enforcement
- Progress bar UI during translate-all operations
- Race-condition hardening (6 edge cases fixed)

**Selling Point:** _"Menu translation just works — at scale, with progress you can watch."_

---

### Phase 35: Allergen/Dietary Tag System ✅ (July 2026)

**Goal:** Rich allergen and dietary preference tagging with visual icons.

**Shipped:**

- 7 allergen SVG icons (gluten, dairy, nuts, eggs, fish, shellfish, soy)
- Dietary tags (vegan, vegetarian, spicy, new, featured)
- `TagPicker` component with search in menu editor
- `MenuItem.tags String[]` on Prisma schema + DTOs
- 12-lang i18n for all tag labels
- Tap-to-open allergen tooltips on public menu cards
- Description expand/collapse for long item descriptions

**Selling Point:** _"Every dietary need is visible at a glance — no surprises."_

---

### Phase 36: Dashboard Polish & Hardening ✅ (July 2026)

**Goal:** Close remaining UX gaps, fix analytics math, harden security, improve dev experience.

**Shipped:**

- Dashboard URL tab persistence — refresh keeps your place
- `react-datepicker` replacing native date inputs across all dashboard tabs
- Analytics math fixes: deleted-item grouping keys, preset execution against PostgreSQL, timezone fixture isolation
- POS offline-queue fixes: stale notice clearing, duplicate order prevention
- Payment settlement lock ordering; session mutation serialization
- CSRF webhook allowlist hardening; conditional `/orders` CSRF
- Socket room join authorization; malformed room rejection
- Checkout page: consistent payment labels, cash-request refresh hardening
- Menu: no-store Cache-Control on public endpoints; undefined route prevention
- Dev: NODE_ENV passthrough in turbo tasks; `start:dev` boot heartbeat
- SWC compiler for NestJS (dev compile 15s → 0.3s)
- Stale chunk auto-reload (`lazyWithReload`) for deployed SPA
- 21-agent system audit: 259 findings → 56 fixes in single remediation pass

**Selling Point:** _"Rock-solid. Every edge case hardened. Every pixel polished."_

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
