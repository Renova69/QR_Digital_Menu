# Session Log: May 4, 2026

This session covered a full UI/UX audit (via `ui-ux-pro-max` design plugin) followed by targeted bug fixes, design system improvements, and a new owner-controlled default theme feature.

## 1. Design System Rewrite (`index.css`)
- **Warm color palette**: All colors converted to HSL CSS custom properties. Accent is restaurant red (`hsl(0 72% 51%)`), backgrounds are warm white/near-black.
- **Font reduction**: Dropped `Plus Jakarta Sans` — reduced from 3 to 2 Google Fonts (Outfit + Playfair Display). Font preconnect hints added to `index.html`.
- **CSS bug fixes**: `.text-glow` and `.premium-bg` were using `hsla(var(--token), 0.25)` — invalid CSS. Both fixed with `color-mix(in srgb, var(--token) N%, transparent)`.
- **Global transition removed**: `html { transition-colors 500ms }` caused site-wide 500ms lag. Removed; replaced with `body { transition: background-color 200ms ease }`.
- **Reduced motion**: Added `@media (prefers-reduced-motion: reduce)` guard for `.animate-float`.

## 2. QR Table & Assistance Flow Fixes (`PublicMenuPage.tsx`)
- **Removed `prompt()`**: `handleAssistanceRequest` called `window.prompt()` for a table number — unnecessary since QR URL already contains `?table=<name>`. Removed entirely.
- **No-table notice**: When no table in URL, Call Waiter now shows an accessible inline glass-panel notice (`role="alert"`, `aria-live="polite"`, auto-dismisses 3.5s) instead of a browser prompt.
- **Button states**: Call Waiter button disabled during `assistanceLoading`; text cycles through states.
- **Accessibility fixes**: Logo alt text populated (`${name} logo`), language select now has `<label>` / `id` association, decorative `animate-pulse` on loading text removed.
- **Invalid Tailwind modifier**: Removed `group-disabled:scale-100` (not a valid group modifier).

## 3. Dark/Light Mode + Branding Integration
**Problem**: ThemeToggle used a single global `localStorage.theme` key, was hidden when custom branding was active, and had no way for owners to set a default customer-facing theme.

**Solution:**
- **Schema**: Added `defaultTheme String? @default("light")` to `Restaurant` model; pushed to Neon; DTO updated (`update-restaurant.dto.ts`); Prisma client regenerated.
- **`ThemeToggle.tsx`** refactored: now accepts `storageKey?: string` (default `'theme'`) and `defaultTheme?: 'light' | 'dark'` (default `'light'`). Dashboard usage unchanged. Improved `aria-label` reflects current action.
- **Per-restaurant storage**: Public menu passes `storageKey={theme-${restaurantId}}` — each restaurant remembers its customer preference independently from the dashboard.
- **Always visible**: Removed `{!hasCustomTheme && ...}` guard — ThemeToggle always renders on public menu. Custom branding colors still override CSS tokens; toggle just switches `.dark` class on top.
- **Owner control**: `BrandingEditor.tsx` — new Light/Dark pill toggle section ("Default Customer Theme"), saves to `defaultTheme` in PATCH payload.
- **First-visit logic**: No stored pref → restaurant's `defaultTheme` → fallback `'light'`. Global dashboard toggle still respects `prefers-color-scheme` as before.

## 4. Files Changed
| File | Change |
|------|--------|
| `apps/frontend/src/index.css` | Full design system rewrite |
| `apps/frontend/index.html` | Font preconnect hints |
| `apps/frontend/src/pages/PublicMenuPage.tsx` | Remove prompt(), no-table notice, ThemeToggle always visible + scoped props, a11y fixes |
| `apps/frontend/src/components/ui/ThemeToggle.tsx` | Accept `storageKey` + `defaultTheme` props |
| `apps/frontend/src/components/ui/BrandingEditor.tsx` | Add `defaultTheme` state + picker + PATCH |
| `apps/backend/prisma/schema.prisma` | Add `Restaurant.defaultTheme` field |
| `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` | Add `defaultTheme` validator |

---

# Session Log: May 1, 2026

This document summarizes all architectural changes, feature implementations, and bug fixes completed during this session.

## 1. Dashboard UI/UX Improvements
*   **Branding Migration**: Moved the `BrandingEditor` component from the "Summary" tab to the "Settings" tab for better configuration grouping.
*   **Settings Layout**: Removed maximum width constraints from `SettingsView.tsx` to allow the settings page to utilize the full dashboard width, matching other tabs.
*   **Alignment Fixes**: Refactored the `ColorSchemeEditor.tsx` grid layout to ensure color pickers and labels are perfectly aligned across all screen sizes (mobile to desktop).

## 2. Scalable QR Code Management
*   **Context Refactor**: Migrated `TableView.tsx` to pull data directly from `RestaurantContext`. This removes prop-drilling and ensures the table management system can scale to thousands of restaurants without performance degradation.
*   **Branded QR Codes**: Integrated `qrcode.react` to enable:
    *   Dynamic colors matching the restaurant's branding.
    *   Embedded restaurant logos in the center of the QR code.
    *   High-resolution rendering.
*   **Bulk Printing System**: Created `PrintableQRCodes.tsx` which provides a clean, print-only view for generating Table Tents in bulk. Uses `@media print` CSS to hide dashboard navigation during the print process.

## 3. Analytics Dashboard Expansion
*   **Backend Metrics**: Extended `dashboard.service.ts` to fetch new data points concurrently using `Promise.all`:
    *   `categoryBreakdown`: Revenue split by menu category (Drinks, Mains, etc.).
    *   `ordersByTable`: Performance metrics (revenue/orders) for individual tables.
*   **Frontend Visualization**:
    *   Added a **Donut Chart** for Category Breakdown.
    *   Added a **Bar Chart** for Top Performing Tables.
    *   Styled all charts to use the restaurant's branding colors dynamically.
*   **Advanced Data Export**:
    *   Implemented a CSV export feature in `AnalyticsView.tsx`.
    *   Added support for **European locales** (semicolon `;` delimiters).
    *   Included **UTF-8 BOM** and `sep=;` metadata to ensure perfect formatting in Microsoft Excel and Apple Numbers.

## 4. Technical Refinement & Bug Fixes
*   **Prisma Fixes**: Resolved a query error in the backend where the system attempted to join a non-existent `table` relation; refactored to use direct `tableId` grouping.
*   **TypeScript Accuracy**: Cleared multiple IDE errors in `DashboardPage.tsx` and `AnalyticsView.tsx` by removing legacy props and unused variables, ensuring a 100% clean build.
*   **CSV Formatting**: Fixed a bug where escaped newline characters were breaking the export structure; ensured all fields are properly quoted for data integrity.

---
**Current Status**: All Dashboard and Analytics objectives for this phase are complete. The system is now ready for the **Kitchen Display System (KDS)** implementation.
