# PR Review: #3 — Landing page redesign, RBAC sprint, Waiter POS, security hardening

**Reviewed:** 2026-05-14
**Author:** Renova69
**Branch:** master → main
**Decision:** APPROVE with comments

## Summary

PR diff is 7 files (landing page redesign + UI/UX docs — the full 140-file delta already exists on `main`). Code quality is solid: clean component structure, proper i18n, good responsive patterns. One trivial cleanup item, three minor type-safety nits.

## Findings

### CRITICAL

None

### HIGH

1. **HomePage.tsx:3-4 — Unused imports `TrendingUp`, `Users`**
   Imported from `lucide-react` but never referenced in JSX. Dead code. Remove from import statement.
   ```diff
   -  QrCode, Smartphone, Layers, Star, TrendingUp, ShoppingCart,
   +  QrCode, Smartphone, Layers, Star, ShoppingCart,
   ```
   And remove `Users` from the import (not used):
   ```diff
   -  BarChart2, Gift, Palette, Zap, Users, Check, ArrowRight,
   +  BarChart2, Gift, Palette, Zap, Check, ArrowRight,
   ```

### MEDIUM

2. **HomePage.tsx:55,66,78 — `as any` on i18n keys**
   `t(\`landing.tiers.starterFeature${i+1}\` as any)`—`as any`bypasses type safety. If a key is missing, the bug is silent. Better approach: type the key builder properly or use`t()` with a fallback string.

   ```tsx
   // Better:
   features: Array.from({ length: 6 }, (_, i) =>
     t(`landing.tiers.starterFeature${i + 1}`, `Feature ${i + 1}`)
   ),
   ```

3. **HomePage.tsx:16 — Loose Record type for `featureIcons`**
   `Record<string, ...>` should be `Record<typeof featureKeys[number], ...>` to guarantee every key has an entry and catch typos at compile time.

   ```tsx
   const featureIcons: Record<typeof featureKeys[number], { icon: typeof QrCode, color: string }> = {
   ```

4. **HomePage.tsx:230 — Non-standard Tailwind class `duration-400`**
   Tailwind durations go up to `duration-300` then jump to `duration-500`. `duration-400` won't apply unless a custom config extends the scale. Same for `duration-1200` on line 145. Verify these work or use standard classes.

### LOW

None

## Validation Results

| Check            | Result                | Notes                                        |
| ---------------- | --------------------- | -------------------------------------------- |
| Frontend build   | ✅ Pass               | Vite build succeeds, 2653 modules            |
| TypeScript check | ⚠️ Pre-existing error | `RestaurantContext.tsx:82` — not in PR scope |
| Tests            | ⚠️ 1 file failed      | Pre-existing failure, not in PR scope        |
| Backend build    | ❌ EPERM              | Windows file lock on Prisma, not code issue  |

## Files Reviewed

| File                                            | Change   | Lines      |
| ----------------------------------------------- | -------- | ---------- |
| `apps/frontend/src/pages/HomePage.tsx`          | Modified | +365 / -98 |
| `apps/frontend/src/components/Header.tsx`       | Modified | +16 / -4   |
| `apps/frontend/src/locales/en/translation.json` | Modified | +118       |
| `apps/frontend/src/locales/bg/translation.json` | Modified | +118       |
| `apps/frontend/src/locales/ro/translation.json` | Modified | +118       |
| `docs/Current_UI-UX.md`                         | Added    | +276       |
| `docs/Current_UI-UX-PUBLIC-MENU.md`             | Added    | +396       |
