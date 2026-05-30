# Community 6

**Community 6** — 31 nodes

## Nodes

### Email OTP authentication Р Р†Р вЂљРІР‚Сњ VerificationToken model, bcrypt-hashed 6-digit code, 10-min expiry, 60s rate limit, Resend REST API, dev mode code logging
- **ID:** `CustomerOTPAuth`
- **Type:** code
- **Degree:** 7
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`
- **Outbound:**
  - → `VerificationToken model Р Р†Р вЂљРІР‚Сњ id, email, bcrypt-hashed code, expiresAt (10-min), usedAt, createdAt, indexed on email` [_`creates_and_validates`_ | EXTRACTED | score: 1.0]
  - → `3-step state machine login modal Р Р†Р вЂљРІР‚Сњ entry (Google+email+phone), OTP (6-digit input with 60s countdown), welcome card` [_`powers`_ | EXTRACTED | score: 1.0]
  - → `AuthContext.loginWithToken() Р Р†Р вЂљРІР‚Сњ stores JWT token + sets axios header without extra API call, used by OTP flow + Google OAuth callback` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Remaining fixes and customer auth design spec Р Р†Р вЂљРІР‚Сњ OTP flow, UI bugs (cart lang sync, options pre-selection, QR print, analytics dark mode, menu health false positive)` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `VARIATION pre-selection Р Р†Р вЂљРІР‚Сњ auto-selects first choice for every VARIATION option on modal open, ADD_ON remain unselected` [_`bundled_with`_ | EXTRACTED | score: 1.0]
  - → `Customer profile page at /profile Р Р†Р вЂљРІР‚Сњ tier colors from API, returnTo query param for back navigation, fully translated with 22 profile keys` [_`bundled_with`_ | EXTRACTED | score: 1.0]
- **Cross-community:**
  - ↔ `Recharts dark mode fix Р Р†Р вЂљРІР‚Сњ XAxis/YAxis tick fills from 'currentColor' to explicit 'hsl(var(--color-muted-foreground))', custom ChartTooltip with glass-panel` [_`bundled_with`_ | c64]

### QR Digital Menu SaaS Platform Р Р†Р вЂљРІР‚Сњ full-stack digital restaurant menu with QR ordering, POS, loyalty, and multi-language
- **ID:** `QRMenuApp`
- **Type:** document
- **Degree:** 7
- **Source:** `README.md`
- **Outbound:**
  - → `Turborepo monorepo with npm workspaces Р Р†Р вЂљРІР‚Сњ apps/backend (NestJS 11), apps/frontend (Vite+React 18)` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `NestJS 11 backend on :3000 Р Р†Р вЂљРІР‚Сњ Prisma 6 + Neon PostgreSQL, JWT+Google OAuth, Swagger at /api-docs, global prefix /api` [_`has_architecture_component`_ | EXTRACTED | score: 1.0]
  - → `Vite + React 18 frontend on :3001 Р Р†Р вЂљРІР‚Сњ Tailwind v4, TanStack Query v5, i18next, socket.io-client, Radix UI` [_`has_architecture_component`_ | EXTRACTED | score: 1.0]
  - → `Neon Serverless PostgreSQL Р Р†Р вЂљРІР‚Сњ hosted, pooled connections, no local Postgres in dev` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `V1 Docker Compose Р Р†РІР‚В РІР‚в„ў V2 WebSockets/Stripe/multi-language Р Р†РІР‚В РІР‚в„ў V3 AWS RDS/S3/ECS/Redis/CDN/POS Р Р†РІР‚В РІР‚в„ў V4 Enterprise` [_`has_roadmap`_ | EXTRACTED | score: 1.0]

### POST /api/v1/restaurants/[id]/menu/import Р Р†Р вЂљРІР‚Сњ API push, JSON file upload, CSV file upload for OCR menu data
- **ID:** `SaaS_Menu_Import_API`
- **Type:** document
- **Degree:** 7
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `OCR tool canonical JSON export schema (version 1.0/2.0) with categories, items, variants, tags, confidence` [_`references`_ | EXTRACTED | score: 1.0]
  - → `SaaS push payload format Р Р†Р вЂљРІР‚Сњ transformed OCR canonical schema with allergens/dietaryTags split, options/choices mapping` [_`accepts`_ | EXTRACTED | score: 1.0]
  - → `Prisma schema additions for OCR import: MenuItem.weight, MenuItem.confidence, MenuOption/MenuOptionChoice models, allergens/dietaryTags arrays, import metadata` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `MenuImport dashboard component Р Р†Р вЂљРІР‚Сњ API key panel, drag-and-drop uploader (.json/.csv), preview table, import results with error download` [_`has_ui_component`_ | EXTRACTED | score: 1.0]
  - → `QR Digital Menu SaaS Platform Р Р†Р вЂљРІР‚Сњ full-stack digital restaurant menu with QR ordering, POS, loyalty, and multi-language` [_`has_planned_feature`_ | INFERRED | score: 0.9]
  - → `NestJS 11 backend on :3000 Р Р†Р вЂљРІР‚Сњ Prisma 6 + Neon PostgreSQL, JWT+Google OAuth, Swagger at /api-docs, global prefix /api` [_`routes`_ | INFERRED | score: 0.9]

### NestJS 11 backend on :3000 Р Р†Р вЂљРІР‚Сњ Prisma 6 + Neon PostgreSQL, JWT+Google OAuth, Swagger at /api-docs, global prefix /api
- **ID:** `NestJSBackend`
- **Type:** code
- **Degree:** 6
- **Source:** `README.md`
- **Outbound:**
  - → `Prisma 6 ORM Р Р†Р вЂљРІР‚Сњ schema.prisma with User, Restaurant, RestaurantTable, MenuCategory, MenuItem, MenuOption, Order, OrderItem, AssistanceRequest, TableSession, Payment, VerificationToken models` [_`depends_on`_ | EXTRACTED | score: 1.0]
  - → `JWT authentication Р Р†Р вЂљРІР‚Сњ httpOnly cookie storage (not localStorage), jwt.strategy reads cookies first then Bearer header, CSRF double-submit cookie pattern` [_`implements`_ | EXTRACTED | score: 1.0]
  - → `Global rate limiting Р Р†Р вЂљРІР‚Сњ ThrottlerGuard applied globally in NestJS, 100 requests per 60 seconds` [_`uses`_ | EXTRACTED | score: 1.0]
  - → `Vite dev server proxy Р Р†Р вЂљРІР‚Сњ /api and /socket.io proxied to backend target from VITE_API_URL env, enables same-origin httpOnly cookie flow` [_`proxies_to`_ | EXTRACTED | score: 1.0]

### SaaS push payload format Р Р†Р вЂљРІР‚Сњ transformed OCR canonical schema with allergens/dietaryTags split, options/choices mapping
- **ID:** `SaaS_Push_Payload`
- **Type:** document
- **Degree:** 4
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `Transform function Р Р†Р вЂљРІР‚Сњ canonical OCR schema to SaaS push payload: splits tags to allergens+dietaryTags, maps variants to options, maps sort_order to order` [_`generated_by`_ | EXTRACTED | score: 1.0]
  - → `CSV parsing utilities: parseVariants() (semicolon-separated name:price pairs), splitTags() (allergens vs dietaryTags)` [_`generates`_ | EXTRACTED | score: 1.0]

### Prisma 6 ORM Р Р†Р вЂљРІР‚Сњ schema.prisma with User, Restaurant, RestaurantTable, MenuCategory, MenuItem, MenuOption, Order, OrderItem, AssistanceRequest, TableSession, Payment, VerificationToken models
- **ID:** `PrismaORM`
- **Type:** code
- **Degree:** 3
- **Source:** `README.md`

### AuthContext.loginWithToken() Р Р†Р вЂљРІР‚Сњ stores JWT token + sets axios header without extra API call, used by OTP flow + Google OAuth callback
- **ID:** `AuthContext_loginWithToken`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`

### CSV parsing utilities: parseVariants() (semicolon-separated name:price pairs), splitTags() (allergens vs dietaryTags)
- **ID:** `CSV_Parse_Utils`
- **Type:** code
- **Degree:** 2
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `Known allergens constant Р Р†Р вЂљРІР‚Сњ ['nuts','dairy','soy','gluten','peanuts','shellfish','egg'] Р Р†Р вЂљРІР‚Сњ used for tag splitting in OCR import` [_`depends_on`_ | EXTRACTED | score: 1.0]

### OCR tool canonical JSON export schema (version 1.0/2.0) with categories, items, variants, tags, confidence
- **ID:** `Canonical_OCR_Schema`
- **Type:** document
- **Degree:** 2
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `SaaS push payload format Р Р†Р вЂљРІР‚Сњ transformed OCR canonical schema with allergens/dietaryTags split, options/choices mapping` [_`transforms_to`_ | EXTRACTED | score: 1.0]

### 3-step state machine login modal Р Р†Р вЂљРІР‚Сњ entry (Google+email+phone), OTP (6-digit input with 60s countdown), welcome card
- **ID:** `CustomerLoginModal`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`
- **Outbound:**
  - → `Google OAuth callback handler at /oauth/callback Р Р†Р вЂљРІР‚Сњ processes redirect, calls loginWithToken, navigates to intended page` [_`conceptually_related_to`_ | INFERRED | score: 0.75]

### Customer profile page at /profile Р Р†Р вЂљРІР‚Сњ tier colors from API, returnTo query param for back navigation, fully translated with 22 profile keys
- **ID:** `CustomerProfilePage`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`

### VARIATION pre-selection Р Р†Р вЂљРІР‚Сњ auto-selects first choice for every VARIATION option on modal open, ADD_ON remain unselected
- **ID:** `ItemWithOptions`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`
- **Outbound:**
  - → `MenuOption.choices JSON schema Р Р†Р вЂљРІР‚Сњ array of {name:string, priceModifier:number}, no id field, price field is priceModifier not price` [_`uses`_ | INFERRED | score: 0.85]

### JWT authentication Р Р†Р вЂљРІР‚Сњ httpOnly cookie storage (not localStorage), jwt.strategy reads cookies first then Bearer header, CSRF double-submit cookie pattern
- **ID:** `JWT_Auth_Flow`
- **Type:** code
- **Degree:** 2
- **Source:** `README.md`
- **Outbound:**
  - → `AuthContext.loginWithToken() Р Р†Р вЂљРІР‚Сњ stores JWT token + sets axios header without extra API call, used by OTP flow + Google OAuth callback` [_`implements_client_side`_ | INFERRED | score: 0.9]

### Known allergens constant Р Р†Р вЂљРІР‚Сњ ['nuts','dairy','soy','gluten','peanuts','shellfish','egg'] Р Р†Р вЂљРІР‚Сњ used for tag splitting in OCR import
- **ID:** `KNOWN_ALLERGENS`
- **Type:** code
- **Degree:** 2
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `Transform function Р Р†Р вЂљРІР‚Сњ canonical OCR schema to SaaS push payload: splits tags to allergens+dietaryTags, maps variants to options, maps sort_order to order` [_`depends_on`_ | EXTRACTED | score: 1.0]

### MAIN_FEATURES.md Р Р†Р вЂљРІР‚Сњ 10-section Fortune 500 acquisition evaluation document (Executive Summary through Strategic Improvements)
- **ID:** `MAIN_FEATURES_Report`
- **Type:** document
- **Degree:** 2
- **Source:** `PROMPT.md`
- **Outbound:**
  - → `QR Digital Menu SaaS Platform Р Р†Р вЂљРІР‚Сњ full-stack digital restaurant menu with QR ordering, POS, loyalty, and multi-language` [_`documents`_ | EXTRACTED | score: 1.0]
  - → `V1 Docker Compose Р Р†РІР‚В РІР‚в„ў V2 WebSockets/Stripe/multi-language Р Р†РІР‚В РІР‚в„ў V3 AWS RDS/S3/ECS/Redis/CDN/POS Р Р†РІР‚В РІР‚в„ў V4 Enterprise` [_`references`_ | INFERRED | score: 0.85]

### MenuOption.choices JSON schema Р Р†Р вЂљРІР‚Сњ array of {name:string, priceModifier:number}, no id field, price field is priceModifier not price
- **ID:** `MenuOption_Choices_JSON`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-06-stripe-payments.md`
- **Outbound:**
  - → `Radix Dialog for menu option selection Р Р†Р вЂљРІР‚Сњ VARIATION/ADDON choice selection + item note input, mounted-root pattern for performance` [_`uses`_ | INFERRED | score: 0.85]

### Neon Serverless PostgreSQL Р Р†Р вЂљРІР‚Сњ hosted, pooled connections, no local Postgres in dev
- **ID:** `NeonServerlessDB`
- **Type:** code
- **Degree:** 2
- **Source:** `README.md`
- **Outbound:**
  - → `Prisma 6 ORM Р Р†Р вЂљРІР‚Сњ schema.prisma with User, Restaurant, RestaurantTable, MenuCategory, MenuItem, MenuOption, Order, OrderItem, AssistanceRequest, TableSession, Payment, VerificationToken models` [_`connects_to`_ | EXTRACTED | score: 1.0]

### Radix Dialog for menu option selection Р Р†Р вЂљРІР‚Сњ VARIATION/ADDON choice selection + item note input, mounted-root pattern for performance
- **ID:** `PosOptionsDrawer`
- **Type:** code
- **Degree:** 2
- **Source:** `docs/superpowers/plans/2026-05-09-waiter-pos-plan.md`
- **Cross-community:**
  - ↔ `Waiter Point-of-Sale at /staff/pos Р Р†Р вЂљРІР‚Сњ full-viewport mobile-first tableside ordering, isolated PosContext, seat-level grouping, 3 session-end actions` [_`uses`_ | c93]

### Prisma schema additions for OCR import: MenuItem.weight, MenuItem.confidence, MenuOption/MenuOptionChoice models, allergens/dietaryTags arrays, import metadata
- **ID:** `Prisma_MenuImport_Schema`
- **Type:** code
- **Degree:** 2
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `Prisma 6 ORM Р Р†Р вЂљРІР‚Сњ schema.prisma with User, Restaurant, RestaurantTable, MenuCategory, MenuItem, MenuOption, Order, OrderItem, AssistanceRequest, TableSession, Payment, VerificationToken models` [_`extends`_ | EXTRACTED | score: 1.0]

### Vite + React 18 frontend on :3001 Р Р†Р вЂљРІР‚Сњ Tailwind v4, TanStack Query v5, i18next, socket.io-client, Radix UI
- **ID:** `ReactFrontend`
- **Type:** code
- **Degree:** 2
- **Source:** `README.md`
- **Outbound:**
  - → `Vite dev server proxy Р Р†Р вЂљРІР‚Сњ /api and /socket.io proxied to backend target from VITE_API_URL env, enables same-origin httpOnly cookie flow` [_`implements`_ | EXTRACTED | score: 1.0]

### V1 Docker Compose Р Р†РІР‚В РІР‚в„ў V2 WebSockets/Stripe/multi-language Р Р†РІР‚В РІР‚в„ў V3 AWS RDS/S3/ECS/Redis/CDN/POS Р Р†РІР‚В РІР‚в„ў V4 Enterprise
- **ID:** `V1_Scaling_Plan`
- **Type:** document
- **Degree:** 2
- **Source:** `README.md`

### Vite dev server proxy Р Р†Р вЂљРІР‚Сњ /api and /socket.io proxied to backend target from VITE_API_URL env, enables same-origin httpOnly cookie flow
- **ID:** `ViteProxy_Architecture`
- **Type:** code
- **Degree:** 2
- **Source:** `apps/frontend/index.html`

### Transform function Р Р†Р вЂљРІР‚Сњ canonical OCR schema to SaaS push payload: splits tags to allergens+dietaryTags, maps variants to options, maps sort_order to order
- **ID:** `transformCanonicalToSaaSPayload`
- **Type:** code
- **Degree:** 2
- **Source:** `Promt_OCR.md`

### FIFO point ledger loyalty program Р Р†Р вЂљРІР‚Сњ earn/redeem rates, Silver/Gold VIP tiers (500/2000 point thresholds), Happy Hour multipliers, expiry reminder cron
- **ID:** `LoyaltyProgram`
- **Type:** code
- **Degree:** 1
- **Source:** `SESSION_CHANGES.md`
- **Outbound:**
  - → `Customer profile page at /profile Р Р†Р вЂљРІР‚Сњ tier colors from API, returnTo query param for back navigation, fully translated with 22 profile keys` [_`displays`_ | INFERRED | score: 0.8]

### MenuImport dashboard component Р Р†Р вЂљРІР‚Сњ API key panel, drag-and-drop uploader (.json/.csv), preview table, import results with error download
- **ID:** `MenuImport_Frontend`
- **Type:** code
- **Degree:** 1
- **Source:** `Promt_OCR.md`

### Google OAuth callback handler at /oauth/callback Р Р†Р вЂљРІР‚Сњ processes redirect, calls loginWithToken, navigates to intended page
- **ID:** `OAuthCallbackPage`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`

### Offline OCR menu digitizer (Node.js + Python sidecar + Ollama) extracting Bulgarian restaurant menus from images/PDFs to structured JSON
- **ID:** `OCR_Menu_Digitizer`
- **Type:** document
- **Degree:** 1
- **Source:** `Promt_OCR.md`
- **Outbound:**
  - → `POST /api/v1/restaurants/[id]/menu/import Р Р†Р вЂљРІР‚Сњ API push, JSON file upload, CSV file upload for OCR menu data` [_`accepts_input_from`_ | EXTRACTED | score: 1.0]

### Remaining fixes and customer auth design spec Р Р†Р вЂљРІР‚Сњ OTP flow, UI bugs (cart lang sync, options pre-selection, QR print, analytics dark mode, menu health false positive)
- **ID:** `RemainingFixes_Design`
- **Type:** document
- **Degree:** 1
- **Source:** `docs/superpowers/specs/2026-05-06-remaining-fixes-customer-auth-design.md`

### Global rate limiting Р Р†Р вЂљРІР‚Сњ ThrottlerGuard applied globally in NestJS, 100 requests per 60 seconds
- **ID:** `ThrottlerGuard`
- **Type:** code
- **Degree:** 1
- **Source:** `README.md`

### Turborepo monorepo with npm workspaces Р Р†Р вЂљРІР‚Сњ apps/backend (NestJS 11), apps/frontend (Vite+React 18)
- **ID:** `TurboRepoMonorepo`
- **Type:** code
- **Degree:** 1
- **Source:** `README.md`

### VerificationToken model Р Р†Р вЂљРІР‚Сњ id, email, bcrypt-hashed code, expiresAt (10-min), usedAt, createdAt, indexed on email
- **ID:** `VerificationToken`
- **Type:** code
- **Degree:** 1
- **Source:** `docs/superpowers/plans/2026-05-06-remaining-fixes-customer-auth.md`
