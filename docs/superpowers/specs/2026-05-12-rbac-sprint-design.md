# RBAC Sprint Design — Staff Roles, Menu Split & Shared Device Mode

**Date:** 2026-05-12
**Status:** Approved — awaiting implementation plan
**Scope:** 5 phases (Phase 1 pre-completed), spanning frontend auth consolidation, backend menu service split, staff roles + PIN auth, and shared device mode

---

## Phase 1 — Wire KDS Route (Pre-completed)

**Status:** Done. No work needed.

Route `/staff/kitchen` renders `KitchenPage` wrapped in `StaffRoute` at `apps/frontend/src/App.tsx:99-105`. Backend `EventsGateway` already emits `orderCreated` / `orderStatusChanged` events consumed by the kitchen display.

---

## Phase 2 — Frontend Foundation

### 2.1 Consolidate Auth

Merge the standalone `useAuth.ts` hook (TanStack Query wrapper) into `AuthContext.tsx` (raw useState). Single source of truth backed by React Query, JWT stays in httpOnly cookie — no localStorage token access anywhere.

**Files to change:**
- `apps/frontend/src/context/AuthContext.tsx` — absorb `useAuth` logic, export `useAuth` from here
- `apps/frontend/src/hooks/useAuth.ts` — delete after migration
- All consumers of `useAuth` — update import path only (API unchanged)

**Contract (unchanged):**
```ts
const { user, isLoading, isAuthenticated, login, logout, loginWithToken } = useAuth()
```

### 2.2 Provider Splitting

Heavy providers (`SocketProvider`, `CartProvider`, `OrderProvider`, `AssistanceProvider`) currently wrap the entire app at root level. They should only wrap layouts that need them.

**Target layout wiring:**

| Layout | Providers needed |
|--------|-----------------|
| `AppLayout` (dashboard, settings, staff views) | Auth, Restaurant, Socket, Notification |
| `PosLayout` (/staff/pos) | Auth, Pos (isolated from CartContext), Socket, Notification |
| `PublicLayout` (customer menu, checkout) | Auth, Cart, Order, Assistance, Socket, Restaurant, Notification |

**Files to change:**
- `apps/frontend/src/App.tsx` — restructure provider nesting per layout
- `apps/frontend/src/layouts/AppLayout.tsx` — add provider wrapper
- `apps/frontend/src/layouts/PosLayout.tsx` — add provider wrapper
- `apps/frontend/src/layouts/PublicLayout.tsx` — add provider wrapper

**Rule:** No provider moved into a layout should break existing `useContext` calls. Verify every consumer still sits under its provider in the React tree.

---

## Phase 3 — Backend Menu Service Split

### 3.1 Verify Split Services

Three split services exist (untracked) and are complete:
- `apps/backend/src/menu/menu-crud.service.ts` — CRUD operations for categories, items, options
- `apps/backend/src/menu/menu-audit.service.ts` — menu health checks, audit rules
- `apps/backend/src/menu/menu-translation.service.ts` — DeepL pre-warm + on-demand translation

These are already wired into `menu.module.ts` providers but controllers still import from the old `menu.service.ts`.

### 3.2 Update Controllers

Five controllers import `MenuService` from `./menu.service`. Each must be updated to import only the split service(s) it actually uses:

| Controller | Current import | Replace with |
|-----------|---------------|--------------|
| `category.controller.ts` | `MenuService` | `MenuCrudService` |
| `item.controller.ts` | `MenuService` | `MenuCrudService` |
| `public-menu.controller.ts` | `MenuService` | `MenuCrudService` + `MenuTranslationService` |
| `audit.controller.ts` | `MenuService` | `MenuAuditService` |
| `menu-option.controller.ts` | `MenuService` | `MenuCrudService` |

Constructor signatures and method calls updated to match.

### 3.3 Delete Monolith

- Delete `apps/backend/src/menu/menu.service.ts` (197 lines, now a pass-through delegator)
- Remove `MenuService` from `menu.module.ts` imports and providers
- Update `menu.module.ts` exports to list `MenuCrudService`, `MenuTranslationService`, `MenuAuditService`

---

## Phase 4 — Staff Roles & Database

### 4.1 Schema Changes

**Prisma schema (`apps/backend/prisma/schema.prisma`):**

```prisma
enum UserRole {
  OWNER
  MANAGER    // new
  WAITER     // new
  KITCHEN    // new
  STAFF      // existing — keep for backward compat, migrate existing STAFF → WAITER
  CUSTOMER
}

model User {
  // ... existing fields ...
  pinHash   String?   // new — bcrypt-hashed 4-digit PIN for shared device login
}
```

Migration: existing `STAFF` users upgraded to `WAITER` role via data migration script.

### 4.2 Permission Matrix

| Action | OWNER | MANAGER | WAITER | KITCHEN |
|--------|-------|---------|--------|---------|
| Full dashboard access | Yes | Yes | No | No |
| Staff management (create/delete) | Yes | Yes | No | No |
| Menu CRUD | Yes | Yes | No | No |
| Analytics | Yes | Yes | No | No |
| Orders — view/manage | Yes | Yes | View own | View KDS |
| POS access | Yes | Yes | Auto-redirect | No |
| Kitchen display | Yes | Yes | No | Auto-redirect |
| Delete restaurant | Yes | No | No | No |
| Stripe/billing | Yes | No | No | No |
| Shared device mode toggle | Yes | Yes | No | No |

Guard implementation: `StaffRoute` expanded to accept allowed roles array. Dashboard routes wrapped with role check blocking WAITER and KITCHEN.

### 4.3 New Endpoints

**`POST /api/restaurants/:id/staff`** — Create staff member (OWNER/MANAGER only)
- Body: `{ name: string, email?: string, role: "WAITER" | "KITCHEN" | "MANAGER" }`
- Generates random 4-digit PIN, bcrypt-hashes it (10 rounds), saves user
- Returns `{ user, rawPin: "1234" }` — raw PIN shown once, never stored
- Rate-limited: 10 requests per minute per restaurant

**`POST /api/auth/pin-login`** — PIN-based shared device login
- Body: `{ restaurantId: string, pin: string }`
- Looks up user by restaurantId + role IN (WAITER, KITCHEN, MANAGER), compares bcrypt hash
- Issues same httpOnly JWT cookie as normal login
- Returns user object (no token in body)
- Rate-limited: 5 attempts per 60s per restaurant
- Brute-force: 5 failed attempts → 15-min lockout (reuse existing OTP lockout pattern from `auth.service.ts:322-348`)

### 4.4 Files to Create/Change

| File | Action |
|------|--------|
| `apps/backend/prisma/schema.prisma` | Modify — enum + pinHash field |
| `apps/backend/src/auth/auth.service.ts` | Modify — add `pinLogin()` method |
| `apps/backend/src/auth/auth.controller.ts` | Modify — add `POST /auth/pin-login` route |
| `apps/backend/src/auth/dto/pin-login.dto.ts` | Create — validation DTO |
| `apps/backend/src/users/users.service.ts` | Modify — add `createStaffMember()` method |
| `apps/backend/src/users/dto/create-staff.dto.ts` | Create — validation DTO |
| `apps/backend/src/users/users.controller.ts` | Modify — add `POST /restaurants/:id/staff` route |
| `apps/frontend/src/components/StaffRoute.tsx` | Modify — expand allowed roles, add smart redirect |

---

## Phase 5 — Shared Device Mode & PIN UI

### 5.1 Device Mode Activation

Manager Settings page gets an "Enable Shared Device Mode" button. On click:
1. Saves `{ restaurantId, restaurantName }` to `localStorage` key `sharedDevice`
2. Redirects to `/device-login`

### 5.2 Keypad UI (`/device-login`)

Full-viewport, dark-themed, mobile-first (375px baseline) touch interface.

**States:**
- **Idle:** Restaurant name + icon header, 4 empty PIN dots, 3×3 numeric grid + 0 + backspace
- **Partial entry:** Filled dots for each digit tapped (indigo `#6366f1`), backspace clears last
- **Submitting:** All 4 dots filled, auto-submit fires on 4th digit — no submit button needed
- **Error:** Dots turn red (`#ef4444`), shake animation on dot row, message "Wrong PIN — N attempts remaining", dots clear after 800ms
- **Locked out:** "Too many attempts — try again in N minutes", keypad disabled, countdown timer

**Design spec:** See visual companion mockup (`device-login.html`). Colors: background `#0f172a`, keypad tiles `#1e293b`, active dot `#6366f1`, error `#ef4444`, empty dot border `#475569`, text `#f1f5f9`. Typography: Outfit font, 24px keypad digits, 18px restaurant name.

**Route:** Public (no auth required). Reads `restaurantId` from `localStorage.sharedDevice`. If missing, shows "No device configured" with instructions to contact manager.

**File:** `apps/frontend/src/pages/DeviceLoginPage.tsx`

### 5.3 Smart Routing

`StaffRoute` updated to redirect by role after authentication:
- `WAITER` → `/staff/pos`
- `KITCHEN` → `/staff/kitchen`
- `MANAGER` / `OWNER` → requested path (dashboard, settings, etc.)

Dashboard routes block WAITER and KITCHEN with redirect to their assigned view.

### 5.4 Auto-Lock (POS only)

Idle timer on `PosLayout`: 5 minutes of no pointer/touch/keyboard events → auto logout + redirect to `/device-login`.

Implementation: event listener on `document` for `pointerdown`, `keydown`, `touchstart` — reset 5-minute timeout on each event. On timeout: call `logout()`, clear POS state, navigate to `/device-login`.

KDS (`/staff/kitchen`) stays always on — no auto-lock. Manual logout button only.

### 5.5 Files to Create/Change

| File | Action |
|------|--------|
| `apps/frontend/src/pages/DeviceLoginPage.tsx` | Create — full keypad UI with all states |
| `apps/frontend/src/components/StaffRoute.tsx` | Modify — role-based redirect |
| `apps/frontend/src/layouts/PosLayout.tsx` | Modify — add idle timer |
| `apps/frontend/src/pages/dashboard/SettingsView.tsx` | Modify — add shared device toggle button |
| `apps/frontend/src/App.tsx` | Modify — add `/device-login` route |

---

## Execution Order

Phases must run sequentially — each depends on the prior:

```
Phase 2 → Phase 3 → Phase 4 → Phase 5
```

Phase 1 is pre-completed and skipped.

**Rationale:** Phase 2 cleans up frontend auth before Phase 4 adds PIN login. Phase 3 removes the menu monolith before Phase 4's schema changes could create merge conflicts. Phase 4's roles and PIN endpoint must exist before Phase 5's UI can call them.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Provider split breaks useContext consumers | Medium | Audit every `useContext` call site before moving; verify React tree at each layout |
| Old MenuService deletion breaks undiscovered import | Low | Grep entire codebase for `menu.service` imports before deleting |
| PIN brute-force bypass | Low | Reuse existing OTP lockout pattern (attempts counter + lockedUntil timestamp) |
| STAFF→WAITER migration breaks existing users | Low | Data migration script; STAFF role kept in enum for backward compat |
| Auto-lock fires during active POS use (e.g., long order entry) | Medium | Reset timer on ANY pointer/touch/keyboard event; 5-min window is generous |
