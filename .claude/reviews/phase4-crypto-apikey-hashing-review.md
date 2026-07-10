# Code Review: Phase 4 — Crypto RNG + API-Key Hashing (#9, #10)

**Reviewed**: 2026-05-30
**Branch**: fix/crypto-and-apikey-hashing → main
**Decision**: APPROVE

## Summary

- **#9** OTP codes use `crypto.randomInt`; placeholder passwords use `crypto.randomBytes` — no more `Math.random` for security values. (Prisma retry jitter left on Math.random — not security-sensitive.)
- **#10** Menu-import API key is now stored as a SHA-256 hash only. The plaintext key is shown exactly once (creation/regeneration); the reveal endpoint is removed; the guard hashes the presented token and matches on the hash.

## ⚠️ Deploy ordering (operator action required)

The DB migration **must run before** the hashed-key code is deployed — the code queries `restaurant.importApiKeyHash`, which does not exist until migrated. Run once against Neon:

```
npx prisma db execute --file prisma/sql/2026-05-30-hash-import-api-key.sql --schema prisma/schema.prisma
npx prisma generate
```

The SQL backfills the hash from existing plaintext before dropping the column, so existing OCR tool keys keep working (Postgres `encode(digest(...,'sha256'),'hex')` == Node `createHash('sha256').digest('hex')`).

## Findings

### CRITICAL / HIGH

None.

### MEDIUM

- **Deploy ordering** (above) — operational, not a code defect.

### LOW

- New i18n keys (`keyHidden`, `saveKeyNow`, `keyConfigured`) have inline English fallbacks only; BG/RO entries can be added later (i18next falls back gracefully).
- `GET .../api-key` still auto-generates a key on first view (pre-existing `getOrCreate` side-effect); the show-once warning covers the "copy it now" case.

## Validation Results

| Check                 | Result                                       |
| --------------------- | -------------------------------------------- |
| Type check (backend)  | Pass                                         |
| Type check (frontend) | Pass                                         |
| Tests (backend)       | Pass — 516                                   |
| Lint                  | Skipped                                      |
| Migration             | Hand-written SQL; operator runs against Neon |

## Files Reviewed

- `apps/backend/src/auth/auth.service.ts` — Modified (#9 randomInt/randomBytes)
- `apps/backend/prisma/schema.prisma` — Modified (importApiKey → importApiKeyHash)
- `apps/backend/prisma/sql/2026-05-30-hash-import-api-key.sql` — Added (migration)
- `apps/backend/src/menu-import/menu-import.service.ts` — Modified (hash, show-once, drop reveal/mask)
- `apps/backend/src/menu-import/menu-import.service.spec.ts` — Modified
- `apps/backend/src/menu-import/menu-import.controller.ts` — Modified (drop reveal route)
- `apps/backend/src/menu-import/guards/api-key.guard.ts` — Modified (hash lookup)
- `apps/backend/src/menu-import/guards/api-key.guard.spec.ts` — Modified
- `apps/frontend/src/lib/api.ts` — Modified (drop revealImportApiKey, types)
- `apps/frontend/src/pages/Dashboard/MenuImportExportView.tsx` — Modified (show-once panel)
- `apps/frontend/src/pages/Dashboard/MenuImportView.tsx` — Deleted (dead, unrouted)
