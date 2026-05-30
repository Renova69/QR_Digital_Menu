# Code Review: Commits e3e3487 + cb79681

**Reviewed**: 2026-05-24  
**Commits**: e3e3487 (purple/violet redesign + dashboard analytics fixes), cb79681 (operations redesign + payment hardening)  
**Decision**: REQUEST CHANGES — 2 HIGH, several MEDIUM issues before these are safe in production

---

## Summary

Two large commits touching ~100 files. The architecture is sound and the feature direction (payment overview, refund flow, KPI redesign, table search) is correct. Primary concerns: a TOCTOU race in the refund path that can double-refund a payment, a role-authorization gap on the refund endpoint that lets waiters issue refunds, and a misleading KPI label. All others are medium/low polish.

---

## Findings

### CRITICAL
None.

---

### HIGH

#### 1. Race condition — double refund possible (no DB-level guard)
**File**: `apps/backend/src/payment/payment.service.ts` ~766  
**Problem**: `refundPayment` reads `payment.status === 'SUCCEEDED'`, then calls `this.stripe.createRefund(...)`, then does `prisma.payment.update({ data: { status: 'REFUNDED' } })`. Two concurrent requests for the same `paymentId` pass the status check simultaneously, both hit Stripe, and Stripe creates two refunds.  
**Fix**: Wrap inside `$transaction` with an atomic status update that fails if the row is already REFUNDED:
```typescript
await this.prisma.$transaction(async (tx) => {
  const locked = await tx.payment.update({
    where: { id: paymentId, status: 'SUCCEEDED' },  // atomic guard
    data: { status: 'REFUNDING' },  // intermediate state
  });
  if (!locked) throw new BadRequestException('Only succeeded payments can be refunded');
  // ... stripe call ...
  await tx.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
});
```
Alternatively add `status: 'SUCCEEDED'` to the `where` of the final update and check `count === 0` as a conflict.

---

#### 2. Waiters can issue refunds — role not checked
**File**: `apps/backend/src/payment/payment.service.ts` ~51–59  
**Problem**: `verifyRestaurantAccess` grants access to any user whose `restaurantId === restaurantId`, regardless of role. This includes WAITER. The refund endpoint has no additional role guard. Waiters should not be able to initiate financial reversals.  
**Fix**: Add explicit role check inside `verifyRestaurantAccess`, or add a `RolesGuard` on the `POST :paymentId/refund` route. Minimum: `MANAGER` or `OWNER` required for refund actions.

---

### MEDIUM

#### 3. `createRefund` missing from `IPaymentProvider` interface
**File**: `apps/backend/src/payment/payment-provider.interface.ts`  
**Problem**: `StripeProvider.createRefund()` exists and is called via `this.stripe.createRefund()`. The field is typed as `StripeProvider` (concrete class) not the `IPaymentProvider` interface, so the interface contract is bypassed. Future providers (MyPOS, Square) will silently skip refund support unless the interface is updated.  
**Fix**: Add `createRefund(params): Promise<{refundId: string; status: string|null}>` to `IPaymentProvider`.

---

#### 4. Non-Stripe payments silently skipped on refund
**File**: `apps/backend/src/payment/payment.service.ts` ~776  
**Problem**: `if (payment.provider === 'STRIPE')` — MYPOS and CASH payments skip the Stripe call but are still marked `REFUNDED` in DB. MYPOS card terminal refunds require a separate reversal. This is a business-logic error: marking a MYPOS payment REFUNDED without actually reversing the charge misleads operators.  
**Fix**: Either throw `BadRequestException('MYPOS refunds must be processed at the terminal')`, or add a MYPOS refund path when that API is available. Add a comment explaining the CASH behavior is intentional (cash refunds are manual).

---

#### 5. Unvalidated date strings passed to `new Date()` — potential NaN dates in queries
**Files**: `apps/backend/src/payment/payment.service.ts` ~556–561, `apps/backend/src/dashboard/dashboard.service.ts` ~379–385  
**Problem**: `startDate`/`endDate` are raw `@Query()` strings — no `@IsDateString()` DTO validation. `new Date('garbage')` returns `Invalid Date`; Prisma will pass `NaN` timestamps to Postgres, which either errors or returns 0 rows silently. `OrderQueryDto` correctly added `@IsDateString()`, but the dashboard controller and payment controller params are bare strings.  
**Fix**: Create a `DateRangeQueryDto` with `@IsOptional() @IsDateString() startDate` / `endDate` and use it on all date-accepting endpoints. Already done correctly in `OrderQueryDto` — replicate pattern.

---

#### 6. `getNewCustomers` counts "unique phones that ordered in period", not truly new customers
**File**: `apps/backend/src/dashboard/dashboard.service.ts` ~364  
**Problem**: The metric counts distinct `customerPhone` values for orders in the date window. A returning customer who orders again in that window is counted. The label "New Customers" is misleading to restaurant owners. Comparing this value against the previous period also inflates the change percent.  
**Fix**: Either rename the KPI to "Active Customers" (frontend `KpiRow.tsx:41` label `"New Customers"` → `"Active Customers"`), or change the query to find phones whose *first* order for this restaurant falls in the window.

---

#### 7. "QR Scans" KPI just duplicates Total Orders
**File**: `apps/frontend/src/pages/Dashboard/summary/KpiRow.tsx` ~40–44  
**Problem**: `value: data.totalOrders.toLocaleString('en-US')` — QR Scans shows the same number as Total Orders. This is confusing and wastes a KPI slot.  
**Fix**: Remove the card until actual scan-tracking is implemented, or replace with a useful metric (pending orders, tables occupied, etc.).

---

#### 8. `window.confirm()` used for refund confirmation — not i18n-safe, no a11y
**File**: `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` ~481  
**Problem**: Native `window.confirm` is synchronous, blocks the main thread, not styled, and not translatable. Fails in environments where native dialogs are suppressed.  
**Fix**: Use an in-component confirmation modal (pattern already exists: `LoginDialog`, `modal.tsx`, etc.) with proper i18n text.

---

#### 9. `reason` field on `RefundPaymentDto` has no `@MaxLength`
**File**: `apps/backend/src/payment/dto/refund-payment.dto.ts` ~12  
**Problem**: `@IsString()` with no length limit. Attacker can send an arbitrary-length reason string. Stripe metadata values are limited to 500 chars; exceeding this will cause Stripe SDK to throw.  
**Fix**: Add `@MaxLength(500)` (matches Stripe metadata limit).

---

#### 10. `period: 0 as DateRangePreset` type cast is a type lie
**File**: `apps/frontend/src/hooks/useSummaryDateRange.ts` ~33  
**Problem**: `DateRangePreset` is `7 | 14 | 30`, but `setCustomRange` forces `0 as DateRangePreset`. The workaround in `api.ts:158` (`period: (startDate && endDate) ? 30 : period`) papers over the NaN/0 sent to backend when custom range is active. Brittle — if `api.ts` send logic changes, `period=0` reaches the backend which uses it as `setDate(date - 0)` = today, silently returning wrong data.  
**Fix**: Extend type to `type DateRangePreset = 7 | 14 | 30 | 'custom'` and handle branching explicitly. Or keep `period` as a number but use a separate `mode: 'preset' | 'custom'` field.

---

#### 11. Refund mutation uses hardcoded reason string
**File**: `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` ~220  
**Problem**: `reason: 'Dashboard refund'` hardcoded. This ends up in Stripe dashboard metadata and is meaningless for reconciliation.  
**Fix**: Either drop the reason entirely (let operator enter it later), or surface a simple text input in the confirmation flow.

---

### LOW

- `apps/backend/src/payment/payment.service.ts:70` — `mapPayment(payment: any)` should be typed against the Prisma `Payment` model. Minor but contributes to drift.  
- `apps/backend/src/payment/payment.service.ts` is 817 lines — over 800-line limit. `getPaymentDetail`, `getPaymentsOverview`, `getPayoutsSnapshot`, `getPaymentSettings`, and `refundPayment` could be extracted to a `PaymentQueryService` and `PaymentMutationService`.  
- `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` is 885 lines — over 800-line limit. `PaymentDrawer`, `MetricCard`, `PayoutsPanel`, `SettingsPanel` should be extracted to `components/payments/`.  
- `apps/backend/src/dashboard/dashboard.service.ts` adds `getPaymentsSummary` — this duplicates some of what `PaymentService.getPaymentsOverview` does. Consider delegating to `PaymentService` rather than querying `payment` table directly from `DashboardService` (breaks separation of concerns).  
- `apps/frontend/src/pages/Dashboard/summary/KpiRow.tsx:41` — `DollarSign` icon for revenue. Fine, but the "Revenue" label with a USD icon is inconsistent with the EUR currency shown everywhere else. Consider `TrendingUp` or the `€` character.

---

## Validation Results

| Check | Result |
|---|---|
| Type check (tsc) | Skipped (not run — no build system change) |
| Lint | Skipped |
| Backend tests | New specs cover `getPaymentsOverview`, `getPaymentDetail`, `refundPayment`. Race condition not tested. |
| Frontend tests | No new tests for PaymentsView, SummaryView, or new hooks |

---

## Files Reviewed (critical path)

| File | Type |
|---|---|
| `apps/backend/src/payment/payment.service.ts` | Modified — new refund, overview, detail, access-check methods |
| `apps/backend/src/payment/payment.controller.ts` | Modified — 5 new routes |
| `apps/backend/src/payment/payment-provider.interface.ts` | Not modified — interface gap |
| `apps/backend/src/payment/stripe.provider.ts` | Modified — `createRefund` added |
| `apps/backend/src/payment/dto/refund-payment.dto.ts` | Added |
| `apps/backend/src/payment/payment.service.spec.ts` | Modified — new test coverage |
| `apps/backend/src/dashboard/dashboard.service.ts` | Modified — `getNewCustomers`, `getPaymentsSummary`, comparison metrics |
| `apps/backend/src/dashboard/dashboard.controller.ts` | Modified — `payments-summary` endpoint |
| `apps/backend/src/orders/dto/order-query.dto.ts` | Modified — `@IsDateString` on date params |
| `apps/backend/src/orders/orders.service.ts` | Modified — date filter added |
| `apps/backend/src/loyalty/loyalty.service.ts` | Modified — `repeatRate`, `topMember` |
| `apps/backend/src/tables/tables.service.ts` | Modified — duplicate name check, item price |
| `apps/backend/src/tables/tables.service.spec.ts` | Modified — conflict + item price tests |
| `apps/frontend/src/pages/Dashboard/PaymentsView.tsx` | Modified — full rewrite (167→885 lines) |
| `apps/frontend/src/pages/Dashboard/SummaryView.tsx` | Modified — full rewrite |
| `apps/frontend/src/pages/Dashboard/LiveTablesView.tsx` | Modified — search, stats bar |
| `apps/frontend/src/pages/Dashboard/OperationsView.tsx` | Modified — badge style |
| `apps/frontend/src/pages/Dashboard/AssistanceView.tsx` | Modified — filter, urgency styling |
| `apps/frontend/src/hooks/useAnalytics.ts` | Modified — `enabled` param, `newCustomers` type |
| `apps/frontend/src/hooks/usePaymentSummary.ts` | Added |
| `apps/frontend/src/hooks/useSummaryDateRange.ts` | Added |
| `apps/frontend/src/lib/api.ts` | Modified — 7 new payment API functions |
| `apps/frontend/src/components/dashboard/KpiCard.tsx` | Added |
| `apps/frontend/src/pages/Dashboard/summary/*.tsx` | Added (7 files) |
