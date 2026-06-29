# Translation System Review — Full Audit Report

**Date**: 2026-06-28  
**Scope**: All translation-related files across backend + frontend  
**Method**: 3-agent parallel review (Spec, Standards, i18n-validator) + direct analysis  
**Fixed point**: `HEAD~10` (10 most recent commits)

---

## Key Counts

| Locale | Keys | Missing from EN | Orphaned | Parity                 |
| ------ | ---- | --------------- | -------- | ---------------------- |
| EN     | 2873 | —               | —        | 100% (source of truth) |
| BG     | 2875 | 0               | 2        | 100%                   |
| RO     | 2778 | 170             | 75       | 94.1%                  |
| DE     | 2869 | 4               | 0        | 99.9%                  |
| ES     | 2869 | 4               | 0        | 99.9%                  |
| FR     | 2869 | 4               | 0        | 99.9%                  |
| IT     | 2869 | 4               | 0        | 99.9%                  |
| ZH     | 2869 | 4               | 0        | 99.9%                  |
| EL     | 2869 | 4               | 0        | 99.9%                  |
| JA     | 278  | 2595            | 0        | 9.7%                   |
| RU     | 278  | 2595            | 0        | 9.7%                   |
| AR     | 278  | 2595            | 0        | 9.7%                   |

---

## CRITICAL (7 findings)

### 1. JA/RU/AR: 278 keys vs EN 2873 — 90.3% missing

**Files**: `apps/frontend/src/locales/{ja,ru,ar}/translation.json`

Only customer-facing blocks present: `nav`, `cart`, `checkout`, `orderConfirmation`, `feedback`, `language.*`. Entirely missing: `dashboard`, `orders`, `payment`, `pos`, `settings`, `staff`, `analytics`, `superAdmin`, `subscription`, `tables`, `pricing`, `gdpr`, `help`, `landing`, `onboarding`, `roles`, `importExport`, `branding`, `loyaltySettings`, `menuAdmin`, `profile`, `summary`, `tierLocked`, `upgrade`, `assistance`, `auth`, `auto` — **2595 missing keys per locale**.

**Impact**: Any dashboard/staff usage in JA/RU/AR falls back to Bulgarian (`fallbackLng: "bg"`). Japanese waiter sees BG labels. Public menu chrome partially translated but all dashboard surfaces show Bulgarian.

**Root cause**: `patch-ja-ru-ar.mjs` explicitly only patches customer-facing blocks. DeepL script was never run for these languages.

**Fix**: Run `scripts/translate-i18n.mjs` against JA/RU/AR to fill all missing keys, or document these as intentionally customer-facing-only.

---

### 2. `?lang=` URL query parameter ignored on initial load

**File**: `apps/frontend/src/pages/PublicMenuPage.tsx`, lines 550–554

```typescript
initialLang = langs[0]; // always first target language
```

The `?lang=` query parameter is never parsed during initialization (only `table` is parsed from `location.search`). A QR code linking to `/menu/rest123?lang=bg` will still load English if English is the first target language.

**Impact**: Restaurants cannot deep-link customers to a specific language. QR codes with `?lang=bg` show wrong initial language.

**Fix**: Parse `?lang=` on mount and validate against `targetLanguages` before defaulting to `targetLanguages[0]`.

---

### 3. Session-flow CheckoutPage never translates item/choice names

**File**: `apps/frontend/src/pages/CheckoutPage.tsx`, lines 88–94

```typescript
const { data: menuData } = useQuery({
  queryKey: ["checkout-menu", restaurantId, selectedLang],
  queryFn: () => getMenu(restaurantId, selectedLang || undefined),
  enabled: !!restaurantId && !!selectedLang, // disabled when selectedLang is ""
});
```

`selectedLang` comes from `location.state.selectedLang` set by CartDrawer. When user arrives via session token (POS QR code payment URL), `location.state` is empty, `selectedLang` is `""`, menu fetch is never enabled.

**Impact**: All item/choice names in session-flow checkout show raw DB values (Bulgarian) regardless of customer's actual language.

**Fix**: Fall back to `i18n.language` when `selectedLang` is empty, or parse `?lang=` from URL in CheckoutPage.

---

### 4. DE/ES/FR/IT/ZH/EL: onboarding plan features arrays lost

**Files**: All 6 locale files, missing 4 keys each:

- `onboarding.plans.free.features`
- `onboarding.plans.starter.features`
- `onboarding.plans.professional.features`
- `onboarding.plans.enterprise.features`

**Root cause**: `scripts/translate-i18n.mjs` `flatten()` function (line 44–46) explicitly skips array values:

```javascript
if (Array.isArray(v)) {
  // skip array values
}
```

**Impact**: `PlanPickerStep.tsx:61` calls `t('onboarding.plans.${tierKey}.features', { returnObjects: true })` — returns `undefined` for 6 locales. Pricing page renders no feature bullet points.

**Fix**: Modify `flatten()` to preserve array leaves (serialize as JSON, translate strings within, deserialize), or manually copy these 4 arrays from EN into each locale.

---

### 5. RO: 170 missing keys + 75 orphaned stale keys

**File**: `apps/frontend/src/locales/ro/translation.json`

Missing keys concentrated in landing page (`landing.dashboardMock.*`, `landing.comparisonTable.*`, `landing.credibility.*`, `landing.footer.*`, `landing.featureSuite.*`) and pricing (`pricing.*`). Orphaned keys indicate the RO file was generated against an older EN key structure that has since been restructured.

**Impact**: Romanian visitors see Bulgarian fallback on marketing pages and pricing.

**Fix**: Re-run `translate-i18n.mjs` for RO, then remove orphaned keys.

---

### 6. French interpolation variable mismatch

**File**: `apps/frontend/src/locales/fr/translation.json`

```
EN: "analytics.export.labels.customRange": "{{start}} to {{end}}"
FR: "analytics.export.labels.customRange": "{{début}} à {{fin}}"
```

The variable names themselves (`start`, `end`) were translated to French (`début`, `fin`). i18next looks for `start`/`end` at runtime, finds neither, and renders the raw template literal.

**Impact**: Analytics export custom date range label shows `"{{début}} à {{fin}}"` instead of actual date range.

**Fix**: Restore variable names: `"{{start}} à {{fin}}"`.

---

### 7. `scripts/translate-i18n.mjs` reads DEEPL_API_KEY from .env regex

**File**: `scripts/translate-i18n.mjs`, lines 17–23

```javascript
const content = readFileSync(envPath, "utf8");
const match = content.match(/^DEEPL_API_KEY=(.+)$/m);
```

No fallback to `process.env.DEEPL_API_KEY`. Key rotation or .env format changes break the script silently.

**Fix**: Check `process.env.DEEPL_API_KEY` first, fall back to .env file.

---

## HIGH (7 findings)

### 8. `resolveItemName` / `resolveChoiceName` duplicated across two files

**Files**: `apps/frontend/src/components/cart/CartDrawer.tsx:11–68`, `apps/frontend/src/pages/CheckoutPage.tsx:23–70`

Both files define identical functions with the same logic (live categories → fallback to cart-time translations). Copy-paste that will drift over time.

**Fix**: Extract to `apps/frontend/src/lib/translation.ts` alongside existing `getTranslatedField`/`getTranslatedArray`.

---

### 9. OrderContext optimistic update race condition

**File**: `apps/frontend/src/context/OrderContext.tsx` (commit `751565f5`)

`batchUpdateOrderStatus` uses `Promise.all` over individual API calls. If 1 of N fails, ALL reverted client-side, but some succeeded server-side. Additionally, stale closure on `const prev = orders` causes concurrent update overwrites.

**Impact**: Client state diverges from reality on partial failure. Visible flash/regression until socket re-syncs.

**Fix**: Track individual successes/failures, revert only failed ones. Add `queryClient.invalidateQueries` fallback for socket disconnect.

---

### 10. `getTrendingItems` backend endpoint ignores language

**File**: `apps/backend/src/menu/menu-crud.service.ts`, line 441

Takes no `lang` parameter, never calls `applyLazyTranslations`. Trending carousel (`TrendingCarousel.tsx:82–84`) falls back to `getTranslatedField(item, lang, "name") || item.name` — but if translations haven't been cached yet, trending items show untranslated names.

**Fix**: Add `lang` parameter to `getTrendingItems`, call `applyLazyTranslations` before returning.

---

### 11. `getMenuMeta` doesn't accept or pass `lang` parameter

**Files**: `apps/frontend/src/lib/api.ts:28`, `apps/backend/src/menu/menu-crud.service.ts:223`

CategoryPills scroll-spy (`CategoryPills.tsx:47`) uses `getTranslatedField(cat, selectedLang, 'name')` but meta endpoint never triggers lazy translation.

**Impact**: Category names in navigation show original language on first visit until item lazy-load populates the cache.

**Fix**: Add `lang` parameter to `getMenuMeta` endpoint + API client call.

---

### 12. `any` types in translation code paths

**Files**:

- `ItemWithOptions.tsx:68` — `(option.translations as any)?.[currentLang]?.choices?.[choice.name]`
- `CartDrawer.tsx:247` — `opt: any` in map callback
- `CheckoutPage.tsx:131` — `useState<any>(null)` for loyalty data

Violates `typescript/coding-style.md`: "Avoid `any` in application code."

**Fix**: Use `Record<string, unknown>` or proper typed interfaces from `types/index.ts`.

---

### 13. Hardcoded `"EUR"` in CartDrawer currency format calls

**File**: `apps/frontend/src/components/cart/CartDrawer.tsx:262,274`

`formatInlineDual(opt.priceModifier || 0, "EUR")` and `formatInlineDual(item.price * item.quantity, "EUR")` hardcode currency. BGN-priced menus show wrong dual display.

**Root cause**: `CartItem` interface doesn't carry `currency` field.

**Fix**: Add `currency` field to `CartItem`, populate when adding to cart, use `item.currency` in format calls.

---

### 14. No tests for auth impersonation or super-admin tenant ops

**Files**: `auth.service.ts` (impersonation exchange/exit), `super-admin.service.ts` (tenant ops, data requests), 6 new frontend pages

Zero test files added or modified in this diff. `testing.md` mandates 80% coverage. `security.md` mandates security review before auth changes.

**Fix**: Add Jest tests for impersonation flow, tenant CRUD ops. Add Vitest tests for new super-admin pages. Update guard-coverage spec.

---

## MEDIUM (8 findings)

### 15. Bulgarian locale has 2 orphaned keys

**File**: `apps/frontend/src/locales/bg/translation.json`

- `dashboard.perTableViewsUnique_one`
- `dashboard.perTableViewsViews_one`

Dead singular-form keys replaced by pluralization patterns. Safe to remove.

---

### 16. `announcementBannerType` DTO lacks `@IsIn` validation

**File**: `apps/backend/src/platform-settings/dto/update-platform-settings.dto.ts:117–120`

Only `@IsString()`. API docs say `enum: ['info', 'warning', 'maintenance']` but `class-validator` doesn't enforce it. Invalid values silently persist to DB.

**Fix**: Add `@IsIn(['info', 'warning', 'maintenance'])`.

---

### 17. AnnouncementBanner only in AppLayout, not PublicLayout

**File**: `apps/frontend/src/components/AnnouncementBanner.tsx`

Rendered inside AppLayout (dashboard header routes) only. Platform-wide banner text (maintenance, legal) never shown to customers browsing public menu.

**Fix**: Add to PublicLayout if platform-wide visibility is intended.

---

### 18. `resolveChoiceName` premature `break` in CartDrawer.tsx

**File**: `apps/frontend/src/components/cart/CartDrawer.tsx:63`

When item found in one category but option not in that item's options, `break` exits the outer loop. Doesn't continue searching other categories for the same item ID.

**Fix**: Remove the `break` and continue scanning all categories.

---

### 19. `exitImpersonation` endpoint unthrottled

**File**: `apps/backend/src/auth/auth.controller.ts`

`POST /auth/impersonate/exit` has `@UseGuards(JwtAuthGuard)` but no `@Throttle`. All other super-admin endpoints throttled 3–10/min.

**Fix**: Add `@Throttle({ default: { limit: 10, ttl: 60000 } })`.

---

### 20. No DeepL circuit breaker for sustained outages

**File**: `apps/backend/src/translation/translation.service.ts`

`translateTexts` retries up to 5 times with exponential backoff per batch. During DeepL outage >60s, every public menu request blocks while retrying. No short-circuit or degraded mode.

**Fix**: Add global failure counter. After N consecutive failures, skip translation and return original text for a cooldown period.

---

### 21. CartContext `JSON.parse` on localStorage without schema validation

**File**: `apps/frontend/src/context/CartContext.tsx:58`

Corrupted or malicious localStorage passes partial schema mismatch silently. `typescript/security.md`: "validate all user input before processing." localStorage IS user-writable.

**Fix**: Add Zod schema validation on localStorage cart data deserialization.

---

### 22. `HomePage.tsx` demo preview hardcodes `selectedLang="bg"`

**File**: `apps/frontend/src/pages/HomePage.tsx:693–694`

```typescript
targetLanguages={["bg"]}
selectedLang="bg"
```

Live demo ignores visitor's browser language. May be intentional (primary market is Bulgaria) but limits international appeal.

**Fix**: Use `i18n.language` for demo language, or document as intentional.

---

## LOW (6 findings)

### 23. `translate-i18n.mjs` hardcodes `source_lang: 'EN'`

**File**: `scripts/translate-i18n.mjs:87`

DB source language is Bulgarian. Translating EN→target instead of BG→target may reduce translation quality for certain language pairs.

**Fix**: Use `source_lang: 'BG'` or detect from the source locale file.

---

### 24. No RTL `dir` attribute on CartDrawer/CheckoutPage

**Files**: `CartDrawer.tsx`, `CheckoutPage.tsx`

Arabic text renders LTR in cart/checkout UI. `PublicMenuPage.tsx:907` handles this correctly with `dir={RTL_LANGS.has(selectedLang) ? "rtl" : "ltr"}`.

**Fix**: Add `dir` attribute to CartDrawer portal root and CheckoutPage root element.

---

### 25. `translate-i18n.mjs` no network error retry

**File**: `scripts/translate-i18n.mjs:146`

Only handles HTTP 429/529 errors. DNS failure, connection refused, or timeout crashes the script with unhandled Promise rejection.

**Fix**: Wrap `fetch` in try-catch with exponential backoff for network-level errors.

---

### 26. TopBar language selector shows raw codes for 9 languages

**File**: `apps/frontend/src/components/menu/TopBar.tsx:6–8`

```typescript
const LANG_CODES: Record<string, string> = {
  en: "EN",
  bg: "BG",
  ro: "RO",
};
```

All other languages fall back to `code.toUpperCase()` → "DE", "ES", "ZH" instead of native names available via `t('language.' + code)` ("Deutsch", "Español", "中文").

**Fix**: Replace `LANG_CODES[code] ?? code.toUpperCase()` with `t('language.' + code)`.

---

### 27. FilterPanel has hardcoded allergen strings in 3 languages

**File**: `apps/frontend/src/components/menu/FilterPanel.tsx:36–40`

`knownAllergens` set includes EN/BG/RO allergen names only. If restaurant adds allergens in DE/FR/etc, they won't classify as allergens.

**Fix**: Make allergen classification data-driven from backend or extend the set.

---

### 28. Translation service spec mocks `setTimeout` globally

**File**: `apps/backend/src/translation/translation.service.spec.ts:178`

```typescript
jest.spyOn(global, "setTimeout").mockImplementation((fn: any) => {
  fn();
  return 0 as any;
});
```

Global `setTimeout` mock could interfere with other async operations if they depended on real timers.

**Fix**: Spy on service's `sleep` method instead, or use `jest.useFakeTimers()`.

---

## What's Good

- **Backend DeepL service** — retry logic with exponential backoff + jitter, Retry-After header honoring, dedup via `Set`, batch chunking at 50, per-language failure isolation. Well-implemented.
- **`menu-translation.service.ts`** — `applyLazyTranslations` has excellent partial-failure resilience. Failed language never discards already-successful ones. Phased approach: collect → batch translate → distribute → apply.
- **`lib/translation.ts`** utilities (`getTranslatedField`, `getTranslatedArray`) — well-designed with proper nullable handling, map-vs-array dual format support for backward compatibility.
- **`choice.name` mutation fix** (commit `944d9a63`) — correct removal of the overwrite with clear comment explaining why choice.name must remain the stable DB key.
- **RTL handling in PublicMenuPage** — `dir={RTL_LANGS.has(selectedLang) ? "rtl" : "ltr"}` correctly applied.
- **i18next lazy-loading** — `i18n.ts` uses `resourcesToBackend` with dynamic imports, reducing initial bundle from 135KB gzip combined to single-language on-demand.

---

## Recommended Fix Order (by impact)

1. Run `scripts/translate-i18n.mjs` for JA/RU/AR with full key set
2. Fix `flatten()` to preserve arrays, re-generate DE/ES/FR/IT/ZH/EL
3. Parse `?lang=` query parameter on PublicMenuPage initial load
4. Propagate `selectedLang` through session-flow checkout (fall back to `i18n.language`)
5. Extract duplicated `resolveItemName`/`resolveChoiceName` to `lib/translation.ts`
6. Fix French interpolation variable names (`{{début}}` → `{{start}}`)
7. Add `lang` parameter to `getTrendingItems` + `getMenuMeta` backend endpoints
8. Add `@IsIn(['info', 'warning', 'maintenance'])` to `announcementBannerType` DTO
9. Add RTL `dir` attribute to CartDrawer portal and CheckoutPage
10. Add `currency` field to `CartItem` interface
11. Add tests for impersonation + super-admin tenant ops
12. Add DeepL circuit breaker for sustained outages

---

## Files Reviewed

### Backend

- `apps/backend/src/translation/translation.service.ts` — DeepL API client
- `apps/backend/src/translation/translation.module.ts` — NestJS module
- `apps/backend/src/translation/translation.service.spec.ts` — unit tests
- `apps/backend/src/menu/menu-translation.service.ts` — lazy translation pipeline
- `apps/backend/src/menu/menu-crud.service.ts` — getTrendingItems, getMenuMeta
- `apps/backend/src/menu/public-menu.controller.ts` — public menu endpoints
- `apps/backend/src/auth/auth.controller.ts` — impersonation endpoints
- `apps/backend/src/super-admin/super-admin.service.ts` — tenant ops
- `apps/backend/src/platform-settings/dto/update-platform-settings.dto.ts` — DTO validation

### Frontend

- `apps/frontend/src/i18n.ts` — i18next configuration
- `apps/frontend/src/lib/translation.ts` — getTranslatedField, getTranslatedArray
- `apps/frontend/src/locales/*/translation.json` — all 12 locale files
- `apps/frontend/src/components/cart/CartDrawer.tsx` — resolveItemName, resolveChoiceName
- `apps/frontend/src/pages/CheckoutPage.tsx` — checkout translation pipeline
- `apps/frontend/src/pages/PublicMenuPage.tsx` — public menu lang handling
- `apps/frontend/src/components/menu/TopBar.tsx` — language selector
- `apps/frontend/src/components/menu/ItemWithOptions.tsx` — getChoiceLabel
- `apps/frontend/src/components/menu/TrendingCarousel.tsx` — trending items
- `apps/frontend/src/components/menu/CategoryPills.tsx` — category navigation
- `apps/frontend/src/components/menu/FilterPanel.tsx` — allergen filtering
- `apps/frontend/src/context/CartContext.tsx` — cart state
- `apps/frontend/src/context/OrderContext.tsx` — optimistic updates
- `apps/frontend/src/components/AnnouncementBanner.tsx` — announcement banner
- `apps/frontend/src/pages/HomePage.tsx` — landing page demo

### Scripts

- `scripts/translate-i18n.mjs` — DeepL batch translation script
- `scripts/patch-ja-ru-ar.mjs` — manual JA/RU/AR patch script

---

## Totals

```
CRITICAL: 7   HIGH: 7   MEDIUM: 8   LOW: 6   = 28 findings
```
