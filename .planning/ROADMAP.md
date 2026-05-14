# Roadmap — Milestone 1.0 (MVP)

> **Status:** ALL PHASES COMPLETE as of May 2026
> **Current:** V2.5 Shipped + V3 Growth (Stripe, Live Tables, OCR, Waiter POS) + Security Hardening (httpOnly cookies, CSRF, CSP, same-origin proxy)
> **See:** `CODING_ROADMAP.md` for full current roadmap with all completed phases

## Phase 1: Fix Foundation & Critical Bugs ✅
**Goal:** Fix all critical bugs and inconsistencies discovered in codebase mapping so the project has a solid base to build on.
**Requirements:** REQ-001
**Scope:**
- [x] Fix auth response mismatch (backend returns `access_token`, frontend expects `token`)
- [x] Remove duplicate auth implementation (choose TanStack Query hook over Context)
- [x] Fix stale/broken tests (AppController spec, E2E tests)
- [x] Fix frontend Dockerfile build order bug
- [x] Add missing `dev` script to frontend package.json
- [x] Configure cascade deletes in Prisma schema
- [x] Add global API prefix to E2E tests
- [x] Clean up unused `frontend/backend/` directory

## Phase 2: Complete Authentication ✅
**Goal:** Finalize authentication system with consistent token handling, Google OAuth end-to-end, and proper security.
**Requirements:** REQ-001
**Scope:**
- [x] Ensure login returns consistent response format (token + user)
- [x] Test Google OAuth flow end-to-end
- [x] Add auth error handling and user feedback
- [x] Add React Error Boundary component
- [x] Secure JWT storage — **migrated to httpOnly cookies (May 2026)** with CSRF protection

## Phase 3: Complete Menu Builder & Image Upload ✅
**Goal:** Finish the menu builder with image upload support and fix cart pricing to include option modifiers.
**Requirements:** REQ-003, REQ-004, REQ-005, REQ-006, REQ-010
**Scope:**
- [x] Add file upload endpoint for menu item images (Cloudflare R2 + sharp WebP pipeline)
- [x] Wire image upload into menu editor UI
- [x] Fix cart total calculation to include option price modifiers
- [x] Add loading/error states to menu editor
- [x] Test menu CRUD operations end-to-end

## Phase 4: Table Management & QR Codes ✅
**Goal:** Add table entity, CRUD, and QR code generation tied to specific tables.
**Requirements:** REQ-007, REQ-008, REQ-009
**Scope:**
- [x] Create Table model in Prisma schema (id, name/number, restaurantId)
- [x] Create tables backend module (CRUD endpoints)
- [x] Create table management UI in dashboard
- [x] Generate QR codes per table (linking to /menu/public/:restaurantId?table=:tableId)
- [x] Update public menu page to capture table context from URL

## Phase 5: Complete Ordering System ✅
**Goal:** Wire the orders service to the database, complete the order flow from customer to staff dashboard.
**Requirements:** REQ-011, REQ-012
**Scope:**
- [x] Implement OrdersService with real Prisma queries (create, findAll, findOne, updateStatus)
- [x] Add order creation endpoint with validation
- [x] Connect frontend checkout to real backend
- [x] Build staff order management view with status updates
- [x] Add order notification indicator on dashboard

## Phase 6: Dashboard & Polish ✅
**Goal:** Complete the admin dashboard with statistics, restaurant branding, and responsive design polish.
**Requirements:** REQ-013, REQ-014, REQ-015
**Scope:**
- [x] Fix dashboard summary to work with restaurant context
- [x] Add restaurant branding (logo upload, accent color)
- [x] Apply restaurant branding to public menu
- [x] Add loading spinners and error states across all pages
- [x] Responsive design audit and fixes
- [x] Polish HomePage with proper landing content

## Phase 7: Deployment & Production Readiness ✅
**Goal:** Fix Docker setup, add production configuration, and prepare for VPS deployment.
**Requirements:** REQ-015
**Scope:**
- [x] Fix frontend Dockerfile (build order)
- [x] Add frontend service to docker-compose.yml
- [x] Add environment variable documentation
- [x] Add production .env.example files
- [x] Database migration strategy for production
- [x] Add health check endpoints
- [x] Add basic rate limiting on public endpoints → **upgraded to per-endpoint throttling (May 2026)**

### Phase 8: Design SaaS Web App UX/UI ✅

**Goal:** Complete UI/UX design system and mobile experience.
**Requirements:** Completed
**Depends on:** Phase 7
**Plans:** All plans complete

Plans:
- [x] Design system rewrite (HSL tokens, color-mix, safe-area utilities)
- [x] Mobile UX overhaul (bottom nav, bottom sheet cart, safe-area insets)
- [x] Branding & theming (Google Fonts, 4-color editor, WCAG contrast, per-restaurant theme)
- [x] Public layout split (bare customer routes, full chrome dashboard)
- [x] Accessibility audit (labels, alt text, reduced motion, focus indicators)
