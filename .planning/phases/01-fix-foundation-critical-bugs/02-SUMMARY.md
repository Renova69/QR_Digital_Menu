---
phase: 1
plan: 2
title: "Fix Tests, Prisma Schema & Project Hygiene"
completed: 2026-04-09
key-files:
  modified:
    - backend/src/app.controller.spec.ts
    - backend/test/app.e2e-spec.ts
    - backend/test/dashboard.e2e-spec.ts
    - backend/prisma/schema.prisma
    - frontend/Dockerfile
    - frontend/package.json
  deleted:
    - frontend/backend/
key-decisions:
  - "OrderItem.menuItemId made nullable with onDelete SetNull to preserve order history"
  - "Frontend Dockerfile port changed to 3001 to match serve config"
  - "E2E tests now set globalPrefix to match main.ts"
requirements-completed: [REQ-001]
---

# Phase 1 Plan 2: Fix Tests, Prisma Schema & Project Hygiene Summary

Fixed stale AppController unit test (was testing deleted `getHello()`, now tests `getApiInfo()`). Both E2E tests now set `app.setGlobalPrefix('api')` and use correct `/api` routes. Added `onDelete: Cascade` to 7 Prisma relations and `onDelete: SetNull` to 1 (OrderItem→MenuItem). Fixed Dockerfile build order (COPY before build) and port. Added `dev` script. Removed dead `frontend/backend/` directory.

## Tasks Completed

| # | Task | Status |
|---|------|--------|
| 2.1 | Fix AppController unit test | ✓ |
| 2.2 | Fix E2E tests to use /api prefix | ✓ |
| 2.3 | Add cascade deletes to Prisma schema | ✓ |
| 2.4 | Fix frontend Dockerfile and add dev script | ✓ |
| 2.5 | Remove unused frontend/backend directory | ✓ |

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- **Git not available:** Git is not installed or not on PATH in this environment. All code changes were applied but no commits could be made. User should commit manually or install git.
