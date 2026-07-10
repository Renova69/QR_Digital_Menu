# Spec: Splitting `payment.service.ts`

**Status:** implementation plan only. Do not implement until explicitly asked.

**Verified against code on:** 2026-06-22

**Current baseline:**

- `apps/backend/src/payment/payment.service.ts` is 4721 physical lines.
- Phase 0 is already done: `payment-scope.utils.ts` contains pure scope/bill-scope algebra.
- Payment specs: 168 tests.
- Full backend unit suite: 879 tests.
- `PaymentService` is only injected by `PaymentController` and payment specs; other modules currently consume `StripeProvider` from `PaymentModule`.
- The graph report is useful for orientation, but this plan is based on direct code inspection of the payment service, providers, DTOs, Prisma schema, webhook setup, feature service, and events gateway.

## Goal

Turn `PaymentService` into a thin facade/orchestrator while keeping all public controller-facing method signatures stable. The refactor must be behavior-preserving and shippable one phase at a time.

Target after all phases:

- `payment.service.ts`: about 600-900 lines, mostly delegates plus any intentionally retained cron/orchestration.
- Extracted services: each focused and preferably below 800 lines.
- No circular DI and no `forwardRef`.
- No transaction split across service boundaries.
- Existing payment behavior remains covered by the current public `PaymentService` tests.

## Non-Negotiable Invariant

Never split a money transaction across service boundaries.

Money correctness depends on these staying in one database transaction when they are part of one logical claim/settlement:

- `PaymentProviderEvent` idempotency via `@@unique([provider, eventKey])`.
- The payment claim methods: `claimSuccessfulPayment*`.
- `paidQuantity` optimistic locks for item-level settlement.
- `PaymentAllocation` creation/deletion.
- Session `OPEN -> PAID` flips.
- Cash request `PENDING -> PAID/CANCELLED` handling when coupled to payment creation.

Rules:

- Any primitive that can run inside a transaction must accept `tx: Prisma.TransactionClient`.
- Such primitives must not call `this.prisma.$transaction(...)`.
- Outer methods may own a transaction, but must not call another method that opens a second transaction inside it.
- Socket/event emits stay after commit. If a transaction needs emit data, return it from the transaction and emit in the caller after commit.
- Provider callbacks/webhooks own their transaction locally, then call core primitives with `tx`.

Important current exception to fix during extraction:

- `createPendingPaymentAfterScopeGuard(...)` currently opens its own transaction.
- In `PaymentCoreService`, split it into two APIs:
  - `createPendingPaymentAfterScopeGuardTx(tx, sessionId, scope, data, options)` - no transaction opened.
  - `createPendingPaymentAfterScopeGuard(sessionId, scope, data, options)` - outer convenience wrapper that opens exactly one transaction and calls the `Tx` variant.
- Code already inside a transaction may only call the `Tx` variant.

## Safety Net

Current payment tests instantiate `PaymentService` manually and call public methods. No payment spec currently reaches into `PaymentService` private methods via `(service as any).privateMethod`.

During the split:

- Keep every public `PaymentService` method signature unchanged.
- Keep controller entrypoints unchanged until the final optional phase.
- Test assertions and scenarios should remain mostly unchanged.
- Test setup will need constructor/mock updates as `PaymentService` becomes a facade that injects sub-services instead of low-level dependencies directly.
- Add focused specs for extracted services only when useful. They are not a replacement for the existing facade-level payment specs.

Required gates after every phase:

```bash
cd apps/backend
npx tsc --noEmit --pretty false
npm test -- --runInBand --runTestsByPath src/payment/payment.service.spec.ts src/payment/payment.behavior-proof.spec.ts src/payment/stripe.provider.spec.ts src/payment/epay.provider.spec.ts src/payment/mypos.provider.spec.ts src/payment/borica.provider.spec.ts src/payment/dto/payment-history-query.dto.spec.ts
npm test -- --runInBand
```

Stop and re-evaluate on any behavior failure, type failure, DI cycle, or unexpected diff outside the planned files.

## Target Structure

```text
payment/
  payment.module.ts
  payment.controller.ts
  payment.service.ts
  payment-scope.utils.ts
  payment-provider-config.service.ts

  core/
    payment-core.service.ts

  reporting/
    payment-reporting.service.ts

  providers/
    stripe-checkout.service.ts
    epay-checkout.service.ts
    mypos-checkout.service.ts
    borica-checkout.service.ts

  session/
    payment-session.service.ts
    payment-settlement.service.ts
```

Dependency direction:

```text
PrismaService / EventsGateway / FeatureService / provider clients
  -> PaymentCoreService
  -> PaymentProviderConfigService
  -> provider/session/settlement/reporting services
  -> PaymentService facade
  -> PaymentController
```

More explicitly:

- `PaymentCoreService` may inject `PrismaService`, `EventsGateway`, and `FeatureService`.
- `PaymentProviderConfigService` may inject `FeatureService`; it must not inject Prisma or provider checkout services.
- Provider checkout services may inject Prisma, core, config, their provider client, and events only when direct emit helpers are not centralized in core.
- Session/settlement services may inject Prisma, core, config, and `StripeProvider` only for cancelling pending Stripe PaymentIntents during abandonment.
- Reporting may inject Prisma and core.
- `PaymentService` injects only extracted payment services and delegates.
- Do not make extracted services inject `PaymentService`.

## Phase 0 - Already Done: Pure Scope Algebra

Already extracted:

- `normalizeCheckoutScope`
- `getCheckoutScopeKey`
- `getCheckoutScopeFromPayload`
- `paymentScopeMatches`
- `checkoutScopePayload`
- `billScopeFromCheckoutScope`
- `billScopeFromCashRequest`
- `billScopeFromPayment`
- `normalizeScopeOrderIds`
- `billScopesEqual`
- `billScopesOverlap`
- `paymentBillScopeEquals`

Keep this file pure: no Prisma, no Nest injection, no events, no process state beyond deterministic hashing.

## Phase A - Provider Config Service

Risk: low.

Create `payment-provider-config.service.ts` as an injectable `PaymentProviderConfigService`.

Move verbatim:

- `isStripeConfigured`
- `isEpayConfigured`
- `isBoricaConfigured`
- `isMyposConfigured`
- `resolveBoricaKeypair`
- `resolveMyposConfig`
- `resolveBoricaCardholder`
- `getFrontendBaseUrl`
- `buildPublicMenuReturnUrl`
- `createEpayInvoice`
- `getEpayExpirationDate`

Important details:

- This is not completely pure. It depends on `FeatureService.restaurantHasFeature(...)` for provider availability checks.
- It imports `decryptSecret` as a free function.
- It reads provider sandbox env vars.
- It should not inject Prisma.
- Move crypto/key logic verbatim. No behavior edits.

Update callers from `this.isEpayConfigured(...)` etc. to `this.providerConfig.isEpayConfigured(...)`.

Verify:

- `npx tsc --noEmit --pretty false`
- Payment provider specs.
- Full payment spec set.
- Full backend suite.

## Phase B - Core Foundation Helpers

Risk: medium.

Create `core/payment-core.service.ts` and move non-transactional helpers plus access/mapping helpers first. This unlocks reporting extraction without duplicating access checks.

Move verbatim:

- `roundMoney`
- `paymentStatusLabel`
- `mapPayment`
- `verifyRestaurantAccess`
- `verifyPosOperatorAccess`
- `verifyRestaurantStaffAccess`
- `verifyCashPaymentOperatorAccess`
- `isUniqueConstraintError`
- `buildStripeCheckoutKey`
- `normalizeTipPercent`
- `calculateTotals`
- `calculatePartialTotals`
- `getCashPaymentRequestScopeKey`
- `billScopeToPayload`
- `formatCashPaymentRequest`
- `formatPendingPayment`
- `formatPendingCashRequest`
- `getOrderItemUnitPrice`
- `mergeProviderPayload`

Notes:

- `PaymentCoreService` injects Prisma, EventsGateway, and FeatureService.
- Keep role differences exactly as-is: `verifyPosOperatorAccess` excludes `STAFF`, while `verifyCashPaymentOperatorAccess` allows `STAFF`.
- Do not change mapped response shapes.
- Do not change rounding behavior.

Verify:

- Full payment spec set.
- Full backend suite.

## Phase C - Reporting Service

Risk: low-medium.

Create `reporting/payment-reporting.service.ts`.

Move:

- `getTableSessions`
- `getPaymentHistory`
- `exportPayments`
- `getPaymentsOverview`
- `getPaymentDetail`
- `getPayoutsSnapshot`
- `getPaymentSettings`

Dependencies:

- Inject Prisma and `PaymentCoreService`.
- Use `core.verifyRestaurantAccess(...)`.
- Use `core.mapPayment(...)`.
- Keep `getPayoutsSnapshot` and `getPaymentsOverview` in the same reporting service so `getPayoutsSnapshot` can call the local overview method without facade recursion.

Do not move:

- `refundPayment` yet. It is a provider write plus money state mutation.

Facade:

- `PaymentService` delegates these methods to `PaymentReportingService`.

Verify:

- Payment history/reporting specs in `payment.service.spec.ts`.
- Full payment spec set.
- Full backend suite.

## Phase D - Core Transaction Primitives

Risk: medium-high.

Extend `PaymentCoreService` with all shared transaction-sensitive primitives.

Move or create:

- `computeSessionBalance(tx, sessionId)`
- `assertNoPendingBillScopeConflict(tx, sessionId, candidateScope, options)`
- `createPendingPaymentAfterScopeGuardTx(tx, sessionId, scope, data, options)`
- `createPendingPaymentAfterScopeGuard(sessionId, scope, data, options)`
- `getPendingBillPayment(sessionId)`
- `resolveCheckoutCharge(tx, session, tipPercent, platformFeePercent, scopeInput)`
- `isPaymentClaimable`
- `claimSuccessfulPaymentForOpenSession(tx, payment, data)`
- `claimSuccessfulPayment(tx, payment, data)`
- `claimSuccessfulScopedCheckoutPayment(tx, payment, data, checkoutScope)`
- `recordProviderEvent(tx, provider, eventKey, data)`
- `lockOpenSessionForSettlement(tx, sessionId)`
- `lockPendingCashPaymentRequest(tx, requestId)`
- `emitPendingBillPayment`
- `emitBillPaymentCleared`
- `emitCashPaymentRequestEvent`
- `emitPaymentConfirmed`
- `emitPaymentClaimEvents`

Rules for this phase:

- Every existing transaction must remain one transaction.
- Provider webhook tx blocks keep `recordProviderEvent(...)` and `claimSuccessfulPayment(...)` together.
- POS/cash settlement tx blocks keep locks, payment writes, allocation writes, and session flips together.
- No socket emit should move inside a transaction.
- The convenience `createPendingPaymentAfterScopeGuard(...)` may open a transaction only when called by outer checkout paths that are not already in a transaction.

Verify:

- Full payment spec set.
- Full backend suite.
- Manually inspect every `$transaction` call after the move and confirm no nested transaction call is reachable inside it.

## Phase E - Provider Checkout and Webhook Services

Risk: medium.

Create provider services:

- `providers/stripe-checkout.service.ts`
- `providers/epay-checkout.service.ts`
- `providers/mypos-checkout.service.ts`
- `providers/borica-checkout.service.ts`

Move:

### StripeCheckoutService

- `createPaymentIntent`
- `handleWebhookEvent`
- `refundPayment`

Dependencies:

- Prisma
- `StripeProvider`
- `PaymentCoreService`
- `PaymentProviderConfigService` only if needed for shared URLs later

Important:

- Stripe webhook raw-body handling stays in `main.ts` and `payment.controller.ts`.
- Do not change `PaymentController.handleWebhook(...)`.
- Keep `constructWebhookEvent(payload, signature)` in `StripeProvider`.
- Keep refund optimistic claim/rollback behavior exactly as-is.

### EpayCheckoutService

- `createEpayCheckout`
- `handleEpayNotification`
- `applyEpayNotification`

Dependencies:

- Prisma
- `EpayProvider`
- `PaymentCoreService`
- `PaymentProviderConfigService`

### MyposCheckoutService

- `createMyposCheckout`
- `handleMyposNotification`

Dependencies:

- Prisma
- `MyposProvider`
- `PaymentCoreService`
- `PaymentProviderConfigService`

### BoricaCheckoutService

- `createBoricaCheckout`
- `handleBoricaCallback`
- `markBoricaStatusUnknown`
- `isBoricaNonFinalStatus`

Dependencies:

- Prisma
- `BoricaProvider`
- `PaymentCoreService`
- `PaymentProviderConfigService`

Provider phase rules:

- `PaymentService.createCheckout(...)` remains the dispatcher.
- Reuse current provider response shapes exactly.
- Preserve provider pending TTL logic.
- Preserve BORICA TRTYPE=90 recovery/status-unknown behavior.
- Preserve ePay/myPOS/BORICA notification text responses exactly.
- Provider callbacks must record idempotency and claim payment in one tx via core.
- Event emits happen after transaction commit.

Verify:

- Individual provider specs:
  - `stripe.provider.spec.ts`
  - `epay.provider.spec.ts`
  - `mypos.provider.spec.ts`
  - `borica.provider.spec.ts`
- Full payment spec set.
- Full backend suite.

## Phase F - Session Service

Risk: medium.

Create `session/payment-session.service.ts`.

Move:

- `getOrCreateSession`
- `getSessionBill`
- `abandonCheckout`
- `abandonCheckoutOrThrowIfPending`
- `closeSession`
- `closeSessionWithCard`
- `closeSessionWithCash`
- `closeSessionWithProvider`
- `forceOpenSession`

Dependencies:

- Prisma
- `PaymentCoreService`
- `PaymentProviderConfigService`
- `StripeProvider` for `cancelPaymentIntent(...)` during abandonment

Important:

- `abandonCheckout` is provider-coupled today because it cancels Stripe PaymentIntents. Do not hide that dependency.
- `closeSessionWithProvider` must keep bill computation, payment creation, and session flip in one transaction.
- `forceOpenSession` must keep old-session close and new-session create in one transaction.
- Emits remain after commit.
- `cleanupAbandonedPaymentsAndStaleSessions` may stay on `PaymentService` until final cleanup, or move here. If moved, ensure exactly one `@Cron` registration exists.

Verify:

- Session, close, force-open, and abandonment tests in `payment.service.spec.ts`.
- Full payment spec set.
- Full backend suite.

## Phase G - Settlement Service

Risk: medium.

Create `session/payment-settlement.service.ts`.

Move:

- `settlePartial`
- `createCashPaymentRequest`
- `listCashPaymentRequests`
- `confirmCashPaymentRequest`
- `cancelCashPaymentRequest`

Dependencies:

- Prisma
- `PaymentCoreService`
- `PaymentSessionService` only if calling `abandonCheckoutOrThrowIfPending`; if this creates a cycle, extract abandonment into a tiny helper service or inject `StripeProvider` directly and keep dependency direction acyclic.

Preferred dependency rule:

- Avoid `PaymentSessionService <-> PaymentSettlementService` mutual injection.
- If both need abandonment logic, move abandonment into a small `PaymentAbandonmentService`, or keep abandonment in core/session with one-way dependency only.

Transaction rules:

- `createCashPaymentRequest` keeps lock + scope conflict check + create/update request in one transaction.
- `confirmCashPaymentRequest` keeps request lock + open-session lock + payment creation + item allocation + session paid flip + request update in one transaction.
- `settlePartial` keeps open-session lock + payment creation + item optimistic locks + allocations + paid flip in one transaction.

Verify:

- Cash request tests.
- `settlePartial` split-bill tests.
- Behavior-proof specs.
- Full payment spec set.
- Full backend suite.

## Final Phase - Slim Facade

After all extracted services are stable:

- `PaymentService` should contain only public methods called by `PaymentController`, each delegating to the relevant service.
- Keep `cleanupAbandonedPaymentsAndStaleSessions` on either facade or session service, not both.
- Keep `PaymentController` unchanged unless intentionally doing a larger final cleanup.

Optional later cleanup:

- Inject sub-services directly into `PaymentController` and delete the facade. This is a larger API-wiring diff and should not be part of the safety-first split unless explicitly requested.

## Module Wiring

`PaymentModule` should provide:

- `PaymentService`
- `PaymentCoreService`
- `PaymentProviderConfigService`
- `PaymentReportingService`
- provider checkout services
- session/settlement services
- existing provider clients: `StripeProvider`, `EpayProvider`, `BoricaProvider`, `MyposProvider`

Exports:

- Keep exporting `StripeProvider`, because `RestaurantsService` currently imports it through `PaymentModule`.
- Do not export internal extracted services unless another module truly needs them.

## Verification Checklist Per Phase

Before code changes:

- Confirm current branch and dirty files.
- Note any unrelated user changes and do not revert them.

After each phase:

- `npx tsc --noEmit --pretty false`
- Full payment spec set: 168 tests.
- Full backend suite: 879 tests.
- `git diff --stat`
- Inspect `$transaction` call sites.
- Inspect `PaymentModule` providers for accidental cycles.
- Confirm socket emits still happen after commit.

After code changes:

- Run `graphify update .` as required by repo instructions.

## Known Risks and Controls

| Risk                               | Impact   | Control                                                                                                    |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| Nested or split transaction        | Critical | Use tx-accepting core primitives; split `createPendingPaymentAfterScopeGuard` into tx and wrapper variants |
| Provider webhook idempotency drift | Critical | Keep `recordProviderEvent` and payment claim in the same tx                                                |
| POS double-collect race            | Critical | Preserve abandonment-before-POS-mutation checks and open-session locks                                     |
| Item split double-pay              | Critical | Preserve `paidQuantity` optimistic locks and allocation writes in the same tx                              |
| Circular DI                        | High     | One-way dependencies only; no service injects `PaymentService`; no `forwardRef`                            |
| Test setup churn                   | Medium   | Keep public method assertions; update constructor/mocks deliberately                                       |
| Config behavior drift              | Medium   | Move provider config verbatim; inject `FeatureService`; do not rewrite crypto                              |
| Event emitted before rollback      | Medium   | Emit only after transaction returns successfully                                                           |
| Reporting access regression        | Medium   | Use `PaymentCoreService.verifyRestaurantAccess`; do not duplicate access checks                            |
| Facade removal too early           | Medium   | Keep facade until final optional cleanup                                                                   |

## Implementation Order

Recommended order:

1. Phase A - provider config service.
2. Phase B - core foundation helpers.
3. Phase C - reporting service.
4. Phase D - core transaction primitives.
5. Phase E - provider checkout/webhook services.
6. Phase F - session service.
7. Phase G - settlement service.
8. Final facade cleanup.

Each phase should be a separate commit or PR-equivalent checkpoint with green verification before continuing.
