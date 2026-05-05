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
