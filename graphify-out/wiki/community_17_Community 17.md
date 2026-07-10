# Community 17

**Community 17** — 14 nodes

## Nodes

### auth.service.spec.ts

- **ID:** `apps_backend_src_auth_auth_service_spec_ts`
- **Type:** code
- **Degree:** 13
- **Source:** `apps/backend/src/auth/auth.service.spec.ts` @ L1
- **Cross-community:**
  - ↔ `auth.service.ts` [_`imports_from`_ | c44]
  - ↔ `AuthService` [_`imports`_ | c41]
  - ↔ `real` [_`contains`_ | c77]
  - ↔ `mockCompare` [_`contains`_ | c77]
  - ↔ `mockHash` [_`contains`_ | c77]

### seed.ts

- **ID:** `apps_backend_prisma_seed_ts`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/prisma/seed.ts` @ L1
- **Outbound:**
  - → `prisma` [_`contains`_ | EXTRACTED | score: 1.0]
  - → `main()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `seed-help-content.ts` [_`imports_from`_ | c96]
  - ↔ `seedHelpContent()` [_`imports`_ | c96]

### reset_password.js

- **ID:** `apps_backend_reset_password_js`
- **Type:** code
- **Degree:** 4
- **Source:** `apps/backend/reset_password.js` @ L1
- **Outbound:**
  - → `bcrypt` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `{ PrismaClient }` [_`contains`_ | c139]
  - ↔ `prisma` [_`contains`_ | c139]
  - ↔ `main()` [_`contains`_ | c139]

### get_users.js

- **ID:** `apps_backend_get_users_js`
- **Type:** code
- **Degree:** 3
- **Source:** `apps/backend/get_users.js` @ L1
- **Outbound:**
  - → `{ PrismaClient }` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `prisma` [_`contains`_ | c147]
  - ↔ `main()` [_`contains`_ | c147]

### debug-pairings.ts

- **ID:** `apps_backend_debug_pairings_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/debug-pairings.ts` @ L1
- **Cross-community:**
  - ↔ `prisma` [_`contains`_ | c157]
  - ↔ `main()` [_`contains`_ | c157]

### debug-prisma.ts

- **ID:** `apps_backend_debug_prisma_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/debug-prisma.ts` @ L1
- **Cross-community:**
  - ↔ `prisma` [_`contains`_ | c158]
  - ↔ `main()` [_`contains`_ | c158]

### fix-points.migration.ts

- **ID:** `apps_backend_src_orders_fix_points_migration_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/src/orders/fix-points.migration.ts` @ L1
- **Outbound:**
  - → `fixPointsCalculation()` [_`contains`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `prisma` [_`contains`_ | c162]

### test_cat.ts

- **ID:** `apps_backend_test_cat_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/test_cat.ts` @ L1
- **Cross-community:**
  - ↔ `prisma` [_`contains`_ | c159]
  - ↔ `main()` [_`contains`_ | c159]

### test_db.ts

- **ID:** `apps_backend_test_db_ts`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/test_db.ts` @ L1
- **Cross-community:**
  - ↔ `prisma` [_`contains`_ | c160]
  - ↔ `main()` [_`contains`_ | c160]

### main()

- **ID:** `prisma_seed_main`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/backend/prisma/seed.ts` @ L9
- **Cross-community:**
  - ↔ `seedHelpContent()` [_`calls`_ | c96]

### { PrismaClient }

- **ID:** `backend_get_users_prismaclient`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/get_users.js` @ L1

### bcrypt

- **ID:** `backend_reset_password_bcrypt`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/reset_password.js` @ L2

### fixPointsCalculation()

- **ID:** `orders_fix_points_migration_fixpointscalculation`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/src/orders/fix-points.migration.ts` @ L5

### prisma

- **ID:** `prisma_seed_prisma`
- **Type:** code
- **Degree:** 1
- **Source:** `apps/backend/prisma/seed.ts` @ L6
