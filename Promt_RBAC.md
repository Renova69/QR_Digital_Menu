Act as a Senior Full-Stack Architect. We are executing a major infrastructure and feature sprint for our restaurant SaaS. This sprint has 4 distinct phases. We must clean up our architectural debt before we implement our new Role-Based Access Control (RBAC) and Shared Device Mode.

You MUST execute this step-by-step. Do not write all the code at once. Plan the implementation for the current phase, ask for my approval, wait for my confirmation, and then build sequentially. Do not move to the next phase until the current one is fully tested and complete.

### Phase 1: The Quick Win (Wire up KDS)
We have a fully built `KitchenPage.tsx` that is currently floating and inaccessible.
1. Open `apps/frontend/src/App.tsx`.
2. Add a new route for `/staff/kitchen` that renders the `KitchenPage`.
3. Protect this route using the existing `StaffRoute` component.

### Phase 2: Frontend Foundation (Consolidate Auth & Providers)
Our frontend currently suffers from "Provider Hell" and dual-auth states.
1. **Consolidate Auth:** Merge the raw `useState` logic in `AuthContext.tsx` with the TanStack Query logic in `useAuth.ts`. We need a single source of truth for authentication backed by React Query, keeping the JWT entirely in the `httpOnly` cookie.
2. **Provider Splitting:** Open `App.tsx`. Move heavy global context providers (like `SocketProvider`, `CartProvider`, `OrderProvider`, `AssistanceProvider`) out of the root level. They should ONLY wrap the `AppLayout` or `PosLayout`. The `PublicLayout` (marketing pages) should not load WebSockets or staff contexts.

### Phase 3: Backend Foundation (Finish Menu Service Split)
We have started breaking up the 964-line `menu.service.ts` monolith but haven't wired it up.
1. Ensure `menu-crud.service.ts`, `menu-audit.service.ts`, and `menu-translation.service.ts` are fully complete.
2. Wire these new services into `menu.module.ts`.
3. Update all controllers to use the new split services.
4. **CRITICAL:** Delete the old monolithic `menu.service.ts` file entirely to prevent future merge conflicts.

### Phase 4: Phase 18 - Staff Roles & Database Update
We are adding granular staff roles.
1. Update Prisma `schema.prisma`:
   - Expand the `UserRole` enum to include `MANAGER`, `WAITER`, and `KITCHEN`.
   - Add an optional `pinHash` (String?) field to the `User` model.
2. Create `POST /api/restaurants/:id/staff` (Restricted to OWNER/MANAGER). It accepts `name` and `role`. It generates a random 4-digit PIN, bcrypt-hashes it, saves the user, and returns the raw PIN once.
3. Create `POST /api/auth/pin-login`. It accepts `restaurantId` and `pin`, compares the bcrypt hash, and issues the exact same `httpOnly` JWT cookie as our normal login.

### Phase 5: Phase 18 - Shared Device Mode & PIN Login UI
Hourly staff will not use emails. Managers will authorize a tablet, and staff will use a 4-digit PIN to access their views.
1. **Device Mode Activation:** Add a button in the Manager Settings to "Enable Shared Device Mode". This saves the active `restaurantId` to localStorage and redirects to `/device-login`.
2. **The Keypad UI (`/device-login`):** Build a full-viewport, touch-friendly numeric grid. On the 4th digit tapped, auto-submit to `/api/auth/pin-login` using the stored `restaurantId`.
3. **Smart Routing (`StaffRoute.tsx`):**
   - If `role === 'WAITER'`, redirect automatically to `/staff/pos`.
   - If `role === 'KITCHEN'`, redirect automatically to `/staff/kitchen`.
   - Block Waiters/Kitchen from accessing `/dashboard`.
4. **Auto-Lock Security:** Implement a listener wrapping POS layout. If idle for 5 minutes, automatically log out and return to the `/device-login` Keypad UI.
KSD stays always on unless tapped logout button so other shift can login. 
### Execution Instructions
Acknowledge this 5-phase roadmap. Then, outline your exact plan for **Phase 1** and wait for my explicit confirmation to write the code.