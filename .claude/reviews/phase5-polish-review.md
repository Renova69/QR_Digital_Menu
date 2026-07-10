# Code Review: Phase 5 — Polish (#8, #12, #13, #15, #17 + #5 nudge)

**Reviewed**: 2026-05-30
**Branch**: fix/security-audit-integrated → (consolidation branch)
**Decision**: APPROVE

## Summary

- **#8** Removed the `PATCH /auth/me/pin` endpoint, `AuthService.setPin`, `SetPinDto`, and its test — unused and invariant-violating (let dashboard roles mint a PIN). `pinLogin` role-scoping unchanged.
- **#12** Extracted the branding font list to `lib/brandingFonts.ts`; FontPicker and the public menu now share it. The public allowlist is 17 fonts (was 3) and still guards the Google Fonts URL against arbitrary values.
- **#13** ThemeToggle persists only on an explicit toggle; the mount effect applies the DOM class without writing, so a returning visitor isn't locked onto a stale default.
- **#15** Shared-device bonding is gated by `canPos`; the Enable/Disable labels and the invite-modal copy are localized and credential-accurate.
- **#17** Removed the dead `withRetry` + circuit-breaker from PrismaService (no callers); kept the live connection-retry and jitter.
- **#5 (deferred frontend)** Loyalty settings tab is visible to non-free tiers with a locked card stating settings/balances are preserved and resume on upgrade.

## Findings

### CRITICAL / HIGH / MEDIUM

None.

### LOW

- New i18n keys (`common.disable/enable`, `staff.inviteNewStaffDesc`, `settings.loyaltyLocked/Desc`) have inline English fallbacks only; BG/RO can be added later (i18next falls back gracefully).

## Validation Results

| Check                 | Result     |
| --------------------- | ---------- |
| Type check (backend)  | Pass       |
| Type check (frontend) | Pass       |
| Tests (backend)       | Pass — 570 |
| Lint                  | Skipped    |

## Files Reviewed

- `apps/backend/src/auth/auth.controller.ts` — Modified (drop me/pin)
- `apps/backend/src/auth/auth.service.ts` — Modified (drop setPin)
- `apps/backend/src/auth/auth.service.spec.ts` — Modified (drop setPin test)
- `apps/backend/src/auth/dto/set-pin.dto.ts` — Deleted
- `apps/backend/src/prisma/prisma.service.ts` — Modified (drop dead withRetry/breaker)
- `apps/frontend/src/lib/brandingFonts.ts` — Added (shared font source)
- `apps/frontend/src/components/branding/FontPicker.tsx` — Modified (use shared list)
- `apps/frontend/src/pages/PublicMenuPage.tsx` — Modified (allowlist from shared list)
- `apps/frontend/src/components/ui/ThemeToggle.tsx` — Modified (persist on toggle only)
- `apps/frontend/src/pages/Dashboard/settings/StaffSettingsTab.tsx` — Modified (canPos gate, i18n)
- `apps/frontend/src/pages/Dashboard/SettingsView.tsx` — Modified (loyalty locked-state nudge)
