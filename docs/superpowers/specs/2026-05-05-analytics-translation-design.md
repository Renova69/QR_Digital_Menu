# Analytics Fix + Translation Overhaul — Design Spec
**Date:** 2026-05-05  
**Status:** Approved

---

## 1. Scope

Two independent but related improvements:

1. **Analytics** — instant data freshness after orders + timezone-correct date grouping
2. **Translation** — platform-managed DeepL key, lazy on-demand fallback for public menu, unified language picker, remove per-restaurant API key from dashboard

---

## 2. Analytics

### 2.1 Problems

| # | Problem | Root Cause |
|---|---------|-----------|
| 1 | New orders don't update analytics charts | `staleTime: 5min`, no socket-driven invalidation |
| 2 | Revenue trend shows orders on wrong calendar day | `getRevenueTrend` groups by UTC `.toISOString()` instead of restaurant timezone |
| 3 | Peak hours chart shows wrong hour buckets | `getPeakHours` uses `.getHours()` (UTC) instead of restaurant local time |
| 4 | Summary "today" count wrong for non-UTC restaurants | `getSummary` sets `today` using server UTC midnight |

### 2.2 Frontend changes

**`apps/frontend/src/hooks/useAnalytics.ts`**
- Set `staleTime: 0` — cache always considered stale, fetches immediately on mount
- Keep `refetchInterval: 30000` as background safety net

**`apps/frontend/src/context/OrderContext.tsx`**
- Import `useQueryClient` from `@tanstack/react-query`
- On any incoming order socket event (new order or status change): call `queryClient.invalidateQueries({ queryKey: ['analytics'] })`
- Effect: analytics refetch the moment an order arrives, not at the next 30s poll tick

### 2.3 Backend changes

**`apps/backend/src/dashboard/dashboard.service.ts`**

`getAnalytics()`:
- Fetch `restaurant.timezone` at the top of the method (single `findUnique` select)
- Pass `tz: string` into `getRevenueTrend` and `getPeakHours`

`getRevenueTrend(restaurantId, start, end, tz)`:
- Replace `order.createdAt.toISOString().split('T')[0]` with `DateTime.fromJSDate(order.createdAt, { zone: tz }).toISODate()`
- Initialize date range loop using Luxon `DateTime` in the same timezone so day boundaries are correct

`getPeakHours(restaurantId, start, end, tz)`:
- Replace `order.createdAt.getHours()` with `DateTime.fromJSDate(order.createdAt, { zone: tz }).hour`

`getSummary(restaurantId)`:
- Derive `today` midnight using `DateTime.now().setZone(tz).startOf('day').toJSDate()` — requires fetching timezone first

Import: `import { DateTime } from 'luxon'` — already a backend dependency.

---

## 3. Translation Architecture

### 3.1 Core principle

Platform owns the DeepL key. Owners configure target languages and trigger translation. Customers always see translated content — from DB cache if available, live from DeepL as fallback (result cached immediately for next visitor).

### 3.2 Platform-managed DeepL key

- Add `DEEPL_API_KEY=<key>` to `apps/backend/.env`
- `restaurant.deeplApiKey` column: stays in schema, never read or written again (CLAUDE.md requirement)

**`apps/backend/src/translation/translation.service.ts`**
- Remove `apiKey` parameter from `translateTexts`, `translateText`, `translateObject`
- Read `process.env.DEEPL_API_KEY` internally
- Free-tier detection: `process.env.DEEPL_API_KEY?.endsWith(':fx')`
- If key missing: log warning, return original texts unchanged (graceful no-op)

### 3.3 "Translate All" — owner-triggered

**`apps/backend/src/restaurants/restaurants.service.ts`** — `translateAll()`:
- Remove `restaurant.deeplApiKey` guard — replace with `process.env.DEEPL_API_KEY` check
- Remove `restaurant.deeplApiKey` from all `this.translationService.*` call sites
- Logic unchanged: categories → items (name, description, allergens, tags) → options + choices

**Post-save pre-warm** (fire-and-forget):
- In `MenuService` create/update item handler and category handler: after DB write succeeds, fire async pre-warm for any `restaurant.targetLanguages` where the item has no existing translation
- Pattern: `void (async () => { const t = await translationService.translateObject(...); await prisma.menuItem.update(...translations) })()` — does not block the HTTP response
- Effect: new/edited menu items are translated in the background before the first customer arrives

### 3.4 Public menu lazy fallback

**`apps/backend/src/menu/menu.service.ts` + controller**

`GET /api/menu/public/:restaurantId?lang=ro`

Flow:
1. Fetch full menu data as normal (unchanged)
2. If `lang` query param provided AND `DEEPL_API_KEY` set:
   - For each category: if `translations?.[lang]` exists → overlay translated name. If missing → translate live → write `translations[lang]` to DB → overlay.
   - For each item: same for name, description, allergens, dietaryTags. If missing → translate live → write → overlay.
   - For each option + choices: same pattern.
3. Items with existing DB translations pay zero DeepL cost. Only missing entries trigger API calls.
4. After the first customer request for a new language on any item, that item is permanently cached in DB — all subsequent customers get instant DB reads.

**Source language**: DeepL auto-detect. No source language hardcoded — works if menu is in BG, EN, or mixed.

**Rate limiting**: translate missing items in batches per entity type, with the existing 300ms delay between items to respect DeepL rate limits.

### 3.5 What gets translated

| Content | Owner "Translate All" | Lazy fallback |
|---------|----------------------|---------------|
| Category names | yes | yes |
| Item name | yes | yes |
| Item description | yes | yes |
| Allergens | yes | yes |
| Dietary tags | yes | yes |
| Option names | yes | yes |
| Choice names | yes | yes |
| Dashboard UI strings | no — static i18n JSON | no |
| Dashboard buttons/labels | no — static i18n JSON | no |

---

## 4. Dashboard UI

### 4.1 Language picker placement

Move language picker to dashboard header (currently buried in settings tab). Single picker controls:

- **Track 1 — Dashboard UI**: calls `i18n.changeLanguage(code)` → all buttons, tabs, labels switch instantly via i18next
- **Track 2 — Menu content**: selected language stored in context/localStorage → public menu requests append `?lang=<code>`

Public menu page retains its own language picker for customers, persisted per-restaurant in localStorage (existing `theme-{restaurantId}` pattern extended to `lang-{restaurantId}`).

### 4.2 Default language

**`apps/frontend/src/i18n.ts`**: change `fallbackLng: 'en'` → `fallbackLng: 'bg'`. `LanguageDetector` stays — browser language detected first, falls back to BG if not EN/BG/RO.

### 4.3 SettingsView cleanup

Remove:
- `deeplApiKey` state variable
- DeepL API Key input field + label
- `handleForceTranslate` API key guard (`if (!deeplApiKey)`)
- `deeplApiKey` from `handleSave` update payload
- `deeplApiKey` from `updateRestaurant` call in `handleForceTranslate`

Keep:
- Target language checkboxes (unchanged)
- "Translate All Now" button — enabled when `targetLanguages.length > 0`

Add:
- Small info text: "Translation powered by DeepL" (no key visible to owner)
- English (`{ code: 'en', name: 'English' }`) added to `AVAILABLE_LANGUAGES` — required since BG is now the source language

### 4.4 i18n JSON audit

Files: `en/translation.json`, `bg/translation.json`, `ro/translation.json`

Strings currently hardcoded in English (missing from JSON, must be added to all 3 files):
- "Timezone" label (`SettingsView`)
- "Export" button (`AnalyticsView`)
- "Translation powered by DeepL" (new)
- Any other inline English strings found during implementation

---

## 5. File Change Summary

| File | Change |
|------|--------|
| `apps/backend/.env` | Add `DEEPL_API_KEY` |
| `apps/backend/src/translation/translation.service.ts` | Drop `apiKey` param, read from env |
| `apps/backend/src/restaurants/restaurants.service.ts` | Drop `deeplApiKey` guard in `translateAll` |
| `apps/backend/src/menu/menu.service.ts` | Add `lang` param, lazy translate + DB write |
| `apps/backend/src/menu/menu.controller.ts` | Accept `?lang` query param |
| `apps/backend/src/dashboard/dashboard.service.ts` | Fetch restaurant timezone, Luxon date/hour grouping in all relevant methods |
| `apps/frontend/src/hooks/useAnalytics.ts` | `staleTime: 0` |
| `apps/frontend/src/context/OrderContext.tsx` | Invalidate `['analytics']` on order socket events |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx` | Remove API key field, add English to language list, remove key guard |
| `apps/frontend/src/i18n.ts` | `fallbackLng: 'bg'` |
| `apps/frontend/src/components/Header.tsx` | Language picker → wired to i18next + lang context |
| `apps/frontend/src/locales/*/translation.json` | Audit + fill missing keys |

---

## 6. Out of Scope

- Adding new static i18n JSON languages (DE, ES, FR, etc.) — static JSON only covers dashboard chrome; DeepL handles content
- Redis or external cache layer — existing DB `translations` JSON field is sufficient
- Stripe, multi-location, staff roles (Phase 18+) — paused per project memory
