# Code Review: Phase 1 — Boundary Validation (#5, #14, #16)

**Reviewed**: 2026-05-30
**Branch**: fix/boundary-validation → main
**Decision**: APPROVE

## Summary

Hardens DTO input validation at the system boundary. Order quantities/redeem points are now integer-bounded, order options are nested-validated, restaurant theme colors are hex-validated, theme/trending/time fields are constrained, and weekday conventions are centralized with documented constants + converters.

## Findings

### CRITICAL / HIGH

None.

### MEDIUM

None.

### LOW

- **Strict hex/enum may 400 malformed input** — `@IsHexColor`/`@IsIn`/`@Matches` with `@IsOptional` skip only `null`/`undefined`, not `''`. Verified the branding editor uses native `<input type="color">` (always `#rrggbb`) and palette defaults are hex; trending values (AUTO/MANUAL/OFF) and `defaultTheme` (light/dark) match the i18n/typed frontend. No real flow submits values that would now be rejected. Strictness is the intended boundary behavior.
- **`@Max(999)` on quantity** — magic upper bound; reasonable sanity cap, documented inline by context.

## Validation Results

| Check                | Result                                 |
| -------------------- | -------------------------------------- |
| Type check (backend) | Pass                                   |
| Tests (backend)      | Pass — 535 (2 new DTO specs, 17 cases) |
| Lint                 | Skipped                                |
| Build                | Skipped (tsc covers types)             |
| Frontend             | N/A (no frontend changes)              |

## Files Reviewed

- `apps/backend/src/common/weekday.ts` — Added (weekday constants + converters + HH:mm pattern)
- `apps/backend/src/orders/dto/create-order.dto.ts` — Modified (qty IsInt/Min/Max, redeemPoints IsInt/Min, nested options)
- `apps/backend/src/orders/dto/create-order.dto.spec.ts` — Added
- `apps/backend/src/restaurants/dto/create-restaurant.dto.ts` — Modified (accentColor IsHexColor)
- `apps/backend/src/restaurants/dto/update-restaurant.dto.ts` — Modified (colors hex, theme/trending IsIn, times Matches, weekday consts)
- `apps/backend/src/restaurants/dto/update-restaurant.dto.spec.ts` — Added
- `apps/backend/src/menu/dto/create-category.dto.ts` — Modified (times Matches, weekday consts)
