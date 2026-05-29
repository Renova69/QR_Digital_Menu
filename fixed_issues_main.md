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

### Files Changed (RBAC Sprint - May 12-14)

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

---

## Security & Bug Fixes (May 15, 2026)

### Socket.io CORS Wildcard

- **Problem**: `events.gateway.ts` used `origin: '*'` — any page (including malicious sites) could subscribe to restaurant Socket.io events.
- **Fix**: Replaced with `process.env.FRONTEND_URL || 'http://localhost:3001'` and added `credentials: true`.
- **File**: `apps/backend/src/events/events.gateway.ts`

### Magic-Link Endpoint Removal

- **Problem**: `POST /auth/magic-link` returned `{ token }` in response body AND `console.log`-ed it — JWT was readable to XSS and visible in server logs.
- **Fix**: Deleted endpoint and `sendMagicLink()` service method entirely. Replaced by Email OTP (shipped May 6, 2026).
- **Files**: `auth.controller.ts`, `auth.service.ts`

### Loyalty Expiry Emails Not Sent

- **Problem**: `runDailyExpiryReminders()` cron ran daily, marked DB batches as `reminderSentAt`, but never sent an email to anyone. Notification was silently dropped.
- **Fix**: Added Resend API call per candidate inside the cron. Dev fallback: `logger.log` if `RESEND_API_KEY` absent.
- **File**: `apps/backend/src/loyalty/loyalty.service.ts`

### Analytics CSV Export Missing Sections

- **Problem**: `handleExportCSV()` exported summary + revenue trend + top items but was missing `peakHours` and `categoryBreakdown` — 2 of 5 data sets.
- **Fix**: Added both sections to the CSV export builder.
- **File**: `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`

### TypeScript Strict Mode Enabled

- **Problem**: Backend `tsconfig.json` had `strictNullChecks: false` and `noImplicitAny: false` — masking dozens of type errors.
- **Fix**: Both set to `true`. Fixed all resulting errors: explicit `any` on controller `@Request() req` params, nullish coalescing on pagination `page`/`limit`, null guards in orders service, supertest import fix in e2e specs.
- **File**: `apps/backend/tsconfig.json` + multiple service/controller files

### CategoryPills Auto-Scroll

- **Problem**: Active category pill could be off-screen after category change — user had to manually scroll to find their active filter.
- **Fix**: Added `scrollIntoView` via `useRef` on pill elements. Active pill scrolls into view on change.
- **File**: `apps/frontend/src/pages/CategoryPills.tsx`

### ItemWithOptions BGN Double-Conversion

- **Problem**: BGN-priced items (`item.currency === 'BGN'`) were passed directly to `formatInlineDual()` which assumed EUR input and multiplied by 1.95583 — showing double-converted amounts.
- **Fix**: If `item.currency === 'BGN'`, divide by `BGN_RATE` before passing to formatter.
- **File**: `apps/frontend/src/components/menu/ItemWithOptions.tsx`

---

## Infrastructure & Polish Sprint (May 15, 2026)

### API Versioning — All Routes at `/api/v1/*`

- All routes migrated from `/api/*` to `/api/v1/*` via `VersioningType.URI` in `main.ts` with `defaultVersion: '1'`. Frontend `api.ts` base URL updated. CSRF exempt paths and webhook path updated to include `/v1`. Vite proxy unchanged (matches `/api/*`).
- **Files**: `main.ts`, `apps/frontend/src/lib/api.ts`

### Prisma Retry / Circuit Breaker

- `PrismaService.onModuleInit()` startup retry upgraded from fixed 2s to jittered exponential backoff (1s → 30s cap).
- New `withRetry<T>(fn, maxAttempts)` for runtime query resilience.
- Circuit breaker: CLOSED → OPEN after 5 consecutive transient failures (P1001/P1002/P1008/P1017/P2024/P1012), HALF_OPEN after 30s cooldown.
- **File**: `apps/backend/src/prisma/prisma.service.ts`

### Order Progress Stepper

- `OrderConfirmationPage` now shows a 3-step visual stepper: Placed → In Kitchen → Served. Animated state transitions (emerald for done, accent/pulse for current). Hidden for CANCELED orders.
- **File**: `apps/frontend/src/pages/OrderConfirmationPage.tsx`

### QR Table Tent Print Templates

- 3 branded print layouts: Classic (white, dashed border), Premium (dark bg, corner accents, serif type), Minimal (clean border, oversized table name). Template selector dropdown added to `TableView.tsx`. `PrintTemplate` type exported.
- **Files**: `apps/frontend/src/components/tables/PrintableQRCodes.tsx`, `apps/frontend/src/pages/Dashboard/TableView.tsx`

### Service Test Coverage — 122 Tests (up from 77)

- 3 new spec files: `tables.service.spec.ts` (19 tests), `users.service.spec.ts` (17 tests), `translation.service.spec.ts` (14 tests). Covers CRUD paths, RBAC checks, transient error fallbacks, DeepL free/paid endpoint routing.

### Customer Split Bill

- `SplitBillSection` component added to `CheckoutPage` — collapsible, counter 2–20 people, shows per-person EUR + BGN amounts. Client-side only, no backend changes.
- **File**: `apps/frontend/src/pages/CheckoutPage.tsx`

### AnalyticsView CSV Field Names

- Field names in revenue trend CSV rows were `name`/`value` instead of `category`/`revenue` — caused incorrect column headers. Fixed to match actual data shape.
- **File**: `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`

---

## SaaS Tiering V2 (May 16, 2026)

Full subscription tier system: 4 tiers (FREE/STARTER/PROFESSIONAL/ENTERPRISE), Stripe Checkout + Customer Portal, feature gating on dashboard and settings, demo accounts for QA.

### Schema Changes

- `SubscriptionTier` enum added: `FREE`, `STARTER`, `PROFESSIONAL`, `ENTERPRISE`.
- `Restaurant` model: `tier SubscriptionTier @default(FREE)`, `stripeCustomerId String?`, `stripeSubscriptionId String?`, `stripePriceId String?`, `tierUpdatedAt DateTime?`.
- Pushed to Neon via `prisma db push`.
- **File**: `apps/backend/prisma/schema.prisma`

### Backend — SubscriptionModule

- `FeatureService` — pure tier→feature flag resolver. `TIER_FEATURES` map: FREE gets `menu:view`, `menu:edit`, `qr:manage` only. Higher tiers unlock `analytics:basic`, `orders:receive`, `payments:stripe`, `loyalty`, `pos`, `kds`, `menu:import`, `orders:call-waiter`.
- `FeatureGuard` — NestJS `CanActivate` guard. Resolves restaurant from owner (`Restaurant.ownerId`) OR staff (`User.restaurantId`) — both cases handled. Throws `ForbiddenException({ code: 'FEATURE_LOCKED' })` when tier insufficient.
- `@RequireFeature(...flags)` decorator — marks controller methods with required feature flags.
- `SubscriptionService` — Stripe Checkout session creation, Customer Portal session creation, webhook handling with timestamp-gate to prevent race conditions. `checkout.session.completed` and `customer.subscription.updated` apply tier; `customer.subscription.deleted` resets to FREE.
- `SubscriptionController` — `/subscription/status`, `/subscription/checkout`, `/subscription/portal`, `/subscription/webhook` (raw body, CSRF-exempt).
- Raw body middleware registered for `/api/v1/subscription/webhook` in `main.ts`. Webhook path added to `isWebhook` CSRF exempt check.
- `@Global()` `SubscriptionModule` — guard available everywhere without per-module imports.
- **Files**: `subscription/feature.service.ts`, `subscription/feature.guard.ts`, `subscription/require-feature.decorator.ts`, `subscription/feature-flag.enum.ts`, `subscription/subscription.service.ts`, `subscription/subscription.controller.ts`, `subscription/subscription.module.ts`, `subscription/dto/checkout.dto.ts`, `main.ts`, `app.module.ts`

### Frontend — Feature Gating

- `useFeature(flag)` hook — reads `RestaurantContext.activeRestaurant.tier`, maps to `TIER_FEATURES` matching backend. Returns `boolean`. Default tier: FREE when no tier in context.
- `DashboardPage.tsx` — 7 feature flags checked. Tabs filtered (analytics, orders, payments, assistance hidden for FREE). POS/KDS links wrapped in `canPos`/`canKds`. Mobile bottom nav filtered.
- `SettingsView.tsx` — loyalty and payments settings tabs hidden for FREE/STARTER.
- `BillingView.tsx` — new Settings tab showing current plan, upgrade options, and Stripe Portal link.
- `SubscriptionBanner.tsx` — inline upgrade nudge shown on locked features.
- `PricingPage.tsx` — `/pricing` public page showing all 4 tier plans with upgrade CTAs.
- **Files**: `hooks/useFeature.ts`, `pages/DashboardPage.tsx`, `pages/Dashboard/SettingsView.tsx`, `components/subscription/BillingView.tsx`, `components/subscription/SubscriptionBanner.tsx`, `pages/PricingPage.tsx`, `App.tsx`, `lib/api.ts`

### Webhook Race Condition Protection

- `updateMany` with `OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lt: eventTime } }]` ensures older events never overwrite newer tier state. Stripe can deliver events out of order — this gate prevents downgrade from a redelivered old event.

### Demo Accounts Seeded

- `apps/backend/prisma/seed-demo-restaurants.ts` — 4 owner+restaurant pairs: `demo.free@qrmenu.test`, `demo.starter@qrmenu.test`, `demo.pro@qrmenu.test`, `demo.enterprise@qrmenu.test` (password: `demo1234`). Useful for QA testing all 4 tier experiences.

### New Env Vars

```env
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_PROFESSIONAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET=whsec_...
```

### Commits

```
e9a86c2 feat: add SubscriptionTier enum and tier fields to Restaurant schema
79d84e5 feat: add @RequireFeature decorator and FeatureGuard with NestJS guard pattern
5021adf feat: add Stripe Checkout, Customer Portal, and timestamp-gated webhook handling
020153a feat: add useFeature hook with tier-based feature resolution for frontend
831369c fix: resolve 4 critical bugs in subscription module
4696061 fix: correct Prisma error imports and replace stub specs with real assertions
979ad40 feat: SaaS tiering v2 — Tasks 2-12 complete
75a4927 feat: wire useFeature into dashboard — gate tabs, links, and settings by tier
```

---

## Menu Import/Export — Combined Dashboard Tab (May 16, 2026)

### Summary

Combined the existing OCR JSON import flow with a new menu export feature under a single "Import/Export" dashboard tab. Export was always available on the backend (`GET /api/restaurants/:id/menu/export`) but had no UI until now.

### Implementation

- **`MenuImportExportView.tsx`** (new, ~380 lines) — parent component with `activeSubTab: 'import' | 'export'` state. Upload icon for Import sub-tab, Download icon for Export sub-tab.
- **`ImportTab`** — all existing import functionality preserved: `ApiKeyPanel` (OCR tool API key management), `FileImporter` (JSON file upload + textarea paste), `PreviewTable` (data preview table), confirm import with `useMutation`.
- **`ExportTab`** — three action buttons: Download JSON, Download CSV, Copy JSON to clipboard. Lazy fetch via `useQuery({ enabled: false })` — data only fetched when user clicks an action button. Shows item/category count after successful fetch. Error state for failed exports.
- **`menuToCSV()`** — converts menu JSON to CSV format with UTF-8 BOM + `sep=;` European locale metadata for Excel/Numbers compatibility. Exports all fields: category, item name, description, price, currency, allergens, dietary tags, options with price modifiers.
- **`exportMenu()` in `api.ts`** — calls existing backend endpoint `GET /api/restaurants/:id/menu/export` (JWT-guarded). Returns `{ restaurantId, categories }` with full item details including translations, options, allergens, dietary tags.
- **Translation keys** — `dashboard.tabs.importExport` added to EN ("Import/Export"), BG ("Импорт/Експорт"), RO ("Import/Export") locale files.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/Dashboard/MenuImportExportView.tsx` | **New** — combined Import/Export view (~380 lines) |
| `apps/frontend/src/pages/DashboardPage.tsx` | Import changed to `MenuImportExportView`, tab label key updated |
| `apps/frontend/src/lib/api.ts` | `exportMenu()` function added |
| `apps/frontend/src/locales/en/translation.json` | `dashboard.tabs.importExport` key added |
| `apps/frontend/src/locales/bg/translation.json` | `dashboard.tabs.importExport` key added |
| `apps/frontend/src/locales/ro/translation.json` | `dashboard.tabs.importExport` key added |

No backend changes needed — export endpoint already existed in `menu-import.controller.ts` and `menu-import.service.ts`.

### Design Decisions

1. **Sub-tab navigation** — Import and Export share a tab because they're closely related (menu data I/O). Sub-tabs prevent tab bar bloat.
2. **Lazy fetch** — Export data is fetched only on button click, not on tab mount. Prevents unnecessary API calls when user only wants to import.
3. **Frontend CSV generation** — CSV conversion happens client-side via `menuToCSV()`. Backend returns JSON only — single source of truth, avoids maintaining two export formats server-side.
4. **No backend changes** — The backend `GET /export` endpoint was already built, tested, and JWT-guarded. Only frontend UI was missing.

---

## Cross-Origin Cookie & CSRF Fix — Production Deployment (May 16, 2026)

### COOKIE_SAMESITE Default Changed from 'lax' to 'none' in Production

- **Problem**: Frontend deployed on Vercel (`vercel.app`) and backend on Cloud Run (`run.app`) are different origins. `sameSite: 'lax'` cookies are NOT sent on cross-site fetch/XHR requests. `/auth/me` return 401 (cookie missing), `/auth/csrf-token` cookie not sent → `X-CSRF-Token` validation fail 403 on POST /orders. Customer can browse menu but cannot place orders.
- **Root cause**: `COOKIE_SAMESITE` defaulted to `'lax'` in both `main.ts` (CSRF cookie) and `auth.controller.ts` (auth token cookie) when `NODE_ENV === 'production'`.
- **Fix**: Changed default production value from `'lax'` to `'none'` in both files. `secure: true` already set in production (required by browsers when `sameSite: 'none'`).
  - `main.ts` line 73: `(process.env.NODE_ENV === 'production' ? 'none' : 'lax')`
  - `auth.controller.ts` line 31: same pattern
  - `COOKIE_SAMESITE` env var still overridable — set to `'lax'` for same-origin deploys.
- **Impact**: All cross-origin POST requests now work (orders, assistance, feedback, OTP). Auth cookies sent cross-origin. CSRF validation passes.
- **Files**: `apps/backend/src/main.ts`, `apps/backend/src/auth/auth.controller.ts`

### Frontend API Base URL — Production Cross-Origin Mode

- **Problem**: `api.ts` hardcoded `/api` as baseURL. In production on Vercel static hosting, there's no Vite proxy — `/api` resolves to `vercel.app/api` which doesn't exist.
- **Fix**: `api.ts` auto-selects baseURL: `/api/v1` in dev (same-origin via Vite proxy), `VITE_API_URL` env in production (cross-origin to Cloud Run).
- **Files**: `apps/frontend/src/lib/api.ts`

### CSRF Cross-Origin Compatibility

- **Problem**: CSRF `csrf-token` cookie also used `sameSite: 'lax'` — not sent cross-origin. `X-CSRF-Token` header validation failed on all state-changing POST requests in production.
- **Fix**: CSRF cookie now uses same `COOKIE_SAMESITE` defaulting to `'none'` in production. `httpOnly: false` (readable by JS for header attachment). CSRF exempt list unchanged (login, register, OTP, Google auth).
- **Files**: `apps/backend/src/main.ts`

---

## CheckoutPage Screen Hang After Order Submission (May 16, 2026)

### useEffect Redirect Race Condition

- **Problem**: Placing order → screen showed "Submitting order..." permanently. Backend received order immediately (owner could see it), but frontend never navigated to order confirmation. Refreshing page went to public menu (not order confirmation).
- **Root cause**: Race condition in `CheckoutPage.tsx`:
  1. `createOrder()` succeeds, returns `{ ...newOrder, sessionToken }`
  2. `navigate("/order-confirmation", { state: {...} })` fires
  3. `clearCart()` sets `items` to `[]`
  4. `useEffect([items, navigate])` on line 191 detects `items.length === 0` → fires `navigate(-1)`
  5. `navigate(-1)` UNDOES the `navigate("/order-confirmation")` — component stays mounted, `submitting` state stays `true`
- **Fix**: Added `useRef(false)` flag:
  ```typescript
  const orderPlaced = useRef(false);
  // useEffect guard: only navigate back if order NOT just placed
  if (items.length === 0 && !orderPlaced.current) { navigate(-1); }
  // Before clearCart: orderPlaced.current = true;
  ```
  Flag set to `true` before `clearCart()`, checked in useEffect before navigating back.
- **Files**: `apps/frontend/src/pages/CheckoutPage.tsx`

### Missing orderId in Navigate State

- **Problem**: Order confirmation page could not join WebSocket room for real-time order status updates.
- **Root cause**: `OrderConfirmationPage.tsx` reads `orderId` from `location.state` (line 107) for `joinOrderRoom(orderId)`. `CheckoutPage` navigate state only passed `orderNumber: newOrder.id` — missing `orderId`.
- **Fix**: Added `orderId: newOrder.id` to navigate state object in `CheckoutPage.tsx`.
- **Files**: `apps/frontend/src/pages/CheckoutPage.tsx`

---

## Menu Import/Export — Combined Dashboard Tab (May 16, 2026)

### Summary

Combined the existing OCR JSON import flow with a new menu export feature under a single "Import/Export" dashboard tab. Export was always available on the backend (`GET /api/restaurants/:id/menu/export`) but had no UI until now.

### Implementation

- **`MenuImportExportView.tsx`** (new, ~380 lines) — parent component with `activeSubTab: 'import' | 'export'` state. Upload icon for Import sub-tab, Download icon for Export sub-tab.
- **`ImportTab`** — all existing import functionality preserved: `ApiKeyPanel` (OCR tool API key management), `FileImporter` (JSON file upload + textarea paste), `PreviewTable` (data preview table), confirm import with `useMutation`.
- **`ExportTab`** — three action buttons: Download JSON, Download CSV, Copy JSON to clipboard. Lazy fetch via `useQuery({ enabled: false })` — data only fetched when user clicks an action button. Shows item/category count after successful fetch. Error state for failed exports.
- **`menuToCSV()`** — converts menu JSON to CSV format with UTF-8 BOM + `sep=;` European locale metadata for Excel/Numbers compatibility. Exports all fields: category, item name, description, price, currency, allergens, dietary tags, options with price modifiers.
- **`exportMenu()` in `api.ts`** — calls existing backend endpoint `GET /api/restaurants/:id/menu/export` (JWT-guarded). Returns `{ restaurantId, categories }` with full item details including translations, options, allergens, dietary tags.
- **Translation keys** — `dashboard.tabs.importExport` added to EN ("Import/Export"), BG ("Импорт/Експорт"), RO ("Import/Export") locale files.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/Dashboard/MenuImportExportView.tsx` | **New** — combined Import/Export view (~380 lines) |
| `apps/frontend/src/pages/DashboardPage.tsx` | Import changed to `MenuImportExportView`, tab label key updated |
| `apps/frontend/src/lib/api.ts` | `exportMenu()` function added |
| `apps/frontend/src/locales/en/translation.json` | `dashboard.tabs.importExport` key added |
| `apps/frontend/src/locales/bg/translation.json` | `dashboard.tabs.importExport` key added |
| `apps/frontend/src/locales/ro/translation.json` | `dashboard.tabs.importExport` key added |

No backend changes needed — export endpoint already existed in `menu-import.controller.ts` and `menu-import.service.ts`.

### Design Decisions

1. **Sub-tab navigation** — Import and Export share a tab because they're closely related (menu data I/O). Sub-tabs prevent tab bar bloat.
2. **Lazy fetch** — Export data is fetched only on button click, not on tab mount. Prevents unnecessary API calls when user only wants to import.
3. **Frontend CSV generation** — CSV conversion happens client-side via `menuToCSV()`. Backend returns JSON only — single source of truth, avoids maintaining two export formats server-side.
4. **No backend changes** — The backend `GET /export` endpoint was already built, tested, and JWT-guarded. Only frontend UI was missing.

---

## Tier Enforcement Sweep Round 2 — Test Fixes (May 17, 2026)

### Context

Round 2 made `UsersService.createStaffMember` and `MenuCrudService` tier-aware. This broke 22 previously-passing tests whose mocks did not include the new `tier` field that the services now read.

### `users.service.spec.ts` — Two Root Causes

**Root cause 1 — Missing DI provider:**
`UsersService` now injects `FeatureService` in its constructor. The test module did not provide `FeatureService`, causing NestJS DI to throw at module init time (all tests failed with "Nest can't resolve dependencies").

- **Fix**: Added `FeatureService` to the `providers` array in `Test.createTestingModule`. Since `FeatureService` has no constructor params, it can be added as a class directly — NestJS instantiates it normally.

**Root cause 2 — Role/tier mismatch:**
`createStaffMember` tests used `role: 'WAITER'` and `role: 'KITCHEN'` with the default `{ tier: 'FREE' }` restaurant mock. `getAllowedStaffRoles('FREE')` returns `[]`, so the service threw `ForbiddenException` before reaching the staff-limit or user-creation logic.

- **Fix**: Updated mock restaurant tier per `getAllowedStaffRoles` rules:
  - Tests that create WAITER or KITCHEN use `tier: 'ENTERPRISE'`
  - Tests that create MANAGER use `tier: 'PROFESSIONAL'`
  - Staff-limit test (PROFESSIONAL, count=5) — role changed from WAITER to MANAGER

### `menu-crud.service.spec.ts` — Two Root Causes

**Root cause 1 — SCHEDULED filter tests:**
`filterByAvailability` now checks `tier` and treats SCHEDULED as ALWAYS for non-DAYPARTING tiers. `BASE_RESTAURANT` had `tier: 'FREE'`, so SCHEDULED categories were never filtered — tests expecting 1 filtered result got 2.

- **Fix**: Two SCHEDULED tests override with `{ ...BASE_RESTAURANT, tier: 'PROFESSIONAL' }` so DAYPARTING enforcement activates.

**Root cause 2 — Trending item tests:**
`getTrendingItems` checks `hasFeature(tier, UPSELLING)` and returns `[]` immediately for non-UPSELLING tiers. Trending mocks passed `{ trendingMode: 'MANUAL', id: 'rest-1' }` with no `tier` — `hasFeature(undefined, ...)` defaulted to FREE so UPSELLING was never enabled.

- **Fix**: Added `tier: 'PROFESSIONAL'` to both MANUAL and AUTO trending restaurant mocks.

### Result

```
Test Suites: 29 passed, 29 total
Tests:       454 passed, 454 total
```

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/users/users.service.spec.ts` | Added FeatureService provider; updated 5 createStaffMember test fixtures with correct tier/role combos |
| `apps/backend/src/menu/menu-crud.service.spec.ts` | Added tier: PROFESSIONAL to 4 test fixtures (2 SCHEDULED, 2 trending) |

---

## Super-Admin Dashboard (May 17, 2026)

Full internal operations panel at `/super-admin` for platform-level management.

### Backend — `SuperAdminModule`

- **`GET /super-admin/stats`** — platform totals (restaurants, users, orders, revenue) + tier distribution (`groupBy` not raw SQL — avoids `@@map` casing pitfall).
- **`GET /super-admin/tenants`** — paginated list with search, tier filter, status filter, deleted filter. `GetTenantsQueryDto` validates `tier` against enum (no arbitrary string pass-through).
- **`GET /super-admin/tenants/:id`** — tenant detail with owner info and counts. Explicit `select` — never exposes `deeplApiKey`, `importApiKey`, `stripeAccountId`, `stripeCustomerId`.
- **`PATCH /super-admin/tenants/:id/tier`** — sets `forceTier` override (bypasses Stripe subscription).
- **`PATCH /super-admin/tenants/:id/status`** — suspend (`isActive: false`) / reactivate (`isActive: true`).
- **`DELETE /super-admin/tenants/:id`** — soft-delete via `deletedAt` timestamp (not hard delete).
- **`POST /super-admin/tenants/:id/restore`** — clears `deletedAt`, reactivates tenant.
- All routes guarded by `@Roles('SUPER_ADMIN')` + `RolesGuard`.
- **Schema additions**: `Restaurant.isActive Boolean @default(true)`, `Restaurant.forceTier SubscriptionTier?`, `Restaurant.deletedAt DateTime?`.

### Frontend — Super-Admin Pages

- **`SuperAdminLayout`** — sidebar nav (Overview / Tenants), isolated from `RestaurantProvider` (SUPER_ADMIN has no restaurant).
- **`OverviewPage`** — platform stats cards + tier distribution pie chart (literal hex colors, not CSS vars).
- **`TenantsPage`** — table with search (debounced 300ms via `useDebouncedValue` hook), tier/status/deleted filter dropdown. Deleted rows show slate "Deleted" badge. `staleTime: 30_000` on queries.
- **`TenantDetailPage`** — tier override dropdown (forceTier), suspend/reactivate button, soft-delete/restore button. All mutations have `onError` handler + red error banner (previously failed silently with no feedback).
- **Files**: `super-admin.service.ts`, `super-admin.controller.ts`, `super-admin.module.ts`, `SuperAdminLayout.tsx`, `OverviewPage.tsx`, `TenantsPage.tsx`, `TenantDetailPage.tsx`, `hooks/useDebouncedValue.ts`

---

## Tier Override Live Propagation (May 17, 2026)

### Problem

Super-admin sets `forceTier` on a restaurant. Owner is already logged in. Owner's browser shows OLD tier until they log out and back in — `RestaurantContext` is fetched once on login and never refreshes.

### Root causes (3 layers)

1. **`subscription.controller.ts` `getStatus()`** — fetched `tier` only, not `forceTier`. Returned raw tier even when `forceTier` was set.
2. **`restaurants.service.ts`** — `findAll/findOne/findOneOrStaff` returned raw Prisma row without applying `forceTier`.
3. **`useFeature.ts` `useTier()`** — read `activeRestaurant.tier` from `RestaurantContext` (stale on-login snapshot). Even with correct API data, context was never refreshed.

### Fixes

**Backend:**
- `subscription.controller.ts`: `getStatus()` now selects `forceTier` and passes both fields to `featureService.getEffectiveTier(tier, forceTier)`.
- `restaurants.service.ts`: Added `applyEffectiveTier<T>(r)` helper that overwrites `tier` with `forceTier` when set. Applied to `findAll`, `findOne`, `findOneOrStaff`.

**Frontend:**
- `useFeature.ts` `useTier()`: Replaced `useContext(RestaurantContext)` read with `useQuery(['subscription-status'], getSubscriptionStatus, { staleTime: 60_000 })`. TanStack Query's default `refetchOnWindowFocus: true` means switching tabs fetches fresh tier. Falls back to context while query is loading.
- `SubscriptionBanner.tsx`: Migrated from `useEffect + useState` to `useQuery(['subscription-status'])` — shares cache key, no extra requests.
- `BillingView.tsx`: Same migration — removed `SubscriptionStatus` interface, `loading` state, `useEffect`. Now driven by `useQuery` data.

**Result**: Tier override by super-admin reflects in owner's browser within 60s (next window-focus event) without logout.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/subscription/subscription.controller.ts` | `getStatus()` selects `forceTier`, uses `getEffectiveTier` |
| `apps/backend/src/restaurants/restaurants.service.ts` | `applyEffectiveTier` helper on all 3 read methods |
| `apps/frontend/src/hooks/useFeature.ts` | `useTier()` uses `useQuery` instead of stale context |
| `apps/frontend/src/components/subscription/SubscriptionBanner.tsx` | `useEffect` → `useQuery` |
| `apps/frontend/src/components/subscription/BillingView.tsx` | `useEffect` → `useQuery`, removed unused interface |

---

## Google OAuth URL Versioning Fix (May 18, 2026)

### Problem

Clicking "Sign in with Google" in both the customer login modal and the dashboard login dialog returned a 404. The button constructed the OAuth redirect URL by appending `/auth/google` to the backend URL, missing the `/v1/` URI version segment.

### Root Cause

Three locations hardcoded `/auth/google` without the version prefix:
- `CustomerLoginModal.tsx` — `window.location.href = apiUrl + '/auth/google'`
- `LoginDialog.tsx` — same pattern
- `google.strategy.ts` — fallback `callbackURL` was `/api/auth/google/callback` (missing `/v1/`)

The backend uses `VersioningType.URI` with `defaultVersion: '1'`, so all routes are mounted at `/api/v1/*`. Requests to `/api/auth/google` had no matching route.

### Fix

All three files updated to include `/v1/` in the OAuth path:
- Frontend: construct URLs as `apiUrl + '/v1/auth/google'`
- Backend `google.strategy.ts`: fallback callback URL corrected to `/api/v1/auth/google/callback`
- Google Cloud Console OAuth credentials updated with correct authorized callback URL

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/components/auth/CustomerLoginModal.tsx` | `/auth/google` → `/v1/auth/google` in URL construction |
| `apps/frontend/src/components/ui/LoginDialog.tsx` | `/auth/google` → `/v1/auth/google` in URL construction |
| `apps/backend/src/auth/google.strategy.ts` | Fallback `callbackURL` updated to include `/v1/` |

---

## Auth Log Scrubbing (May 18, 2026)

### Problem

OTP verification codes and customer phone numbers (from Twilio) were visible in Cloud Run production logs. Anyone with log access could see live OTP codes.

### Fix

Two `console.log` calls in `auth.service.ts` wrapped in `if (process.env.NODE_ENV !== 'production')` guard:
1. OTP code log (~line 250): `console.log('OTP code for', email, ':', code)` — suppressed in production
2. Twilio phone number log (~line 127): log that included raw phone number — suppressed in production

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/auth/auth.service.ts` | OTP code and Twilio phone number logs gated behind `NODE_ENV !== 'production'` |

---

## CartContext `updateItem` Type Fix (May 18, 2026)

### Problem

`CartContext.updateItem` had `options: any[]` parameter type, bypassing TypeScript's type safety. The correct shape (`SelectedOption`) was already defined and exported at the top of the same file.

### Fix

One-line change: `options: any[]` → `options: SelectedOption[]` in the `updateItem` useCallback signature. No callers needed updating (function has no UI call-sites in the current codebase, exists for future use).

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/context/CartContext.tsx` | `updateItem` parameter `options: any[]` → `options: SelectedOption[]` |

---

## PrismaService Pool Exhaustion Logging (May 18, 2026)

### Problem

Pool exhaustion on Neon cold starts produced no visible warnings in Cloud Run logs, making DB performance issues hard to diagnose.

### Fix

`PrismaService` constructor now calls `super({ log: ['warn', 'error'] })` — surfaces Prisma pool exhaustion warnings and error-level events to stdout, which Cloud Run captures and routes to Google Cloud Logging.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/prisma/prisma.service.ts` | Constructor added with `super({ log: ['warn', 'error'] })` |

---

## CI Gate Added (May 18, 2026)

### Problem

Tier/auth regressions reached production undetected (pattern from May 16-17 incidents). No automated check blocked merging broken code on the main branch.

### Fix

`.github/workflows/ci.yml` created. Runs on every PR to `main`/`master` and every push to those branches. Four checks must pass before merge is allowed:

1. **Backend unit tests** — `npx jest --reporters=default --ci` (overrides the hardcoded Windows absolute path in the `tdd-guard-jest` reporter that exists in the project's jest config)
2. **Frontend type-check** — `npx tsc --noEmit` (Vite build does NOT type-check; this step catches TypeScript errors)
3. **Frontend tests** — `npx vitest run` (non-interactive mode; `vitest` without `run` opens interactive watch mode and hangs CI)
4. **Full monorepo build** — `npx turbo run build` (catches missing imports, broken builds in either app)

A dummy `DATABASE_URL` satisfies Prisma's connection string format validation during `prisma generate` (which runs as part of backend build) without needing a real database.

### Files Changed

| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | New file — CI gate workflow |

---

## Pricing Page Redesign + Subscription Checkout Fix (May 19, 2026)

### "Could not start checkout" — Hidden Backend Error

- **Problem**: Clicking "Choose Professional" on `/pricing` showed generic "Could not start checkout. Please try again." The real error was never visible.
- **Root cause** (3 layers):
  1. `STRIPE_PRICE_STARTER/PROFESSIONAL/ENTERPRISE` env vars were never set on Cloud Run — `PRICE_MAP` returned empty strings for all tiers.
  2. `subscription.service.ts` threw `new Error('No Stripe price configured for tier X')` — plain `Error` → NestJS returns 500 with an empty body (no `{ message }` field).
  3. `PricingPage.tsx` catch block: `catch {}` — no reference to `e`, so `e?.response?.data?.message` was never read; frontend fell straight to the generic localized fallback.
- **Fix**:
  - All `throw new Error(...)` → `throw new BadRequestException(...)` in `subscription.service.ts` — Nest returns HTTP 400 with `{ message: '...' }` body.
  - `PricingPage.tsx` catch: in `import.meta.env.DEV`, shows real `e?.response?.data?.message`; production shows generic localized string.
  - `STRIPE_PRICE_*` env vars must be set in Cloud Run for checkout to work (operator action — see `.env.example`).
- **Files**: `apps/backend/src/subscription/subscription.service.ts`, `apps/frontend/src/pages/PricingPage.tsx`

### Annual Billing Support

- **Problem**: Subscription checkout only supported monthly pricing; no annual toggle existed anywhere.
- **Fix**:
  - `PRICE_MAP` replaced with nested monthly/yearly lookup:
    ```
    STRIPE_PRICE_STARTER_MONTHLY / STARTER_YEARLY
    STRIPE_PRICE_PROFESSIONAL_MONTHLY / PROFESSIONAL_YEARLY
    STRIPE_PRICE_ENTERPRISE_MONTHLY / ENTERPRISE_YEARLY
    ```
  - `createCheckoutSession` accepts new `billingPeriod: 'monthly' | 'yearly'` param.
  - `CreateCheckoutDto` gains optional `billingPeriod` enum field (defaults to `'monthly'`).
  - `subscription.controller.ts` passes `dto.billingPeriod` through.
  - `api.ts createCheckoutSession` accepts and forwards `billingPeriod`.
  - `subscription.service.spec.ts` updated to 4-arg calls.
- **Files**: `subscription.service.ts`, `subscription.controller.ts`, `dto/checkout.dto.ts`, `subscription.service.spec.ts`, `api.ts`

### Pricing Page Redesign (full rewrite)

- **Problem**: `/pricing` showed wrong prices (€29/€79/€199), incomplete feature lists, no annual toggle, no comparison table, no FAQ. "Most Popular" badge wrapped to 2 rows in BG/RO. All strings were hardcoded English (not wired to i18n).
- **Fix**: Full rewrite of `PricingPage.tsx` (~320 lines):
  - Correct prices: FREE €0 / STARTER €15 / PROFESSIONAL €25 / ENTERPRISE €45 monthly
  - Annual toggle: 15% discount, prices shown as `€X.XX/mo · €Y/yr`
  - Feature bullets sync'd to actual backend `FeatureFlag` enum (22 flags, accurate per tier)
  - Feature comparison table: 22 feature rows, 4 tier columns, ✓ / — cells, section headers, mobile horizontal scroll
  - FAQ accordion: 6 entries (VAT, cancellation, downgrade, free trial, transaction fees, billing-period switching)
  - All strings via `t(key, englishDefault)` — fully i18n-wired
  - "Most Popular" badge: `whitespace-nowrap` + tighter padding prevents 2-row wrap in BG/RO
- **Files**: `apps/frontend/src/pages/PricingPage.tsx`

### i18n — Pricing Page Keys (EN/BG/RO)

- Added ~60 new keys under `pricing.*` namespace to all 3 locale files:
  - `pricing.tiers.{free,starter,professional,enterprise}.b1-b10` — tier bullets
  - `pricing.features.*` (23 keys) — comparison table row labels
  - `pricing.sections.*` (8 keys) — section headers
  - `pricing.faq.q1-q6.{question,answer}` — FAQ accordion
  - `pricing.billing.{monthly,yearly,saveAnnual}`, `pricing.popular`, etc.
- **Files**: `apps/frontend/src/locales/{en,bg,ro}/translation.json`

### Analytics Tab — STARTER Gating Tightened

- **Problem**: `DashboardPage.tsx` showed the Analytics tab to STARTER users (`useFeature('analytics:basic')`). STARTER only has `ANALYTICS_BASIC` — full analytics views are PRO+. Showing the tab and then gating individual charts inside it was confusing.
- **Fix**: Analytics tab guard changed to `useFeature('analytics:full')` — STARTER no longer sees the tab at all.
- **File**: `apps/frontend/src/pages/DashboardPage.tsx`

### Cloud Run Redeployed

- Revision `qr-menu-backend-00025-8qt` deployed via `deploy.ps1`.
- New env vars `STRIPE_PRICE_*_MONTHLY/YEARLY` must be set manually via `gcloud run services update --update-env-vars` before checkout will work end-to-end.

---

## Subscription UX, Duplicate Prevention & Password Reset (May 19, 2026)

### Pricing Page — Re-Checkout Guard & Current Plan Badge

- **Problem**: Clicking "Choose Plan" for the currently active tier created a second Stripe subscription. No guard prevented duplicate checkout.
- **Fix**:
  - Pricing page now detects current tier and shows "Current Plan" badge (disabled button) instead of "Choose Plan".
  - Lower tiers show "Manage in Billing Portal" button instead of checkout.
  - `ALREADY_SUBSCRIBED` error from backend auto-redirects to Stripe Customer Portal.
  - Auto-renew caption shown near billing toggle.
- **Files**: `apps/frontend/src/pages/PricingPage.tsx`

### BillingView — Upgrade Routing & Subscription Details

- **Problem**: BillingView upgrade buttons had no billing-period selection; current plan card showed no subscription dates or interval.
- **Fix**: Upgrade buttons route to `/pricing` for billing-period choice. Plan card now shows `subscriptionStart`, `subscriptionEnd`, and billing interval from Stripe.
- **Files**: `apps/frontend/src/components/subscription/BillingView.tsx`

### Backend — Active Subscription Guard

- **Problem**: `createCheckoutSession` had no active-subscription check — could create duplicate subscriptions.
- **Fix**: `SubscriptionService.createCheckoutSession` now checks for active Stripe subscription before creating checkout session. Throws `BadRequestException('ALREADY_SUBSCRIBED')` if customer has active sub. `getSubscriptionDetails()` added — retrieves period dates, interval, cancel status from Stripe.
- **Files**: `apps/backend/src/subscription/subscription.service.ts`, `apps/backend/src/subscription/subscription.controller.ts`

### TenantDetailPage — Password Reset Error Handling

- **Problem**: `resetPwMutation` had no `onError` handler — backend 400/500 responses failed silently. Client password validation was looser than backend DTO regex.
- **Fix**: Added `onError` handler displaying backend error message. Client validation tightened to match backend regex: uppercase + lowercase + digit + 8+ chars minimum.
- **Files**: `apps/frontend/src/pages/super-admin/TenantDetailPage.tsx`

---

## Stripe Subscription Type Cast Fix (May 19, 2026)

### Problem

`subscription.service.ts` passed Stripe's untyped subscription object directly to Prisma `updateMany` without casting `status` and `id` fields. The dahlia API version of the Stripe SDK returned slightly different types, causing silent type mismatches.

### Fix

Explicitly cast `subscription.status` and `subscription.id` to string before passing to Prisma queries. 4 call sites updated in `subscription.service.ts`.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/subscription/subscription.service.ts` | 4 explicit type casts on Stripe subscription object fields |

---

## Pricing Page i18n + Badge Wrap Fix (May 19, 2026)

### Problem

Pricing page strings (tier names, bullet points, FAQ answers) were hardcoded English — not wired to i18n. "Most Popular" badge wrapped to 2 lines in Bulgarian/Romanian translations.

### Fix

- All pricing page strings moved to i18n `pricing.*` namespace with `t(key, englishDefault)` pattern.
- "Most Popular" badge: `whitespace-nowrap` + tighter padding prevents 2-row wrap across BG/RO locales.
- ~60 new i18n keys added across EN/BG/RO for pricing tiers, features, FAQ, and billing labels.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/PricingPage.tsx` | All strings wired to i18n, badge wrap fix |
| `apps/frontend/src/locales/en/translation.json` | `pricing.*` keys added |
| `apps/frontend/src/locales/bg/translation.json` | `pricing.*` keys added |
| `apps/frontend/src/locales/ro/translation.json` | `pricing.*` keys added |

---

## Printable QR Codes — Layout & i18n Improvements (May 19, 2026)

### Problem

Printable QR code templates had inconsistent margins, crowding at table edges. Template labels and button text were hardcoded English — no i18n support.

### Fix

Refactored all 3 print templates (Classic, Premium, Minimal) with consistent margins, proper padding, and i18n-wired labels. Template selector dropdown and print button text localized in EN/BG/RO.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/components/tables/PrintableQRCodes.tsx` | Layout margins, template i18n, 190 lines changed |
| `apps/frontend/src/components/tables/TableView.tsx` | Template selector labels localized |

---

## Prisma Connection Pool — Neon PgBouncer Compatibility (May 21, 2026)

### Problem

Neon uses PgBouncer in transaction mode, which limits prepared statements and connection pooling. Prisma's default connection pool settings caused sporadic connection errors under load.

### Fix

Configured Prisma client with PgBouncer-compatible connection parameters: `pgbouncer=true` in connection string and `connection_limit` tuned for Neon's serverless pool size. `PrismaService` constructor calls `super({ log: ['warn', 'error'] })` to surface pool exhaustion warnings.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/prisma/prisma.service.ts` | PgBouncer-compatible connection config, 14 lines changed |

---

## Seed Safety — Data Wipe Prevention (May 22, 2026)

### Problem

Running `npm run seed` on a production or populated database could wipe all users, restaurants, and related data via `deleteMany` calls. No guard prevented accidental data loss.

### Fix

Three-layer safety guard added to `seed.ts`:
1. **Production check** — refuses to run if `NODE_ENV === 'production'`
2. **Remote DB check** — warns if `DATABASE_URL` contains remote host (not localhost)
3. **User count check** — refuses to run if database has >5 users, unless `FORCE_SEED_WIPE=true` env var is set

`seed-help-content.ts` uses upsert pattern (checks `helpContent.count() > 0` before inserting). `seed-help-only.ts` only calls `seedHelpContent()` — no destructive operations. `seed-demo-restaurants.ts` uses upsert pattern throughout.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/prisma/seed.ts` | 3-layer safety guard (lines 10-35) |
| `apps/backend/prisma/seed-help-content.ts` | Idempotent — checks existing count before insert |
| `apps/backend/prisma/seed-help-only.ts` | New — single-purpose help content seed, zero destructive ops |
| `apps/backend/prisma/seed-demo-restaurants.ts` | Upsert-only pattern |

---

## Help Center CMS — Database-Driven Help System (May 19-22, 2026)

### Summary

Full-stack feature moving all Help/FAQ content from hardcoded i18n JSON into a Prisma-backed CMS with full CRUD. New `HelpContent` model with section/category/item key structure, NestJS service+controller with 6 endpoints, and React CMS UI with inline editing in the super-admin dashboard.

### Backend — HelpContentModule

- **`HelpContent` model** — fields: `id`, `section` (landing/dashboard), `categoryKey`, `itemKey`, `sortOrder`, `locale` (EN/BG/RO), `title`, `body`, `active`, timestamps.
- **`HelpContentService`** — `findBySection`, `findBySectionAndLocale`, `create`, `update`, `delete`, `reorder` (bulk sort order update).
- **`HelpContentController`** — 6 endpoints:
  - `GET /help-content/:section` (public, no auth) — returns active items grouped by category, ordered by sortOrder
  - `GET /super-admin/help-content` (JWT + SuperAdmin) — all items with locale filter
  - `POST /super-admin/help-content` (JWT + SuperAdmin) — create item
  - `PATCH /super-admin/help-content/:id` (JWT + SuperAdmin) — update item
  - `DELETE /super-admin/help-content/:id` (JWT + SuperAdmin) — delete item
  - `PATCH /super-admin/help-content/reorder` (JWT + SuperAdmin) — bulk reorder
- **DTOs** — `CreateHelpContentDto`, `UpdateHelpContentDto`, `ReorderHelpContentDto` with class-validator decorators.
- **Tests** — `help-content.service.spec.ts` (118 lines), `help-content.controller.spec.ts` (96 lines).

### Frontend — HelpCenterPage CMS

- **`HelpCenterPage.tsx`** (507 lines) — super-admin page with sub-tabs (Landing FAQ / Dashboard Help), locale tabs (EN/BG/RO), inline CRUD (create/edit/delete with modals), category grouping.
- **`LandingFAQ.tsx`** — home page FAQ section fetches from API via `useQuery(['help-content', 'landing', i18n.language])`. Shows 8 pre-sale FAQ items in accordion layout. Smooth transitions + accessibility (keyboard nav, ARIA labels).
- **`HelpView.tsx`** (310 lines) — dashboard Help tab fetches from API, replaces hardcoded i18n content.
- **`api.ts`** — 6 functions: `getHelpContent`, `getAdminHelpContent`, `createHelpContent`, `updateHelpContent`, `deleteHelpContent`, `reorderHelpContent`.
- **`SuperAdminLayout.tsx`** — Help Center nav item with `MessageCircleQuestion` icon.
- **`App.tsx`** — Lazy route for `/super-admin/help` rendering `HelpCenterPage`.

### Seed — Help Content Seed

- `seed-help-content.ts` (581 lines) — seeds 50+ help items across landing FAQ (8 items) and dashboard help (42+ items) in EN/BG/RO from current i18n values. Idempotent — checks `existing > 0` before inserting.
- `seed-help-only.ts` (23 lines) — single-purpose script for seeding only help content without touching other data.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/prisma/schema.prisma` | `HelpContent` model added |
| `apps/backend/src/help-content/*` | 7 files — module, service, controller, 3 DTOs, tests |
| `apps/backend/src/app.module.ts` | `HelpContentModule` registered |
| `apps/backend/prisma/seed-help-content.ts` | New — help content seed data |
| `apps/backend/prisma/seed-help-only.ts` | New — help-only seed script |
| `apps/frontend/src/pages/super-admin/HelpCenterPage.tsx` | New — CMS UI |
| `apps/frontend/src/components/landing/LandingFAQ.tsx` | New — API-driven FAQ |
| `apps/frontend/src/pages/Dashboard/HelpView.tsx` | Rewrite — API-driven help |
| `apps/frontend/src/lib/api.ts` | 6 help content functions added |
| `apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx` | Help Center nav item |
| `apps/frontend/src/App.tsx` | `/super-admin/help` route |
| `apps/frontend/src/pages/HomePage.tsx` | LandingFAQ section added |

---

## Security Hardening Round 2 — Account Disable, Audit Trail, Rate Limiting (May 22, 2026)

### Summary

Second security hardening pass covering account lifecycle management, administrative audit logging, per-endpoint rate limiting, guard coverage verification, JWT disablement enforcement, and production startup enforcement. All dangerous admin mutations now leave an `AdminAuditLog` trail in the same `$transaction` as the mutation — atomic and guaranteed.

### Account Disable (User Model)

- **`User` model** — added `isActive Boolean @default(true)`, `disabledAt DateTime?`, `disabledReason String?`.
- **JWT strategy** — `validate()` checks `user.isActive === false` and throws `UnauthorizedException('Account disabled')` — even SUPER_ADMIN accounts are rejected when disabled.
- **SuperAdmin service** — `setAccountStatus()` toggle endpoint with `DisableUserDto` requiring `confirm: "I understand the security implications"` and optional `reason` field. Disabled accounts get `disabledAt` timestamp + `disabledReason` logged.
- **Tests** — `jwt.strategy.spec.ts` (64 lines): 2 tests — rejects disabled users (including SUPER_ADMIN), returns active user without sensitive fields.

### CONFIRM-typing DTOs

5 dangerous endpoints require a typed confirmation string in the request body:

| Endpoint | DTO | Confirmation |
|----------|-----|--------------|
| `POST /super-admin/set-tier` | `SetTierDto` | `"CONFIRM"` |
| `POST /super-admin/set-account-status` | `DisableUserDto` | `"I understand the security implications"` |
| `POST /super-admin/reset-password` | `ResetPasswordDto` | `"I confirm password reset for user {email}"` |
| `DELETE /super-admin/tenant/:id` | `DeleteTenantDto` | `"DELETE {restaurantName}"` |
| `POST /super-admin/restore-tenant/:id` | `RestoreTenantDto` | `"RESTORE {restaurantName}"` |

### Per-Mutation Rate Limiting

Every dangerous admin endpoint has independent `@Throttle` decorators:

| Endpoint | Limit |
|----------|-------|
| Set tier | 5 req / 60s |
| Set account status | 5 req / 60s |
| Reset password | 3 req / 60s |
| Manage payments | 5 req / 60s |
| Delete tenant | 3 req / 60s |
| Restore tenant | 3 req / 60s |
| Delete staff | 5 req / 60s |
| Update platform settings | 5 req / 60s |
| Help content CRUD (create/reorder/update/delete) | 10 req / 60s |

### AdminAuditLog Model

- **Schema** — `id`, `actorUserId` (who performed action), `action` (string description), `targetType` (tenant/user/system), `targetId`, `metadata Json?`, `createdAt`.
- **Atomic audit** — every dangerous mutation wraps mutation + `adminAuditLog.create()` in same `prisma.$transaction` — if mutation fails, no phantom audit entry; if audit create fails, mutation rolls back.
- **Audited actions**: `setTier`, `setAccountStatus`, `resetUserPassword`, `managePayments`, `deleteTenant`, `restoreTenant`, `deleteStaffAccount`, `updatePlatformSettings`.

### Guard Coverage Verification

- **`super-admin.guard-coverage.spec.ts`** (38 lines) — uses `Reflect.getMetadata(GUARDS_METADATA)` to programmatically verify every admin endpoint has `JwtAuthGuard` + `SuperAdminGuard`. Covers `SuperAdminController` (class-level), `PlatformSettingsController` (getAdmin/updateAdmin), and `HelpContentController` (5 admin methods).
- **Pattern** — `expectSuperAdminGuards(metadataTarget)` helper asserts both guards present. Guards against accidentally adding an endpoint without auth.

### NODE_ENV=production Startup Enforcement

- **`main.ts`** — validates required environment variables at startup when `NODE_ENV=production`:
  - `JWT_SECRET` must not be default value (`'your-super-secret-key-change-in-production'`)
  - `COOKIE_SECRET`, `CSRF_SECRET`, `SESSION_EXPIRY_MINUTES` must be set
  - `FRONTEND_URL` must be set (used for CORS)
  - `STRIPE_SECRET_KEY` must be set (payments)
  - Server refuses to start in production with insecure defaults — `process.exit(1)` with clear error message.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/prisma/schema.prisma` | `User.isActive/disabledAt/disabledReason` fields + `AdminAuditLog` model |
| `apps/backend/prisma/migrations/20260522193000_add_user_account_disable_fields/migration.sql` | Migration — adds account disable columns |
| `apps/backend/src/auth/jwt.strategy.ts` | `isActive` check — rejects disabled users |
| `apps/backend/src/auth/jwt.strategy.spec.ts` | New — 2 tests for disabled user rejection |
| `apps/backend/src/super-admin/super-admin.controller.ts` | 7 `@Throttle` decorators + CONFIRM DTOs |
| `apps/backend/src/super-admin/super-admin.service.ts` | `$transaction` + `AdminAuditLog` creation on all mutations |
| `apps/backend/src/super-admin/super-admin.guard-coverage.spec.ts` | New — guard metadata verification |
| `apps/backend/src/super-admin/dto/*.ts` | New DTOs — `SetTierDto`, `DisableUserDto`, `ResetPasswordDto`, `DeleteTenantDto`, `RestoreTenantDto` |
| `apps/backend/src/help-content/help-content.controller.ts` | 4 `@Throttle` decorators on admin write endpoints |
| `apps/backend/src/platform-settings/platform-settings.controller.ts` | Throttle + audit log on `updateAdmin` |
| `apps/backend/src/main.ts` | Production env enforcement block |

---

## Super Admin Overview v2 — Tier Analytics, Attention Panel, Activity Feed (May 22, 2026)

### Summary

Full rewrite of the Super Admin overview dashboard (`getStats()`) from a basic count query to a comprehensive operations dashboard. Billing tier is now shown separately from effective (forced) tier, with detailed force-tier breakdowns. New "Attention Needed" panel flags 5 categories of issues. Richer KPI cards with sub-metrics. Recent activity feed with real admin actions. All computed in a single `Promise.all` with 12 parallel database queries.

### Key Improvements

#### Billing vs Effective Tier Separation
- **Billing Tier** — the `tier` column, what the restaurant pays for.
- **Effective Tier** — `forceTier ?? tier`, what the restaurant actually operates at.
- **Force-tier summary** — each force-tier override classified as upgrade, downgrade, or same (comparing `TIER_RANK`). Summary card shows counts by direction.
- **Tier distribution** — counts by both billing tier and effective tier, surfaced side-by-side.

#### Attention Needed Panel (5 Categories)
1. **Disabled accounts** — active tenants with `isActive: false` — potential support issues.
2. **Unverified restaurants** — tenants where `verifiedAt` is null — onboarding gaps.
3. **Unverified emails** — users with unverified email addresses.
4. **Demo restaurants** — tenants flagged as demo — cleanup candidates.
5. **Inactive subscriptions** — tenants on FREE tier with 0 active users.

#### Richer KPI Cards
- Each KPI card now includes sub-metrics: Total Users shows admin vs staff breakdown, Total Restaurants shows verified vs unverified, Active Subscriptions shows per-tier breakdown.

#### Recent Activity Feed
- Displays last 20 `AdminAuditLog` entries with actor email, action description, target type/ID, and relative timestamp. Real data from the audit trail — not computed or synthetic.

#### Performance
- 12 independent queries in a single `Promise.all` — all database work happens in parallel. Response time bound by slowest single query, not sum of all queries.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/super-admin/super-admin.service.ts` | Full `getStats()` rewrite — 12 parallel queries, tier analytics, attention panel, activity feed (lines 1-580) |
| `apps/frontend/src/pages/super-admin/SuperAdminOverview.tsx` | New KPI cards, attention panel UI, activity feed, tier breakdown charts |

---

## Onboarding Wizard — 6 Bugs from Walkthrough (May 23-24, 2026)

### Summary

Full walkthrough of the new-user onboarding wizard uncovered 6 bugs. All resolved before the May 24 redesign completion.

### Bug 1 — Stripe Connect Onboarding Not Shown for FREE→Starter

- **Problem**: Users starting on FREE tier who upgraded to Starter during onboarding skipped the Stripe Connect step. Connect was only offered to Starter+ starters.
- **Fix**: Connect step now shown when the selected tier requires payments (STARTER or higher), regardless of starting tier.
- **Files**: `OnboardingWizard.tsx`

### Bug 2 — Owner Name Not Collected

- **Problem**: Onboarding created a restaurant without collecting the owner's display name. Restaurant appeared with no owner name in dashboard header and public menu footer.
- **Fix**: Added owner name field to wizard (Step 1). Saved to `Restaurant.ownerName` field on create.
- **Files**: `OnboardingWizard.tsx`, `restaurants.service.ts`

### Bug 3 — Table Setup Step Skipped on Fast Click

- **Problem**: Rapidly clicking "Next" on the table setup step could skip table creation entirely — restaurant created with zero tables.
- **Fix**: Added disabled state during table creation, loading spinner on Next button, and minimum 1 table validation before proceeding.
- **Files**: `OnboardingWizard.tsx`

### Bug 4 — Tier Synced from Webhook, Not Session (Race Condition)

- **Problem**: Stripe subscription tier was applied via webhook (`checkout.session.completed`), which can take seconds to minutes to arrive. Users saw FREE tier after payment until webhook fired.
- **Fix**: Tier now synced directly from Stripe Checkout session metadata during the return redirect — instant activation. Webhook still processes as fallback for edge cases (closed browser before redirect).
- **Files**: `subscription.service.ts`, `OnboardingWizard.tsx`

### Bug 5 — Wizard Could Be Re-entered After Completion

- **Problem**: Completing the wizard and navigating away, then clicking browser back, re-entered the wizard. Could create duplicate restaurants.
- **Fix**: Wizard checks `restaurant.wizardCompleted` flag on mount — redirects to dashboard if already completed.
- **Files**: `OnboardingWizard.tsx`

### Bug 6 — Stripe Connect Onboarding URL Expired

- **Problem**: Stripe Connect account link URLs expire after use. Returning to the wizard after completing Connect showed "Link expired" with no recovery.
- **Fix**: "Generate New Link" button added — calls `POST /restaurants/:id/stripe/account-link` to create a fresh onboarding URL.
- **Files**: `OnboardingWizard.tsx`, `restaurants.controller.ts`

---

## POS Bill History — Flat Shape Mapping Fix (May 24, 2026)

### Problem

POS bill history (`getSessionBill`) returned old nested shape with `item: { name, price }` but POS cart items expected flat shape `{ name, unitPrice }`. Bill history items rendered with empty names and zero prices — read-only history rows showed blank data.

### Root Cause

`payment.service.ts` `getSessionBill()` Prisma `include` returned `orderItems { menuItem: { name, price } }` — nested under `menuItem`. `PosContext.setHistoryItems()` mapped `oi.menuItem.name` and `oi.menuItem.price` to `name` and `unitPrice`, but the mapping broke after the schema changed to flat fields.

### Fix

Updated `PosContext.setHistoryItems()` to read the new flat shape: `oi.name` and `oi.unitPrice` directly from `OrderItem` fields (not nested under `menuItem`).

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/context/PosContext.tsx` | `setHistoryItems` mapping: nested `menuItem.name` → flat `oi.name`, `menuItem.price` → `oi.unitPrice` |

---

## Stale Test Mocks After Staff Attribution (May 24, 2026)

### Problem

22 backend tests failed after adding `OrderSource` enum and `staffUserId` to the Order model. Existing test mocks created orders without the new required fields, causing Prisma validation failures.

### Root Cause

`orders.service.spec.ts` mock order objects used the old shape without `source` and `staffUserId` fields. `create-order.dto.ts` and `CreateOrderDto` validation expected the new fields.

### Fix

Updated all mock order fixtures in `orders.service.spec.ts` to include `source: 'QR'` and `staffUserId: null` (public orders have no staff). Added `source: 'POS'` variants where POS-specific behavior was tested.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/orders/orders.service.spec.ts` | 22 mock fixtures updated with `source` + `staffUserId` fields |

---

## OptionalJwtAuthGuard — JWT Error Rethrow (May 24, 2026)

### Problem

`OptionalJwtAuthGuard` silently caught all JWT errors (expired, malformed, invalid signature) and set `request.user = null`. Expired or tampered JWTs were treated identically to no-JWT — degrading to anonymous access without any signal.

### Root Cause

The guard's `handleRequest(err, user, info)` returned `null` for ALL error cases including expired tokens. Legitimate staff with an expired token got anonymous access instead of a clear auth error.

### Fix

`handleRequest` now rethrows JWT errors (expired, malformed) while still allowing missing-JWT (no auth header) as anonymous. Expired tokens produce a 401 error; absent tokens pass through as anonymous. This preserves the public endpoint behavior while surfacing real auth problems.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/auth/optional-jwt-auth.guard.ts` | `handleRequest` — rethrow JWT errors, pass through missing auth only |

---

## TableCard Redesign — Compact Layout + Live Timer (May 24, 2026)

### Problem

Table cards in the POS table picker and dashboard live view were bulky with excessive padding and scattered information. No live indicator showed how long a table had been occupied or how long until auto-close of PAID sessions.

### Fix

Redesigned `TableCard` with compact 4-row layout: row 1 (table name + status badge), row 2 (customer count + order count), row 3 (total amount), row 4 (live timer showing elapsed time for occupied, countdown for PAID auto-close). `TableStatusBadge` color-coded: green (empty), amber (occupied), slate (paid).

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/components/tables/TableCard.tsx` | Full redesign — compact 4-row layout + live timer |

---

## Custom Date Filter Heading — Analytics Deep-Dive (May 24, 2026)

### Problem

Analytics deep-dive tab showed "Custom Range" as a static English string in the date range heading, even when i18n was active. The custom date range label was not wired to the translation system.

### Fix

Added `analytics.customRange` key to all 3 locale files. `DateRangeFilter.tsx` now uses `t('analytics.customRange', 'Custom Range')` for the heading when a custom date range is selected.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/Dashboard/summary/DateRangeFilter.tsx` | Custom range heading wired to i18n |
| `apps/frontend/src/locales/{en,bg,ro}/translation.json` | `analytics.customRange` key added |

---

## Stripe Webhook — Raw Body Handling (May 19, 2026)

### Problem

Stripe subscription webhook returned HTTP 500. The webhook controller used `req.rawBody` to access the raw request body for signature verification, but `main.ts` body parser configuration did not preserve `rawBody`.

### Fix

Changed webhook controller to use `req.body` (parsed by NestJS raw body middleware registered specifically for the webhook route). The raw body middleware in `main.ts` already preserves the raw buffer on `req.body` for the webhook path — the controller just needed to read the correct property.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/subscription/subscription.controller.ts` | `req.rawBody` → `req.body` in webhook handler |

**Guideline**: Always use `req.body` (not `req.rawBody`) in any webhook controller given the current `main.ts` raw-body middleware setup.

---

## Atomic Refund — Race Condition Fix (May 23, 2026)

### Problem

Refunding a Stripe payment and updating the local Payment record were two separate operations — if the DB update failed after a successful Stripe refund, the payment record showed incorrect status. Additionally, concurrent refund requests could double-refund.

### Fix

Wrapped Stripe refund API call + local Payment status update in a Prisma `$transaction`. Added optimistic lock check: `where: { status: 'PAID' }` on the payment update — if another request already processed the refund, the second update affects 0 rows and throws a handled error.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/payment/payment.service.ts` | Atomic refund in `$transaction` with status guard |

---

## Date Range Validation — Analytics (May 23, 2026)

### Problem

Analytics date range picker allowed end dates before start dates, producing empty charts with no error message. Users confused by blank analytics views.

### Fix

Added client-side validation in `DateRangeFilter.tsx`: if end date is before start date, shows inline red error message and disables the apply button. Server-side validation added to `DashboardController` analytics endpoints — returns 400 with clear message if `endDate < startDate`.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/Dashboard/summary/DateRangeFilter.tsx` | Client-side date validation + error state |
| `apps/backend/src/dashboard/dashboard.controller.ts` | Server-side date range validation on analytics endpoints |

---

## XLSX Import/Export Roundtrip (May 23, 2026)

### Summary

Menu import expanded to accept XLSX files alongside JSON OCR. Export already produced XLSX workbooks. Combined, this enables a full roundtrip: export menu → edit in Excel → re-import.

### Implementation

- **`MenuImportExportView.tsx`** — ImportTab now accepts both `.json` and `.xlsx` files. `xlsxToPayload()` converts XLSX rows to the same `ImportPayload` shape used by JSON import. Preview table works identically for both formats.
- **Export** — Download XLSX button added alongside existing JSON/CSV options.
- **Backend** — No changes needed. All import goes through the same `POST /menu-import/confirm` endpoint.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/Dashboard/MenuImportExportView.tsx` | XLSX file acceptance + `xlsxToPayload()` converter |

---

## Public Menu Footer + Social Icons (May 23, 2026)

### Summary

Added a footer to the public customer menu showing restaurant name, location, contact info, and social media icon links. Language defaults to Bulgarian.

### Implementation

- **`PublicMenuFooter.tsx`** — new component rendered at bottom of `PublicMenuPage`. Shows restaurant name bar, address, phone, and social media icons (Facebook, Instagram, TikTok, YouTube, website) as clickable links.
- **i18n** — Footer labels in EN/BG/RO.
- **`Restaurant` model** — social media URL fields (`facebookUrl`, `instagramUrl`, `tiktokUrl`, `youtubeUrl`, `websiteUrl`) added to schema.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/components/menu/PublicMenuFooter.tsx` | New — footer component with social icons |
| `apps/frontend/src/pages/PublicMenuPage.tsx` | Footer rendered below menu content |
| `apps/backend/prisma/schema.prisma` | Social media URL fields on Restaurant |

---

## FREE Tier Restrictions (May 23, 2026)

### Summary

Revenue cards and analytics button hidden for FREE tier restaurants. Tier enforcement hardened across the dashboard.

### Implementation

- **`DashboardPage.tsx`** — Revenue KPI cards wrapped in `useFeature('analytics:full')` guard. Analytics tab button hidden for FREE tier.
- **`SummaryView.tsx`** — Revenue and order summary cards gated behind tier check.
- **Backend** — `DashboardController` analytics endpoints return 403 for FREE tier restaurants (double-checked at API layer, not just UI).

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/DashboardPage.tsx` | Revenue cards + analytics button gated |
| `apps/frontend/src/pages/Dashboard/SummaryView.tsx` | Revenue summary cards gated |
| `apps/backend/src/dashboard/dashboard.controller.ts` | Tier check on analytics endpoints |

---

## Subscription/SaaS Polish (May 23, 2026)

### Summary

Unified TanStack Query cache for subscription status across all components. Locked navigation for unpaid tiers. UpgradeModal with revenue trap messaging.

### Key Changes

- **Unified cache key** — All components use `['subscription-status']` query key. Prevents duplicate fetches and inconsistent tier state across the dashboard.
- **Locked navigation** — Unpaid tier tabs show lock icon, redirect to UpgradeModal instead of navigating.
- **UpgradeModal** — Revenue trap messaging: "Unlock €X.XX/month in platform fees" based on current order volume.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/hooks/useFeature.ts` | Unified query key `['subscription-status']` |
| `apps/frontend/src/components/subscription/SubscriptionBanner.tsx` | Same query key, no duplicate fetch |
| `apps/frontend/src/components/subscription/BillingView.tsx` | Same query key |
| `apps/frontend/src/components/subscription/UpgradeModal.tsx` | New — revenue trap messaging |
| `apps/frontend/src/pages/DashboardPage.tsx` | Locked nav items for unpaid tiers |

---

## Dashboard Purple/Violet Luxury Redesign (May 24, 2026)

### Summary

Complete visual overhaul of dashboard operations. Purple/violet accent palette replacing the previous warm-red scheme. Stronger visual hierarchy across all dashboard views. Payments view card density and readability improved.

### Key Changes

- **Color palette** — Accent shifted from warm red (`hsl(0 72% 51%)`) to purple/violet (`hsl(267 100% 61%)`). CSS custom properties updated across all dashboard components.
- **KPI cards** — Gradient backgrounds, larger numerals, animated hover states with depth.
- **Payments view** — Card density improved, status badges more prominent, amount columns right-aligned for scanability.
- **Chart theming** — Recharts axes, tooltips, and area fills use new purple palette consistently.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/styles/tokens.css` | Purple/violet accent palette |
| `apps/frontend/src/pages/Dashboard/*.tsx` | All dashboard views restyled |
| `apps/frontend/src/components/ui/*.tsx` | UI primitives updated to new palette |

---

## Table Status Simplification (May 24, 2026)

### Summary

Removed the "waiting" table status — tables now have 3 states: empty, occupied, paid. PAID sessions auto-close after 5 minutes.

### Key Changes

- **Status reduction** — `tableStatus` now returns `'empty' | 'occupied' | 'paid'`. The `'waiting'` status (session open but no orders) was confusing — tables with open sessions but no orders now show as `'occupied'`.
- **Auto-close PAID** — `PaymentService.autoClosePaidSessions()` cron runs every minute, closes PAID sessions older than 5 minutes. Prevents tables staying in PAID state indefinitely.
- **POS i18n** — POS interface now available in Bulgarian. All POS strings wired to `t()`.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/tables/tables.service.ts` | Status logic: 3 states, no "waiting" |
| `apps/backend/src/payment/payment.service.ts` | Auto-close PAID cron |
| `apps/frontend/src/components/tables/TableCard.tsx` | Status badge: 3 colors |
| `apps/frontend/src/components/pos/*.tsx` | POS BG translations |

---

## Staff Attribution & Itemized Bills (May 24, 2026)

### Summary

Orders now track which staff member created them and via which channel (POS vs QR). Itemized bills group items by source with visual badges.

### Key Changes

- **Schema** — `OrderSource` enum (`POS` | `QR`) added to Prisma schema. `Order.staffUserId` (nullable, FK to User) + `Order.source` fields.
- **Order creation** — `OrdersService.create()` sets `source: 'QR'` for public orders, `source: 'POS'` for staff-submitted orders. `staffUserId` captured from JWT when `OptionalJwtAuthGuard` extracts the authenticated staff member.
- **Source badges** — Order list rows show POS/QR badge. Table detail cards show per-order source. Payment detail drawer shows source badge on each order row. PaymentModal shows source breakdown.
- **Itemized bills** — Bill grouped by source: "POS Orders" section and "QR Orders" section with subtotals.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/prisma/schema.prisma` | `OrderSource` enum + `Order.source` + `Order.staffUserId` |
| `apps/backend/src/orders/orders.service.ts` | Source tracking on order create |
| `apps/backend/src/orders/dto/create-order.dto.ts` | `source` field added to DTO |
| `apps/frontend/src/components/orders/*.tsx` | Source badges on order list, table cards |
| `apps/frontend/src/components/payment/PaymentDrawer.tsx` | Source badge on payment detail rows |
| `apps/frontend/src/components/payment/PaymentModal.tsx` | Source breakdown |
| `apps/frontend/src/context/PosContext.tsx` | POS source tracking |

---

## Table Zones/Sections (May 24, 2026)

### Summary

Tables can be grouped into zones/sections for large-restaurant POS filtering. POS table picker groups by zone with section headers.

### Key Changes

- **Schema** — `RestaurantTable.zone` field (optional string) added to Prisma schema.
- **POS table picker** — Tables grouped by zone with collapsible section headers. Ungrouped tables fall under "Other" section.
- **Dashboard table view** — Zone filter dropdown added to table management view.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/prisma/schema.prisma` | `zone` field on `RestaurantTable` |
| `apps/frontend/src/components/pos/PosTableModal.tsx` | Zone-grouped table list |
| `apps/frontend/src/pages/Dashboard/TableView.tsx` | Zone filter dropdown |

---

## Analytics Deep-Dive Full i18n (May 24, 2026)

### Summary

All hardcoded English strings in the analytics deep-dive tab replaced with i18next `t()` calls. 103 keys synced across EN/BG/RO.

### Key Changes

- **103 analytics keys** — Day parts, order statuses, hour bar labels, chart names, custom range labels, all wired to `t()`.
- **Module-scope lookup maps** — `dayPartKeyMap` and `orderStatusKeyMap` for translating data-driven labels at module scope (before component render).
- **Excel export localized** — XLSX export respects current language for sheet names and column headers.
- **Custom date filter heading** — `analytics.customRange` key for custom date range display.

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx` | All strings wired to `t()` + lookup maps |
| `apps/frontend/src/lib/analyticsExport.ts` | Localized sheet names + headers |
| `apps/frontend/src/pages/Dashboard/summary/DateRangeFilter.tsx` | Custom range heading i18n |
| `apps/frontend/src/locales/{en,bg,ro}/translation.json` | 103 analytics keys synced |

## Staff Creation Race & Duplicate Handling (May 25, 2026)

### Summary

Staff CRUD moved out of `auth.controller.ts` into a dedicated `StaffController`, and concurrent staff creation hardened.

### Key Changes

- **Serializable transaction + retry** — `createStaffMember` runs inside a `Serializable` `$transaction` and retries up to 3× on `P2034` serialization conflicts, closing a race where two simultaneous creates could exceed the tier seat limit.
- **Duplicate generated email** — on `P2002` for an auto-generated `staff-<ts>@<restaurantId>.local` email, a `crypto.randomBytes` fallback email is generated and the create is retried; explicit duplicate emails return a `ConflictException`.
- **Duplicate restaurant per owner** — `c358777` prevents an owner from accidentally creating multiple restaurants.
- **Stale prefetch** — `db05681` clears stale `prefetchedRestaurants` on login/register/loginWithToken to prevent showing the previous account's data.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/restaurants/staff.controller.ts` | New dedicated staff routing |
| `apps/backend/src/users/users.service.ts` | Serializable tx + P2034 retry + P2002 fallback |
| `apps/frontend/src/context/AuthContext.tsx` | Clear stale prefetch on auth |

## Branding: Public Menu Theme Application (May 25, 2026)

### Summary

Dual light/dark brand palette shipped end-to-end; fixed theme colors not applying correctly on the public menu and harsh border/overlay opacities.

### Key Changes

- **Dual palette** — `themeLight*` (Bg/Text/Card/Accent) + `themeDark*` columns + `defaultTheme` (light/dark) on `Restaurant`; public menu applies the correct palette per active theme.
- **Border opacity** — `f1815ce` softened dynamic border opacities in the public menu (previously too harsh in one theme).
- **Editor stability** — `f3948a5` fixed i18n gaps, dark-mode override bug, and tab-switch instability in the branding editor.

## Onboarding: Pre-Existing Owner Access (May 25, 2026)

### Summary

Owners who existed before the onboarding-wizard rewrite were incorrectly bounced into onboarding. `32fdacb` restores direct dashboard access for pre-existing restaurant owners.

## Stripe API Version Drift (May 29, 2026)

### Summary

Cloud Build failed (`TS2322`) because the Stripe SDK `^22.1.0` resolved to `22.2.0`, whose typed `apiVersion` literal advanced to `2026-05-27.dahlia`, while the code hardcoded `2026-04-22.dahlia`. Local `tsc` had passed on stale `node_modules`.

### Key Changes

- Bumped both call sites to `2026-05-27.dahlia`; synced local stripe to `22.2.0` so local and Cloud Build agree.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/payment/stripe.provider.ts` | apiVersion → 2026-05-27.dahlia |
| `apps/backend/src/subscription/subscription.service.ts` | apiVersion → 2026-05-27.dahlia |

## Staff Credential Model Hardening (May 29, 2026)

### Summary

Closed a security gap where every staff account (including dashboard roles and OWNER) carried a brute-forceable 4-digit PIN that `pinLogin` accepted, allowing a guessed PIN to mint a JWT for a privileged account.

### Key Changes

- **`staff-roles.ts` SoT** — `PIN_LOGIN_ROLES = ['WAITER','KITCHEN']`, `isPinRole()`.
- **Role-exclusive credentials** — `createStaffMember` issues a PIN only for WAITER/KITCHEN and a temp password only for STAFF/MANAGER (password column always set; never both surfaced).
- **`pinLogin` scoped** — only WAITER/KITCHEN are candidates; OWNER/MANAGER/STAFF can never authenticate by PIN.
- **Frontend** — invite modal + Reset-PIN gating switched from `=== 'STAFF'` to `isPinRole`; device-enrollment QR shown only for PIN roles.

### Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/users/staff-roles.ts` | New SoT for credential roles |
| `apps/backend/src/users/users.service.ts` | Role-exclusive credential issuance |
| `apps/backend/src/auth/auth.service.ts` | pinLogin restricted to device roles |
| `apps/frontend/src/pages/Dashboard/settings/StaffSettingsTab.tsx` | isPinRole gating |

## Tier Entitlement: Tab Guard & Payments (May 29, 2026)

### Summary

A forced `?tab=payments` URL on a FREE restaurant (with `paymentsEnabled=true`) could render `PaymentsView` despite no entitlement (UI-only; backend FeatureGuard already blocked the APIs).

### Key Changes

- `PaymentsView` render now also requires `canPayments`.
- Added an owner tab-sanitizing effect: any locked tab (orders/assistance/payments/analytics) reached via URL redirects to `summary`, preventing a blank content area.

## Call-Waiter Cooldown Bypass on Reload (May 29, 2026)

### Summary

The 60s anti-spam cooldown on the public-menu call-waiter button was in-memory only, so reloading the page re-enabled it immediately.

### Key Changes

- Cooldown timestamp persisted in `localStorage` keyed `assist-cd-{restaurantId}-{tableNumber}`; restored on mount and auto-released after the remaining time. Per-table.
- Dashboard now distinguishes STANDARD vs URGENT requests via a red **URGENT** badge (`type` added to `AssistanceContext`; `assistance.urgent` i18n in EN/BG/RO).

### Files Changed

| File | Change |
|------|--------|
| `apps/frontend/src/pages/PublicMenuPage.tsx` | Persisted cooldown |
| `apps/frontend/src/context/AssistanceContext.tsx` | `type` field exposed |
| `apps/frontend/src/pages/Dashboard/AssistanceView.tsx` | URGENT badge |
| `apps/frontend/src/locales/{en,bg,ro}/translation.json` | `assistance.urgent` |

