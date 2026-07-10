# Tier Enforcement Round 2 — Design Spec

**Date:** 2026-06-10
**Status:** Approved
**Scope:** Analytics basic/full split (the only remaining gap after audit)

---

## Context

Audit of 22 feature flags revealed most enforcement already implemented in prior rounds. Full codebase scan confirms 15 of 16 plan items (9.1–9.9) are already shipped:

- Backend: `ANALYTICS_BASIC/FULL` gated, `PAYMENTS_STRIPE` gated on payment + Stripe-connect routes, `CUSTOMERS_AUTH` service-layer check with `restaurantId` on OTP endpoints, `DAYPARTING` strip in `filterByAvailability`, `UPSELLING` gate in `getTrendingItems`, `getAllowedStaffRoles` + role-tier matrix in `UsersService`.
- Frontend: `canFullAnalytics`, `upsellEnabled`, `customersAuthEnabled`, `daypartingEnabled`, `canPos` (redirect), `canKds` (redirect), `allowedStaffRoles` role dropdown + `limitReached` invite guard all wired.

**One gap remains:** `AnalyticsView` blocks STARTER entirely with an early-return upgrade card. STARTER has `ANALYTICS_BASIC` and should see KPI cards + Revenue Trend. Only the deep-chart sections (Top Items, Peak Hours, Category Breakdown, Top Tables, Feedback) require `ANALYTICS_FULL` (PRO+).

---

## Changes

### Backend — 1 file, 1 line

**`apps/backend/src/dashboard/dashboard.controller.ts`**

Change the `GET /analytics` route guard from `ANALYTICS_FULL` to `ANALYTICS_BASIC`:

```diff
- @RequireFeature(FeatureFlag.ANALYTICS_FULL)
+ @RequireFeature(FeatureFlag.ANALYTICS_BASIC)
  @Get('analytics')
```

**Rationale:** STARTER+ can now fetch analytics data. FREE is still blocked (no `ANALYTICS_BASIC`). The frontend becomes the gate for the deep-chart sections via `canFullAnalytics`. No service-layer split needed — response shape is already complete.

---

### Frontend — 1 file, 4 changes

**`apps/frontend/src/pages/Dashboard/AnalyticsView.tsx`**

**Change 1 — Remove `canFullAnalytics` from `useAnalytics` enabled flag:**

```diff
  const { data, isLoading, error, insights } = useAnalytics(
    activeRestaurant?.id,
    dateRange.period,
    dateRange.startDate,
    dateRange.endDate,
-   canFullAnalytics,
  );
```

`feedbackSummary` query keeps `enabled: canFullAnalytics` — correct, PRO+ only.

**Change 2 — Remove early-return upgrade card block (lines 222–244):**

Delete the `if (!canFullAnalytics) { return <upgrade card> }` early return entirely.

**Change 3 — Insert inline upgrade card after Revenue Trend:**

```tsx
{
  !canFullAnalytics && (
    <div className="glass-panel p-6 rounded-lg border-primary/20 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Lock className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <p className="text-sm font-black uppercase tracking-widest text-foreground">
            {t("tierLocked.analyticsTitle", "Full Analytics locked")}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              "tierLocked.analyticsDesc",
              "Deep menu, table, demand, and guest analytics require Professional plan.",
            )}
          </p>
        </div>
      </div>
      <a
        href="/pricing"
        className="px-4 py-2 brand-cta text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap flex-shrink-0"
      >
        {t("tierLocked.upgrade", "Upgrade")}
      </a>
    </div>
  );
}
```

Reuses existing i18n keys — no new locale strings.

**Change 4 — Wrap deep sections in `{canFullAnalytics && ...}`:**

Sections to wrap:

- Top Items
- Peak Hours
- Category Breakdown
- Top Tables
- Feedback & Satisfaction

---

## Resulting render tree by tier

| Section            | FREE    | STARTER | PROFESSIONAL+ |
| ------------------ | ------- | ------- | ------------- |
| KPI cards          | ✗ (403) | ✓       | ✓             |
| Revenue Trend      | ✗ (403) | ✓       | ✓             |
| Upgrade card       | ✗       | ✓       | ✗             |
| Top Items          | ✗       | ✗       | ✓             |
| Peak Hours         | ✗       | ✗       | ✓             |
| Category Breakdown | ✗       | ✗       | ✓             |
| Top Tables         | ✗       | ✗       | ✓             |
| Feedback           | ✗       | ✗       | ✓             |

---

## Files to modify

| File                                                  | Change                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/backend/src/dashboard/dashboard.controller.ts`  | Line 73–74: `ANALYTICS_FULL` → `ANALYTICS_BASIC`                                     |
| `apps/frontend/src/pages/Dashboard/AnalyticsView.tsx` | Remove early-return block; fix enabled flag; insert upgrade card; wrap deep sections |

---

## Verification

**Backend:**

1. `cd apps/backend && npx tsc --noEmit` — clean
2. `npm test` — existing specs pass
3. Manual: STARTER hits `GET /api/v1/dashboard/analytics` → 200 (not 403)
4. Manual: FREE hits `GET /api/v1/dashboard/analytics` → 403

**Frontend:**

1. `cd apps/frontend && npx tsc --noEmit` — clean
2. `npm test` — Vitest green
3. Manual (STARTER): Analytics tab shows KPI cards + Revenue Trend + upgrade card; deep sections absent
4. Manual (PRO): Analytics tab shows all sections; no upgrade card
5. Manual (FREE): Analytics tab not visible (tab gated by `ANALYTICS_BASIC` entitlement)

---

## Out of scope

All other plan items (9.3–9.9) confirmed already implemented. No changes needed to payment gates, OTP auth, upselling, dayparting, KDS/POS route guards, RBAC role matrix, or staff limits.
