# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Turborepo monorepo with npm workspaces (`apps/*`). Two apps, no `packages/` directory (the README mentions one but it doesn't exist):

- **`apps/backend`** — NestJS 11 + Prisma 6 + Neon (hosted Postgres, pooled). API on `:3000` under `/api`, Swagger at `/api-docs`.
- **`apps/frontend`** — Vite + React 18 + Tailwind v4 + TanStack Query + i18next + socket.io-client. Dev server on `:3001` (`strictPort: true`).
- **Currency** — `apps/frontend/src/lib/currency.ts` — `formatEuro()` and `formatBgn()` at BNB fixed rate 1 EUR = 1.95583 BGN. Used in CartDrawer, CheckoutPage, PaymentModal, ItemWithOptions.

## Common commands

### Root (turbo orchestrated)
```bash
npm run dev      # runs both apps (backend :3000, frontend :3001)
npm run build    # turbo build
npm run lint     # turbo lint
npm run format   # prettier on all .ts/.tsx/.md
```

### Backend (`apps/backend`)
```bash
npm run start:dev      # NestJS watch mode
npm run build          # prisma generate + nest build
npm run lint           # ESLint --fix
npm test               # Jest unit tests
npx jest path/to/file.spec.ts -t "test name"   # single test
npm run test:e2e       # e2e (run `npm run test:prepare` first to copy .env.test → .env)
npm run test:cov       # coverage
npm run seed           # build + prisma db seed (runs prisma/seed.ts)
npm run migrate:dev    # prisma migrate dev
npx prisma db push     # preferred when migration history is drifted (additive schema only)
```

### Frontend (`apps/frontend`)
```bash
npm run dev      # vite --host (strictPort, fails fast on conflict)
npm run build    # vite build
npm test         # Vitest with jsdom
npm start        # serve dist/ on :3001
```

## Environment & DB

- Per-app `.env` files: `apps/backend/.env`, `apps/frontend/.env` — copy from `.env.example`.
- DB is **hosted Neon Postgres** — no local Postgres in dev. The root `docker:up` / `docker:down` scripts exist but are not part of daily flow.
- API base URL: **`/api`** (same-origin). Frontend does NOT call backend directly. Vite dev server proxies `/api` and `/socket.io` to backend target derived from `VITE_API_URL` env. This is critical for httpOnly cookies — `sameSite: 'lax'` blocks cross-site AJAX.
- `VITE_API_URL` in `apps/frontend/.env` is ONLY used by `vite.config.js` for proxy target. `api.ts` hardcodes `/api`.
- Global API prefix `/api` is set in `apps/backend/src/main.ts` via `app.setGlobalPrefix('api')`.
- CORS origin = `FRONTEND_URL` env (default `http://localhost:3001`).

## Backend architecture

NestJS modules registered in `apps/backend/src/app.module.ts` (in order): Prisma, Auth, Restaurants, Menu, Orders, Assistance, Dashboard, Tables, Health, Feedback, Translation, Storage, Events, Payment, Loyalty. `ThrottlerGuard` applied globally (100 req / 60s).

Cross-cutting concerns:
- **Auth** (`auth/`) — JWT + Google OAuth + magic link + Email OTP via Passport strategies. **JWT stored in httpOnly cookie** (not localStorage). `jwt.strategy.ts` reads from `request.cookies.token` first, Bearer header fallback. CSRF double-submit cookie pattern on all state-changing endpoints (`X-CSRF-Token` header must match `csrf-token` cookie). `AuthContext` no longer touches localStorage for token — reads user via `/auth/me` which sends cookie automatically.
- **CSRF** — `main.ts` CSRF middleware validates `X-CSRF-Token` header matches `csrf-token` cookie on POST/PATCH/DELETE/PUT. Skipped in dev mode (`NODE_ENV !== 'production'`) and for Stripe webhook path. `GET /api/auth/csrf-token` issues token.
- **401 interceptor** (`api.ts`) — redirects to `/login` on 401 EXCEPT for `/auth/me` (returns rejected promise instead). This prevents logout loop during app initialization. AuthContext handles `/auth/me` failures silently.
- **Same-origin proxy** — `api.ts` baseURL is `/api` (same-origin). `vite.config.js` proxies `/api` and `/socket.io` to backend. `SocketContext` connects via `io()` with no URL. NEVER change `api.ts` baseURL to read from `VITE_API_URL` env directly — that creates cross-origin requests, which breaks httpOnly cookies.
- **Realtime** (`events/`) — `@nestjs/websockets` + socket.io for live order / assistance / table status / payment pushes. `EventsGateway.emitTableStatusChanged(restaurantId, tableId, sessionId)` emits `table:status-changed` — called from 4 locations (`OrdersService.create`, `OrdersService.updateStatus`, `PaymentService.handleWebhookEvent`, `PaymentService.closeSession`). `payment:confirmed` event emitted on successful payment.
- **Payment** (`payment/`) — Stripe Connect pay-at-table + Waiter POS session management. `IPaymentProvider` interface abstracts provider; `StripeProvider` implements it (future providers: MyPOS, Square). `PaymentService` handles sessions, bill calculation, PaymentIntent creation, webhook processing, force-open (`forceOpenSession()`), card-payment close (`closeSessionWithCard()` — creates MYPOS payment, sets session PAID, emits socket events). `PaymentController` has 7 routes: sessions, bill, create-payment-intent, webhook (raw body), history, force-open, close-card. `RestaurantsService` manages Stripe Connect account onboarding (create account link, status check, disconnect). Never add provider-specific logic outside the provider — always go through `IPaymentProvider`.
- **Tables** (`tables/`) — `getTablesWithStatus()` fetches tables + active sessions in parallel via `Promise.all`, derives status per table (empty/waiting/occupied/paid). `GET /tables/status/:restaurantId` returns enriched data with `orderCount`, `totalAmount`, `customerNames`, `sessionStatus`, `sessionId`. `getTableOrders(tableId, restaurantId)` returns all orders for a table's active OPEN session with item names — used by dashboard live view and POS order history.
- **Translation** (`translation/`) — DeepL. Platform owns the key via `DEEPL_API_KEY` env var in `apps/backend/.env`. `TranslationService.translateTexts/translateText/translateObject` take **no** `apiKey` param — the service reads the key internally. `restaurant.deeplApiKey` column exists in schema but is **never read or written** — do not add call-sites that touch it. Three translation paths: (1) fire-and-forget pre-warm on menu item/category/option create+update; (2) owner-triggered "Translate All Now" via `POST /api/restaurants/:id/translate-all`; (3) lazy on-demand per-request via `GET /api/menu/public/:id?lang=<code>` — translates missing entries and caches to DB `translations` JSON field immediately. `lang` param is validated against `restaurant.targetLanguages` — arbitrary langs are rejected. Free-tier detection: key ending in `:fx` routes to `api-free.deepl.com`.
- **Storage** (`storage/`) — Cloudflare R2 client for image uploads. `StorageService` runs sharp image processing pipeline: EXIF auto-rotate, resize to 1200px max, convert to WebP (quality 82), generate 400px thumbnail (quality 75), upload both in parallel. Methods: `upload(fileBuffer, originalName, contentType)` returns URL; `uploadWithThumbnail(...)` returns `{url, thumbnailUrl}`. ALLOWED_TYPES: JPEG, PNG, WebP. File filter in controllers additionally restricts to JPEG/PNG only. R2 creds in `apps/backend/.env`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.
- **Schedule** — `@nestjs/schedule` is registered **only** inside `loyalty.module.ts`. Loyalty expiry-reminder cron runs at midnight UTC.

## Loyalty subsystem (read these before changing tier or points logic)

This is the most heavily modified subsystem. Single sources of truth:

- **`apps/backend/src/loyalty/loyalty-tiers.utils.ts`** — `getTierInfo()` and `tierConfigFromRestaurant()`. Never hardcode tier thresholds (500/2000) or multipliers (1.2/1.5) anywhere — read them from the `Restaurant` row through this util.
- **`apps/backend/src/loyalty/loyalty-ledger.utils.ts`** — FIFO point ledger ops: `expireAccountPoints`, `redeemAccountPoints`, `addEarnedPointBatch`, `getExpiringPointBatches(..., onlyUnnotified)`, `markRemindersSent`. **Never use `Promise.all` over Prisma writes inside `$transaction`** — use `updateMany` instead.
- **`apps/backend/src/loyalty/loyalty.service.ts`** — `buildRewardSummary()` defines the tier/points API contract for the frontend. Cron `runDailyExpiryReminders` runs daily.
- **`apps/backend/src/orders/orders.service.ts`** — happy-hour detection uses **Luxon** with the restaurant's IANA `timezone` field (never raw `new Date()`). Multiplier strategy is `Math.max(happyHour, tier)`, not additive.

Frontend consumes tier info directly from the API — do not recompute it on the client:
- `apps/frontend/src/pages/CustomerProfilePage.tsx`
- `apps/frontend/src/pages/CheckoutPage.tsx`

Design rationale and bug history: `03.05.26_loyalty_rewards_implementation.md` at repo root.

### Loyalty rate semantics (important — past source of bugs)

- **`loyaltyExchangeRate`** (Int, default 10) — points **earned** per €1 spent. Formula: `points = floor(totalEuros × earnRate × multiplier)`. A value of 10 gives 100 pts on a €10 order.
- **`loyaltyRedeemRate`** (Int, default 150) — points **needed** for €1 of discount. `rewardValue = points / redeemRate`. Higher = less generous for customers.
- Effective cashback % = `earnRate / redeemRate × 100`. Defaults give 6.7%. The SettingsView shows this live and warns when it exceeds 15%.
- **`@Max(100)`** is enforced on `loyaltyExchangeRate` in `update-restaurant.dto.ts` — do not remove it.
- The initial migration (`20260503092841`) added the column with `DEFAULT 20`. Migration `20260503200750` corrects existing rows where the value is still 20 to the intended default of 10.
- If a restaurant reports absurdly high point awards, check `loyaltyExchangeRate` in the DB first — it is the most likely culprit.

## Menu options / choices — JSON schema (critical)

Choices are stored as `Json` on `MenuOption.choices`. The schema is **always**:
```json
[{ "name": "Medium Well", "priceModifier": 0.00 }, ...]
```

There is **no `id` field** and the price key is `priceModifier`, not `price`. This affects every layer:

- **DB / seed / `ManageOptionsModal.tsx`** — create choices as `{ name, priceModifier }`.
- **`ItemWithOptions.tsx`** — builds `selectedOptions` as `{ optionId, optionName, choiceName, priceModifier }` when adding to cart. Note: `choiceName` (not `choiceId`).
- **`orders.service.ts`** — validates choices server-side by matching `c.name === selected.choiceName` and reads `choice.priceModifier`. **Never change this to `c.id` or `choice.price`** — those fields don't exist and will throw "Invalid choice selected" for every order with options.
- **`CartContext.tsx`** — totals options via `opt.priceModifier || 0`.

Key files for the options flow:
- `apps/backend/src/orders/orders.service.ts` — server-side choice validation (lines ~143–169)
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — builds cart item with `selectedOptions`
- `apps/frontend/src/components/menu/ManageOptionsModal.tsx` — owner UI for creating options/choices
- `apps/frontend/src/context/CartContext.tsx` — cart totals using `priceModifier`

## Frontend architecture

- **Routing** — React Router v7 in `apps/frontend/src/App.tsx`.
- **State** — React Context per concern in `src/context/`: `AuthContext`, `RestaurantContext`, `MenuContext`, `CartContext`, `OrderContext`, `AssistanceContext`, `SocketContext`, `NotificationContext`, `PosContext`. Server state via TanStack Query.
- **API client** — `src/lib/api.ts` (axios + CSRF interceptor). BaseURL is `/api` (same-origin, Vite proxy). `withCredentials: true` sends httpOnly cookie. CSRF token fetched once, cached, attached to state-changing requests. 401 interceptor skips `/auth/me` to prevent logout loop. All requests go through this — never call axios directly elsewhere.
- **UI primitives** — `src/components/ui/` (Radix + class-variance-authority + tailwind-merge).

## Conventions & gotchas

- Backend `clean` script uses Windows `rmdir /s /q` (`apps/backend/package.json`). Cross-platform users should run `rm -rf dist` manually if needed.
- `npm run build` in backend always regenerates the Prisma client before `nest build` — no need to run `prisma generate` separately.
- Frontend `strictPort: true` means a stale dev server on `:3001` blocks startup. Kill with PowerShell (`Stop-Process -Id <pid> -Force`); Git Bash `taskkill` mangles paths.
- When adding new fields on `Restaurant` (or any DTO-validated model), also add `@Min` / `@Max` / `@IsOptional` to `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` — `class-validator` is the input boundary.
- **NEVER change `api.ts` baseURL** to read from `VITE_API_URL` directly. That creates cross-origin requests, breaking httpOnly cookies. Always use `/api` (same-origin, Vite proxy).
- **NEVER read token from localStorage** in AuthContext or anywhere else. Token lives in httpOnly cookie only. Use `/auth/me` to get current user.
- **CSRF middleware ordering in main.ts**: Helmet CSP → cookieParser → CSRF validation → app.useGlobalPipes. CSRF must run after cookieParser but before guards.

## Waiter POS (`/staff/pos`)

Third layout (`PosLayout`) alongside `AppLayout` and `PublicLayout`. Full-viewport, mobile-first Point-of-Sale for waiters. `PosContext` (`apps/frontend/src/context/PosContext.tsx`) owns all POS state — in-memory only, completely isolated from `CartContext`.

### Key concept: `submitted` flag
`PosCartItem.submitted: boolean` separates order history (read-only display, gray, ✓ checkmark) from pending items (full quantity/note/delete controls):
- `addItem()` → `submitted: false`
- `markAsSubmitted()` → all pending → submitted (after order creation)
- `setHistoryItems(history)` → replaces submitted items, keeps pending
- `clearCart()` → removes only pending (preserves history)
- `resetCart()` → removes ALL items (table switch)
- `buildSpecialRequests()` → only includes `submitted: false` items
- `getPendingTotal()` → sum of only non-submitted items

### Session lifecycle
| Action | Endpoint | Auth | Behavior |
|--------|----------|------|----------|
| Open table | `POST /payments/session` | Public | Idempotent `getOrCreateSession` |
| Force open | `POST /payments/session/force-open` | JWT | Closes existing OPEN, creates new |
| Load history | `GET /payments/session/:token/bill` | Public | All past orders → `setHistoryItems()` |
| Submit order | `POST /api/orders` | Public | Only pending items → `markAsSubmitted()` |
| Paid by card | `POST /payments/session/:token/close-card` | JWT | MYPOS payment → PAID |
| Force close | `POST /payments/session/:token/close` | JWT | CLOSED_NO_PAYMENT |

### POS files (15 new)
- Context: `apps/frontend/src/context/PosContext.tsx` (190 lines, 15 methods)
- Pages: `PosLayout.tsx`, `PosPage.tsx` in `apps/frontend/src/pages/pos/`
- Components: 12 files in `apps/frontend/src/components/pos/`
- Auth guard: `apps/frontend/src/components/StaffRoute.tsx`
- Backend: `payment.service.ts` (+`forceOpenSession`, `+closeSessionWithCard`), `tables.service.ts` (+`getTableOrders`)

## Roadmap & current focus

Source of truth: `CODING_ROADMAP.md`. Detailed per-phase plans under `.planning/phases/`.

**Shipped — V1 MVP (April 2026):** auth (JWT + Google OAuth), restaurant CRUD, menu builder + image upload (upgraded May 2026 to R2 + sharp), tables + QR codes, contactless ordering with server-side pricing, owner dashboard, Docker Compose, Swagger.

**Shipped — V2 Premium (Phases 9–14):** smart analytics, customer feedback + Google Review redirect, automated dayparting (scheduled categories with timezone), multi-language menu (EN/BG/RO + DeepL), realtime via socket.io, upselling / trending / perfect pairing.

**Shipped — post-roadmap (May 2026):** full loyalty program — FIFO point ledger, configurable VIP tiers, timezone-aware happy hour, expiry reminder cron. Image upload overhaul — Cloudflare R2 migration, sharp WebP compression pipeline (80-95% size reduction), `ImageUploadInput` component (preview thumbnail + remove), JPEG/PNG validation, toast success/error feedback.

**Shipped — V2.5 Visual Polish, Branding & Mobile UX (May 2026):**
- **Phase 15** — Square images, pinch-to-zoom lightbox (full gesture rewrite), category banners, mobile aspect ratio + card height fixes.
- **Phase 16** — Google Fonts picker, 4-color scheme editor, WCAG contrast validator, live BrandingPreview panel, CSS custom props on public menu.
- **Phase 17** — Menu Check widget (`MenuCheckWidget.tsx`, `/menu/audit/:id`), severity levels, one-click fix navigation.
- **Mobile UX overhaul** — `viewport-fit=cover` + iOS PWA metas; layout routes in `App.tsx` (customer routes get no app header/container); CartDrawer → bottom sheet on mobile; bottom navigation on dashboard mobile; safe-area insets throughout; PublicMenuPage spacing tightened for 375px; CheckoutPage panel padding responsive; OrderConfirmationPage full premium redesign with live status.

**Shipped — UI/UX Audit & Theme Polish (May 4, 2026):**
- **Design system rewrite** (`index.css`) — warm restaurant color palette (HSL tokens throughout), dropped Plus Jakarta Sans (now 2 fonts: Outfit + Playfair Display), fixed `.text-glow` and `.premium-bg` to use `color-mix(in srgb, var(--token) N%, transparent)` instead of invalid `hsla(var(...))` syntax, removed `html { transition-colors }` (was causing 500ms delay globally), added `@media (prefers-reduced-motion)` for `.animate-float`.
- **Table / assistance flow fixes** — removed browser `prompt()` for table number (table always comes from QR URL `?table=<name>`); Call Waiter now shows accessible `role="alert"` / `aria-live="polite"` notice when no table context, button disabled during `assistanceLoading`.
- **Default customer theme** — new `defaultTheme String? @default("light")` field on `Restaurant` schema (pushed to Neon). `ThemeToggle` accepts `storageKey` + `defaultTheme` props; public menu uses per-restaurant localStorage key (`theme-{restaurantId}`) so each venue remembers independently. Dashboard toggle unchanged. Owner sets default in `BrandingEditor` (Light/Dark picker). ThemeToggle always visible on public menu even when custom branding is active.
- **Accessibility** — logo alt text fixed (`${name} logo`), language select label added, accessible loading states (removed decorative `animate-pulse`), improved `aria-label` on ThemeToggle (`Switch to dark/light mode`).
- **Schema fields added:** `Restaurant.defaultTheme` (String?, default `"light"`).
- **Key files:** `index.css`, `PublicMenuPage.tsx`, `ThemeToggle.tsx`, `BrandingEditor.tsx`, `index.html`, `schema.prisma`, `update-restaurant.dto.ts`.

**Shipped — Analytics & Translation Overhaul (May 5, 2026):**
- **Analytics fixes** — `staleTime: 0` in `useAnalytics.ts` (always fresh); `OrderContext` invalidates `['analytics']` TanStack Query cache on every incoming socket event (new order or status change); `DashboardService` fetches `restaurant.timezone` and passes it through `getRevenueTrend`, `getPeakHours`, `getSummary` — all date/hour grouping now uses Luxon with restaurant local time instead of server UTC.
- **Translation overhaul** — Platform-managed DeepL key (`DEEPL_API_KEY` env var); `TranslationService` reads key internally, no `apiKey` param on any method; `restaurant.deeplApiKey` column kept but never touched; fire-and-forget pre-warm on menu create/update; lazy on-demand public menu translation with DB caching (`?lang=<code>`); `lang` validated against `restaurant.targetLanguages`; `fallbackLng` changed to `'bg'`; language picker (BG/EN/RO) added to dashboard header; SettingsView removes API key field — only language checkboxes and Translate button remain; locale JSON audit (added `timezone`, `timezoneDesc`, `translationPoweredBy`, `failedSave`, `failedInitiate`; removed obsolete `deeplApiKey`/`googleApiKey`/`apiKeyRequired`).

**Shipped — Customer Auth, UI Bug Fixes & Translation Gaps (May 6, 2026):**
- **Customer auth (Email OTP)** — `VerificationToken` model added to schema (`id, email, code, expiresAt, usedAt, createdAt`, `@@index([email])`); `User.phone String?` added. `AuthService.sendOtp` + `verifyOtp` methods: 6-digit code, bcrypt-hashed (10 rounds), 10-min expiry, 60s rate-limit, Resend REST API when `RESEND_API_KEY` env set, otherwise `console.log` + `devCode` in response. New env vars: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`. Two new controller routes: `POST /api/auth/otp/send`, `POST /api/auth/otp/verify` (public, no guard). `AuthContext.loginWithToken(token, user)` stores JWT + sets axios header without extra API call. `CustomerLoginModal` fully rewritten to 3-step state machine (`entry → otp → welcome`): Google button, email+phone inputs, 6-digit code input with 60s resend countdown, welcome card for new customers.
- **Profile nav** — Public menu action bar logged-in state replaced: profile chip navigates to `/profile?returnTo=<current url>`, separate `LogOut` icon button. `CustomerProfilePage` fully translated (`t("profile.*")`), reads `returnTo` query param to show back button, tier colors derived from `acc.tier` (no hardcoded threshold comparisons).
- **Cart language sync** — `resolveItemName(cartItem, categories, lang)` in `CartDrawer` looks up live translated name from `categories` prop by item ID + `lang` key, bypassing stale snapshot `name` stored at add-time. `selectedLang` prop forwarded `PublicMenuPage → CartIcon → CartDrawer`.
- **Options pre-selection** — `ItemWithOptions` `useEffect` keyed on `item.id` auto-selects first choice for every `VARIATION` option on modal open; `ADD_ON` options remain unselected. Eliminates ability to order base item without selecting required variant.
- **QR print layout** — `PrintableQRCodes` changed from `grid-cols-2` to `grid-cols-1`; each card has `breakInside: avoid`; `<style>@page { size: A4 portrait; margin: 12mm }</style>` injected. Two cards fit per A4 page, no cross-page cuts.
- **Analytics dark mode** — All Recharts `XAxis`/`YAxis` tick fills changed from `'currentColor'` to explicit `'hsl(var(--color-muted-foreground))'`; custom `ChartTooltip` component uses `glass-panel` styling with `text-foreground`/`text-muted-foreground` tokens.
- **Menu health false positive** — Deleted category-image audit rule from `menu.service.ts` (no UI exists to add category images).
- **Translation gaps** — ~120 new i18n keys across EN/BG/RO: `auth.otp.*` (20 keys), `publicMenu.signIn/myProfile/calling/scanQrForAssistance/selectLanguage/pairing.*/drinkUpsell.*`, `profile.*` (22 keys). All previously hardcoded strings in `CustomerLoginModal`, `CartDrawer`, `ItemWithOptions`, `CustomerProfilePage`, `PublicMenuPage` now wired to `t()`.
- **Key files:** `schema.prisma`, `auth.service.ts`, `auth.controller.ts`, `AuthContext.tsx`, `CustomerLoginModal.tsx`, `PublicMenuPage.tsx`, `CustomerProfilePage.tsx`, `CartIcon.tsx`, `CartDrawer.tsx`, `ItemWithOptions.tsx`, `PrintableQRCodes.tsx`, `AnalyticsView.tsx`, `menu.service.ts`, `en/bg/ro translation.json`.

**Shipped — Stripe Connect Payments & Live Table View (May 8, 2026):**
- **Stripe Connect Payments** — `IPaymentProvider` interface + `StripeProvider` implementation; `PaymentService` (sessions, bill calculation, PaymentIntent creation, webhook handling); `PaymentController` (5 routes: sessions, bill, create-payment-intent, webhook, history); Stripe Connect onboarding via `RestaurantsService` (account link, status, disconnect); `PaymentModal` 3-step UI (tip → Stripe Elements → confirmation); `PaymentsView` history table with status/date filters; `NotificationContext` + `NotificationBell` (badge count) + `PaymentToast` (slide-in); `TableSession` model (OPEN/PAID/CLOSED_NO_PAYMENT) + `Payment` model (PENDING/SUCCEEDED/FAILED); webhook idempotency via `stripePaymentIntentId` lookup; raw body preservation for Stripe signature verification.
- **Live Table View** — `getTablesWithStatus()` in `tables.service.ts` fetches tables + active sessions in parallel via `Promise.all`; derives status per table (empty/waiting/occupied/paid); `GET /tables/status/:restaurantId` returns enriched data; `emitTableStatusChanged()` helper in `EventsGateway` called from 4 locations; `LiveTablesView.tsx` with filter modes (Active/Occupied/Paid/All) defaulting to Active; `TableCard.tsx` color-coded cards (red/amber/green/gray left border); `TableDetailModal.tsx` showing orders + payment info; `TableView.tsx` parent with Live View / QR Management sub-tabs; socket listener invalidates React Query `['tableStatuses']` cache on `table:status-changed` events.
- **Code review fixes** — Parallel DB queries replacing sequential awaits; `emitTableStatusChanged` helper deduplication across 4 call sites; removed unused `label` field from `statusStyles` Record; added `enabled: !!restaurantId` guard on `useQuery` in `TableView.tsx`; removed dead code + unnecessary existence checks.
- **Key files:** `payment.service.ts`, `payment.controller.ts`, `stripe.provider.ts`, `payment-provider.interface.ts`, `tables.service.ts`, `tables.controller.ts`, `events.gateway.ts`, `orders.service.ts`, `PaymentModal.tsx`, `PaymentsView.tsx`, `LiveTablesView.tsx`, `TableCard.tsx`, `TableDetailModal.tsx`, `TableView.tsx`, `NotificationContext.tsx`, `NotificationBell.tsx`, `PaymentToast.tsx`, `api.ts`.

**Shipped — Waiter POS (May 9-10, 2026):** Full-viewport tableside ordering at `/staff/pos`. 15 new frontend files, 4 modified files. `PosLayout` + `PosContext` (in-memory, isolated from CartContext). Seat-level ordering, table selection modal with Force Open, submitted/pending item tracking, 3 session-end actions (Submit/Paid by Card/Force Close) with Radix confirmation dialogs. 4 new backend endpoints. Zero Prisma schema changes. 5 bug fix commits (duplicate menuItemId, session history, dashboard live view, cart reset, confirmation dialogs).

**Shipped — Staff Roles & RBAC (May 12-14, 2026):**
- **RBAC Sprint** — `UserRole` expanded to `OWNER` / `MANAGER` / `WAITER` / `KITCHEN`. Permission matrix enforced in all service layers: `checkRestaurantOwnership` → `checkRestaurantAccess` allowing owner OR assigned staff. `User.restaurantId` links staff to their restaurant. Auth responses include `restaurantId` for frontend restaurant resolution.
- **PIN-based staff login** — `POST /auth/pin-login` endpoint: staff set a 4-digit PIN on first enrollment, login by entering PIN on device login page. PIN hashed with SHA256. PIN login searches only users assigned to the configured restaurant. Role-based redirect: WAITER → `/staff/pos`, KITCHEN → `/staff/kitchen`, other → `/dashboard`.
- **Device enrollment (Bond a Device)** — `DeviceEnrollmentToken` model: manager creates expiring enrollment token (SHA256-hashed, 10-min TTL), generates enrollment URL with frontend base URL. Staff scans QR code or opens link to set PIN. Re-bond flow: re-issue enrollment for existing staff. `POST /:id/device-enrollment` endpoint.
- **StaffCreatedModal** — QR code display (`QRCodeSVG`), raw PIN display with copy-to-clipboard (clipboard API + execCommand fallback), expiry countdown timer, enrollment error banner. Used for both initial enrollment and re-bond.
- **Shared Device Mode** — Toggle in Settings > Staff tab. Stores `{ restaurantId, restaurantName }` in `localStorage.sharedDevice`. Device login page clears existing session first, shows PIN keypad. 401 interceptor skips `/auth/pin-login` to prevent redirect loops.
- **Staff settings consolidation** — Shared Device Mode + QR Code Management moved from General to Staff tab. Staff table shows: name, email (`.local` synthetic emails hidden with "—"), role badge, re-bond button, delete action. Enrollment errors surfaced inline in StaffCreatedModal.
- **RBAC access fixes** — Orders: assigned staff can read/update orders for their restaurant. Dashboard: owner + MANAGER access. Restaurant management: owner + MANAGER (except delete + Stripe which remain owner-only). Assistance: owner + assigned staff. POS: restaurant resolved from `user.restaurantId`.
- **Provider fetch noise fix** — `OrderProvider` and `AssistanceProvider` only fetch when authenticated session exists (not on socket reconnect). `SocketProvider` no longer depends on nonexistent `token` field from `AuthContext`. Both providers removed from public/customer routes.
- **Key files:** `auth.controller.ts` (+pin-login), `auth.service.ts` (+validatePin), `device-enrollment.service.ts`, `restaurants.controller.ts` (+device-enrollment), `orders.service.ts` (RBAC), `dashboard.controller.ts` (RBAC), `assistance.service.ts` (RBAC), `StaffCreatedModal.tsx`, `SettingsView.tsx` (staff tab), `DeviceLoginPage.tsx`, `AuthContext.tsx`, `RestaurantContext.tsx`, `OrderContext.tsx`, `AssistanceContext.tsx`, `SocketContext.tsx`, `App.tsx`, `api.ts`.

**Shipped — Public Menu Mobile UX Redesign (May 15, 2026):**
- **Shared currency utility** (`lib/currency.ts`) — `formatEuro()` and `formatBgn()` using BNB fixed rate 1 EUR = 1.95583 BGN. Dual-currency display throughout checkout, cart, and payment flows. Bulgarian law compliance.
- **TopBar** (`TopBar.tsx`) — Full-width search with Lucide magnifier icon, filter toggle button, theme toggle, language codes (EN/BG/RO), table chip replacing "You are viewing the menu for table X" text.
- **FilterPanel** (`FilterPanel.tsx`) — Slide-down panel with dietary toggle switches (Spicy, Vegan, New, Featured) and allergen exclusion pills (Milk, Wheat, Fish, Nuts, etc.). Clicking an allergen pill hides products containing it.
- **Horizontal item cards** — `ItemWithOptions.tsx` redesigned to horizontal layout. Dual-currency prices (EUR + BGN). Pill-shaped "+ Add" buttons replace full-width solid blue buttons.
- **CategoryPills** (`CategoryPills.tsx`) — Horizontal scroll pill navigation replacing sticky category nav. Active pill highlighted with accent color.
- **Slim TrendingCarousel** — Wider horizontal cards with compact skeleton loader. Reduced vertical footprint.
- **Bottom nav regroup** — Profile and Call Waiter icons grouped left, cart/bill actions right. Better visual hierarchy.
- **i18n** — ~30 new keys across EN/BG/RO for search placeholder, filter labels, dietary tags, allergen names, add-to-cart button.
- **Dead code cleanup** — Removed unused `LANG_LABELS` constant and `handleLanguageChange` function from `PublicMenuPage.tsx`.
- **Key files:** `currency.ts`, `TopBar.tsx`, `FilterPanel.tsx`, `CategoryPills.tsx`, `ItemWithOptions.tsx` (rewrite), `TrendingCarousel.tsx` (slim), `PublicMenuPage.tsx` (refactor — 815→~400 lines), `BottomNav.tsx`, `CartDrawer.tsx` (+dual currency), `CheckoutPage.tsx` (+dual currency), `PaymentModal.tsx` (+dual currency), `en/bg/ro translation.json`.

**Shipped — Code Review & PR#3 Fixes (May 15, 2026):**
- **HomePage.tsx** — Removed 3 unused Lucide imports (`TrendingUp`, `Users`, `Layers`). Fixed 3 `as any` type casts on i18n keys → `t(key, fallback)` pattern. Tightened `featureIcons` Record type to keyof `featureKeys[number]`. Replaced non-standard Tailwind durations (`duration-400`→`duration-300`, `duration-1200`→`duration-1000`).
- **RestaurantContext.tsx** — Fixed TS error on line 82: `user.restaurantId` is `string | undefined` but `getRestaurantById` expects `string`. Added non-null assertion after guard check.
- **CheckoutPage.tsx** — Replaced sr-only checkbox toggle hack with `<Toggle>` component (Radix `role="switch"`, `aria-checked`, keyboard navigation).
- **Code review fixes** — Typed translations (`t(key)` without `as any`), shared utils deduplication, Toggle component adoption, i18n gaps filled.

**Payments "not enabled" investigation (May 15, 2026):** Confirmed NO code bug. `paymentsEnabled Boolean @default(false)` in Prisma schema means new restaurants default to false. `PaymentService` correctly checks `restaurant.paymentsEnabled` before allowing payment intent creation. Both affected restaurants had `paymentsEnabled = false` in DB — enabled via direct DB update.

**Shipped — Security & Bug Fixes (May 15, 2026):**
- **Socket.io CORS** — `events.gateway.ts` wildcard `origin: '*'` replaced with `process.env.FRONTEND_URL || 'http://localhost:3001'` + `credentials: true`. Any page could previously subscribe to restaurant events.
- **Magic-link removal** — Deleted `POST /auth/magic-link` endpoint and `sendMagicLink()` service method. Method leaked JWT token in response body and `console.log`. Flow replaced by Email OTP (already live since May 6).
- **Loyalty expiry emails** — `runDailyExpiryReminders()` cron in `loyalty.service.ts` now sends per-candidate emails via Resend (`RESEND_API_KEY`). Dev fallback: `logger.log`. Previous implementation only marked DB batches as sent but never emailed anyone.
- **Analytics CSV export** — `handleExportCSV()` in `AnalyticsView.tsx` was missing `peakHours` and `categoryBreakdown` sections. Both added — CSV now exports all 5 data sets (summary, revenue trend, top items, peak hours, category breakdown).
- **TypeScript strict mode** — `apps/backend/tsconfig.json`: `strictNullChecks` and `noImplicitAny` both enabled (`false` → `true`). Fixed all resulting errors: explicit `any` on `@Request() req` controller params, nullish coalescing on pagination `page`/`limit`, null guards on `dbItem` in orders service, supertest import fix in e2e specs.
- **CategoryPills auto-scroll** — Active pill now scrolls into view via `scrollIntoView` + `useRef` on pill elements. Previously active category could be off-screen after category change.
- **ItemWithOptions BGN conversion** — If `item.currency === 'BGN'`, price divided by `BGN_RATE` before passing to `formatInlineDual`. Previously BGN-priced items would show double-converted amounts.
- **Key files:** `events.gateway.ts`, `auth.controller.ts`, `auth.service.ts`, `loyalty.service.ts`, `AnalyticsView.tsx`, `tsconfig.json` (backend), `CategoryPills.tsx`, `ItemWithOptions.tsx`.

**Shipped — Infrastructure & Polish Sprint (May 15, 2026):**
- **API versioning** — All routes now at `/api/v1/*`. `main.ts` uses `VersioningType.URI` with `defaultVersion: '1'`. Frontend `api.ts` base URL updated to `/api/v1`. Vite proxy unchanged (matches `/api/*`). CSRF exempt paths and webhook path updated to `/api/v1/...`.
- **Prisma retry/circuit breaker** — `PrismaService.onModuleInit()` startup retry now uses jittered exponential backoff (1s → 30s cap) instead of fixed 2s. New `withRetry<T>(fn, maxAttempts)` method for runtime query resilience. Circuit breaker: CLOSED → OPEN after 5 consecutive transient failures, HALF_OPEN after 30s cooldown. Only transient Prisma error codes trigger the breaker (P1001, P1002, P1008, P1017, P2024, P1012).
- **Order progress stepper** — `OrderConfirmationPage` now shows a 3-step visual stepper: Placed → In Kitchen → Served. Animated state transitions (emerald for done, accent/pulse for current). Hidden for CANCELED orders. Also fixed `AnalyticsView` CSV export field names (`category`/`revenue` not `name`/`value`).
- **QR table tent print templates** — 3 branded print layouts: Classic (white, dashed border), Premium (dark bg, corner accents, serif type), Minimal (clean border, oversized table name). Template selector dropdown added next to "Print All QR" button in `TableView`. `PrintTemplate` type exported.
- **Service test coverage** — 3 new spec files: `tables.service.spec.ts` (19 tests), `users.service.spec.ts` (17 tests), `translation.service.spec.ts` (14 tests). Total: 122 tests (up from 77). Covers all CRUD paths, RBAC checks, transient error fallbacks, DeepL free/paid endpoint routing.
- **Customer split bill** — `SplitBillSection` component in `CheckoutPage` — collapsible below order total, counter 2–20 people, per-person amount in EUR + BGN. Client-side only, no backend changes.
- **Key files:** `main.ts`, `api.ts` (frontend), `prisma.service.ts`, `OrderConfirmationPage.tsx`, `PrintableQRCodes.tsx`, `TableView.tsx`, `CheckoutPage.tsx`, `tables.service.spec.ts`, `users.service.spec.ts`, `translation.service.spec.ts`.

**Shipped — SaaS Tiering V2 (May 16, 2026):**
- **Schema** — `SubscriptionTier` enum (`FREE/STARTER/PROFESSIONAL/ENTERPRISE`) on `Restaurant.tier` (default `FREE`). Added `stripeCustomerId`, `stripeSubscriptionId`, `tierUpdatedAt` fields.
- **SubscriptionModule** — `FeatureService` maps tier→feature flags (`TIER_FEATURES` map — never hardcode). `FeatureGuard` resolves restaurant from owner (`Restaurant.ownerId`) OR staff (`User.restaurantId`), throws `403 FEATURE_LOCKED`. `@RequireFeature(...flags)` decorator for controllers. `SubscriptionService` handles Stripe Checkout + Portal + webhook with timestamp-gate race protection (`updateMany WHERE tierUpdatedAt IS NULL OR < eventTime`). Controller at `/subscription` with 4 routes: `status`, `checkout`, `portal`, `webhook`.
- **Frontend** — `useFeature(flag)` reads `RestaurantContext.activeRestaurant.tier`. `BillingView` (current plan + Stripe Portal link). `PricingPage` at `/pricing` (tier comparison + upgrade CTA). `SubscriptionBanner` in dashboard header on FREE. `DashboardPage` + `SettingsView` gated.
- **Demo accounts** — `demo.free@qrmenu.test`, `demo.starter@qrmenu.test`, `demo.pro@qrmenu.test`, `demo.enterprise@qrmenu.test` / password `demo1234`.
- **New env vars** — `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_ENTERPRISE`, `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` in `apps/backend/.env`.
- **Key files:** `apps/backend/src/subscription/` (new: `feature.service.ts`, `feature.guard.ts`, `feature-flag.enum.ts`, `require-feature.decorator.ts`, `subscription.service.ts`, `subscription.controller.ts`, `subscription.module.ts`), `apps/frontend/src/hooks/useFeature.ts`, `BillingView.tsx`, `PricingPage.tsx`, `SubscriptionBanner.tsx`.

**Current focus — V3 Growth:**
- **Phase 20 — Multi-location:** menu templates, bulk price updates, cross-location analytics.

**Planned — V4 Enterprise:** AWS/GCP migration, Redis, POS integration (Square / Toast / Lightspeed), inventory + waste tracking, SMS/email marketing, React Native staff app.

When asked to add a feature, first check whether it falls under an existing phase — follow the scope defined there rather than re-scoping.

## Testing

- **Backend** — Jest, specs co-located as `*.spec.ts` under `src/`. E2e config at `apps/backend/test/jest-e2e.json` and requires `.env.test` copied to `.env` first via `npm run test:prepare`.
- **Frontend** — Vitest + jsdom; React Testing Library available.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
