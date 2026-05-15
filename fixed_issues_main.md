# Fixed Issues & Bug Resolutions Log

*This document serves as a reference for recently resolved bugs and UI/UX stabilization efforts across the platform.*

## Core Stability & Checkout
- **Stale Cart Cleanup**: Implemented automatic pruning (`pruneInvalidItems`) of invalid/stale cart items on public menu load to prevent "Menu item not found or invalid" checkout errors caused by old session data or database reseeds.
- **Checkout Failure Handling**: Hardened the checkout flow to detect 404 stale-item submissions, displaying the exact backend missing-item message and providing a one-click "Clear cart and return to menu" recovery path.
- **Tables Modal Crash**: Fixed a crash path in the `TableView.tsx` component by properly passing required `title` and `description` props into the Modal, ensuring stable translation scoping.

## UI/UX Polish & Menu Experience
- **Scroll Jump Bug (Public Menu)**: Fixed a disruptive issue where clicking "Add to Cart" caused the public menu to lose its scroll position and jump to different categories. 
  - *Resolution*: Memoized CartContext functions with `useCallback` and refactored the `PublicMenuPage`'s `useEffect` dependency array to only re-fetch menu data when the `restaurantId` or URL query params change, preventing full DOM rebuilds on cart state changes.
- **Perfect Pairing Flow**: Fixed the trigger mechanism so that clicking "Add to Cart" on an item with linked pairings deterministically opens the Perfect Pairing modal first, rather than silently adding the main item.
- **Add to Cart Toast Confirmation**: Added a premium, animated inline toast confirmation overlay on menu cards when items (and pairings) are added to the cart, complete with localized "Added to cart" text (EN, BG, RO).
- **Dark Mode Contrast (White-on-White)**: Addressed visual regressions and white-on-white text rendering issues in input fields and table management components to restore a consistent dark mode experience.

## CSS / Design System (May 4, 2026)
- **Invalid `hsla(var(...))` syntax**: `.text-glow` and `.premium-bg` used `hsla(var(--color-accent), 0.25)` which is invalid CSS — CSS variables cannot be used as arguments inside legacy `hsla()`. Fixed with `color-mix(in srgb, var(--color-accent) 25%, transparent)`.
- **Global transition-colors on `<html>`**: `html { @apply transition-colors duration-500 }` caused a 500ms color delay on every element site-wide. Removed. Replaced with targeted `body { transition: background-color 200ms ease }`.
- **Decorative `animate-pulse` on loading text**: Continuous animation without user trigger violates `prefers-reduced-motion`. Removed class, added `opacity-60` instead. `@media (prefers-reduced-motion: reduce)` guard added for `.animate-float`.
- **Invalid Tailwind modifier `group-disabled:scale-100`**: Applied to an SVG icon className — `group-disabled` is not a valid Tailwind group variant. Removed.

## Public Menu / Assistance Flow (May 4, 2026)
- **Browser `prompt()` for table number**: `handleAssistanceRequest` called `window.prompt()` to ask for a table number — but the QR code URL already contains the table as `?table=<name>`. Removed the prompt entirely. Table is now read from URL params on page load.
- **Call Waiter with no table**: When no `?table` param is present (e.g. direct URL access), the button now shows an inline accessible notice (`role="alert"`, `aria-live="polite"`) instead of a browser prompt. Notice auto-dismisses after 3.5s.
- **ThemeToggle always hidden with custom branding**: The theme toggle was conditionally rendered with `{!hasCustomTheme && <ThemeToggle />}` — customers couldn't switch dark/light when a restaurant had custom colors. Now always rendered.
- **Logo alt text empty**: `alt=""` on restaurant logo broke screen reader context. Fixed to `alt="${name} logo"`.
- **Language select no label**: `<select>` for language had no associated `<label>`, breaking form accessibility. Added `<label htmlFor="lang-select">` and `id="lang-select"`.

## Theme / Branding (May 4, 2026)
- **ThemeToggle not scoped per restaurant**: All public menus shared `localStorage.theme` key — a customer visiting restaurant A then restaurant B would see the same theme regardless of either restaurant's default. Fixed with per-restaurant key `theme-{restaurantId}`.
- **No owner-defined default theme for customers**: Customers always got system/browser default theme on first scan. Added `Restaurant.defaultTheme` (schema + DTO), `BrandingEditor` picker, and `ThemeToggle.defaultTheme` prop so the owner's chosen default applies on first visit.

## Infrastructure & Data
- **Demo Dataset Expansion**: Expanded the `seed.ts` dataset from ~20 to 35+ items across various categories (starters, steaks, seafood, pastas, etc.) to improve frontend scenario testing.

## Image Upload Overhaul (May 7, 2026)
- **No image compression before upload**: Images were uploaded at original resolution, causing 5MB mobile page loads. Fixed with `sharp` processing pipeline in `StorageService` — EXIF auto-rotate, resize to 1200px max, convert to WebP (quality 82%), generate 400px thumbnail (quality 75%), upload both to R2 in parallel. Typical 80-95% size reduction.
- **No preview when selecting image**: File inputs showed only filename. Created `ImageUploadInput` component with live preview thumbnail, change/remove buttons on hover, configurable aspect ratios (square/wide/banner), dropzone-style empty state.
- **No save status feedback**: All image upload forms (BrandingEditor, CreateItemForm, EditItemForm, CategorySettingsModal) caught errors silently. Added `Toast` component + `useToast` hook with animated success/error notifications.
- **No file type validation**: Multer filter accepted any `image/*` type (SVG XSS risk, GIF too large). Added JPEG/PNG-only validation at multer layer (controllers) + MIME/extension validation in StorageService. Invalid types now throw `BadRequestException` with clear message instead of raw 500 error.
- **Storage migration**: Moved from local `/uploads/` and AWS S3 references to Cloudflare R2 with CDN delivery. Added `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` env vars.
- **Thumbnail persistence**: Added `thumbnailUrl` to `Restaurant` (`logoThumbnailUrl`), `MenuItem`, and `MenuCategory` Prisma models. All three `update*Image`/`updateLogo` service methods now store both URLs.
- **Image removal support**: `ImageUploadInput` supports `onRemove` callback. `BrandingEditor`, `EditItemForm`, `CategorySettingsModal` handle image removal (clear URLs in DB when user explicitly removes).

## Database Performance Indexes (May 7, 2026)
- **Missing indexes on high-traffic FK columns**: `Order.restaurantId`, `Order.status`, `MenuItem.categoryId`, `Feedback.restaurantId`, `AssistanceRequest.restaurantId` had no indexes. Queries degrade linearly with order volume — `getPublicMenu()` joins categories→items→options with no index support on categoryId.
- **Fix**: Added 4 `@@index` declarations to `schema.prisma`:
  - `Order` — `@@index([restaurantId, status, createdAt])` — accelerates dashboard order listings filtered by restaurant + status, sorted by date
  - `MenuItem` — `@@index([categoryId, order])` — accelerates menu queries joining categories→items with ordering
  - `Feedback` — `@@index([restaurantId])` — accelerates feedback summary queries per restaurant
  - `AssistanceRequest` — `@@index([restaurantId, isResolved])` — accelerates waiter call listing filtered by resolved status
- Pushed via `prisma db push` to Neon. No application code changes required — Prisma abstracts indexes transparently.

---

## Live Table View — Code Review Fixes (May 8, 2026)

Following a full simplify/code-review pass on the Live Table View + Payment History implementation in the `feature/stripe-payments` worktree. All fixes applied and merged to master.

### Performance — Sequential Awaits → Parallel Queries
- **`tables.service.ts:getTablesWithStatus()`**: Two independent Prisma queries (`findMany` for tables, `findMany` for active sessions) ran sequentially. Changed to `Promise.all` — both queries execute in parallel. No dependency between them; result mapping happens after both resolve. Reduces DB round-trip time by ~50%.

### Deduplication — emitTableStatusChanged Helper
- **`events.gateway.ts`**: Added `emitTableStatusChanged(restaurantId, tableId, sessionId)` helper method. Previously, 4 call sites (`OrdersService.create`, `OrdersService.updateStatus`, `PaymentService.handleWebhookEvent`, `PaymentService.closeSession`) each manually called `this.eventsGateway.emitToRestaurant(restaurantId, 'table:status-changed', {...})` with identical payload shapes. Now all 4 use the single helper — single source of truth for the event name and payload contract.
- **`orders.service.ts`**: Updated 2 call sites to use `emitTableStatusChanged`.
- **`payment.service.ts`**: Updated 2 call sites to use `emitTableStatusChanged`.

### Dead Code Removal
- **`TableCard.tsx`**: Removed unused `label` field from `statusStyles` Record. The Record had `{ border, bg, label }` but `label` was never read in the JSX. Reduced to `{ border, bg }` only.

### Query Guard — Missing `enabled` on useQuery
- **`TableView.tsx`**: `useQuery(['tables', restaurantId], ...)` had no `enabled` guard. When `restaurantId` was undefined (e.g., during auth transition), the query fired immediately with an invalid parameter. Added `enabled: !!restaurantId` — matches pattern used in `LiveTablesView.tsx` and other dashboard components.

### Overfetch Prevention — Fetch Only Active Sessions
- **`tables.service.ts`**: Session query previously fetched all sessions (`findMany({ where: { restaurantId } })`). Narrowed to only active states: `where: { restaurantId, status: { in: ['OPEN', 'PAID'] } }`. Expired/cancelled sessions are irrelevant for table status display.

### Unnecessary Existence Check Removed
- **`tables.controller.ts`**: Removed pre-check for restaurant existence before calling `getTablesWithStatus()`. The service method already handles the empty-restaurant case (returns empty array for no tables). TOCTOU anti-pattern — operate directly, handle the result.

### Commit Reference
- Commit `a0752c2` on `feature/stripe-payments` (merged to master May 8, 2026): `fix: code review — parallel queries, dedup emitTableStatusChanged, remove dead code, add enabled guard`

---

## OCR Menu Import — Schema Alignment & P2028 Fix (May 9, 2026)

### Prisma P2028 Transaction Timeout

- **Error**: `PrismaClientKnownRequestError: Transaction API error: Transaction not found` (code `P2028`) returned as HTTP 500 from `POST /api/restaurants/:id/menu/import/confirm`
- **Root cause**: 82-item / 14-category menus generate ~260 DB queries inside a single `$transaction` (1 aggregate + findFirst/create/update + deleteMany per item). Over Neon cloud at 20–50 ms/query the total exceeds Prisma's default 5-second interactive transaction timeout.
- **Fix**: Added `{ timeout: 60000 }` as second argument to `this.prisma.$transaction(async (tx) => { ... }, { timeout: 60000 })` in `menu-import.service.ts`. Added `Logger` to `MenuImportService` with try-catch wrapping `upsertMenu` for visibility into future failures.
- **Commit**: `639e6ef` — `fix: increase Prisma transaction timeout to 60s for large menu imports`
- **File**: `apps/backend/src/menu-import/menu-import.service.ts`
- **Guideline**: If menus grow to 500+ items consider breaking into per-category transactions or removing the outer transaction; the P2028 threshold is `timeout / avg_query_latency`.

### OCR Schema Alignment

- **Problem 1**: OCR tool exported `tags: ["vegetarian", "gluten-free"]` but `ImportItemDto` and Prisma schema have separate `allergens: String[]` and `dietaryTags: String[]` fields. The mismatch caused `whitelist: true` ValidationPipe to strip the `tags` field silently, resulting in empty allergen/tag data on all imported items.
- **Fix 1**: Updated `jsonToPayload()` in `MenuImportView.tsx` to read `item.allergens` and `item.dietaryTags` directly (no `tags` mapping). Updated OCR tool export to emit `allergens[]` and `dietaryTags[]` separately.
- **Problem 2**: `price || 0` treated zero-priced items (e.g., "water: 0.00 BGN") as falsy and replaced them with `0` but also dropped the explicit `0` in some edge paths.
- **Fix 2**: Changed to `price ?? 0` (`nullish` coalescing) so only `null`/`undefined` triggers the fallback — explicit `0` passes through correctly.
- **Confirmed**: Import of 82 items across 14 categories succeeded end-to-end after fixes.

---

## Waiter POS — Bug Fixes & Feature Round (May 10, 2026)

Five commits fixing critical POS issues found during testing after the initial 18-task implementation.

### Duplicate MenuItemId in Order Creation (commit `e69b20c`)

- **Bug**: "Some menu items not found" error when order had multiple items with the same `menuItemId` (e.g., 2 salads with different options). `findMany` with `where: { id: { in: menuItemIds } }` returned fewer rows than the input array because Prisma deduplicates by `id` — the subsequent validation loop couldn't match every `orderItem` to a DB item.
- **Fix**: Deduplicate `menuItemIds` with `[...new Set(menuItemIds)]` before `findMany`. Prisma only needs each ID once to fetch all needed items. The validation loop then looks up `dbItems.find(i => i.id === item.menuItemId)` which works correctly for duplicates since all required items are in the array.
- **File**: `apps/backend/src/orders/orders.service.ts`

### Paid by Card + Confirmation Dialogs (commit `4e1bf4e`)

- **Feature**: Added "Paid by Card" flow for physical card terminal payments (not Stripe/QR). Creates MYPOS payment record, sets session to PAID, emits socket events.
- **Implementation**: `PaymentService.closeSessionWithCard()` with Prisma `$transaction` (payment create + session update). `POST /payments/session/:token/close-card` endpoint (JWT-guarded). Frontend `closeSessionWithCard()` in `api.ts`.
- **Confirmation dialogs**: All 3 session-end actions (Submit Order, Paid by Card, Force Close) now have Radix Dialog confirmations with action-specific titles, descriptions, and button colors. Prevents accidental table closure.
- **Files**: `payment.service.ts`, `payment.controller.ts`, `api.ts`, `PosCartDrawer.tsx` (full rewrite)

### Session Order History — submitted/pending Tracking (commit `96d08f3`)

- **Bug**: When waiter reopened an occupied table, past orders were invisible. Submitting again re-sent ALL items to kitchen — duplicate orders.
- **Fix**: Added `submitted: boolean` to `PosCartItem`. New context methods: `markAsSubmitted()` (pending → submitted), `setHistoryItems()` (loads past orders as submitted), `clearCart()` (clears only pending), `resetCart()` (clears all), `getPendingTotal()` (pending-only sum), `buildSpecialRequests()` (pending-only serialization).
- **Flow**: Waiter opens occupied table → `getSessionBill()` loads past orders as `submitted: true` (gray, read-only, ✓ checkmark) → new items added as `submitted: false` → submit only sends pending items → `markAsSubmitted()` makes them history. Session stays open.
- **Files**: `PosContext.tsx` (full rewrite), `PosCartDrawer.tsx`, `PosTableModal.tsx`, `payment.service.ts` (`getSessionBill` enhanced include)

### Dashboard Live View — Real Order Data (commit `7faa918`)

- **Bug**: Clicking a table in the owner dashboard live view showed "No orders" — hardcoded empty state.
- **Fix**: New `GET /tables/:tableId/orders?restaurantId=X` endpoint (JWT-guarded) — finds active OPEN session, returns all orders with item names via Prisma nested `include`. `LiveTablesView.tsx` `handleTableClick` now async — fetches real orders when `orderCount > 0`, passes to `TableDetailModal`. Added `ordersLoading` prop for spinner during fetch.
- **Files**: `tables.service.ts` (+`getTableOrders()`), `tables.controller.ts` (+endpoint), `api.ts` (+`getTableOrders()`), `LiveTablesView.tsx`, `TableDetailModal.tsx`

### POS Cart Reset on Table Switch (commit `99915c0`)

- **Bug**: Switching from Table 3 (2 soups, €6) to Table 2 or an empty table still showed the 2 soups in the POS cart. Dashboard table view was fine — pure POS issue.
- **Fix**: Added `resetCart()` to `PosContext` (clears ALL items, unlike `clearCart` which only clears pending). Both `handleSelect` and `handleForceOpen` in `PosTableModal.tsx` now call `resetCart()` before loading the new session.
- **Root cause**: `clearCart()` was designed to preserve `submitted: true` items (for order history persistence within same session). Table switching needed a full reset.
- **Files**: `PosContext.tsx`, `PosTableModal.tsx`

---

## Security Hardening — httpOnly Cookies, CSRF, Same-Origin Proxy (May 10-11, 2026)

Major security architecture overhaul. Moved JWT from localStorage (XSS-vulnerable) to httpOnly cookies with CSRF protection. Fixed cross-origin cookie blocking by migrating frontend to same-origin Vite proxy.

### JWT → httpOnly Cookie Migration

- **Problem**: JWT stored in `localStorage` — any XSS could read all user tokens. Payment + PII exposure. `sameSite: 'lax'` blocked cookies on cross-site AJAX (localhost:3001 → 192.168.0.3:3000 are different sites).
- **Fix (backend)**:
  - `auth.controller.ts`: login, register, OTP verify, OAuth callback all set httpOnly cookie via `res.cookie('token', token, { httpOnly: true, secure: NODE_ENV === 'production', sameSite: COOKIE_SAMESITE, path: '/', maxAge: 86400000 })`.
  - `COOKIE_SAMESITE` env-driven, defaults to `'lax'`.
  - `POST /auth/logout` clears cookie with matching `sameSite`.
  - `main.ts`: Added `cookieParser()` middleware BEFORE auth middleware.
  - `jwt.strategy.ts`: Reads token from `request.cookies.token` first, falls back to Bearer header.
  - Response still includes `{ token }` in body for transition period (dual auth).
- **Fix (frontend)**:
  - `AuthContext.tsx`: Removed all `localStorage.setItem/removeItem('token', ...)`. Token now comes from httpOnly cookie set by server.
  - `api.ts`: `withCredentials: true` already set — cookie sent automatically. Bearer header interceptor kept as fallback.
- **Files**: `auth.controller.ts`, `jwt.strategy.ts`, `main.ts`, `AuthContext.tsx`, `api.ts`

### CSRF Double-Submit Cookie Protection

- **Problem**: httpOnly cookies are sent automatically on ALL requests — malicious sites could forge state-changing requests.
- **Fix (backend)**:
  - `GET /api/auth/csrf-token` returns `{ csrfToken }` — random UUID set as `csrf-token` cookie (not httpOnly, readable by JS).
  - `main.ts`: CSRF validation middleware checks `X-CSRF-Token` header matches `csrf-token` cookie on POST/PATCH/DELETE/PUT.
  - Skipped in dev mode (`NODE_ENV !== 'production'`) and for Stripe webhook path.
  - Helmet CSP headers applied BEFORE CSRF middleware (ordering matters — CSP sets headers, CSRF checks them).
- **Fix (frontend)**:
  - `api.ts`: Request interceptor fetches CSRF token on first state-changing request, attaches `X-CSRF-Token` header.
  - Token cached in module-level variable, fetched once per session.
- **Files**: `main.ts`, `auth.controller.ts`, `api.ts`

### Same-Origin Vite Proxy (Cross-Origin Cookie Fix)

- **Problem**: Frontend on `localhost:3001` made API calls to `192.168.0.3:3000` (different sites). `sameSite: 'lax'` cookie NOT sent on cross-site AJAX → `/auth/me` returns 401 → StaffRoute redirects to `/login` → infinite logout loop.
- **Root cause**: `api.ts` used `VITE_API_URL` env var (`http://192.168.0.3:3000/api`) as baseURL — cross-origin. SocketContext computed backend URL the same way.
- **Fix**:
  - `api.ts`: Changed `baseURL` from reading `VITE_API_URL` to hardcoded `'/api'` — all requests go through same-origin Vite proxy.
  - `vite.config.js`: Changed from static `defineConfig({...})` to function form `defineConfig(({ mode }) => {...})` using `loadEnv` from Vite. Proxy target derived from `.env` `VITE_API_URL` (strip `/api` suffix): `'/api' → backendOrigin`, `'/socket.io' → backendOrigin` with `ws: true`.
  - `SocketContext.tsx`: Changed from `io(backendUrl, {...})` to `io({...})` with no URL — defaults to `window.location.origin`, proxy forwards `/socket.io`.
  - `.env`: Kept `VITE_API_URL=http://192.168.0.3:3000/api` for vite.config.js proxy target. `api.ts` ignores this and uses `/api` directly.
- **Files**: `api.ts`, `vite.config.js`, `SocketContext.tsx`, `.env`

### 401 Interceptor Logout Loop Fix

- **Problem**: 401 response interceptor in `api.ts` redirected to `/login` when `/auth/me` failed during app initialization. AuthContext hadn't loaded yet, StaffRoute hadn't rendered — hard page reload. Navigating to `/staff/pos` or `/staff/kitchen` after successful login triggered the loop.
- **Fix**: Added guard in 401 interceptor: `if (error.config?.url === '/auth/me') { return Promise.reject(error); }` — lets AuthContext handle auth check failures silently. StaffRoute redirects via `<Navigate>` without hard page reload.
- **File**: `api.ts` (response interceptor, line ~210)

### Category Type — Missing `translations` Field

- **Problem**: TS2339 — `Property 'translations' does not exist on type 'Category'`. PublicMenuPage accessed `activeCat.translations[selectedLang]?.name` but Category interface in `types/index.ts` didn't declare `translations`.
- **Fix**: Added `translations?: any;` to the `Category` interface.
- **File**: `apps/frontend/src/types/index.ts`

### Auth Context — Token Null on Refresh

- **Problem**: On page refresh, `AuthContext` read `token` from localStorage (now empty), set state to `null`, then `/auth/me` succeeded via cookie — but SocketContext already disconnected because `token` was briefly null.
- **Fix**: `AuthContext` no longer reads token from localStorage. `useEffect` calls `/auth/me` on mount — if cookie is valid, user + token loaded. SocketContext reconnects on token change via `useEffect` dependency.
- **Files**: `AuthContext.tsx`, `SocketContext.tsx`

---

## RBAC & Staff Roles — Sprint Implementation (May 12-14, 2026)

Full RBAC sprint implementing Phase 18 (Staff Role Management). 17 tasks across 4 phases. Design spec at `docs/superpowers/specs/2026-05-12-rbac-sprint-design.md`, plan at `docs/superpowers/plans/2026-05-12-rbac-sprint-plan.md`.

### StaffCreatedModal — 4 Runtime Bug Fixes

- **Bug 1 — QR code not appearing**: When `enrollmentUrl` was empty/falsy, `QRCodeSVG` rendered with empty `value` producing unreadable QR. **Fix**: Conditional rendering — QR section only renders when `enrollmentUrl` truthy. Empty state shows `qrUnavailable` message.
- **Bug 2 — "Invalid date" in expiry countdown**: `new Date(expiresAt)` produced `Invalid Date` when `expiresAt` was empty/malformed. `useEffect` interval kept calling `getTime()` on `NaN`. **Fix**: Early return guard `if (isNaN(expiryDate.getTime())) return;` before `setInterval`.
- **Bug 3 — Copy PIN not working (non-HTTPS)**: `navigator.clipboard.writeText()` unavailable on non-HTTPS origins (e.g., LAN IP access). **Fix**: Added `execCommand('copy')` fallback — creates hidden `<textarea>`, selects, copies, removes.
- **Bug 4 — Copy enrollment link copying wrong data**: `handleCopyLink` passed `rawPin` instead of `enrollmentUrl`. **Fix**: Changed to pass `enrollmentUrl`.
- **Files**: `StaffCreatedModal.tsx`

### Device Enrollment Token — Missing DB Table (500 Error)

- **Problem**: "Bond a Device" returned HTTP 500 — `device_enrollment_token` table existed in Prisma migration file (`20260513192000_device_enrollment_tokens/migration.sql`) but was never applied to Neon DB. DB managed via `prisma db push` (not `migrate dev`), so the migration file was present but the table was missing.
- **Fix**: Ran `npx prisma db push` to sync schema directly to Neon DB. `DeviceEnrollmentToken` model now maps to existing `device_enrollment_token` table.
- **Root cause**: Schema drift between migration history and live DB. Project prefers `prisma db push` over `migrate dev` for additive schema changes.
- **Verification**: Enrollment creation succeeds, `POST /:id/device-enrollment` returns `{ enrollmentUrl, expiresAt }`, QR code generates correctly, staff can set PIN from enrollment URL.

### Prisma Client Regeneration — File Lock on Windows

- **Problem**: After `prisma db push`, `npx prisma generate` failed with `EPERM: operation not permitted, rename` on `query_engine-windows.dll.node`. Running NestJS dev server held file lock on the Prisma engine binary.
- **Fix**: Stopped dev server, deleted stale `.tmp` and `.node` files in `node_modules/.prisma/client/` via PowerShell `Remove-Item -Force`, re-ran `npx prisma generate`.
- **Guideline**: Always stop running Node processes before `prisma generate` on Windows — the query engine DLL is locked by any running Prisma client.

### Email Display — Hide Synthetic `.local` Emails

- **Problem**: Staff created without email got auto-generated `staff-{timestamp}@{restaurantId}.local` emails displayed in the staff table — confusing and non-functional.
- **Fix**: Staff table row checks `s.email?.endsWith(".local")` and displays "—" instead.
- **Files**: `SettingsView.tsx`

### Re-Bond Functionality

- **Problem**: Already-enrolled staff who lost their PIN or got a new device had no way to re-enroll without deleting and recreating the staff account.
- **Fix**: "Re-bond" button on each staff row calls `handleRebondStaff()` which triggers the same device enrollment flow as initial creation. `StaffCreatedModal` shows `rebondTitle` / `rebondInstruction` when `rawPin` is absent. `enrollmentError` field cleared before each re-bond attempt.
- **Files**: `SettingsView.tsx`, `StaffCreatedModal.tsx`

### Shared Device Mode & Device Login Fixes

- **Problem 1**: Shared Device Mode toggle didn't reflect current state. **Fix**: SettingsView reads `localStorage.sharedDevice` on mount to initialize toggle state.
- **Problem 2**: Toggle button text didn't change after enabling. **Fix**: Button now shows "Disable Shared Device Mode" when active. Success/disabled message shown inline next to button.
- **Problem 3**: `/device-login` mounted customer providers (CartContext, AssistanceContext), causing API fetch noise. **Fix**: Moved `/device-login` out of public customer layout — now bare route.
- **Problem 4**: PIN login 401 errors redirected away from keypad. **Fix**: 401 interceptor now skips `/auth/pin-login` path.
- **Files**: `SettingsView.tsx`, `App.tsx`, `DeviceLoginPage.tsx`, `api.ts`

### POS & KDS Restaurant Resolution

- **Problem 1**: POS showed "No restaurant selected" after staff login. **Fix**: `RestaurantContext` now prioritizes `user.restaurantId` for assigned staff/managers. Shows "Loading restaurant..." while fetching.
- **Problem 2**: Kitchen Display showed no orders for kitchen staff. **Fix**: `OrdersService.findAll` allows assigned staff (not just owner) to read orders for their restaurant.
- **Files**: `RestaurantContext.tsx`, `orders.service.ts`

### Provider Fetch Noise & Socket Churn

- **Problem**: `OrderProvider` fetched `/orders` on every socket connection state change (including reconnects) even when no authenticated user existed. `AssistanceProvider` had same issue. `SocketProvider` reconnected unnecessarily because it depended on nonexistent `token` field from `AuthContext`.
- **Fix**: OrderProvider and AssistanceProvider now check for authenticated session before fetching. SocketProvider no longer reads `token`. Both providers removed from public/customer route layouts.
- **Files**: `OrderContext.tsx`, `AssistanceContext.tsx`, `SocketContext.tsx`, `App.tsx`

### Verification

All checks passed after fixes:
```bash
npm.cmd --workspace frontend run build
npm.cmd --workspace backend exec -- nest build
npm.cmd --workspace backend test -- orders.service.spec.ts --runInBand
```

### Files Changed (RBAC Sprint)

- Backend: `auth.controller.ts`, `auth.service.ts`, `orders.service.ts`, `restaurants.service.ts`, `dashboard.controller.ts`, `assistance.controller.ts`, `assistance.service.ts`, `restaurants.controller.ts`, `device-enrollment.service.ts`, `menu/*.controller.ts`, `feedback.service.ts`
- Frontend: `App.tsx`, `AuthContext.tsx`, `RestaurantContext.tsx`, `OrderContext.tsx`, `AssistanceContext.tsx`, `SocketContext.tsx`, `api.ts`, `DeviceLoginPage.tsx`, `SettingsView.tsx`, `PosTableModal.tsx`, `StaffRoute.tsx`, `ProtectedRoute.tsx`

---

## Payments "Not Enabled" Investigation (May 15, 2026)

### Summary

Customer reported "Payments are not enabled for this restaurant" error despite having payments toggled on. Investigation confirmed this is **NOT a code bug** — it's the expected behavior of `paymentsEnabled Boolean @default(false)` in the Prisma schema.

### Investigation Chain

1. **Starting point** — `PaymentService.createPaymentIntent()` (line 81-97 of `payment.service.ts`) checks `restaurant.paymentsEnabled` and throws `ForbiddenException` if false.

2. **Root cause** — `paymentsEnabled Boolean @default(false)` in `schema.prisma` line 74. New restaurants default to `false`. The toggle in the frontend Settings tab was never clicked, or the Stripe Connect onboarding was never completed, for the affected restaurants.

3. **Fix** — Both affected restaurants had `paymentsEnabled = false` in their DB row. Updated via direct Neon SQL:
   ```sql
   UPDATE "Restaurant" SET "paymentsEnabled" = true WHERE id = '<id>';
   ```

### Files Affected
- No code changes needed. Schema default is correct. Documentation updated.

---

## PR#3 Findings Fixes (May 15, 2026)

### HomePage.tsx — Unused Imports (HIGH)

- **Problem**: 3 Lucide icons (`TrendingUp`, `Users`, `Layers`) imported but never referenced in JSX or the `featureIcons` map. 16 icons imported, only 13 needed.
- **Fix**: Removed `TrendingUp`, `Users`, `Layers` from import statement.
- **Files**: `apps/frontend/src/pages/HomePage.tsx`

### HomePage.tsx — `as any` on i18n Keys (MEDIUM)

- **Problem**: Three instances of `t(`landing.tiers.starterFeature${i + 1}` as any)` — unsafe type cast bypassing TypeScript checking.
- **Fix**: Replaced with `t(`landing.tiers.starterFeature${i + 1}`, `Feature ${i + 1}`)` using i18next's built-in fallback parameter.
- **Files**: `apps/frontend/src/pages/HomePage.tsx`

### HomePage.tsx — Loose `featureIcons` Record Type (MEDIUM)

- **Problem**: `Record<string, { icon, color }>` allows any string key — no compile-time validation that all `featureKeys` have entries.
- **Fix**: Changed to `Record<typeof featureKeys[number], { icon: typeof QrCode, color: string }>` — guarantees every key in `featureKeys` has an entry, catches typos at compile time.
- **Files**: `apps/frontend/src/pages/HomePage.tsx`

### HomePage.tsx — Non-Standard Tailwind Durations (MEDIUM)

- **Problem**: `duration-400` and `duration-1200` classes don't exist in default Tailwind config — silently ignored by JIT compiler, animations had no transition duration.
- **Fix**: `duration-400` → `duration-300`, `duration-1200` → `duration-1000`.
- **Files**: `apps/frontend/src/pages/HomePage.tsx`

### RestaurantContext.tsx — TS Error Line 82

- **Problem**: `getRestaurantById(user.restaurantId)` — `user.restaurantId` is `string | undefined` but `getRestaurantById` expects `string`. TypeScript error even though line 78's `!!user?.restaurantId` guards the branch at runtime.
- **Fix**: Added non-null assertion: `const restaurant = await getRestaurantById(user.restaurantId!);`
- **Files**: `apps/frontend/src/context/RestaurantContext.tsx`

### CheckoutPage.tsx — Sr-Only Checkbox Hack

- **Problem**: Hand-built toggle using `<input type="checkbox" className="sr-only">` + two `<div>` elements — no ARIA semantics, no keyboard support, no `role="switch"`.
- **Fix**: Replaced with `<Toggle>` component using Radix UI primitive — proper `role="switch"`, `aria-checked`, keyboard navigation, `useId()` for label association, focus-visible ring.
- **Files**: `apps/frontend/src/pages/CheckoutPage.tsx`

### Verification

```bash
cd apps/frontend
npx tsc --noEmit   # Zero errors (RestaurantContext:82 error gone)
npm run build       # Vite build succeeded
```

---

## Code Review Findings Fixes (May 15, 2026)

### Typed Translations (MEDIUM)

- **Problem**: Multiple `t(key as any)` casts throughout codebase — unsafe, bypassing type checking.
- **Fix**: Replaced all `as any` casts with proper `t(key, fallback)` calls. i18next's `t()` function accepts `string` as key; second argument is default/fallback.
- **Files**: `HomePage.tsx`, `FilterPanel.tsx`, `TopBar.tsx`

### Shared Utils Deduplication

- **Problem**: Currency formatting logic duplicated across CartDrawer, CheckoutPage, PaymentModal.
- **Fix**: Extracted to single `lib/currency.ts` utility — `formatEuro()` and `formatBgn()` at BNB fixed rate.
- **Files**: `apps/frontend/src/lib/currency.ts`, `CartDrawer.tsx`, `CheckoutPage.tsx`, `PaymentModal.tsx`

### Toggle Component Adoption

- **Problem**: Custom toggle implementations without proper ARIA semantics in CheckoutPage points redemption switch.
- **Fix**: Adopted existing `<Toggle>` component from `components/ui/` (Radix primitive with `role="switch"`, `aria-checked`, keyboard support).
- **Files**: `CheckoutPage.tsx`

### i18n Gaps

- **Problem**: Search placeholder, dietary tags, allergen names not wired to translation files.
- **Fix**: Added ~30 new keys across EN/BG/RO for all new public menu UX elements.
- **Files**: `en/translation.json`, `bg/translation.json`, `ro/translation.json`

### Verification

All checks passed: `npx tsc --noEmit`, `npm run build`, `npx vitest run`

---

## Public Menu Mobile UX Redesign (May 15, 2026)

### Summary

Complete mobile-first redesign of the customer-facing public menu. 10 tasks across 14 files. `PublicMenuPage.tsx` refactored from 815 lines to ~400 by extracting TopBar, FilterPanel, and CategoryPills into standalone components.

### Components Created/Modified

| Component | File | Description |
|-----------|------|-------------|
| Currency Utility | `lib/currency.ts` | `formatEuro()`, `formatBgn()` at BNB fixed rate 1.95583 |
| TopBar | `pages/TopBar.tsx` | Search, filter toggle, theme, language codes, table chip |
| FilterPanel | `pages/FilterPanel.tsx` | Dietary toggles + allergen exclusion pills |
| CategoryPills | `pages/CategoryPills.tsx` | Horizontal scroll pill navigation |
| ItemWithOptions | `components/menu/ItemWithOptions.tsx` | Horizontal layout, dual currency, pill +Add buttons |
| TrendingCarousel | `components/menu/TrendingCarousel.tsx` | Slim version with compact skeleton |
| CartDrawer | `components/cart/CartDrawer.tsx` | Dual-currency integration |
| CheckoutPage | `pages/CheckoutPage.tsx` | Dual-currency integration |
| PaymentModal | `components/payment/PaymentModal.tsx` | Dual-currency integration |
| PublicMenuPage | `pages/PublicMenuPage.tsx` | Refactored 815→~400 lines |
| i18n | `locales/*/translation.json` | ~30 new keys EN/BG/RO |

### Dead Code Removed

- `LANG_LABELS` constant — hardcoded language display names, unused after TopBar extraction
- `handleLanguageChange` function — unused after language selection moved to TopBar

### Design Decisions

1. **BNB fixed rate single source** — `currency.ts` is the only place that stores 1.95583. Components consume formatters, never duplicate the rate.
2. **Component extraction** — TopBar, FilterPanel, CategoryPills extracted as page-level components (co-located with PublicMenuPage, not in `components/`) since they're specific to the public menu surface.
3. **Zero backend changes** — Pure frontend redesign. Same API, same cart/order/assistance flows.
4. **Pill-shaped buttons** — `rounded-full` + compact sizing replaces full-width solid blue buttons. Better for dense mobile layouts.

### Verification

```bash
cd apps/frontend
npx tsc --noEmit   # Zero errors
npm run build       # Vite build succeeded
```

### Commits

```
68c939e feat: add shared currency utility — dual EUR/BGN formatters at BNB fixed rate 1.95583
7f9d5dd feat: add TopBar component — search, filter, theme, lang codes, table chip
ced6387 feat: add FilterPanel — dietary toggles + allergen exclusion pills, multi-select search
5b30c84 feat: redesign item cards — horizontal layout, dual-currency prices, pill +Add buttons
cc56598 feat: add CategoryPills — horizontal scroll pill navigation replacing sticky nav
e56d1da feat: slim TrendingCarousel — wider horizontal cards, compact skeleton loader
1b45d4e feat: regroup bottom nav — profile/waiter left, bill/cart right
b044625 feat: add i18n keys — search, filters, addShort, dietary/allergen labels EN/BG/RO
a1e96ca feat: dual-currency prices in CartDrawer, Checkout, PaymentModal — EUR + BGN at fixed BNB rate
7e4b534 refactor: remove dead code from PublicMenuPage — unused LANG_LABELS constant, handleLanguageChange function
2809930 fix: address code review findings — typed translations, shared utils, Toggle component, i18n gaps
667e954 fix: HomePage.tsx PR#3 findings + RestaurantContext TS error
```
