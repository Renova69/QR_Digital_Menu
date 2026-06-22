# Local Review: branch `feat/split-bill-pos` (full source diff vs `main`)

**Reviewed**: 2026-06-22
**Branch**: feat/split-bill-pos → main (40 commits ahead)
**Scope**: All source changes vs main. Excluded generated artifacts (`graphify-out/`, `i18n-keys-*.txt`, `.log`, `.playwright-mcp/`, review/research `.md`).
**Decision**: APPROVE with comments

## Summary

Split-bill POS, public scoped/cash payments, MyPOS provider, and an analytics
hardening pass. The money-critical core is genuinely well-built: ownership
checks, optimistic locking, idempotent webhooks, post-commit event emission, and
balance clamping are all present and correct. No CRITICAL or HIGH _functional_
issues found. The main debt is maintainability (oversized files) and some
type/DTO-validation erosion at new endpoint boundaries.

## Findings

### CRITICAL

None.

### HIGH

- **`apps/backend/src/payment/payment.service.ts` is 4770 lines** (project rule:
  800 max). It's the single source of truth for 4 providers + sessions + split +
  cash + webhooks, so cohesion is real, but it's now a god file that's hard to
  review and risky to change. Recommend extracting per-concern modules
  (e.g. `cash-payment.service.ts`, `split-settlement.service.ts`,
  provider-notification handlers) behind the existing `IPaymentProvider` seam.
  No functional risk — flagged as maintainability per code-review.md severity.

### MEDIUM

- **New public endpoints use inline/untyped bodies instead of validated DTOs.**
  `PaymentController.createCashPaymentRequest` takes
  `@Body() body: { restaurantId: string; orderIds?: string[] }` and
  `createCheckout` takes an inline body type — no `class-validator` decorators
  at the boundary. Risk is contained (restaurantId is re-checked against the
  session via `findFirst({ token, restaurantId, status: 'OPEN' })`, and
  `orderIds` are validated server-side in `resolveCheckoutCharge` against
  `tableSessionId` with a count-match guard), but per coding-style this input
  should go through a DTO. `settle-partial.dto.ts` is the right model to follow.
- **`AnalyticsView.tsx` is 1840 lines** — over the 800 guideline; candidate for
  splitting into panel components (the branch already started this with
  `analytics/Panel.tsx` + `MenuProfitabilityPanel.tsx`).
- **37 new `as any` casts** across changed source. Many are pragmatic Prisma
  JSON casts (`as Prisma.InputJsonValue`, `providerPayload as any`), but the
  count is worth a sweep — prefer typed payloads where the shape is known.

### LOW

- **`verifyCashPaymentOperatorAccess` allows `STAFF`** to confirm/cancel cash
  requests, while `verifyPosOperatorAccess` deliberately excludes `STAFF`/`KITCHEN`
  from session force/close. Likely intentional (cash collection is a cashier
  action) but the role models now diverge — confirm it's deliberate and document
  the rationale alongside the existing `verifyPosOperatorAccess` comment.
- **`api.ts` diff is dominated by prettier quote churn** (`'` → `"`), mixing
  format-only changes with the real CSRF-retry logic. Keep formatting-only
  changes in separate commits so logic diffs stay reviewable.
- **MyPOS `buildSignedPayload` depends on incoming field order** matching myPOS's
  signing order (it concatenates `Object.entries` values in received order).
  Spec-covered and matches provider behavior, but fragile if the provider
  reorders fields. Note for future debugging.
- **Analytics `take: 50000`** order-scan cap is bounded but large for big tenants
  over long ranges; fine for now.

## What was verified as correct (highlights)

- **Migrations** — all idempotent (`IF NOT EXISTS`, `DO $$` constraint guards),
  sensible FK cascades, `costPrice` correctly camelCase (prior bug fixed),
  print-agent token now stored as SHA-256 hash with raw token dropped (real
  security win), order-time price snapshot backfill.
- **`settlePartial`** — POS-operator gated, abandons pending online payments
  first (prevents over-collection), per-unit optimistic locks on `paidQuantity`,
  clamps to remaining balance, blocks item-split under loyalty discount, session
  flip guarded on `status='OPEN'`, events emitted post-commit.
- **Cash-request lifecycle** — public create bound by `token+restaurantId+OPEN`
  (no cross-tenant injection), feature-gated, dedup by scopeKey; confirm/cancel
  both call `verifyCashPaymentOperatorAccess`.
- **MyPOS webhook** — RSA-SHA256 signature verified, fails closed on empty sig,
  full reconciliation (amount/currency/store/order), idempotent via
  `recordProviderEvent` unique key.
- **Public scoped checkout** — `resolveCheckoutCharge` validates `orderIds`
  against the session (count match) and against outstanding balance; client
  `publicOrderOwnership.ts` is a best-effort UX hint only, not a security boundary.
- **CSRF retry** — single bounded retry via `_csrfRetry` flag, state-changing
  methods only, force-refreshes token. No loop risk.
- **Analytics** — Luxon tz-aware boundaries, `includePremium` tier-gating with
  cache-key separation, revenue uses `unitPriceWithOptions` snapshot,
  SERVED→COMPLETED fulfillment KPI, prep-time outlier guard.

## Validation Results

| Check                                             | Result                            |
| ------------------------------------------------- | --------------------------------- |
| Type check                                        | Skipped (full-branch tsc not run) |
| Lint                                              | Skipped                           |
| Tests (payment: service + mypos + behavior-proof) | Pass — 125/125                    |
| Tests (dashboard: service + views + controller)   | Pass — 37/37                      |
| Build                                             | Skipped                           |

Full suite not run (110 changed source files across 2 apps); validation focused
on the money-critical + analytics code actually reviewed.

## Files Reviewed (deep)

- prisma/migrations/\* (7 new) + manual drop-index, schema.prisma (spot)
- payment.service.ts (settlePartial, cash-request lifecycle, createCheckout,
  resolveCheckoutCharge, handleMyposNotification, access helpers)
- payment.controller.ts, dto/settle-partial.dto.ts, mypos.provider.ts
- dashboard.service.ts (analytics correctness)
- frontend: lib/api.ts (CSRF), lib/publicOrderOwnership.ts

Remaining ~90 files (tests, i18n JSON, POS UI components, frontend panels)
reviewed by diff sweep only — no console.log/debugger, no new TODO/FIXME.
