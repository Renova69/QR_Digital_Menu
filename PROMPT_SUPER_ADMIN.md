# Goal: Build a Centralized Super-Admin Dashboard

We need to build a new centralized Super-Admin dashboard within our existing Turborepo monorepo. This dashboard will allow platform administrators to manage restaurant tenants, oversee subscription tiers, override feature gating, and view platform-wide metrics.

You must strictly follow our existing tech stack: React 18, Vite, Tailwind CSS 4, Radix UI, TanStack Query 5 (Frontend) and NestJS 11, Prisma 6, Neon DB (Backend).

Before writing any code, please review the following files to understand our established patterns:
1. `apps/backend/prisma/schema.prisma` (Understand UserRole, Restaurant, and SubscriptionTier)
2. `apps/backend/src/subscription/feature.guard.ts` and `feature.service.ts` (Understand how we currently gate features)
3. `apps/frontend/src/App.tsx` and `apps/frontend/src/pages/pos/PosLayout.tsx` (Understand our layout splitting pattern)
4. `apps/frontend/src/lib/api.ts` (Understand our Axios setup and error handling)

Please execute this implementation step-by-step. Stop and ask for my confirmation after completing each phase before moving to the next.

## Phase 1: Database & Security Foundation
1. Update `apps/backend/prisma/schema.prisma`:
   - Add `SUPER_ADMIN` to the `UserRole` enum.
   - Add a `forceTier` (SubscriptionTier, nullable) field to the `Restaurant` model to allow super-admins to manually override Stripe-driven tiers.
2. Run `npx prisma db push` to apply the changes to the Neon database.
3. Update `apps/backend/src/auth/auth.service.ts`:
   - Ensure `SUPER_ADMIN` users bypass standard restaurant-ownership checks, or create a specific `SuperAdminGuard` in `apps/backend/src/auth/super-admin.guard.ts` that checks if `request.user.role === 'SUPER_ADMIN'`.
4. Update `apps/backend/src/subscription/feature.service.ts`:
   - Modify the feature resolution logic: if a restaurant has `forceTier` set, use that instead of the `tier` derived from the Stripe webhook.

## Phase 2: Backend Super-Admin API (`apps/backend/src/super-admin/`)
Generate a new NestJS module (`SuperAdminModule`) with routes prefixed at `/api/v1/super-admin`. All routes must be protected by `JwtAuthGuard` and `SuperAdminGuard`.
Create the following endpoints:
1. `GET /stats`: Return platform-wide KPIs (Total Restaurants, Total Users, Active Subscriptions by Tier, MRR estimate).
2. `GET /tenants`: Return a paginated list of all `Restaurant` records. Include the owner's email, current `tier`, `forceTier`, and Stripe Connect status.
3. `GET /tenants/:id`: Return full details for a single tenant, including their latest orders count and payment history summary.
4. `PATCH /tenants/:id/tier`: Accept a payload to set or clear the `forceTier` value.
5. `PATCH /tenants/:id/status`: Accept a payload to suspend/disable a restaurant (you may need to add an `isActive` boolean to the `Restaurant` model in Prisma if it doesn't exist).

## Phase 3: Frontend Routing & Layout (`apps/frontend/`)
1. Create `apps/frontend/src/components/SuperAdminRoute.tsx`:
   - Similar to `StaffRoute.tsx`, verify the user is logged in AND has `role === 'SUPER_ADMIN'`. Redirect others to `/dashboard` or `/login`.
2. Create `apps/frontend/src/pages/super-admin/SuperAdminLayout.tsx`:
   - A distinct layout (do not reuse `AppLayout`). It should have a dark, distinct sidebar or top header so admins never confuse it with the standard owner dashboard. Use our existing Lucide icons.
3. Update `apps/frontend/src/App.tsx`:
   - Register the `/super-admin/*` routes wrapped in `<SuperAdminRoute>` and `<SuperAdminLayout>`.

## Phase 4: Frontend Views (`apps/frontend/src/pages/super-admin/`)
Build the following views using our existing UI primitives (`Card`, `Table`, `Badge`, `Button`, `StatusBadge`):
1. **OverviewPage (`/super-admin`)**:
   - Display top-level platform stats using the `StatCard` component.
   - Show a chart (using Recharts) of restaurants by Subscription Tier (FREE vs STARTER vs PRO vs ENTERPRISE).
2. **TenantsPage (`/super-admin/tenants`)**:
   - A data table listing all restaurants.
   - Include a search bar (by restaurant name or owner email).
   - Columns: Name, Owner, Current Tier, Forced Tier Status, Stripe Status, Actions.
3. **TenantDetailPage (`/super-admin/tenants/:id`)**:
   - Detailed view of a specific restaurant.
   - Include a dedicated section for "Subscription & Tier Management".
   - Create a form with a Radix UI `Select` to manually override the tenant's tier (`forceTier`). Add a confirmation `Dialog` before applying changes.
   - Include a "Suspend Tenant" button (red/destructive).

## Design & Coding Constraints
- **Tailwind 4 & Colors**: Use our established HSL CSS variables (e.g., `bg-background`, `text-foreground`, `border-accent/20`). Do NOT use raw hex codes.
- **Data Fetching**: Use TanStack Query (`useQuery`, `useMutation`). Include loading skeletons and error states using our `ErrorBoundary` or toast notifications.
- **i18n**: Wrap all new hardcoded strings in `t('superAdmin.xyz')` and add the keys to `apps/frontend/src/locales/en/translation.json`. You do not need to translate to BG/RO right now, just set up the EN keys.
- **Types**: Ensure strict TypeScript typing for all API responses. Add DTOs in the backend and corresponding interfaces in `apps/frontend/src/types/index.ts`.

Are you ready to begin Phase 1?