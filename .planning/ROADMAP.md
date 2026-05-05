# Roadmap — Milestone 1.0 (MVP)

## Phase 1: Fix Foundation & Critical Bugs
**Goal:** Fix all critical bugs and inconsistencies discovered in codebase mapping so the project has a solid base to build on.
**Requirements:** REQ-001
**Scope:**
- Fix auth response mismatch (backend returns `access_token`, frontend expects `token`)
- Remove duplicate auth implementation (choose TanStack Query hook over Context)
- Fix stale/broken tests (AppController spec, E2E tests)
- Fix frontend Dockerfile build order bug
- Add missing `dev` script to frontend package.json
- Configure cascade deletes in Prisma schema
- Add global API prefix to E2E tests
- Clean up unused `frontend/backend/` directory

## Phase 2: Complete Authentication
**Goal:** Finalize authentication system with consistent token handling, Google OAuth end-to-end, and proper security.
**Requirements:** REQ-001
**Scope:**
- Ensure login returns consistent response format (token + user)
- Test Google OAuth flow end-to-end
- Add auth error handling and user feedback
- Add React Error Boundary component
- Secure JWT storage (consider httpOnly cookies)

## Phase 3: Complete Menu Builder & Image Upload
**Goal:** Finish the menu builder with image upload support and fix cart pricing to include option modifiers.
**Requirements:** REQ-003, REQ-004, REQ-005, REQ-006, REQ-010
**Scope:**
- Add file upload endpoint for menu item images (local storage)
- Wire image upload into menu editor UI
- Fix cart total calculation to include option price modifiers
- Add loading/error states to menu editor
- Test menu CRUD operations end-to-end

## Phase 4: Table Management & QR Codes
**Goal:** Add table entity, CRUD, and QR code generation tied to specific tables.
**Requirements:** REQ-007, REQ-008, REQ-009
**Scope:**
- Create Table model in Prisma schema (id, name/number, restaurantId)
- Create tables backend module (CRUD endpoints)
- Create table management UI in dashboard
- Generate QR codes per table (linking to /menu/public/:restaurantId?table=:tableId)
- Update public menu page to capture table context from URL

## Phase 5: Complete Ordering System
**Goal:** Wire the orders service to the database, complete the order flow from customer to staff dashboard.
**Requirements:** REQ-011, REQ-012
**Scope:**
- Implement OrdersService with real Prisma queries (create, findAll, findOne, updateStatus)
- Add order creation endpoint with validation
- Connect frontend checkout to real backend
- Build staff order management view with status updates
- Add order notification indicator on dashboard

## Phase 6: Dashboard & Polish
**Goal:** Complete the admin dashboard with statistics, restaurant branding, and responsive design polish.
**Requirements:** REQ-013, REQ-014, REQ-015
**Scope:**
- Fix dashboard summary to work with restaurant context
- Add restaurant branding (logo upload, accent color)
- Apply restaurant branding to public menu
- Add loading spinners and error states across all pages
- Responsive design audit and fixes
- Polish HomePage with proper landing content

## Phase 7: Deployment & Production Readiness
**Goal:** Fix Docker setup, add production configuration, and prepare for VPS deployment.
**Requirements:** REQ-015
**Scope:**
- Fix frontend Dockerfile (build order)
- Add frontend service to docker-compose.yml
- Add environment variable documentation
- Add production .env.example files
- Database migration strategy for production
- Add health check endpoints
- Add basic rate limiting on public endpoints

### Phase 8: Design SaaS Web App UX/UI

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 8 to break down)
