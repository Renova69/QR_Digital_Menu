# Fix Plan — Analytics & Loyalty Audit Findings (verified 2026-07-17/18)

Source: independent verification of automated audit findings C-6, H-9, H-10, C-7, H-22, H-23
against `apps/backend/src/dashboard/dashboard.service.ts` and `apps/backend/src/loyalty/loyalty.service.ts`
at HEAD `982a9024`. Every claim below was re-derived from the actual file contents, the Prisma
migration SQL, and existing spec files — not taken on the audit's word.

## Verdict summary

| ID   | Verdict                               | Action                                                              |
| ---- | ------------------------------------- | ------------------------------------------------------------------- |
| C-6  | **REFUTED**                           | No code fix. Add a clarifying comment only (see "Do Not Fix").      |
| H-9  | CONFIRMED (per-method breakdown only) | Fix — Tier 2                                                        |
| H-10 | CONFIRMED                             | Fix — Tier 1                                                        |
| C-7  | **REFUTED**                           | No code fix. Remove/update stale docstring only (see "Do Not Fix"). |
| H-22 | CONFIRMED                             | Fix — Tier 1                                                        |
| H-23 | CONFIRMED                             | Fix — Tier 2                                                        |

Fix order below is by blast radius (money-visible numbers first, then unbounded-query hardening),
not by the audit's original severity labels.

---

## Do Not Fix (close these out, doc-only follow-up)

### C-6 — "double AT TIME ZONE" in dashboard.service.ts:353,433,1058,1164

**Why the audit is wrong:** it assumed `customer_order."createdAt"` is `timestamptz`. It is actually
`TIMESTAMP(3)` **without** time zone (confirmed in `apps/backend/prisma/migrations/0_baseline/migration.sql:239`,
no `@db.Timestamptz` override in `schema.prisma`). Prisma always writes/reads `DateTime` values as UTC,
so the naive column holds UTC wall-clock digits. Given that, `(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE tz)`
is the **correct** two-step conversion (naive-UTC → timestamptz → local wall clock), not a double-shift.
Applying the audit's proposed single-step fix (`"createdAt" AT TIME ZONE tz`) would instead introduce a
real bug, because that single step, run against a naive column, treats the UTC-valued naive timestamp as
if it were already local time.

This is also already covered by a named regression test —
`dashboard.service.spec.ts:343` _"converts stored UTC timestamps to restaurant local time in aggregate SQL"_ —
and a prior-bug-fix comment at `dashboard.service.ts:772-773` referencing "Issue 46" for the identical
pattern on the materialized-view path. Do not touch the SQL.

**Action item (optional, low priority):** add a one-line comment above each of the 4 raw-SQL blocks
(`getRevenueTrend` :353, `getPeakHours` :433, `getKitchenEfficiency` :1058, `getCancelAnalytics` :1164),
mirroring the one already at :772:

```sql
-- "createdAt" is TIMESTAMP(3) WITHOUT TIME ZONE but Prisma always stores it as UTC wall-clock
-- digits. The double AT TIME ZONE is required: 'UTC' tags it as an absolute instant, then ${tz}
-- converts that instant to local wall clock. Do NOT collapse to a single AT TIME ZONE — see Issue 46.
```

This is purely to stop a future human or automated audit from "fixing" it into a regression.
No test changes required (the existing spec assertion already locks the pattern in place).

### C-7 — "expiry reminder cron marks sent without sending" in loyalty.service.ts:545

**Why the audit is wrong:** line 545 is inside the function's docstring comment
(`* Plug in an email or push service in the TODO block below.`), which is stale. The actual
implementation at `runDailyExpiryReminders()` (loyalty.service.ts:548-670) really does call the
Resend API (`fetch('https://api.resend.com/emails', ...)`) and — per the inline comment
`// Send first; only mark sent on confirmed delivery (Issue 14)` — only calls `markRemindersSent(...)`
after `res.ok` is confirmed. Production has `RESEND_API_KEY` configured (per project memory:
OTP email auth already runs on this same Resend integration). The sibling manual path
`notifyExpiryReminders()` (loyalty.service.ts:319-422) has the identical dispatch-then-mark pattern.

**Action item (doc-only):** update/delete the stale docstring at loyalty.service.ts:542-546. Replace:

```ts
/**
 * Daily cron — finds all restaurants with loyalty enabled, marks expiry
 * reminder batches as sent, and logs candidates for email/push delivery.
 * Plug in an email or push service in the TODO block below.
 */
```

with something that reflects reality, e.g.:

```ts
/**
 * Daily cron — finds all restaurants with loyalty enabled, sends expiry
 * reminder emails via Resend (falls back to a [DEV] log line when
 * RESEND_API_KEY is unset), and marks a batch as reminded only after a
 * confirmed successful send (Issue 14).
 */
```

No functional change, no new tests needed.

---

## Tier 1 — Fix now (revenue-visible correctness + unbounded owner-facing query)

### H-10 — Revenue KPIs include PENDING_PAYMENT (abandoned online checkouts)

**Files:** `apps/backend/src/dashboard/dashboard.service.ts`

- `getSummary()` — line 83
- `getPeriodStats()` — line 476

**Root cause:** `PENDING_PAYMENT` is set at order creation when `paymentPreference === 'ONLINE'`
(`orders.service.ts:1041-1044`) with the full `totalPrice` already recorded, before the customer has
actually paid. The team already recognized this exact "abandoned checkout" semantic and excluded
`PENDING_PAYMENT` from the `completionRate` denominator (`dashboard.service.ts:251-269`, test
`dashboard.service.spec.ts:464` "Bug 2a") — but never applied the same exclusion to revenue.

**Fix:**

`getSummary()` (line 79-85):

```ts
// before
const totalRevenueResult = await this.prisma.order.aggregate({
  _sum: { totalPrice: true },
  where: {
    restaurantId,
    status: { not: OrderStatus.CANCELED },
  },
});

// after
const totalRevenueResult = await this.prisma.order.aggregate({
  _sum: { totalPrice: true },
  where: {
    restaurantId,
    status: { notIn: [OrderStatus.CANCELED, OrderStatus.PENDING_PAYMENT] },
  },
});
```

`getPeriodStats()` (line 470-479):

```ts
// before
const result = await this.prisma.order.aggregate({
  _sum: { totalPrice: true },
  _count: true,
  _avg: { totalPrice: true },
  where: {
    restaurantId,
    status: { not: OrderStatus.CANCELED },
    createdAt: { gte: start, lte: end },
  },
});

// after
const result = await this.prisma.order.aggregate({
  _sum: { totalPrice: true },
  _count: true,
  _avg: { totalPrice: true },
  where: {
    restaurantId,
    status: { notIn: [OrderStatus.CANCELED, OrderStatus.PENDING_PAYMENT] },
    createdAt: { gte: start, lte: end },
  },
});
```

**Do NOT touch:** lines 503/524 (`getCategoryBreakdown`'s SQL sibling, `getRepeatCustomerRate`) unless
a follow-up audit confirms the same issue there — out of scope for this plan, flag separately if needed.
`getPeriodStats` is also used to compute `previousPeriodStats` for the period-over-period `revenueChange`
comparison (dashboard.service.ts ~161-334) — verify that comparison delta still makes sense once both
current and previous periods consistently exclude PENDING_PAYMENT (it will — same filter both sides).

**Tests to update/add** (`dashboard.service.spec.ts`):

1. New test: `getSummary` — mock an order aggregate scenario with mixed COMPLETED + PENDING_PAYMENT +
   CANCELED orders, assert the Prisma `where` clause passed to `order.aggregate` has
   `status: { notIn: [CANCELED, PENDING_PAYMENT] }` (mirror the existing "Bug 2a" assertion style).
2. New test: `getPeriodStats` (via `getAnalytics`) — same assertion, plus a numeric check that
   `totalRevenue`/`avgOrderValue` in the returned analytics object excludes a PENDING_PAYMENT order's
   `totalPrice` from the sum/average.
3. Grep the existing suite for any test currently asserting `status: { not: OrderStatus.CANCELED }`
   on these two call sites and update the expected `where` shape — do not leave stale assertions green
   by accident (they would currently mask this exact regression class).

**Risk:** low. Purely an additional exclusion on an already-scoped `where`; no schema/migration change.
Restaurants with heavy online-checkout abandonment will see `totalRevenue`/`ordersToday` **decrease**
after this ships — that is the intended, correct behavior, but call it out if there's a customer-facing
changelog/release note process, since an owner might otherwise report "revenue dropped" post-deploy.

---

### H-22 — Unbounded `loyaltyAccount.findMany` in owner-triggered reminder endpoints

**File:** `apps/backend/src/loyalty/loyalty.service.ts`

- `notifyExpiryReminders()` — lines 334-339
- `getExpiryReminderCandidates()` — lines 437-442

**Root cause:** both load every loyalty account for a restaurant with `points > 0` in one unbounded
`findMany`, with a `user` include. The cron variant `runDailyExpiryReminders()` (568-656) already solves
this correctly with `take: EXPIRY_BATCH_SIZE` (50) + cursor (`cursor: { id: cursor }, skip: 1`) in a
`do...while` loop (comment-tagged "Issue 13") — reuse that exact shape.

**Fix — `notifyExpiryReminders()`:** wrap the single `findMany` (334-339) plus its processing loop
(347-419) in the same cursor-pagination shape as the cron. Concretely: hoist the existing per-account
loop body into the `do...while(cursor)` structure, replacing:

```ts
const accounts = await this.prisma.loyaltyAccount.findMany({
  where: { restaurantId, points: { gt: 0 } },
  include: {
    user: { select: { id: true, email: true, name: true } },
  },
});
```

with:

```ts
let cursor: string | undefined;
const notified: any[] = [];
do {
  const accounts = await this.prisma.loyaltyAccount.findMany({
    take: EXPIRY_BATCH_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { id: "asc" },
    where: { restaurantId, points: { gt: 0 } },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  for (const account of accounts) {
    // ...existing per-account body unchanged, pushing into `notified`...
  }

  cursor =
    accounts.length === EXPIRY_BATCH_SIZE ? accounts.at(-1)!.id : undefined;
} while (cursor);

return notified;
```

**Fix — `getExpiryReminderCandidates()`:** identical restructuring around lines 437-442 and the loop
at 448-473, accumulating into `candidates` across pages instead of `notified`.

**Tests to add** (`loyalty.service.spec.ts`):

1. `notifyExpiryReminders` — mock `loyaltyAccount.findMany` to return `EXPIRY_BATCH_SIZE` accounts on
   page 1 and a partial page on page 2; assert `findMany` is called twice with the correct
   `cursor`/`skip` on the second call, and that `notified` contains entries from both pages.
2. `getExpiryReminderCandidates` — same pagination assertion for `candidates`.
3. Regression guard: assert neither function ever calls `findMany` without a `take` (can be a single
   shared assertion helper if the spec file already has one for the cron test).

**Risk:** low-medium. These are `POST`/`GET :restaurantId/expiry-reminders*` endpoints, JWT +
`FeatureGuard(LOYALTY)`, owner-scoped by `restaurantId` — reachable but not public. Existing behavior
(return everything in one shot) is preserved in aggregate; only the query shape changes to bounded
pages. No response-shape change for callers (`loyaltyController` returns the full accumulated array
either way), so no frontend changes required.

---

## Tier 2 — Fix soon (lower blast radius, still real)

### H-9 — `paymentsByMethod` breakdown doesn't net refunds (per-method only)

**File:** `apps/backend/src/dashboard/dashboard.service.ts`, `getPaymentTotals()` lines 573-608.
Same unaddressed pattern also exists in the sibling `getPaymentsSummary()` (lines 610-662,
`byMethod` at 644-651/657-660) — include both in this fix, they share the root cause.

**Root cause:** the top-level `collectedRevenue`/`refundedAmount` split is intentional (frontend nets
them: `analyticsExport.ts:269` `netCollected = collectedRevenue - refundedAmount`). But
`paymentsByMethod` has no analogous per-method refund figure, so `sum(paymentsByMethod.amount)` does
not equal `netCollected` whenever a specific payment method had refunds — that method's row is
overstated by its refunded amount.

**Fix:** extend `getRefundTotals()` (lines 536-571) — or add a sibling `getRefundTotalsByMethod()` —
to group the same `successful_refunds` CTE by `p.provider`, then subtract per-method refunds when
building `paymentsByMethod`:

```ts
// new helper, modeled on getRefundTotals but grouped by provider
private async getRefundTotalsByMethod(restaurantId: string, start: Date, end: Date) {
  type Row = { provider: string; salesAmount: number };
  const rows = await this.prisma.$queryRaw<Row[]>`
    WITH successful_refunds AS (
      SELECT ra.id AS "refundKey", ra.amount, p."tipAmount", p.provider
      FROM refund_attempt ra
      JOIN payment p ON p.id = ra."paymentId"
      WHERE ra."restaurantId" = ${restaurantId}
        AND ra.status = 'SUCCEEDED'
        AND ra."updatedAt" >= ${start}
        AND ra."updatedAt" <= ${end}

      UNION ALL

      SELECT p.id AS "refundKey", p.amount, p."tipAmount", p.provider
      FROM payment p
      WHERE p."restaurantId" = ${restaurantId}
        AND p.status = 'REFUNDED'
        AND p."updatedAt" >= ${start}
        AND p."updatedAt" <= ${end}
        AND NOT EXISTS (
          SELECT 1 FROM refund_attempt ra
          WHERE ra."paymentId" = p.id AND ra.status = 'SUCCEEDED'
        )
    )
    SELECT provider,
           COALESCE(SUM(GREATEST(amount - "tipAmount", 0)), 0)::float AS "salesAmount"
    FROM successful_refunds
    GROUP BY provider
  `;
  return new Map(rows.map((r) => [r.provider, Math.round(Number(r.salesAmount) * 100) / 100]));
}
```

Then in `getPaymentTotals()`, fetch it alongside the existing `Promise.all` and subtract per method:

```ts
const [collected, refunded, byMethod, refundedByMethod] = await Promise.all([
  /* existing collected/refunded/byMethod ... */
  this.getRefundTotalsByMethod(restaurantId, start, end),
]);
// ...
paymentsByMethod: byMethod
  .map((m) => ({
    method: m.provider,
    amount:
      Math.round(
        (((m._sum.amount ?? 0) - (m._sum.tipAmount ?? 0)) -
          (refundedByMethod.get(m.provider) ?? 0)) * 100,
      ) / 100,
  }))
  .sort((a, b) => b.amount - a.amount),
```

Apply the equivalent change to `getPaymentsSummary()`'s `byMethod` block (644-651/657-660).

**Tests to add** (`dashboard.service.spec.ts`):

1. `getPaymentTotals` — scenario with STRIPE having a REFUNDED payment and MYPOS having none; assert
   `paymentsByMethod` for STRIPE is net of the refund and `sum(paymentsByMethod) === collectedRevenue - refundedAmount`
   (this equality check is the actual regression guard — it wasn't true before the fix).
2. Same for `getPaymentsSummary`.
3. Edge case: refund on a payment whose provider differs in casing/enum vs. the `collected` groupBy key
   — make sure the `Map` lookup key matches exactly what `payment.groupBy({ by: ['provider'] })` returns.

**Risk:** low-medium. Additive query (one more `$queryRaw` in an existing `Promise.all`, same tables/
indexes as `getRefundTotals`). Changes displayed numbers for any restaurant with a refund on a specific
payment method — the total (`collectedRevenue`, `refundedAmount`) is unaffected, only the per-method
split shifts down for methods with refunds. Frontend (`AnalyticsView.tsx`, `analyticsExport.ts`) needs
no code change since it already just renders `paymentsByMethod` as given.

---

### H-23 — Unbounded `order.findMany` in loyalty `getHistory()`

**File:** `apps/backend/src/loyalty/loyalty.service.ts:301-312`
**Endpoint:** `GET /loyalty/orders/history` (`loyalty.controller.ts:26-29`, JWT-guarded, customer-facing
— `CustomerProfilePage.tsx`).

**Fix:** add pagination. Minimal version (cap + newest-first, already has `orderBy`):

```ts
// before
async getHistory(userId: string) {
  return this.prisma.order.findMany({
    where: { customerId: userId },
    include: {
      restaurant: { select: { name: true, logoUrl: true } },
      items: {
        include: { menuItem: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// after
private static readonly HISTORY_PAGE_SIZE = 50;

async getHistory(userId: string, cursor?: string) {
  const orders = await this.prisma.order.findMany({
    where: { customerId: userId },
    take: LoyaltyService.HISTORY_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      restaurant: { select: { name: true, logoUrl: true } },
      items: {
        include: { menuItem: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = orders.length > LoyaltyService.HISTORY_PAGE_SIZE;
  const page = hasMore ? orders.slice(0, -1) : orders;
  return { orders: page, nextCursor: hasMore ? page.at(-1)!.id : null };
}
```

`loyalty.controller.ts:26-29` needs a `@Query('cursor') cursor?: string` param passed through, and the
frontend `CustomerProfilePage.tsx` needs a "load more" / infinite-scroll affordance to actually use
`nextCursor` — otherwise this is a backend-only cap with no UI regression (page 1 always returns the
50 most recent orders, which covers the overwhelming majority of real users; only the multi-restaurant/
high-frequency-orderer edge case previously got everything in one response and now gets the first 50
until "load more" ships).

**Decide before implementing:** confirm with product/frontend owner whether this ships as (a) a real
paginated UI (cursor + "load more" button), or (b) just a hard cap with no cursor exposed yet (simpler,
faster to ship, defer full pagination UI to a follow-up). Given this is a "polish/bugs only" phase per
project memory, (b) — hard cap at `take: 50`, no response-shape change, no controller/frontend change —
is the lower-risk choice unless a customer has actually reported truncated history. Recommend shipping
(b) now, track (a) as a follow-up ticket.

**Tests to add** (`loyalty.service.spec.ts`):

1. Assert `getHistory` calls `order.findMany` with a `take` value present (regression guard against
   silently dropping the cap in a future edit).
2. If going with option (a): cursor round-trip test (page 1 → `nextCursor` → page 2 has no overlap).

**Risk:** low. Read-only endpoint, no money/state mutation. Only visible behavior change is history
depth for the small minority of users with 50+ lifetime orders.

---

## Suggested execution order

1. H-10 (revenue KPI fix) — small, isolated, highest visibility if wrong.
2. H-22 (cursor pagination for reminder endpoints) — copy-paste the cron's existing pattern, low risk.
3. H-9 (per-method refund netting) — slightly more SQL, needs the new equality-check test.
4. H-23 (getHistory cap) — decide (a) vs (b) with product first, then implement.
5. C-6 / C-7 doc-only comment updates — bundle into whichever of the above PRs touches those files, or
   a single small "docs" commit; zero functional risk either way.

## Verification commands (per CLAUDE.md)

```bash
cd apps/backend
npx jest src/dashboard/dashboard.service.spec.ts
npx jest src/dashboard/dashboard.controller.spec.ts
npx jest src/loyalty/loyalty.service.spec.ts
npm run lint
npm run build
```

Do not run the full analytics/loyalty regression as a single "big bang" commit — land H-10, H-22, H-9,
H-23 as separate PRs/commits so a bad number can be bisected quickly if a restaurant reports a revenue
discrepancy post-deploy.

---

## Addendum — Cross-report comparison (`17.07.REPORT.md` vs `17.07.FULLREPORT.md`)

**Status: recorded for future triage. Nothing below has been code-verified. Nothing below has been
fixed. Do not act on any item in this addendum until it goes through the same read-the-actual-code
verification pass the six items above got.**

Two independent automated audit runs exist in the repo root:

- `17.07.FULLREPORT.md` — 29 agents, 259 findings (46 CRIT / 47 HIGH / 87 MED / 79 LOW). Source of the
  C-6/H-9/H-10/C-7/H-22/H-23 items verified above.
- `17.07.REPORT.md` — 17 agents, ~110 findings (14 CRIT / 26 HIGH / 23 MED / ~15 LOW).

Compared the two on 2026-07-18. Headline result: of the 6 items already verified above, **2 of 6 (C-6,
C-7) turned out to be false positives** on direct code inspection. That is the operating assumption for
everything below — treat every row as "an automated audit claimed this," not as "this is true."

### Scope difference

`FULLREPORT.md` audits 9 subsystems `REPORT.md`'s 17 agents never touched at all: Print Station, Device
Enrollment, Migration Safety, Seed Safety, Frontend React Quality, Frontend Context State, NestJS
Architecture, Test Quality, Future-Break Risks. Findings in those subsystems have no counterpart in
`REPORT.md` and are out of scope for this addendum (already tracked in `FULLREPORT.md` itself).

### Confident overlaps between the two reports (same file/line, same bug) — with severity conflicts noted

| REPORT.md                                                                | FULLREPORT.md                                                 | Severity given (REPORT → FULLREPORT) |
| ------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------ |
| C1 Kitchen status silent catch (`KitchenPage.tsx:170`)                   | C-18 (`:168-170`)                                             | CRIT → CRIT                          |
| C9 `payment:refundRequired` no listener (`payment-core.service.ts:1391`) | C-16 (same line)                                              | CRIT → CRIT                          |
| C10/C11/C12 AR/JA/RU locale ~19% parity                                  | C-12 (same 3 locales)                                         | CRIT → CRIT                          |
| C14 loyalty `getHistory()` unbounded (`:301`)                            | H-23 (`:302`) — **verified CONFIRMED above**                  | CRIT → HIGH                          |
| H6 3 `ReservationsController` routes missing `@RequireFeature`           | H-28 (`:122,141,156`)                                         | HIGH → HIGH                          |
| H10 `collectedRevenue` includes REFUNDED (`:579`)                        | H-9 (`:576`) — **verified CONFIRMED (per-method only) above** | HIGH → HIGH                          |
| H14 reminder endpoints unbounded (`:334,437`)                            | H-22 (`:334-339,437-442`) — **verified CONFIRMED above**      | HIGH → HIGH                          |
| H18 only 2 ErrorBoundaries (`App.tsx:121`)                               | C-11 (same + `DashboardPage.tsx:665`)                         | HIGH → **CRIT**                      |
| H20 `MenuItem.weight` missing from create DTO                            | H-31                                                          | HIGH → HIGH                          |
| H26 RO 66 orphaned landing-page keys                                     | M-17 (same count)                                             | HIGH → **MEDIUM**                    |
| M1 CSRF token never rotated                                              | LG-38                                                         | MED → **LOW**                        |
| M5 3 cash-request endpoints lack FeatureGuard                            | H-37 / M-43 (`:265-291`)                                      | MED → HIGH                           |
| M7 Help-content create/update/delete not atomic                          | M-12                                                          | MED → MED                            |
| M12 `closeSessionWithProvider` no terminal verification                  | C-2                                                           | MED → **CRIT**                       |
| M19 Stripe refund lookup swallows DB errors (`:510,526`)                 | C-23 (`:508-526`)                                             | MED → **CRIT**                       |
| M20 Migration DO block no batch limit                                    | H-44                                                          | MED → HIGH                           |
| M23 119 vs 100 keys missing DE/ES/FR/IT/ZH                               | C-13                                                          | MED → **CRIT**                       |
| L2 OTP 10-min expiry                                                     | LG-40                                                         | LOW → LOW                            |
| L6 `startCooldown` setTimeout not cleaned up                             | H-38                                                          | LOW → **HIGH**                       |

Take-away if this ever gets triaged: several of the largest severity gaps (M12/C-2, M19/C-23, M23/C-13,
L6/H-38) are cases where one report calls something MEDIUM/LOW and the other calls the _same_ finding
CRITICAL/HIGH — that spread needs resolving with actual code reads before either rating is trusted.

### Direct contradiction (needs a read before either is trusted)

**REPORT.md H21** ("MenuItem/Category `imageUrl`/`thumbnailUrl` missing from create DTO" — rated HIGH,
"fix: add `@IsOptional() @IsUrl()` fields") directly contradicts **FULLREPORT.md LG-16/17/63/64** on the
exact same fields/DTOs, rated LOW and explicitly called "acceptable — uploaded separately via storage
controller." One of these two verdicts is wrong. Not yet checked which.

### Same area, different specific claim (not true duplicates — each would need separate verification)

- REPORT C6 (Borica `isPaymentClaimable` rejects FAILED) vs FULLREPORT H-1 (Borica non-final status never
  clears stale PENDING) — same Borica TRTYPE=90 recovery path, different specific defect.
- REPORT C8 (force-open race, table-row vs session-row lock) vs FULLREPORT C-8 (session lookup outside
  `$transaction`) — plausibly the _same_ underlying race described from two entry points; worth
  reconciling into one finding rather than fixing twice.
- REPORT H9 ("Revenue" KPI shows ordered, not collected — labeling/placement issue) — a third, distinct
  angle on `dashboard.service.ts` beyond the H-9 (per-method refund) and H-10 (PENDING_PAYMENT inclusion)
  already verified above. Same file, not a duplicate.
- REPORT H12 (`orders.service.ts:281` unscoped restaurant fetch) vs FULLREPORT H-24 (`:137`) — different
  line numbers in the same file; may be two separate call sites (public vs POS order creation), not
  confirmed.
- REPORT M22 (`GET /tables` leaks service-point records) vs FULLREPORT H-37/M-43 (tables CRUD lacks
  FeatureGuard broadly) — same controller, related but distinct specific claims.

### Findings that appear net-new in REPORT.md (grep-confirmed absent from FULLREPORT.md's 259 findings)

Not yet verified against actual source. Listed here purely so they aren't lost — **none of these have
been read against the codebase yet, unlike the C-6/H-9/H-10/C-7/H-22/H-23 items above.**

**Auth (notable — FULLREPORT.md rated the entire Auth Strategy subsystem PASS with only 1 MED/7 LOW; these three directly contradict that verdict and deserve first look if this addendum is ever picked up):**

- H1 — `exitImpersonation` bare `res.clearCookie('token')` without matching options (`auth.controller.ts:207`); same pattern claimed in `users-data.controller.ts:40`
- H2 — Bearer-token gate logic gap when `NODE_ENV` is unset (`jwt.strategy.ts:22`)
- M16 — OAuth `state` param parse swallows malformed input with empty catch (`auth.controller.ts:132`)

**Cron / silent-failure sites not covered by FULLREPORT.md's C-18→C-23 silent-failure list:**

- C2 — GDPR retention cron (`retention.service.ts:20-72`), 3 sequential Prisma ops, zero try/catch
- C3 — Reservation reminder sweep aborts mid-batch on first DB error (`reservation-reminder.service.ts:30-108`)
- C4 — WebSocket `evictUser`/`evictDeviceToken` uncaught errors — disable/suspend/revoke may silently not disconnect a live session (`events.gateway.ts:809-835`)
- H17 — `autoClosePaidSessions`, `enforceGraceExpiry`, `cleanupAbandonedPayments` crons — zero try/catch (`tables.service.ts:41-66`, `subscription.service.ts:553-606,614-653`, `payment-session.service.ts:39-142`)
- H16 — `CartContext.tsx` (7 sites: `:170,185,201,220,222,228,230`) localStorage writes without try/catch
- H19 — `ThemeContext.tsx:14` localStorage read without try/catch, runs at module-init time (crash-before-render risk)

**Payment-provider abstraction / interface gaps:**

- H3 — `IPaymentProvider.createRefund` interface missing `refundAttemptId` (`payment-provider.interface.ts:30-36`)
- H4 — `StripeCheckoutService` constructor-typed to concrete `StripeProvider`, not `IPaymentProvider` (`stripe-checkout.service.ts:42-48`)
- H5 — `confirmCheckoutSession` errors silently swallowed in onboarding — tier can end up wrong after a failed Stripe confirm (`OnboardingPage.tsx:131`)
- C7 (REPORT's own C7, unrelated to FULLREPORT's C-7) — `abandonCheckout` marks ePay/MyPOS/Borica PENDING payments ABANDONED without cancelling at the provider (`payment-session.service.ts:372`)
- C6 (REPORT's own C6, unrelated to FULLREPORT's C-6) — `isPaymentClaimable` rejects FAILED status, blocking Borica TRTYPE=90 recovery claim (`payment-core.service.ts:936`)

**Feature-gating gaps:**

- H7 — Assistance dashboard endpoints (list/resolve/delete) lack `@RequireFeature` (`assistance.controller.ts`)
- H8 — 5 feature flags (`KDS`, `RBAC`, `MULTILOCATION`, `STAFF_UNLIMITED`, `TEMPLATES_MENU`) have zero server-side enforcement (`feature-flag.enum.ts`, `feature.service.ts`)
- M6 — 4 `LoyaltyController` routes (`getLoyaltyAccounts`, `getHistory`, `enroll`, `getPoints`) lack `@RequireFeature(LOYALTY)` (`loyalty.controller.ts:20,26,72,78`) — **partially self-corroborated**: while verifying H-23 above I directly read `loyalty.controller.ts:26-29` and confirmed `getHistory` has only `@UseGuards(JwtAuthGuard)`, no FeatureGuard. The other 3 routes in this claim are not yet individually re-checked.

**DTO / API-contract gaps:**

- H22 — `ImportItemDto.currency` uses loose `@IsString()` instead of `@IsIn([Currency.EUR])` enum (`import-menu.dto.ts`)
- H23 — `ImportItemDto` missing `tags`, `upsellContexts` fields (`import-menu.dto.ts`)
- H24 — `CreateOrderDto` missing `tableName`, `clientPayloadHash`, `restaurantId` (`create-order.dto.ts`)

**Socket payload consistency:**

- M9 — `table:created` payload diverges: single-create emits `{ tableId }`, bulk-create emits `{ tableIds }` (`tables.service.ts:140,188`)
- M10 — `orderStatusChanged` has two different payload shapes across emit sites (`orders.service.ts:1525`, `events.gateway.ts:672`)

**POS / cart correctness:**

- M11 — `posOfflineOrders.ts:434-462` session-ID propagation loop skips orders past the 2nd in queue when patching `expectedTableSessionId` — **flag for priority re-check**: this is the same subsystem as the already-shipped "Jul 15/16 merge regression" POS offline-queue fixes (see project memory `project_jul15_merge_regression_remediation.md`), so this could be either a residual bug that slipped through that remediation or a stale finding from before it. Needs a diff against what actually shipped in `57d1dfaf` before treating as real.
- M13/M14 — Menu import/export `price` vs `priceModifier` field-name mismatch (`menu-import.service.ts:358-362,550`) — import silently defaults choice prices to 0 when following the internal schema name instead of the export's renamed field
- M15 — `PosContext.tsx:374-394` `getTotal()`/`getPendingTotal()` lack cent rounding (display-only artifact; server re-derives price so no billing impact claimed)

**Other:**

- C13 — `NotificationBell.tsx:33-41` hardcoded English `timeAgo()` strings, bypassing i18n
- H11 — `updateDataRequest` (GDPR) missing audit log + CONFIRM + `$transaction` (`super-admin.service.ts:1188-1211`) — FULLREPORT.md splits this same endpoint across its own H-30 (audit log) and M-11 (CONFIRM) but does not mention the missing `$transaction` wrapping; that specific detail is net-new
- M8 — `forceLogout`, `regenerateApiKey`, `forceCloseSession`, `impersonate` lack CONFIRM validation — impersonate flagged as highest-risk (grants full owner session) (`super-admin.controller.ts`)
- H25 — EN/BG/RO missing `language.*` section entirely — dropdown shows raw key paths for language names, not just missing translations (distinct from the already-tracked orphaned-key findings)
- M21 — No startup warning if `pgbouncer=true` missing from `DATABASE_URL` (`prisma.service.ts:19-27`) — distinct from FULLREPORT's C-14 (`relationMode = "prisma"` missing), same general PgBouncer-config-drift risk area

### Suggested next step (not started)

If/when this addendum gets picked up: verify the Auth-subsystem trio (H1/H2/M16) and the feature-gating
pair (H7/H8) first — those directly contradict FULLREPORT.md's "PASS" verdict on Auth Strategy, which is
exactly the kind of report-vs-report disagreement that was worth catching on C-6/C-7 above. Everything
else in this addendum is lower-priority triage fodder, not a queue to start fixing from.
