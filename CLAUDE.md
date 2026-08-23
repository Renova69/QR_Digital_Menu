# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

Turborepo monorepo with npm workspaces (`apps/*`). Two apps, no `packages/` directory (the README mentions one but it doesn't exist):

- **`apps/backend`** — NestJS 11 + Prisma 6 + Supabase (hosted Postgres 17, Supavisor pooler). API on `:3000` under `/api`, Swagger at `/api-docs`.
- **`apps/frontend`** — Vite + React 18 + Tailwind v4 + TanStack Query + i18next + socket.io-client. Dev server on `:3001` (`strictPort: true`).
- **Currency** — `apps/frontend/src/lib/currency.ts` — `formatEuro()` and `formatBgn()` at BNB fixed rate 1 EUR = 1.95583 BGN. Used in CartDrawer, CheckoutPage, PaymentModal, ItemWithOptions.

## Reference docs

- \@CLAUDE.md — Project instruction file for Claude Code. Describes repo layout, common commands, architecture, conventions, and history.
- \@CODING_ROADMAP.md — Phased development plan. Lists shipped phases through V3 Growth + current focus. Single source of truth for what's done vs. next.
- \@HOW_TO.md — Developer onboarding guide. Step-by-step setup: clone, install deps, configure .env, run dev servers, seed DB, troubleshooting.
- \@MAIN.md — Project overview. High-level product description, tech stack, feature set.
- \@MAIN_FEATURES.md — Feature catalog by category (menu, orders, payments, loyalty, reservations, analytics, etc.).
- \@fixed_issues_main.md — Chronological bug-fix log. Each entry documents problem, root cause, fix applied, affected files.

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
npm start        # serve dist/ on :3002 (kept off :3001 so a built PWA's service worker never colonizes the vite-dev origin — see fixed_issues_main.md)
```

## Environment & DB

- Per-app `.env` files: `apps/backend/.env`, `apps/frontend/.env` — copy from `.env.example`.
- DB is **hosted Supabase Postgres** (free tier, EU Frankfurt) — no local Postgres in dev. Migrated off Neon on 23 Aug 2026: Neon bills compute-hours and this backend's per-minute crons stop its database ever suspending, so an always-on 0.25 CU exceeded the free allowance on idle alone. Supabase does not meter compute. The root `docker:up` / `docker:down` scripts exist but are not part of daily flow.
- API base URL: **`/api/v1`** (same-origin in dev, cross-origin in production). In development, Vite dev server proxies `/api` and `/socket.io` to backend target derived from `VITE_API_URL` env. In production (Vercel → Cloud Run), frontend uses `VITE_API_URL` directly — cross-origin with `sameSite: 'none'` cookies + CORS.
- `VITE_API_URL` in `apps/frontend/.env` is used by `vite.config.js` for proxy target in dev, and by `api.ts` for cross-origin API calls in production.
- **Production:** `COOKIE_SAMESITE` env-driven, defaults to `'none'` in production (required for cross-origin cookie send from Vercel → Cloud Run). Set `COOKIE_SAMESITE=lax` for same-origin deploys.
- Global API prefix `/api` is set in `apps/backend/src/main.ts` via `app.setGlobalPrefix('api')`.
- CORS origin = `FRONTEND_URL` env (default `http://localhost:3001`).

## Backend architecture

NestJS modules registered in `apps/backend/src/app.module.ts`: Config (global), Throttler, Prisma, Subscription, Auth, Restaurants, Menu, Orders, Assistance, Dashboard, Tables, Health, Feedback, Translation, Storage, Events, Loyalty, Payment, MenuImport, HelpContent, Reservations, PrintStation, Push, MenuViews, ClientLogs, TableZones, UsersData. `ThrottlerGuard` applied globally (100 req / 60s).

Cross-cutting concerns:

- **Auth** (`auth/`) — JWT + Google OAuth + magic link + Email OTP via Passport strategies. **JWT stored in httpOnly cookie** (not localStorage). `jwt.strategy.ts` reads from `request.cookies.token` first, Bearer header fallback. CSRF double-submit cookie pattern on all state-changing endpoints (`X-CSRF-Token` header must match `csrf-token` cookie). `AuthContext` no longer touches localStorage for token — reads user via `/auth/me` which sends cookie automatically.
- **CSRF** — `main.ts` CSRF middleware validates `X-CSRF-Token` header matches `csrf-token` cookie on POST/PATCH/DELETE/PUT. Skipped in dev mode (`NODE_ENV !== 'production'`) and for Stripe webhook path. `GET /api/auth/csrf-token` issues token.
- **401 interceptor** (`api.ts`) — redirects to `/login` on 401 EXCEPT for `/auth/me` (returns rejected promise instead). This prevents logout loop during app initialization. AuthContext handles `/auth/me` failures silently.
- **Auth cookie transport** — Dev: same-origin Vite proxy (`api.ts` baseURL `/api/v1`, `sameSite: 'lax'`). Production: cross-origin (`api.ts` uses `VITE_API_URL` env, `sameSite: 'none'` + `secure: true`). CSRF double-submit cookie pattern protects cross-origin state-changing requests. `api.ts` auto-selects baseURL: `/api/v1` in dev (proxy), `VITE_API_URL` in production (cross-origin).
- **Realtime** (`events/`) — `@nestjs/websockets` + socket.io for live order / assistance / table status / payment pushes. `EventsGateway.emitTableStatusChanged(restaurantId, tableId, sessionId)` emits `table:status-changed` — called from 4 locations (`OrdersService.create`, `OrdersService.updateStatus`, `PaymentService.handleWebhookEvent`, `PaymentService.closeSession`). `payment:confirmed` event emitted on successful payment.
- **Payment** (`payment/`) — Multi-provider payment system behind `IPaymentProvider` interface. Four providers: **Stripe Connect** (pay-at-table, Connect onboarding, PaymentIntent), **BORICA** (EMV-3DS direct, RSA-SHA256 signing, TRTYPE=90), **ePay.bg** (hosted checkout, HMAC signing, callback verification), **MyPOS** (card terminal, demo/live mode). Provider abstraction: never add provider-specific logic outside the provider — always go through `IPaymentProvider`. `PaymentService` handles sessions, bill calculation, webhook processing, force-open, card-payment close, split bill settlement, cash requests, scoped bill payments. `PaymentController` routes: sessions, bill, payment-intent, webhook (raw body), history, force-open, close-card, split, cash-request. `RestaurantsService` manages Stripe Connect onboarding. BORICA/ePay feature flags independent of Stripe; `paymentsEnabled` on Restaurant gates public menu payment visibility.
- **Tables** (`tables/`) — `getTablesWithStatus()` fetches tables + active sessions in parallel via `Promise.all`, derives status per table (empty/occupied/paid — "waiting" removed May 2026). PAID sessions auto-close after 5 minutes via `PaymentService.autoClosePaidSessions()`. `GET /tables/status/:restaurantId` returns enriched data with `orderCount`, `totalAmount`, `customerNames`, `sessionStatus`, `sessionId`. `getTableOrders(tableId, restaurantId)` returns all orders for a table's active OPEN session with item names — used by dashboard live view and POS order history. Tables have optional `zone` field for grouping/sectioning in large-restaurant POS views.
- **Staff Attribution** — `OrderSource` enum (POS/QR) + `staffUserId` on Order. Order recorded with source on create — `OrdersService.create()` captures optional staff identity via `OptionalJwtAuthGuard` (public endpoint that extracts JWT user when present, passes through when absent). Source badges appear on dashboard order list, table detail cards, payment detail rows, and PaymentModal. Itemized bill grouped by source (POS vs QR). `OptionalJwtAuthGuard` rethrows JWT errors (expired/malformed tokens) rather than silently passing through — prevents degraded auth on public endpoints.
- **Table Zones** — `RestaurantTable.zone` field for grouping tables into sections (e.g., "Main Floor", "Terrace", "Bar"). POS table picker groups by zone with section headers. Improves navigation for large-restaurant POS workflows.
- **Staff credentials (role-exclusive) — security-critical** — `apps/backend/src/users/staff-roles.ts` is the single source of truth: `PIN_LOGIN_ROLES = ['WAITER','KITCHEN']` + `isPinRole()`. `createStaffMember` issues a PIN **only** for WAITER/KITCHEN and a temp password **only** for STAFF/MANAGER (the non-null `password` column always gets a random hash; never surface both). `AuthService.pinLogin` scopes its candidate query to `PIN_LOGIN_ROLES` — OWNER/MANAGER/STAFF can never authenticate via a 4-digit PIN (prevents a guessed PIN minting a dashboard JWT). Never add OWNER/MANAGER/STAFF back into pinLogin. Frontend mirrors this: `StaffSettingsTab` gates the credential shown + Reset-PIN + device-enrollment QR on `isPinRole`, not `=== 'STAFF'`.
- **Scan tracking (all tiers)** — `MenuView` model (`tableId?`, `visitorId?`, `restaurantId`, indexed). Public `POST /menu-views` (`recordView`) fired from `PublicMenuPage` with a `localStorage` visitor UUID (`apps/frontend/src/lib/visitorId.ts`). Dashboard `GET /menu-views/dashboard/scan-stats/:restaurantId` (JWT + ownership, **no tier gate**) returns `{ totalViews, uniqueVisitors, perTable[] }`. `SummaryView` shows these reach metrics for **every** tier (not just FREE); revenue KPIs remain paid-tier-only.
- **Assistance type** — `AssistanceRequest.type` String `@default("STANDARD")` (STANDARD/URGENT). Public menu dialog sends URGENT; dashboard `AssistanceView` renders a red URGENT badge. `AssistanceContext`'s request interface must keep the `type` field or the dashboard loses the distinction. Call-waiter 60s cooldown is persisted in `localStorage` (`assist-cd-{restaurantId}-{tableNumber}`) and restored on mount — do not revert to in-memory-only or reload bypasses it.
- **Dashboard mobile nav** — `DashboardPage` bottom nav shows 4 primary tabs (`MOBILE_PRIMARY_TABS`: summary/orders/tables/assistance) + a **More** sheet holding overflow tabs (`MOBILE_MORE_TABS`: payments/analytics/settings/help), account info, language, theme, **logout**, and View Public Menu. Logout/help/language are NOT in the desktop sidebar's mobile equivalent — they live in the More sheet. Segmented tab/filter strips (Orders/Assistance/Tables/Payments) use `grid grid-cols-2 sm:flex` (equal-width on mobile, row on desktop) — do not revert to `overflow-x-auto`. A tab-entitlement effect redirects forced `?tab=` to an unentitled tab back to `summary`.
- **Stripe apiVersion** — pinned to `2026-05-27.dahlia` in `stripe.provider.ts` + `subscription.service.ts`. The string must match the Stripe SDK's typed literal; on SDK bumps the Cloud Build will fail with `TS2322` until both call sites are updated (local `tsc` may pass on stale `node_modules`). Backend deploys via `deploy.ps1` (Cloud Build → Cloud Run, backend only).
- **Onboarding Wizard** — New-user flow rewritten May 2026. Tier-aware Stripe Checkout (FREE→Starter skips payment; Starter→Pro/Enterprise charges immediately). Stripe Connect onboarding integrated into wizard. Owner name collected. Table setup step. Tier synced from Stripe session (not webhook) for instant activation.
- **FREE Tier Restrictions** — Revenue cards and analytics button hidden for FREE tier restaurants. Tier enforcement hardened across dashboard. FeatureGuard checks tier before rendering revenue-sensitive components.
- **Subscription Cache** — Unified TanStack Query cache key `['subscription-status']` across all components (SubscriptionBanner, PricingPage, BillingView, FeatureGuard). Prevents duplicate fetches and inconsistent state. Locked navigation for unpaid tiers with UpgradeModal.
- **Public Menu Footer** — Restaurant name bar, location, contact info, social media icon links (Facebook, Instagram, TikTok, YouTube, website) on public menu. Language defaults to BG.
- **XLSX Import** — Menu import now supports XLSX format alongside JSON OCR. `MenuImportExportView.tsx` ImportTab accepts both `.json` and `.xlsx` files. XLSX export produces multi-sheet workbook for Excel editing roundtrip.
- **Translation** (`translation/`) — Job-queue pipeline with sidecar `TranslationJob` table for progress tracking, quota management, and DeepL native glossary support. Platform owns the key via `DEEPL_API_KEY` env var. `TranslationService.translateTexts/translateText/translateObject` take **no** `apiKey` param — the service reads the key internally. `restaurant.deeplApiKey` column exists in schema but is **never read or written**. Three translation paths: (1) fire-and-forget pre-warm on menu item/category/option create+update; (2) owner-triggered "Translate All Now" via `POST /api/restaurants/:id/translate-all` (queued, shows progress); (3) lazy on-demand per-request via `GET /api/menu/public/:id?lang=<code>` — translates missing entries and caches to DB. `lang` param validated against `restaurant.targetLanguages`. Free-tier detection: key ending in `:fx` routes to `api-free.deepl.com`. 12 supported locales: EN/BG/RO/DE/ES/FR/IT/ZH/EL/JA/RU/AR.
- **Reservations** (`reservations/`) — Public booking page + dashboard management. Features: availability calendar, seating zones with capacity, configurable duration, blackout dates, SMS notifications (Twilio + SIM-based SMS gateway providers), self-service manage links, guest preferences (allergens, accessibility, seating), analytics dashboard. `BookingConfirmationPage` + `BookingManagePage` for customer self-service. 12-lang i18n. Tier-gated (PROFESSIONAL+). Real-time status sync via socket.
- **Print Station** (`print-station/`) — Thermal receipt printing subsystem. `PrintStation` model with per-category assignment. `PrintAgentToken` for device auth. `PrintJob` model with reliability states (PENDING/PRINTING/COMPLETED/FAILED). ESC/POS ticket builder with Cyrillic support. Expo Android printer agent (`PRINT EMULATOR/escpresso/`). Customizable receipt template per station. EventsGateway routes print jobs to agents via socket. `PrintStationsView` dashboard tab.
- **Service Points** — QR ordering for non-table locations (bar counter, pickup window). `ServicePoint` model with unique QR codes. Public ordering flow parallels table ordering. Dashboard management in TablesView.
- **Split Bill** (`payment/` split provider) — POS split settlement: per-item, even split, and custom partial amounts. `SplitMode` enum, `SplitProvider`, settlement allocation DTOs. Multiple settlements per session with item count draw-down. Theme-aware split drawer.
- **Web Push** (`push/`) — VAPID-based push notifications. Service worker registration via `vite-plugin-pwa`. `PushSubscription` model. Notification click opens correct dashboard page. Key rotation with auto-resubscribe. Prod-guarded VAPID keys in Secret Manager.
- **Allergen/Dietary Tags** — 7 allergen icons (gluten, dairy, nuts, etc.) + dietary tags (vegan, vegetarian, etc.) on `MenuItem.tags`. `TagPicker` component with search in menu editor. 12-lang i18n. Tap-to-open tooltips on public menu.
- **Context-Aware Upselling** — WeatherAPI integration for weather-context suggestions. Deterministic perfect-pairing triggers. Trending carousel with AUTO mode. Bounded trending queries, batched public-menu items endpoint.
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
- **Translation invariant:** `choice.name` is the canonical Bulgarian validation key and must never be replaced in menu API responses. Store translated choice labels at `option.translations[lang].choices[choice.name]` and resolve them only for display. `option.name` and item/category names are display fields and may be translated in responses.
- **`CartContext.tsx`** — totals options via `opt.priceModifier || 0`.

Public-menu translation has two deliberately separate sources:

- Restaurant-authored menu content is read from the menu entities' stored `translations` JSON (DeepL may populate missing menu translations).
- UI chrome such as buttons, errors, cart, checkout, and payment labels comes only from `apps/frontend/src/locales/<lang>/translation.json`. Never send UI translation keys or labels to DeepL at runtime.

Key files for the options flow:

- `apps/backend/src/orders/orders.service.ts` — server-side choice validation (lines ~143–169)
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — builds cart item with `selectedOptions`
- `apps/frontend/src/components/menu/ManageOptionsModal.tsx` — owner UI for creating options/choices
- `apps/frontend/src/context/CartContext.tsx` — cart totals using `priceModifier`

## Frontend architecture

- **Routing** — React Router v7 in `apps/frontend/src/App.tsx`. Three layouts: `AppLayout` (dashboard/auth), `PublicLayout` (customer-facing), `PosLayout` (staff POS).
- **State** — React Context per concern in `src/context/`: `AuthContext`, `RestaurantContext`, `MenuContext`, `CartContext`, `OrderContext`, `AssistanceContext`, `SocketContext`, `NotificationContext`, `PosContext`, `ThemeContext`, `PosThemeContext`. Server state via TanStack Query.
- **Pages** — 19 top-level pages + 5 sub-page directories. Key additions since May 2026: `BookingPage`, `BookingConfirmationPage`, `BookingManagePage` (reservations), `DeviceEnrollPage`, `DeviceLoginPage` (staff PIN), `OAuthCallbackPage`, `ImpersonationExchangePage` (super-admin), `legal/` (PrivacyPolicyPage, TermsPage, CookiePolicyPage), `staff/KitchenPage` (KDS), `onboarding/OnboardingPage`, `profile/DataPrivacyTab`, `super-admin/` (RevenuePage, DataRequestsPage, LegalSettingsPage, TenantDetailPage).
- **Dashboard sub-pages**: `SummaryView`, `OrdersView`, `LiveTablesView`, `AssistanceView`, `PaymentsView`, `AnalyticsView`, `SettingsView`, `MenuImportExportView`, `ReservationsView`, `HelpView`, `PrintStationsView`, `PaymentReconciliationQueue`.
- **API client** — `src/lib/api.ts` (axios + CSRF interceptor). BaseURL auto-selects: `/api/v1` in dev (same-origin via Vite proxy), `VITE_API_URL` in production (cross-origin to Cloud Run). `withCredentials: true` sends httpOnly cookie. CSRF token fetched once, cached, attached to state-changing requests. 401 interceptor skips `/auth/me` to prevent logout loop. All requests go through this — never call axios directly elsewhere.
- **UI primitives** — `src/components/ui/` (Radix + class-variance-authority + tailwind-merge).
- **Menu import/export** — `src/pages/Dashboard/MenuImportExportView.tsx` (~380 lines). Combined Import/Export dashboard tab with sub-tab navigation. `ImportTab` accepts both JSON and XLSX files (full roundtrip: export → edit in Excel → re-import). Contains OCR JSON import flow (ApiKeyPanel, FileImporter, PreviewTable, confirm import with mutation). `ExportTab` offers Download JSON, Download XLSX, Download CSV (`menuToCSV()` with BOM + European locale), Copy JSON. Uses lazy fetch (`useQuery({ enabled: false })`) — data fetched on button click only. `exportMenu()` in `api.ts` calls `GET /api/restaurants/:id/menu/export` (JWT-guarded, backend endpoint already existed). Tab label key: `dashboard.tabs.importExport`.
- **Analytics export** — `src/lib/analyticsExport.ts` (217 lines). Multi-sheet XLSX workbook generation replacing single-sheet CSV. 5 sheets: Summary, Revenue Trend, Top Items, Peak Hours, Category Breakdown. BGN dual-currency columns. Used by `AnalyticsView.tsx` via download button.
- **Help Center CMS** — `src/pages/super-admin/HelpCenterPage.tsx` (~507 lines). Database-driven CMS for all Help/FAQ content. Sub-tabs for Landing FAQ and Dashboard Help sections. Locale tabs (EN/BG/RO). Inline CRUD with modal forms. `LandingFAQ.tsx` on home page fetches from API (`getHelpContent('landing', locale)`). `HelpView.tsx` in dashboard fetches from API. Backend: `HelpContentModule` with 6 endpoints — public `GET /help-content/:section` (grouped by category, ordered by sortOrder) + super-admin CRUD under `/super-admin/help-content`. Seed: `prisma/seed-help-content.ts` (idempotent, checks existing count) + `prisma/seed-help-only.ts` (help-only, zero destructive ops). Help content is tri-lingual (EN/BG/RO) per item.

## Conventions & gotchas

- Backend `clean` script uses Windows `rmdir /s /q` (`apps/backend/package.json`). Cross-platform users should run `rm -rf dist` manually if needed.
- `npm run build` in backend always regenerates the Prisma client before `nest build` — no need to run `prisma generate` separately.
- Frontend `strictPort: true` means a stale dev server on `:3001` blocks startup. Kill with PowerShell (`Stop-Process -Id <pid> -Force`); Git Bash `taskkill` mangles paths.
- When adding new fields on `Restaurant` (or any DTO-validated model), also add `@Min` / `@Max` / `@IsOptional` to `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` — `class-validator` is the input boundary.
- **Dev:** `api.ts` uses `/api/v1` (same-origin, Vite proxy). **Production:** `api.ts` uses `VITE_API_URL` (cross-origin, `sameSite: 'none'` + `secure: true` cookies). Both paths valid — proxy not available on static hosts like Vercel.
- **NEVER read token from localStorage** in AuthContext or anywhere else. Token lives in httpOnly cookie only. Use `/auth/me` to get current user.
- **CSRF middleware ordering in main.ts**: Helmet CSP → cookieParser → CSRF validation → app.useGlobalPipes. CSRF must run after cookieParser but before guards.
- **Seed safety**: `seed.ts` has 3-layer guard — production check, remote DB check, user count > 5 (refuses unless `FORCE_SEED_WIPE=true`). `seed-help-content.ts` and `seed-demo-restaurants.ts` use idempotent upsert patterns — never delete existing data. `seed-help-only.ts` is single-purpose, zero destructive ops. Never bypass these guards without explicit user approval.
- **Prisma + Supavisor**: Supabase fronts Postgres with Supavisor. `DATABASE_URL` is the **transaction** pooler (`:6543`, `?pgbouncer=true&connection_limit=10`) and `DIRECT_URL` is the **session** pooler (`:5432`), used only by the Prisma CLI because migrations need session semantics transaction pooling cannot give. Never use the `db.<ref>.supabase.co` host — it is IPv6-only on the free tier and Cloud Run egress is IPv4. PrismaService constructor calls `super({ log: ['warn', 'error'] })` to surface pool exhaustion.
- **Security — Account disable**: `User.isActive` (default true), `disabledAt`, `disabledReason`. JWT strategy rejects disabled users including SUPER_ADMIN with `UnauthorizedException('ACCOUNT_DISABLED')`. Login rejects disabled accounts before token issuance.
- **Security — Dangerous action confirmation**: 5 super-admin actions require `@Matches(/^CONFIRM$/) confirmation: string` in DTOs: tier override, suspend/reactivate, reset password, payments toggle, delete/restore. Frontend `ConfirmationField` with "Type CONFIRM to continue" input. Server-enforced via class-validator pipeline.
- **Security — Super-admin rate limiting**: All dangerous mutations throttled independently: tier 5/60s, status 5/60s, password reset 3/60s, payments 5/60s, delete 3/60s, restore 3/60s. Help-content admin writes: 10/60s. Platform-settings update: 5/60s.
- **Security — Guard coverage**: `super-admin.guard-coverage.spec.ts` uses `Reflect.getMetadata(GUARDS_METADATA)` to verify JwtAuthGuard + SuperAdminGuard on all super-admin, help-content admin, and platform-settings admin endpoints.
- **Security — NODE_ENV enforcement**: `main.ts` crashes if production env (K_SERVICE/CLOUD_RUN_JOB) detected without NODE_ENV=production. Bearer JWT auth only allowed in test/dev/ALLOW_BEARER_AUTH=true — production is cookie-only.
- **AdminAuditLog**: Every dangerous super-admin action logs to `AdminAuditLog` with actorUserId, action, targetType, targetId, metadata — all in same `$transaction` as the mutation. `GET /super-admin/audit-log` provides paginated audit trail.
- **Super-admin overview v2**: `GET /super-admin/stats` returns billing vs effective tier counts, force-tier summary (upgrades/downgrades), richer KPIs (active/deleted/suspended/paid/stripe-linked), recent activity (7d/24h), and "Attention Needed" panel (forced overrides, payments not onboarded, empty menus, no tables, inactive tenants). Single `Promise.all` batch with 12 parallel queries.

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

| Action       | Endpoint                                   | Auth   | Behavior                                 |
| ------------ | ------------------------------------------ | ------ | ---------------------------------------- |
| Open table   | `POST /payments/session`                   | Public | Idempotent `getOrCreateSession`          |
| Force open   | `POST /payments/session/force-open`        | JWT    | Closes existing OPEN, creates new        |
| Load history | `GET /payments/session/:token/bill`        | Public | All past orders → `setHistoryItems()`    |
| Submit order | `POST /api/orders`                         | Public | Only pending items → `markAsSubmitted()` |
| Paid by card | `POST /payments/session/:token/close-card` | JWT    | MYPOS payment → PAID                     |
| Force close  | `POST /payments/session/:token/close`      | JWT    | CLOSED_NO_PAYMENT                        |

### POS files (15 new)

- Context: `apps/frontend/src/context/PosContext.tsx` (190 lines, 15 methods)
- Pages: `PosLayout.tsx`, `PosPage.tsx` in `apps/frontend/src/pages/pos/`
- Components: 12 files in `apps/frontend/src/components/pos/`
- Auth guard: `apps/frontend/src/components/StaffRoute.tsx`
- Backend: `payment.service.ts` (+`forceOpenSession`, `+closeSessionWithCard`), `tables.service.ts` (+`getTableOrders`)

## Testing

- **Backend** — Jest, specs co-located as `*.spec.ts` under `src/`. NestJS CLI compiled via SWC (dev compile ~0.3s). E2e config at `apps/backend/test/jest-e2e.json` and requires `.env.test` copied to `.env` first via `npm run test:prepare`.
- **Frontend** — Vitest + jsdom; React Testing Library available.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Deployment

When asked to deploy, deploy backend to existing GCloud (installed at `C:\google-cloud-sdk\bin`) and frontend via Vercel MCP.



## Token Saving & Coworker Delegation Rules

You have access to a fast, cheap worker LLM (DeepSeek) via local CLI tools. **Always delegate token-heavy I/O and repetitive drafting to save tokens:**

### 1. Bulk File Reading & Analysis (`ask-kimi`)
When asked to analyze, summarize, or search across files >300 lines or when reading 3+ files:
```bash
ask-kimi --paths <path1> <path2> ... --question "<specific question or extraction query>"
```
- Use the returned structured summary instead of ingesting all raw files into context.
- Only read files directly when you need to edit specific lines.

### 2. Boilerplate & Test Generation (`kimi-write`)
When generating unit tests, config files, type definitions, or repetitive boilerplate:
```bash
kimi-write --spec "<what to write>" --context <similar_existing_file> --target <output_path>
```
- Review the generated output file and edit only what needs refinement.

### 3. Session Review (`extract-chat`)
To extract human-readable text from session logs for documentation/changelogs:
```bash
extract-chat <session.jsonl>
```

### ⛔ DO NOT Delegate:
- Architecture and system design decisions
- Complex cross-module debugging or edge-case reasoning
- Final code reviews and security-critical refactoring
