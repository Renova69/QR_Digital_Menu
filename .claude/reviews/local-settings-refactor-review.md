# Local Code Review — Settings Refactor + Happy Hour + websiteUrl/youtubeUrl

**Reviewed**: 2026-05-25
**Author**: QR Menu Dev
**Branch**: main (uncommitted changes)
**Decision**: REQUEST CHANGES — 1 HIGH (TS compile error), rest MEDIUM/LOW

## Summary

Solid refactor: self-contained tabs, typed context hook, per-restaurant rehydration, overnight day attribution, bounded selects, named constants. One real breakage: `timezone` is missing from `RestaurantContext.Restaurant`, which fails `tsc`. The two `Restaurant` interfaces (context vs service) drifting out of sync is the structural root cause.

---

## Findings

### CRITICAL

None.

### HIGH

**H1 — TypeScript compile error: `timezone` missing from `RestaurantContext.Restaurant`**

- File: `apps/frontend/src/context/RestaurantContext.tsx:6`
- Error: `GeneralSettingsTab.tsx:79: Property 'timezone' does not exist on type 'Restaurant'`
- Root cause: `restaurantService.ts` `Restaurant` has `timezone?: string` (line 15) but `RestaurantContext.tsx` `Restaurant` does not. `GeneralSettingsTab` now uses `useRestaurantContext()` (typed) so the cast-bypass is gone and TS catches it.
- Fix: Add `timezone?: string;` to `RestaurantContext.tsx` Restaurant interface after the `dashboardLanguage` field.

### MEDIUM

**M1 — `(restaurant as any).happyHourDays` in orders.service.ts:171**

- `happyHourDays` exists in schema + migration but Prisma client wasn't regenerated (EPERM during `db push`). Once backend is restarted and `npx prisma generate` runs clean, replace `(restaurant as any).happyHourDays` with the proper typed field.
- Not blocking — the runtime behavior is correct — but the cast silences type safety.

**M2 — `(menuMeta?.restaurant as any)?.websiteUrl` in PublicMenuPage.tsx:368,373,772,777**

- `menuMeta.restaurant` type doesn't include `websiteUrl` or `youtubeUrl`. Using `as any` works at runtime but bypasses type checking.
- Fix: Extend the menu-meta type (wherever it's defined) or cast only the new fields with a typed partial.

**M3 — Two out-of-sync `Restaurant` interfaces**

- `apps/frontend/src/context/RestaurantContext.tsx` and `apps/frontend/src/services/restaurantService.ts` both export a `Restaurant` interface. They're now structurally diverged (`timezone` in service, not context; `stripeSubscriptionId` in context, check if it's in service; etc.).
- Fix: Either re-export the service interface from the context, or merge into a single source.

**M4 — Inconsistent URL validation in create-restaurant.dto.ts**

- `websiteUrl` and `youtubeUrl` have `@IsUrl({ protocols: ['http','https'], require_protocol: true })` but `facebookUrl`, `instagramUrl`, `tiktokUrl` have no `@IsUrl()` at all.
- Fix: Either add `@IsUrl()` to the three existing social fields for consistency, or remove from the new fields to match. Either choice; pick one.

**M5 — `} as any` on Prisma select in menu-crud.service.ts:54,111**

- Pre-existing pattern, now extended for `websiteUrl`/`youtubeUrl`. Safe at runtime, but suppresses type inference on the select result.
- Fix: After Prisma regen, remove the `as any` and let the type flow through. (Low-priority since it's an existing pattern.)

### LOW

**L1 — `listDeviceEnrollments` has no `@RequireFeature()` decorator (restaurants.controller.ts:123)**

- The controller-level `@UseGuards(JwtAuthGuard)` protects auth, and `deviceEnrollment.verifyManagerAccess()` checks ownership. But if device enrollment is a paid feature, no tier gate is applied at the controller layer unlike the surrounding endpoints.
- Action: Confirm whether this feature is gated; add `@RequireFeature()` if so.

**L2 — Branding tab visible for non-free users regardless of `canBranding` (SettingsView.tsx:32)**

- Tab shows for `!isFree` (Starter+), content shows locked message when `!canBranding`. This is an intentional upsell pattern, but `visible: !isFree` reads like a bug if you don't see the locked content render below.
- Action: Add a comment on line 32 so the intent is clear.

**L3 — `previous` day computation in CheckoutPage uses `now - 24h` (line 129)**

- Correct for the "overnight happy hour" case. DST spring-forward edge case (1h skipped) is extremely unlikely to cause wrong attribution. Acceptable.

---

## Validation Results

| Check                 | Result                            |
| --------------------- | --------------------------------- |
| Frontend tsc --noEmit | **FAIL** — 1 error (H1 above)     |
| Backend tsc --noEmit  | Pass                              |
| Lint                  | Skipped                           |
| Tests                 | Skipped                           |
| Migration SQL         | Pass — idempotent `IF NOT EXISTS` |

---

## Files Reviewed

| File                                                                                               | Type                                     |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `apps/backend/prisma/schema.prisma`                                                                | Modified                                 |
| `apps/backend/prisma/migrations/20260525120000_add_happy_hour_days_and_public_links/migration.sql` | Added                                    |
| `apps/backend/src/restaurants/dto/create-restaurant.dto.ts`                                        | Modified                                 |
| `apps/backend/src/restaurants/dto/update-restaurant.dto.ts`                                        | Verified (inherits via PartialType — OK) |
| `apps/backend/src/orders/orders.service.ts`                                                        | Modified                                 |
| `apps/backend/src/loyalty/loyalty.service.ts`                                                      | Modified                                 |
| `apps/backend/src/menu/menu-crud.service.ts`                                                       | Modified                                 |
| `apps/backend/src/restaurants/restaurants.controller.ts`                                           | Modified                                 |
| `apps/frontend/src/context/RestaurantContext.tsx`                                                  | Modified                                 |
| `apps/frontend/src/hooks/useFeature.ts`                                                            | Modified                                 |
| `apps/frontend/src/services/restaurantService.ts`                                                  | Modified                                 |
| `apps/frontend/src/pages/Dashboard/SettingsView.tsx`                                               | Modified                                 |
| `apps/frontend/src/pages/Dashboard/settings/GeneralSettingsTab.tsx`                                | Modified                                 |
| `apps/frontend/src/pages/Dashboard/settings/LoyaltySettingsTab.tsx`                                | Modified                                 |
| `apps/frontend/src/pages/Dashboard/settings/PaymentSettingsTab.tsx`                                | Modified                                 |
| `apps/frontend/src/pages/CheckoutPage.tsx`                                                         | Modified                                 |
| `apps/frontend/src/pages/PublicMenuPage.tsx`                                                       | Modified                                 |
| `apps/frontend/src/components/menu/Footer.tsx`                                                     | Modified                                 |
| `apps/frontend/src/components/menu/SocialBar.tsx`                                                  | Modified                                 |
| `apps/frontend/src/components/ui/BrandingEditor.tsx`                                               | Modified                                 |
| `apps/frontend/src/locales/{en,bg,ro}/translation.json`                                            | Modified                                 |

---

## Next steps

1. **Fix H1 now** — add `timezone?: string` to `RestaurantContext.Restaurant`. One line.
2. **Restart backend** + `npx prisma generate` to fix M1 and M2 properly.
3. Pick consistency direction for M4 (URL validation).
4. Consider unifying the two Restaurant interfaces (M3) in a follow-up.
