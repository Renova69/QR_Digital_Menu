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
