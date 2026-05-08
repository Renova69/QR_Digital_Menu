# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Turborepo monorepo with npm workspaces (`apps/*`). Two apps, no `packages/` directory (the README mentions one but it doesn't exist):

- **`apps/backend`** — NestJS 11 + Prisma 6 + Neon (hosted Postgres, pooled). API on `:3000` under `/api`, Swagger at `/api-docs`.
- **`apps/frontend`** — Vite + React 18 + Tailwind v4 + TanStack Query + i18next + socket.io-client. Dev server on `:3001` (`strictPort: true`).

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
- API base URL: `http://localhost:3000/api`. CORS origin = `FRONTEND_URL` env (default `http://localhost:3001`).
- Global API prefix `/api` is set in `apps/backend/src/main.ts` via `app.setGlobalPrefix('api')`.

## Backend architecture

NestJS modules registered in `apps/backend/src/app.module.ts` (in order): Prisma, Auth, Restaurants, Menu, Orders, Assistance, Dashboard, Tables, Health, Feedback, Translation, Storage, Events, Payment, Loyalty. `ThrottlerGuard` applied globally (100 req / 60s).

Cross-cutting concerns:
- **Auth** (`auth/`) — JWT + Google OAuth + magic link via Passport strategies.
- **Realtime** (`events/`) — `@nestjs/websockets` + socket.io for live order / assistance / table status / payment pushes. `EventsGateway.emitTableStatusChanged(restaurantId, tableId, sessionId)` emits `table:status-changed` — called from 4 locations (`OrdersService.create`, `OrdersService.updateStatus`, `PaymentService.handleWebhookEvent`, `PaymentService.closeSession`). `payment:confirmed` event emitted on successful payment.
- **Payment** (`payment/`) — Stripe Connect pay-at-table. `IPaymentProvider` interface abstracts provider; `StripeProvider` implements it (future providers: MyPOS, Square). `PaymentService` handles sessions, bill calculation, PaymentIntent creation, webhook processing. `PaymentController` has 5 routes: sessions, bill, create-payment-intent, webhook (raw body), history. `RestaurantsService` manages Stripe Connect account onboarding (create account link, status check, disconnect). Never add provider-specific logic outside the provider — always go through `IPaymentProvider`.
- **Tables** (`tables/`) — `getTablesWithStatus()` fetches tables + active sessions in parallel via `Promise.all`, derives status per table (empty/waiting/occupied/paid). `GET /tables/status/:restaurantId` returns enriched data with `orderCount`, `totalAmount`, `customerNames`, `sessionStatus`, `sessionId`.
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
- **State** — React Context per concern in `src/context/`: `AuthContext`, `RestaurantContext`, `MenuContext`, `CartContext`, `OrderContext`, `AssistanceContext`, `SocketContext`, `NotificationContext`. Server state via TanStack Query.
- **API client** — `src/lib/api.ts` (axios + JWT interceptors). All requests go through this — never call axios directly elsewhere.
- **UI primitives** — `src/components/ui/` (Radix + class-variance-authority + tailwind-merge).

## Conventions & gotchas

- Backend `clean` script uses Windows `rmdir /s /q` (`apps/backend/package.json`). Cross-platform users should run `rm -rf dist` manually if needed.
- `npm run build` in backend always regenerates the Prisma client before `nest build` — no need to run `prisma generate` separately.
- Frontend `strictPort: true` means a stale dev server on `:3001` blocks startup. Kill with PowerShell (`Stop-Process -Id <pid> -Force`); Git Bash `taskkill` mangles paths.
- When adding new fields on `Restaurant` (or any DTO-validated model), also add `@Min` / `@Max` / `@IsOptional` to `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` — `class-validator` is the input boundary.

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

**Current focus — V3 Growth:**
- **Phase 18 — Staff Roles:** expand `UserRole` to `OWNER` / `MANAGER` / `WAITER` / `KITCHEN`, permission matrix, `StaffInvite` model with expiring tokens, activity log.
- **Phase 20 — Multi-location:** menu templates, bulk price updates, cross-location analytics.

**Planned — V4 Enterprise:** AWS/GCP migration, Redis, POS integration (Square / Toast / Lightspeed), inventory + waste tracking, SMS/email marketing, React Native staff app.

When asked to add a feature, first check whether it falls under an existing phase — follow the scope defined there rather than re-scoping.

## Testing

- **Backend** — Jest, specs co-located as `*.spec.ts` under `src/`. E2e config at `apps/backend/test/jest-e2e.json` and requires `.env.test` copied to `.env` first via `npm run test:prepare`.
- **Frontend** — Vitest + jsdom; React Testing Library available.
