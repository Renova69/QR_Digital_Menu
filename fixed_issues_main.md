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
