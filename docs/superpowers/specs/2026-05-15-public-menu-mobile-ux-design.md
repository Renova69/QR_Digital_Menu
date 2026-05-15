# Public Menu — Mobile UX Redesign Spec

> **Date:** 2026-05-15
> **Status:** Design Approved — Ready for Implementation Plan
> **Scope:** `PublicMenuPage.tsx` + related components, mobile-first (320-430px)

## Overview

Redesign the customer-facing public menu for mobile devices. Compact the top area, add search + structured filters, fix price display for legal compliance (dual currency EUR/BGN), replace full-width add-to-cart buttons with pill buttons, regroup bottom navigation, and convert item cards to horizontal layout.

---

## 1. Top Bar — All-in-One Glass Panel

Replace the current two-row layout (table banner + logo + language pill) with a single compact glass-panel bar.

### Layout (left to right)

| Element | Rendering | Notes |
|---------|-----------|-------|
| Table chip | `🪑 5` — blue pill, icon + number | Hidden when no `tableNumber` query param |
| Search input | `🔍 Search menu...` — flex-1, no border | Only text visible is placeholder. i18n key: `publicMenu.searchPlaceholder` |
| Filter button | ☰ icon, 30×30px | Blue highlight when filter panel open or filters active |
| Theme toggle | Sun/Moon icon, 30×30px | Existing `ThemeToggle` component, `size="sm"` |
| Language selector | 2-char code: `EN` / `BG` / `RO` | Tap cycles or opens quick popover. Shows only codes from `restaurant.targetLanguages` |

### Styling
- Glass panel: `bg-white/85 dark:bg-black/85 backdrop-blur-md rounded-[18px]`
- Padding: `px-2 py-1.5`
- Gap between elements: `gap-1.5`
- Shadow: `shadow-sm`
- Position: sticky top-3 z-40

### States
- **No table:** Table chip hidden, search bar expands
- **Filter active:** ☰ button gets accent background + badge dot

---

## 2. Filter Panel — Dropdown from ☰ Button

Opens as a slide-down panel below the top bar when ☰ is tapped. Not a modal — panel pushes content down.

### Structure

#### 2a. Dietary Preference Toggles (Include Filter)
Label: i18n `filters.showOnly`

Toggle pills in a flex-wrap row. Each is a checkbox styled as a pill:
- **Off:** `bg-muted/50 border border-transparent`
- **On:** Green accent border + tinted background

Tags sourced dynamically from `menuData` — collect all unique `dietaryTags` across items:
- `spicy`, `vegan`, `new`, `popular`, `keto`, etc.

Multi-select. Show only items matching at least one selected dietary tag.

#### 2b. Divider
Thin line with i18n label `filters.or` centered.

#### 2c. Allergen Exclusion Pills (Exclude Filter)
Label: i18n `filters.excludeAllergens` — shows "Изключи" (BG), "Exclude" (EN), etc.

Pills in a flex-wrap row. Tap to toggle exclusion:
- **Off:** `border-border bg-white`
- **On (excluded):** Red border + red-tinted bg + ✕ icon

Allergens sourced dynamically from all `item.allergens` arrays:
- `milk`, `wheat`, `nuts`, `fish`, `eggs`, `shellfish`, `soy`, `garlic`, etc.

Exclusion logic: items whose `allergens` array contains any excluded allergen are hidden.

#### 2d. Footer
- Active filter count: `"3 filters active"` — i18n `filters.activeCount`
- "Clear all" link — resets all toggles and pills

### Behavior
- Search in top bar AND filters work together (intersection)
- Panel closes on tapping outside or tapping ☰ again
- Filter state preserved when panel closes
- Filter button shows indicator dot when any filter is active

---

## 3. Price Display — Dual Currency (EUR + BGN)

### Format
```
12.50 € / 24.45 лв
```
- EUR primary (bold), BGN secondary (muted, smaller)
- Slash separator
- Fixed exchange rate: **1 EUR = 1.95583 BGN** (Bulgarian National Bank)

### Where this applies
| Location | Current | New |
|----------|---------|-----|
| Item card | `€12.50` | `12.50 € / 24.45 лв` |
| CartDrawer line items | `€25.00` | `25.00 € / 48.90 лв` |
| CartDrawer total | `€28.50` | `28.50 € / 55.75 лв` |
| CheckoutPage | `€12.50` | `12.50 € / 24.45 лв` |
| TrendingCarousel cards | `€12.50` | `12.50 €` (single line, no BGN — too small) |
| PaymentModal | `€28.50` | `28.50 € / 55.75 лв` |

### Implementation
- Create shared utility: `src/lib/currency.ts`
  ```ts
  export const BGN_RATE = 1.95583;
  export function formatEuroEur(amount: number): string { ... }    // "12.50 €"
  export function formatDualCurrency(amount: number): { eur: string; bgn: string } { ... }
  ```
- `Item.currency` field determines which currency is primary
  - `EUR` items: show `12.50 € / 24.45 лв`
  - `BGN` items: show `24.45 лв / 12.50 €` (BGN primary, EUR secondary)
- All inline `€{x.toFixed(2)}` replaced with shared utility calls

---

## 4. Item Card — Horizontal Layout

### Layout
```
┌──────────┬──────────────────────┐
│          │ Name                 │
│  Image   │ Description (2-line) │
│  1/3 w   │ 🏷️ Tags (inline)     │
│          │ 12.50 € / 24.45 лв   │
│          │            [+ Add]   │
└──────────┴──────────────────────┘
```

### Specs
- **Image:** 33% width, min 110px, object-fit cover. Fallback: initial letter on gradient background when no image.
- **Content:** flex-1, flex-col, justify-between. Padding: `px-3 py-2.5`.
- **Name:** `text-sm font-bold`, single line
- **Description:** `text-[10px] text-muted-foreground`, 2-line clamp
- **Tags:** Inline pills, `text-[7px] font-bold uppercase tracking-wider`. Dietary = green tints, allergens = amber tints.
- **Price row:** flex, justify-between, items-center
  - Price: `text-xs font-bold` — `12.50 € / 24.45 лв`
  - Button: `+ Add` pill — `px-3 py-1.5 rounded-full bg-accent text-white text-[11px] font-bold`
- **Options badge:** When item has options, show `+N` badge (e.g. `+3`) in purple tint next to tags
- **Card:** `bg-white dark:bg-black rounded-2xl overflow-hidden shadow-sm`
- **Gap between cards:** `gap-3` (12px)

### States
- **Out of stock:** Card opacity 50%, "+ Add" replaced with "Out of stock" muted text
- **In cart:** Button shows quantity: `3 ✓` instead of `+ Add`

---

## 5. Category Navigation — Horizontal Scroll Pills

Replace mobile `<select>` dropdown with horizontal scrollable pill row (same as desktop).

### Specs
- Horizontal flex row, `overflow-x-auto`, no scrollbar (`scrollbar-width: none`)
- Pills: `rounded-full px-3.5 py-1.5 text-[11px] font-semibold`
- Active pill: `bg-accent text-white`
- Inactive pill: `bg-white/70 dark:bg-white/10 text-foreground/70`
- Gap: `gap-1.5`
- Sticky below top bar: `sticky top-[72px] z-30` (adjust based on top bar height)
- Auto-scroll active category into view

---

## 6. Trending Carousel — Slim Cards

### Specs
- Horizontal scroll row, small cards
- Each card: `flex items-center gap-2 bg-white rounded-2xl p-2 shadow-sm min-w-[140px]`
- Image: `w-10 h-10 rounded-xl object-cover`
- Content: name `text-[11px] font-bold` + price `text-[10px] font-semibold opacity-50` (EUR only, no BGN)
- Gap between cards: `gap-2`
- Label above: "🔥 Trending" — `text-[11px] font-bold uppercase tracking-wider opacity-40`
- Same row height as new design language

---

## 7. Bottom Navigation — Regrouped

Layout: **Option B** — Waiter · Profile | Bill · Cart

### Structure
```
┌─────────────────────────────────────────────┐
│  🔔 Waiter    👤 Profile  │  💳 Bill   🛒3  │
└─────────────────────────────────────────────┘
```

### Specs
- Glass panel bar, identical container to current: `rounded-[2rem] glass-panel max-w-[480px]`
- **Left group:** Call Waiter (bell icon + label on sm+) + Profile/Login (user icon)
  - Logged in: profile icon → navigates to `/profile`
  - Logged out: person icon → opens `CustomerLoginModal`
- **Divider:** Single `w-px h-7 bg-border/40` between groups
- **Right group:** Request Bill (text, only if session active) + Cart (shopping cart icon with red badge)
  - Cart highlighted: `bg-accent text-white rounded-full` when items present
- Spacing: `justify-between` with padding
- All buttons: `h-10 min-w-[40px]` touch targets

### Button visibility by state
| State | Waiter | Profile | Divider | Bill | Cart |
|-------|--------|---------|---------|------|------|
| No table, not logged in | ✓ | Sign In | — | — | ✓ |
| No table, logged in | ✓ | Profile | — | — | ✓ |
| Table, no session | ✓ | Sign In | — | — | ✓ |
| Table + session | ✓ | Profile | ✓ | ✓ | ✓ |

---

## 8. i18n Requirements

All user-facing strings must use `t()` with keys in EN/BG/RO locales.

### New translation keys needed

| Key | EN | BG | RO |
|-----|----|----|----|
| `publicMenu.searchPlaceholder` | Search menu... | Търси в менюто... | Caută în meniu... |
| `filters.showOnly` | Show Only | Покажи само | Arată doar |
| `filters.excludeAllergens` | Exclude | Изключи | Exclude |
| `filters.or` | or | или | sau |
| `filters.activeCount` | {{count}} filters active | {{count}} активни филтъра | {{count}} filtre active |
| `filters.clearAll` | Clear all | Изчисти | Șterge tot |
| `publicMenu.spicy` | Spicy | Лютиво | Picant |
| `publicMenu.vegan` | Vegan | Веган | Vegan |
| `publicMenu.new` | New | Ново | Nou |
| `publicMenu.popular` | Popular | Популярно | Popular |
| `publicMenu.keto` | Keto | Кето | Keto |
| `publicMenu.addToCart` | + Add | + Добави | + Adaugă |
| `publicMenu.outOfStock` | Out of stock | Изчерпано | Stoc epuizat |
| `publicMenu.optionsCount` | +{{count}} options | +{{count}} опции | +{{count}} opțiuni |

### Existing keys to reuse
- `publicMenu.viewingTable` — current table banner text (no longer used, replaced by table chip)
- `publicMenu.callWaiter` — bottom nav label
- `publicMenu.signIn` — bottom nav login
- `publicMenu.requestBill` — bottom nav bill
- All allergen/dietary tag translations from existing translation pipeline

---

## 9. New Shared Utility — `src/lib/currency.ts`

```ts
export const BGN_RATE = 1.95583;

export function formatEuro(value: number): string {
  return `${value.toFixed(2)} €`;
}

export function formatBgn(value: number): string {
  return `${(value * BGN_RATE).toFixed(2)} лв`;
}

export function formatDualCurrency(
  value: number,
  primaryCurrency: 'EUR' | 'BGN' = 'EUR'
): { primary: string; secondary: string } {
  if (primaryCurrency === 'EUR') {
    return { primary: formatEuro(value), secondary: formatBgn(value) };
  }
  return { primary: formatBgn(value), secondary: formatEuro(value / BGN_RATE) };
}

export function formatInlineDual(value: number, primaryCurrency: 'EUR' | 'BGN' = 'EUR'): string {
  const { primary, secondary } = formatDualCurrency(value, primaryCurrency);
  return `${primary} / ${secondary}`;
}
```

---

## 10. Component Changes Summary

| File | Change |
|------|--------|
| `PublicMenuPage.tsx` | Major refactor — extract top bar, filter panel, category nav, trending, bottom nav into sub-components or restructure inline sections. Remove logo rendering. |
| `ItemWithOptions.tsx` | Horizontal card layout. Price format changed. Add button → pill. |
| `CartDrawer.tsx` | Dual-currency prices on line items + total. |
| `CheckoutPage.tsx` | Dual-currency prices. |
| `PaymentModal.tsx` | Dual-currency prices. |
| `TrendingCarousel.tsx` | Slim card layout. |
| `CartIcon.tsx` | No functional changes (used in bottom nav). |
| `ThemeToggle.tsx` | No changes (already supports `size="sm"`). |
| **NEW** `src/lib/currency.ts` | Shared currency formatting utility. |
| **NEW** `src/components/menu/FilterPanel.tsx` | Filter panel component (dietary toggles + allergen pills). |
| **NEW** `src/components/menu/CategoryPills.tsx` | Horizontal scroll category pills (extracted from PublicMenuPage). |
| `src/locales/en/translation.json` | ~15 new keys |
| `src/locales/bg/translation.json` | ~15 new keys |
| `src/locales/ro/translation.json` | ~15 new keys |

---

## 11. Design Constraints

- **Mobile-first:** Primary target 320-430px width. Desktop should also look correct (existing 2-column grid for items).
- **No logo:** Logo removed from public menu entirely to save vertical space. Restaurant name still shown in page `<title>`.
- **Law compliance:** BGN must always be visible alongside EUR at fixed BNB rate 1.95583.
- **i18n:** All strings via `t()`. No hardcoded text.
- **Performance:** Filter/search are client-side (data already loaded). No additional API calls.
- **Accessibility:** Filter panel must be keyboard-navigable. Toggle switches must have `role="switch"` + `aria-checked`. Allergen pills must have `aria-pressed`.
