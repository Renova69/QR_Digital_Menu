# Code Review: audit-phase2 merge — 56-finding security/correctness audit

**Reviewed**: 2026-06-11  
**Merge commit**: 2a346d9e  
**Branch**: fix/audit-phase2 → main  
**Decision**: WARNING (5 HIGH, 6 MEDIUM, 5 LOW — 0 CRITICAL)

---

## Summary

Overall the audit fixes are sound and well-structured. No security vulnerabilities introduced. Two HIGH findings deserve attention before next deploy: (1) ItemWithOptions choice translation regression risk if TanStack Query cache keys are not lang-aware, (2) duplicate AdminAuditLog entries possible on concurrent cron pod runs for subscription downgrade.

---

## Findings

### CRITICAL
None.

### HIGH

**`apps/frontend/src/components/menu/ItemWithOptions.tsx:426`**  
Choice names never translated if menu fetched without `?lang=` param and cached.  
The `getTranslatedArray` removal is safe when the public menu always includes `?lang=`. If TanStack Query cache key does not include `currentLang`, a prior no-lang fetch can be served with untranslated choices. Verify all `useQuery` keys for public menu data include the active language.

**`apps/backend/src/subscription/subscription.service.ts:501-517 / 543-558`**  
`updateMany` inside `$transaction` lacks `tier: { not: 'FREE' }` guard — concurrent cron pods write duplicate `AdminAuditLog` entries for same downgrade event.  
The outer `findMany` filters `tier: { not: FREE }` but the transaction `updateMany` does not re-apply this filter. Two simultaneous cron firings on separate pods both read the same IDs, both execute `$transaction`, both write audit logs. The `updateMany` is idempotent (FREE→FREE is no-op) but the audit creates are not.  
Fix: add `tier: { not: 'FREE' as any }` to `updateMany.where` inside both transactions.

**`apps/backend/src/loyalty/loyalty.service.ts:321-376`**  
`getExpiryReminderCandidates` preview path missing `!account.user?.email` guard.  
Send path has `if (batches.length === 0 || !account.user?.email) continue`. Preview path has `if (batches.length === 0) continue` but no email guard — returns candidates with `user.email = null`.  
Fix: add `|| !account.user?.email` to the preview path continue condition.

**`apps/backend/Dockerfile:48`**  
`prisma migrate deploy` in CMD has no timeout — DB cold-start latency can block container start indefinitely.  
With Neon serverless, a cold-start + migration can exceed Cloud Run startup probe timeout. The `&&` chain prevents app start if migration fails, but a hung connection will block forever.  
Fix: consider `timeout 120 node_modules/.bin/prisma migrate deploy || exit 1` or extend Cloud Run startup probe failure threshold.

**`apps/backend/src/dashboard/dashboard.service.ts:86`**  
`sweepCache()` called synchronously on every `getAnalytics` invocation — couples cache maintenance to the hot path.  
At ANALYTICS_CACHE_MAX=100 this is O(100) per request. Low impact but unnecessary coupling.  
Fix: move to periodic `setInterval` in `OnModuleInit` (same pattern as `sweepConnectAttempts`).

### MEDIUM

**`apps/backend/prisma/migrations/20260611000000_schema_safety_constraints/migration.sql:37-48`**  
De-dup CTE does not check for collision with pre-existing `"Table N (M)"`-style names before adding UNIQUE constraint.  
If a restaurant already has `"Table 1 (2)"` and two rows named `"Table 1"`, the CTE renames the second to `"Table 1 (2)"` which collides with the pre-existing entry, causing migration failure.  
Already applied to prod DB — verify no such names exist. Add note to migration file.

**`apps/backend/src/loyalty/loyalty.service.ts:317`**  
`RESEND_API_KEY` / `RESEND_FROM_EMAIL` read from `process.env` directly, not ConfigService.  
Missing values silently produce `undefined`; `'noreply@yourdomain.com'` fallback will be rejected by Resend at runtime.  
Fix: inject ConfigService and validate at module init.

**`apps/backend/src/tables/tables.service.ts:121-128`**  
P2002 from Prisma not caught in `bulkCreate` — raw constraint error leaks to client.  
The UNIQUE constraint is the real safety net, but the error is not user-friendly.  
Fix: catch `P2002` and throw `ConflictException`.

**`apps/backend/src/menu/menu-translation.service.ts:52-65`**  
Items with old array-format allergens re-translate on every menu load until edited.  
Every page load for old-format items fires DeepL requests unnecessarily.  
Fix: add a one-time cron/endpoint to convert old array translations to map format.

**`apps/backend/src/users-data/retention.service.ts:24-27`**  
Change is correct — `expiresAt` is non-nullable in schema, so `expiresAt < now` is semantically equivalent to old cutoff calculation. No issue, verified.

**`apps/backend/src/menu-import/menu-import.service.ts:278-284`**  
`deleteMany` then `create` within the same `$transaction` context — atomic if tx is passed correctly.  
Confirm all `tx.menuOption.deleteMany` / `tx.menuOption.create` calls use the transaction client `tx`, not `this.prisma`. Verified in diff — correct.

### LOW

**`apps/backend/src/subscription/subscription.service.ts:501-517`**  
Array-form `$transaction` safe for Neon PgBouncer. Note only.

**`apps/frontend/src/pages/PublicMenuPage.tsx:116-123`**  
`localStorage` for `cartRestaurantId` now cross-tab — tab isolation lost.  
Old `sessionStorage` was intentionally tab-scoped. Opening restaurant B in tab 2 can clear restaurant A's cart context for tab 1 on reload. Assess UX intent.

**`apps/frontend/src/App.tsx:172`**  
Inner `<SuperAdminRoute>` wraps on child routes are redundant — outer layout route already gates.  
Not a security issue. Remove inner wrappers for clarity.

**`apps/printer-agent/src/services/printer.ts:39`**  
`client.on('error', done)` signature change is functionally correct — `done()` now handles `clearTimeout` internally. Verified safe.

**`deploy.ps1`**  
`--session-affinity` is best-effort cookie routing, not guaranteed sticky sessions. In-memory state (analyticsCache, wsConnectAttempts, refreshing flag) remains per-instance. Document this.

---

## Validation Results

| Check | Result |
|-------|--------|
| Type check | Not run (no `tsc --noEmit` script) |
| Lint | Not run |
| Tests | ✅ 772 passing (run during implementation) |
| Build | Not run post-merge |
| Migration | ✅ Applied to Neon DB |
| Prisma generate | ✅ Client regenerated |

---

## Files Reviewed

| File | Type |
|------|------|
| apps/backend/Dockerfile | Modified |
| apps/backend/prisma/migrations/20260611000000_schema_safety_constraints/migration.sql | Added |
| apps/backend/prisma/schema.prisma | Modified |
| apps/backend/src/dashboard/dashboard.service.ts | Modified |
| apps/backend/src/events/events.gateway.ts | Modified |
| apps/backend/src/loyalty/loyalty.service.ts | Modified |
| apps/backend/src/menu-import/menu-import.service.ts | Modified |
| apps/backend/src/menu/menu-translation.service.ts | Modified |
| apps/backend/src/payment/payment.controller.ts | Modified |
| apps/backend/src/payment/payment.service.spec.ts | Modified |
| apps/backend/src/restaurants/restaurants.service.ts | Modified |
| apps/backend/src/subscription/subscription.service.ts | Modified |
| apps/backend/src/tables/tables.service.ts | Modified |
| apps/backend/src/users-data/retention.service.ts | Modified |
| apps/backend/src/users/users.service.ts | Modified |
| apps/frontend/src/App.tsx | Modified |
| apps/frontend/src/components/menu/ItemWithOptions.tsx | Modified |
| apps/frontend/src/pages/PublicMenuPage.tsx | Modified |
| apps/frontend/src/pages/super-admin/TenantDetailPage.tsx | Modified |
| apps/printer-agent/index.js | Modified |
| apps/printer-agent/src/services/printer.ts | Modified |
| deploy.ps1 | Modified |

## Priority fixes

1. `subscription.service.ts` — add `tier: { not: 'FREE' }` to both `updateMany` where clauses in `$transaction` (prevents duplicate audit logs)
2. `ItemWithOptions.tsx` — verify all public menu `useQuery` keys include `currentLang` (prevents silent translation regression)
3. `loyalty.service.ts` — add `|| !account.user?.email` guard to preview path
