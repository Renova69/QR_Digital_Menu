# Translation Completeness & i18n Fix — Design Spec

**Date:** 2026-05-05  
**Status:** Approved  
**Scope:** Frontend only — no backend changes required

---

## Problem

Two classes of i18n bugs exist across the frontend:

1. **Hardcoded strings** — JSX contains English string literals with no `t()` call. These never translate regardless of language selection.
2. **Missing locale keys** — Some components call `t(key, 'fallback')` but the key is absent from all three locale JSON files (`en`, `bg`, `ro`). BG/RO users always see the English fallback.

Additionally, two bugs:

- **Duplicate language picker** — `Header.tsx` and `DashboardPage.tsx` both render a language selector; on the dashboard both are visible simultaneously.
- **QR print broken** — `window.print()` in `TableView.tsx` prints the entire page; QR codes appear as an overlay on the full site rather than printing cleanly.

**Out of scope:** `HomePage.tsx` (marketing landing page — excluded for now). Backend-generated audit messages in `MenuCheckWidget` stay English.

---

## Constraints

- All fixes are purely additive: new locale keys + `t()` wiring. No new components, no routing changes, no API changes.
- Locale files: `apps/frontend/src/locales/{en,bg,ro}/translation.json`
- i18n library: `react-i18next` — use `useTranslation()` hook, `t(key)` calls, `{{interpolation}}` for dynamic values.
- `window.alert()` in `CheckoutPage.tsx` (loyalty "not enough points") replaced with inline state-based error message.
- `BOTTOM_NAV_TABS` in `DashboardPage.tsx` is a static array with hardcoded `short` labels — labels must move to render time so `t()` can be called inside the component.

---

## Architecture

No structural changes. Each phase is: **add locale keys → replace string literals with `t()` calls**.

---

## Phase 1 — Customer-facing pages + bugs

### Bugs fixed in this phase

**Duplicate language picker:**  
Remove the language picker block from `DashboardPage.tsx` (lines 96–110). The picker in `Header.tsx` is the single source of truth — it is always visible and applies globally.

**QR print layout:**  
Add `@media print` CSS (in `index.css` or a scoped `<style>` in `PrintableQRCodes`):

- Hide everything: `body > * { display: none }`
- Show only the printable container: `.printable-qr-sheet { display: block !important }`
- Stack QR code cards cleanly with page breaks

### Locale keys added

**`publicMenu` additions:**

```
language        — "Language"
logout          — "Logout"
trendingNow     — "Trending Now"
```

**`checkout` changes + additions:**

```
title           — "Your Order"  (was "Checkout")
loyaltyPoints   — "Loyalty Points"
pointsAvailable — "You have {{count}} points available (Value: EUR {{value}})"
redeemForDiscount — "Redeem points for discount"
discountApplied — "Discount applied:"
willEarn        — "You will earn {{pts}} pts"
happyHourBonus  — "Happy Hour: {{multiplier}}x Points"
redeemedFree    — "Redeemed Free"
redeemForPts    — "Redeem for {{pts}} pts"
notEnoughPoints — "Not enough points to redeem this item"
earnFreeFood    — "Want to earn free food?"
signInToEarn    — "Sign in to earn points on this order."
```

**`common` additions:**

```
pleaseLogin     — "Please log in to continue"
```

### Components changed

- `CheckoutPage.tsx` — wire 12 loyalty strings; replace `alert()` with inline error state
- `TrendingCarousel.tsx` — locale JSON only (already calls `t()` with fallback)
- `PublicMenuPage.tsx` — locale JSON only (already calls `t()` with fallback)

---

## Phase 2 — Dashboard owner UI

### Locale keys added

**`summary` section (new keys):**

```
statusSnapshot              — "Status Snapshot"
loyaltyProgramPerformance   — "Loyalty Program Performance"
totalVipMembers             — "Total VIP Members"
pointsRedeemed              — "Points Redeemed"
freebiesIssued              — "Freebies & Discounts Issued"
pointsOutstandingLiability  — "Points Outstanding Liability"
unspentCustomerPoints       — "Unspent Customer Points"
```

**`orders` additions:**

```
pluckedAt   — "Placed {{time}}"
```

**`assistance` additions:**

```
resolvedAt  — "Resolved {{time}}"
```

**`tables` additions:**

```
printAllQr  — "Print All QR Codes"
```

**`analytics` additions:**

```
export              — "Export"
categoryBreakdown   — "Category Breakdown"
topTablesByRevenue  — "Top Tables by Revenue"
dateFrom            — "From"
dateTo              — "To"
```

**`menuCheck` section (new):**

```
title           — "Menu Health"
subtitle        — "AI-powered audit to optimize your menu"
rescan          — "Rescan"
fix             — "Fix"
perfectScore    — "Perfect Score!"
perfectScoreDesc — "Your menu is fully optimized and ready to convert customers."
critical        — "{{count}} Critical"
warnings        — "{{count}} Warnings"
suggestions     — "{{count}} Suggestions"
itemIssue       — "Item Issue"
categoryIssue   — "Category Issue"
fieldLabel      — "Field: {{field}}"
```

**`loyaltySettings` section (new):**

```
sectionTitle        — "Loyalty & Rewards Program"
enableLoyalty       — "Enable Loyalty Program"
signupBonus         — "Signup Bonus Points"
earnRate            — "Points Earned per €1"
redeemRate          — "Points Needed per €1 Discount"
expiryDays          — "Points Expiry (days)"
reminderDays        — "Expiry Reminder (days before)"
silverThreshold     — "Silver Tier Threshold (pts)"
goldThreshold       — "Gold Tier Threshold (pts)"
silverMultiplier    — "Silver Multiplier"
goldMultiplier      — "Gold Multiplier"
cashbackInfo        — "Effective cashback: {{pct}}%"
happyHourEnable     — "Enable Happy Hour"
happyHourStart      — "Happy Hour Start"
happyHourEnd        — "Happy Hour End"
happyHourMultiplier — "Happy Hour Multiplier"
silverMustBeLower   — "Silver threshold must be lower than Gold threshold."
```

**`branding` additions:**

```
typography      — "Typography"
headingFont     — "Heading Font"
bodyFont        — "Body Font"
menuBackground  — "Menu Background"
textColor       — "Text Color"
cardBackground  — "Card Background"
buttonAccent    — "Button / Accent"
defaultTheme    — "Default Customer Theme"
defaultThemeDesc — "Customers see this mode when they first scan the QR code. They can still toggle it."
livePreview     — "Live Preview"
restaurantTimezone     — "Restaurant Timezone"
restaurantTimezoneDesc — "Used for automated menu scheduling."
```

### Components changed

- `SummaryView.tsx` — wire loyalty stat labels
- `AssistanceView.tsx` — replace `"Resolved " + toLocaleTimeString()` → `t('assistance.resolvedAt', { time })`
- `OrdersView.tsx` — replace `"Plucked " + toLocaleTimeString()` → `t('orders.pluckedAt', { time })`
- `TableView.tsx` — wire `t('tables.printAllQr')`
- `AnalyticsView.tsx` — wire export, category breakdown, top tables, date range labels
- `SettingsView.tsx` — wire all ~20 loyalty field labels
- `BrandingEditor.tsx` — wire typography, font, theme, live preview labels
- `ColorSchemeEditor.tsx` — wire color scheme labels
- `MenuCheckWidget.tsx` — wire all frontend chrome strings

---

## Phase 3 — Global chrome + Menu Editor

### Locale keys added

**`nav` section (new):**

```
dashboard   — "Dashboard"
logout      — "Logout"
login       — "Login"
getStarted  — "Get Started"
```

**`dashboard` additions:**

```
tabs.home       — "Home"
tabs.requests   — "Requests"
tabs.stats      — "Stats"
```

_(existing `tabs.orders`, `tabs.tables`, `tabs.settings`, `tabs.menuEditor` already present)_

**`menuEditor` additions:**

```
storefrontUpselling — "Storefront Upselling"
trendingEngine      — "Trending Engine"
trendingModeAuto    — "Auto (Algorithm)"
trendingModeManual  — "Manual (Hand-picked)"
trendingModeOff     — "Off"
trendingDescAuto    — "Automatically analyzes sales to trend popular items."
trendingDescManual  — "Click the stars on items to feature them on your menu."
```

### Components changed

- `Header.tsx` — wire "Dashboard", "Logout", "Login", "Get Started" using `t('nav.*')`
- `DashboardPage.tsx` — `BOTTOM_NAV_TABS` `short` labels moved from static array to render-time `t()` calls; wire mobile "Menu Editor" link
- `MenuEditorPage.tsx` — wire section heading, trending engine label, three mode options, dynamic description text

---

## BG / RO locale coverage

All new keys must have translations in all three locale files simultaneously. EN is the source of truth. BG is the primary target (restaurant owner audience). RO must be complete.

Key translation notes for implementer:

- "Your Order" → BG: "Вашата поръчка" / RO: "Comanda dvs."
- "Trending Now" → BG: "Популярно сега" / RO: "În tendințe"
- "Loyalty Points" → BG: "Точки за лоялност" / RO: "Puncte de loialitate"
- All other BG/RO values: translate from EN at implementation time

---

## Error handling

- `CheckoutPage` loyalty `alert()` → replace with a `notEnoughPointsError` state boolean; render an inline `<p className="text-red-500 text-xs mt-1">` below the redeem button. No modal, no toast — inline is sufficient.

---

## Testing

- Switch language picker (EN → BG → RO) on dashboard; verify no visible English fallbacks remain in owner UI.
- Switch language on public menu; verify trending carousel, language label, logout label translate.
- Checkout with loyalty points active; verify all loyalty strings translate.
- Open QR print preview; verify only QR codes render, no site chrome.
- Verify language picker appears only once on dashboard (in Header, not on page).
