# Code Review: Analytics suite (9 features) + Daily Target UI

**Reviewed**: 2026-06-21
**Branch**: feat/split-bill-pos
**Decision**: APPROVE — all findings resolved
**Committed in**: `172dfc10` (finalize bill payment locks and daily targets),
`f034213c` (harden profitability and customer metrics), + a follow-up test commit.

## Summary

Nine analytics features (menu profitability, staff performance, customer insights,
kitchen efficiency, cancel analysis, table turnover, daily closeout, gross profit,
daily target) with `costPrice` plumbing. Engine, tier gating, XLSX export,
AnalyticsView rendering, tri-lingual i18n, and the Daily Target dashboard UI all
verified. Every finding from the initial review and the follow-up "noted items"
pass has been fixed.

## Findings — all resolved

### CRITICAL

- **[FIXED] Migration column-name mismatch** — migration created `cost_price`, but
  Prisma field `costPrice` has no `@map` (model is camelCase). A fresh prod
  `migrate deploy` would have created the wrong column → menu CRUD + profitability
  break. Migration now `ADD COLUMN ... "costPrice"`. Live DB confirmed `costPrice`.

### MEDIUM

- **[FIXED] Compute-then-discard** — `getAnalytics(..., includePremium)` now skips the
  7 premium metrics for non-FULL tiers instead of computing then stripping.
  Covered by new `getAnalytics premium gating` spec.
- **[FIXED] DailyTargetCard silent save failure** — added `onError` inline message.
- **[FIXED] `getCustomerMetrics` unbounded `findMany`** — rewritten as SQL
  `GROUP BY customerPhone` (one row per customer, not per order). Verified on live DB.

### LOW

- **[FIXED] Cost input missing `min="0"`** — added to Create/Edit item forms.
- **[FIXED] Closeout `netRevenue` tip-inflated** — `net = collected − tips − refunded`
  (confirmed `payment.amount` includes tip via the dedup check `amount ≈ subtotal+tip`).
- **[FIXED] Gross profit tip-inflated** — revenue base now `collected − tips`; tile +
  export relabeled "Net Sales".
- **[FIXED] Profitability shows fake 100% margins with no costs** — panel gates on
  `summary.totalCost === 0` and shows a "set costs" hint instead of the matrix.
- **[FIXED] Churn counted top-20 only** — now computed across all customers; CLV is a
  true global mean.
- **[FIXED] "RevPASH" mislabeled (no seat data)** — relabeled "Revenue / Hr".
- **[FIXED] Kitchen prep skewed by stale orders** — capped at `MAX_PREP_MINUTES = 180`.

## Validation

| Check                     | Result                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Backend full suite (jest) | 877 pass (+2 gating tests → dashboard spec 24)             |
| Backend type-check        | Pass                                                       |
| Frontend type-check       | Pass                                                       |
| Frontend suite (vitest)   | 102 pass (+6 new render tests)                             |
| Lint (changed files)      | Clean                                                      |
| Live-DB query checks      | Pass (customer GROUP BY, kitchen cap, gross/tip aggregate) |
| i18n parity en/bg/ro      | Pass                                                       |

## Tests added

- `dashboard.service.spec.ts` — getAnalytics premium-tier gating (keys present at FULL,
  omitted + uncomputed below FULL).
- `MenuProfitabilityPanel.test.tsx` — cost-gate render (hint vs matrix).
- `DailyTargetCard.test.tsx` — progress render, set-goal CTA, save, save-error.

## Known limitations (by design, not bugs)

- Kitchen prep time is estimated from `createdAt → updatedAt` (no `completedAt`
  column); capped to drop stale outliers.
- `estimatedTurnsPerDay` assumes 24h operation.
