# Super-Admin Dashboard Design

**Date:** 2026-05-17
**Status:** Approved
**Scope:** Centralized Super-Admin dashboard for QR Menu SaaS platform management

## Summary

A 4th layout route inside `apps/frontend` providing platform administrators (SUPER_ADMIN role) with tenant management, subscription oversight, tier override, restaurant suspension, and platform-wide metrics. Backend: new `SuperAdminModule` at `/api/v1/super-admin` with JWT + role guard. No new app — reuses existing monorepo infrastructure.

## Key Decisions

| Decision | Choice |
|----------|--------|
| App architecture | Routes inside existing `apps/frontend` (4th layout, like PosLayout) |
| SuperAdmin creation | Manual DB insert (user handles) |
| SuperAdmin login | Same `/login` page, role-based redirect to `/super-admin` |
| Restaurant suspend | Full freeze — public menu, dashboard, orders all blocked (403) |
| forceTier override | forceTier wins over Stripe webhooks; Stripe continues billing normally |
| forceTier cleared | Falls back to Stripe-driven `tier` column |

## Schema Changes

### UserRole enum — add SUPER_ADMIN

```prisma
enum UserRole {
  OWNER
  MANAGER
  WAITER
  KITCHEN
  STAFF
  CUSTOMER
  SUPER_ADMIN   // NEW
}
```

### Restaurant model — add forceTier + isActive

```prisma
model Restaurant {
  // ... existing fields unchanged

  forceTier   SubscriptionTier?     // manual tier override (superadmin only)
  isActive    Boolean @default(true) // suspend flag
}
```

## Backend Architecture

### New module: `apps/backend/src/super-admin/`

```
super-admin/
├── super-admin.module.ts
├── super-admin.controller.ts
├── super-admin.service.ts
├── super-admin.guard.ts
└── dto/
    └── update-tenant.dto.ts
```

### SuperAdminGuard

Checks `request.user.role === 'SUPER_ADMIN'`. All super-admin routes use `@UseGuards(JwtAuthGuard, SuperAdminGuard)`.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/super-admin/stats` | Platform KPIs |
| GET | `/api/v1/super-admin/tenants` | Paginated tenant list (search, filter) |
| GET | `/api/v1/super-admin/tenants/:id` | Single tenant detail |
| PATCH | `/api/v1/super-admin/tenants/:id/tier` | Set/clear forceTier |
| PATCH | `/api/v1/super-admin/tenants/:id/status` | Toggle isActive (suspend/reactivate) |

### GET /stats response shape

```typescript
{
  totalRestaurants: number;
  totalUsers: number;
  byTier: Record<SubscriptionTier, number>;
  activeSubscriptions: number;
  suspendedCount: number;
}
```

### GET /tenants query params

```
?page=1&limit=20&search=<name or owner email>&tier=FREE&status=suspended
```

Response: `{ data: TenantSummary[], meta: { total, page, limit } }`

### PATCH /tenants/:id/tier

```typescript
{ forceTier: SubscriptionTier | null }
```

`null` clears override, restoring Stripe-driven tier.

### PATCH /tenants/:id/status

```typescript
{ isActive: boolean }
```

### Tier resolution — feature.service.ts change

```typescript
// In FeatureGuard and anywhere tier is resolved for feature checks:
const effectiveTier = restaurant.forceTier ?? restaurant.tier;
```

Single line change. Stripe webhook handler unchanged — it updates `tier` column normally, but `forceTier` takes precedence when non-null.

### Suspend enforcement

Three check points:
1. `FeatureGuard.canActivate()` — if `restaurant.isActive === false` and user not SUPER_ADMIN, throw 403 `RESTAURANT_SUSPENDED`
2. Public menu endpoints (`GET /menu/public/:id`, `/menu/public/:id/meta`, etc.) — check `isActive`, return 403 if suspended
3. Order creation (`POST /orders`) — validate restaurant is active before creating

## Frontend Architecture

### Files

```
apps/frontend/src/
├── components/
│   └── SuperAdminRoute.tsx
└── pages/super-admin/
    ├── SuperAdminLayout.tsx
    ├── OverviewPage.tsx
    ├── TenantsPage.tsx
    └── TenantDetailPage.tsx
```

### Modified files

| File | Change |
|------|--------|
| `App.tsx` | Add `/super-admin/*` route group with SuperAdminLayout |
| `LoginPage.tsx` | Add `SUPER_ADMIN → /super-admin` redirect |
| `lib/api.ts` | Add 5 super-admin API functions |
| `locales/en/translation.json` | Add `superAdmin` namespace (~25 keys) |

### SuperAdminRoute guard

Pattern: copy `StaffRoute.tsx` pattern. Checks `user.role === 'SUPER_ADMIN'`, redirects to `/dashboard` (non-admin) or `/login` (unauthenticated).

### LoginPage redirect

Add to existing role redirect map: `SUPER_ADMIN → /super-admin`.

### SuperAdminLayout

Dark sidebar layout — distinct from AppLayout/PublicLayout/PosLayout:
- Sidebar: `bg-gray-950`, platform branding "QR Menu Admin", Lucide nav icons
- Nav items: Overview (`LayoutDashboard`), Tenants (`Building2`)
- Main content area: standard padding, `<Outlet />`
- No restaurant context needed — superadmin sees all restaurants

### Views

**OverviewPage:** 4 StatCards + Recharts PieChart (tier distribution) + MRR estimate. TanStack Query fetches `/super-admin/stats`.

**TenantsPage:** Search input (300ms debounce) + tier/status filter dropdowns + data table. Columns: Name, Owner email, Tier badge, Force Tier badge, Stripe status, Active status. Click row → `/super-admin/tenants/:id`. Pagination.

**TenantDetailPage:** Back button, tenant info card, tier management section (Radix Select + confirmation Dialog), danger zone (red Suspend/Reactivate button with confirmation Dialog). Tier override applies via mutation with toast feedback.

### API client additions

```typescript
getSuperAdminStats()
getSuperAdminTenants(params?: { page?, limit?, search?, tier?, status? })
getSuperAdminTenant(id: string)
updateTenantTier(id: string, forceTier: string | null)
updateTenantStatus(id: string, isActive: boolean)
```

### i18n

All new strings under `superAdmin.*` namespace in EN only. BG/RO not required per user instruction.

## Data Flow

```
SuperAdminPage → useQuery(api.getSuperAdminStats)
                      ↓
              GET /api/v1/super-admin/stats
                      ↓
              JwtAuthGuard → SuperAdminGuard
                      ↓
              SuperAdminService.getStats()
                      ↓
              Prisma queries (aggregate counts)
                      ↓
              JSON response → TanStack Query cache → StatCards + Charts

TenantDetailPage → useMutation(api.updateTenantTier)
                      ↓
              PATCH /api/v1/super-admin/tenants/:id/tier
                      ↓
              JwtAuthGuard → SuperAdminGuard
                      ↓
              SuperAdminService.updateTier(id, forceTier)
                      ↓
              Prisma update → invalidate React Query cache → UI refresh
```

## Error Handling

- **401/403**: Existing api.ts interceptor redirects to `/login` on 401; 403 shows toast with error code
- **404 tenant**: TenantDetailPage shows "Tenant not found" state
- **Mutation failures**: TanStack Query `onError` → toast notification with error message
- **Race condition**: forceTier update uses `updateMany WHERE id = X` (optimistic), no timestamp gating needed since only superadmins can set it

## Testing

| Layer | Tests |
|-------|-------|
| Backend unit | `super-admin.service.spec.ts` — stats aggregation, tenant queries, tier update, status update |
| Backend guard | `super-admin.guard.spec.ts` — rejects non-SUPER_ADMIN, passes SUPER_ADMIN |
| Backend e2e | `super-admin.e2e-spec.ts` — endpoint auth + CRUD smoke test |
| Frontend unit | `SuperAdminRoute.spec.tsx` — redirect behavior per role |
| Frontend component | `OverviewPage.spec.tsx`, `TenantsPage.spec.tsx`, `TenantDetailPage.spec.tsx` |

## Implementation Phases

1. **Phase 1** — Schema + security: SUPER_ADMIN role, forceTier, isActive, SuperAdminGuard, feature.service.ts change
2. **Phase 2** — Backend API: SuperAdminModule with all 5 endpoints
3. **Phase 3** — Frontend routing: SuperAdminRoute, SuperAdminLayout, App.tsx, LoginPage redirect
4. **Phase 4** — Frontend views: OverviewPage, TenantsPage, TenantDetailPage, i18n keys
