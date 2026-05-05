# Session Log: May 5, 2026

This session delivered two independent improvements: analytics data freshness + timezone correctness, and a full translation architecture overhaul (platform-managed DeepL key, lazy on-demand caching, dashboard UI cleanup).

## 1. Analytics Fixes

**Problem:** Analytics charts didn't update when new orders arrived (stale 5-minute cache). Revenue trend and peak hours showed data bucketed to wrong calendar days/hours for non-UTC restaurants.

**Root causes and fixes:**

| # | Problem | Fix |
|---|---------|-----|
| 1 | New orders don't refresh analytics | `staleTime: 0` in `useAnalytics.ts`; `OrderContext` invalidates `['analytics']` query on every order socket event |
| 2 | Revenue trend on wrong calendar day | `getRevenueTrend` now uses `DateTime.fromJSDate(createdAt, { zone: tz }).toISODate()` (Luxon) |
| 3 | Peak hours in wrong hour bucket | `getPeakHours` now uses `DateTime.fromJSDate(createdAt, { zone: tz }).hour` |
| 4 | "Today" count wrong for non-UTC restaurants | `getSummary` derives midnight via `DateTime.now().setZone(tz).startOf('day').toJSDate()` |

**Files changed:** `apps/backend/src/dashboard/dashboard.service.ts`, `apps/frontend/src/hooks/useAnalytics.ts`, `apps/frontend/src/context/OrderContext.tsx`

## 2. Translation Architecture Overhaul

**Platform-managed DeepL key:**
- `DEEPL_API_KEY` added to `apps/backend/.env` — owners no longer supply their own key
- `TranslationService.translateTexts/translateText/translateObject` — `apiKey` param removed; service reads key from env internally; free-tier auto-detected (`key.endsWith(':fx')` → routes to `api-free.deepl.com`)
- `restaurant.deeplApiKey` column retained in schema but **never read or written** going forward
- Removed from `UpdateRestaurantDto` (DTO is the validation boundary)

**Three translation paths:**
1. **Fire-and-forget pre-warm** — after any menu item / category / option create or update, background IIFE translates into all `restaurant.targetLanguages` and writes to the `translations` JSON field; does not block the HTTP response
2. **Owner "Translate All"** — `POST /api/restaurants/:id/translate-all` guard changed from `restaurant.deeplApiKey` check to `process.env.DEEPL_API_KEY` check
3. **Lazy on-demand** — `GET /api/menu/public/:id?lang=<code>` checks DB cache per entity; on miss: translates → writes to DB → overlays on response; 300ms delay between DeepL calls (rate limit). `lang` validated against `restaurant.targetLanguages` (prevents arbitrary DB key injection and unauthorized quota burn). Logic extracted into private `applyLazyTranslations()` helper

**Dashboard UI cleanup (`SettingsView.tsx`):**
- Removed DeepL API Key input field, state, and payload
- "Translate All Now" button enabled by `targetLanguages.length > 0` (not by key presence)
- English added to `AVAILABLE_LANGUAGES` (needed since BG is now the source language)
- Added "Translation powered by DeepL" attribution text

**i18n changes:**
- `fallbackLng` changed from `'en'` → `'bg'` in `apps/frontend/src/i18n.ts`
- Language picker (BG/EN/RO `<select>`) added to dashboard `Header.tsx` — visible when logged in, calls `i18n.changeLanguage()`, `LanguageDetector` persists to localStorage automatically
- Locale JSON audit (all 3 files — EN/BG/RO): added `timezone`, `timezoneDesc`, `translationPoweredBy`, `failedSave`, `failedInitiate`; removed obsolete `deeplApiKey`/`googleApiKey`/`apiKeyRequired`; updated `localizationDesc` and `processExistingDesc` to reference DeepL instead of Google Translate

## 3. Files Changed

| File | Change |
|------|--------|
| `apps/backend/src/dashboard/dashboard.service.ts` | Luxon timezone-aware date/hour grouping in all analytics methods |
| `apps/frontend/src/hooks/useAnalytics.ts` | `staleTime: 0` |
| `apps/frontend/src/context/OrderContext.tsx` | Invalidate `['analytics']` on order socket events |
| `apps/backend/.env` | Added `DEEPL_API_KEY` |
| `apps/backend/src/translation/translation.service.ts` | Removed `apiKey` param; reads from env; free-tier detection |
| `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` | Removed `deeplApiKey` field |
| `apps/backend/src/restaurants/restaurants.service.ts` | `translateAll` uses `process.env.DEEPL_API_KEY` guard |
| `apps/backend/src/menu/menu.service.ts` | Fire-and-forget pre-warm on create/update; `applyLazyTranslations()` on public menu; `lang` validation against `targetLanguages` |
| `apps/backend/src/menu/public-menu.controller.ts` | Accept `?lang` query param |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx` | Remove API key field; add English; fix button condition; timezone i18n keys |
| `apps/frontend/src/i18n.ts` | `fallbackLng: 'bg'` |
| `apps/frontend/src/components/Header.tsx` | BG/EN/RO language picker |
| `apps/frontend/src/locales/*/translation.json` | Audit: add 5 missing keys, remove 3 obsolete keys, update stale copy |

---

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
