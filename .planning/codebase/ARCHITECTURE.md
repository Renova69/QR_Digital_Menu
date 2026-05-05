# Architecture

## Architectural Pattern

**Monorepo with separate backend and frontend applications.**

- **Backend:** NestJS modular architecture (Controller → Service → Prisma ORM)
- **Frontend:** React SPA with Context API for state, TanStack Query for server state

## System Overview

```
┌──────────────────────┐     ┌──────────────────────┐
│    Frontend (React)  │────▶│   Backend (NestJS)   │
│    Port 3001 (Vite)  │     │    Port 3000         │
│                      │     │    /api prefix        │
└──────────────────────┘     └──────────┬───────────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  PostgreSQL 15   │
                              │  Port 5432       │
                              └──────────────────┘
```

## Backend Architecture (NestJS)

### Module Structure

The backend follows NestJS's modular architecture. Each domain has its own module:

```
AppModule
├── ConfigModule (global)
├── PrismaModule (shared DB access)
├── AuthModule
├── RestaurantsModule
├── MenuModule
├── OrdersModule
├── AssistanceModule
└── DashboardModule
```

### Layer Pattern (per module)

```
Controller (HTTP layer)
    ↓ receives validated DTOs
Service (Business logic)
    ↓ calls Prisma methods
PrismaService (Database access)
    ↓ executes queries
PostgreSQL
```

### Key Abstractions

#### PrismaService (`backend/src/prisma/prisma.service.ts`)
- Extends `PrismaClient`, implements `OnModuleInit`
- Retry logic for database connections (15 attempts, 2s delay)
- Shutdown hooks for graceful exit (SIGINT/SIGTERM)
- Shared across all modules via `PrismaModule` (exported globally)

#### AuthService (`backend/src/auth/auth.service.ts`)
- Validates users via email/password (bcrypt compare)
- Issues JWT tokens with `{ email, sub: userId }` payload
- Handles Google OAuth user creation/lookup
- Registration with duplicate email detection

#### MenuService (`backend/src/menu/menu.service.ts`)
- Most complex service (219 lines)
- Manages categories, items, and menu options
- Ownership validation via `checkRestaurantOwnership()` on every mutation
- Public menu endpoint filters out-of-stock items
- Auto-increment `order` field for sorting

### Authentication Flow

```
1. Login: POST /api/auth/login
   → LocalAuthGuard → LocalStrategy.validate()
   → AuthService.login() → JWT signed and returned

2. Protected routes: 
   → JwtAuthGuard → JwtStrategy.validate()
   → Extracts user from JWT payload

3. Google OAuth:
   → GET /api/auth/google → Google login page
   → GET /api/auth/google/callback → Create/find user → issue JWT
```

### API Design

- Global prefix: `/api` (set in `main.ts`)
- Route structure: `/api/{module}/{resource}`
- Auth: Bearer token via `Authorization` header
- Validation: `class-validator` with `ValidationPipe({ whitelist: true })`
- Error handling: NestJS built-in exceptions (`NotFoundException`, `ForbiddenException`, `ConflictException`)

## Frontend Architecture (React)

### State Management

The frontend uses a **Context API + Hooks pattern** (6 contexts):

| Context | File | Purpose |
|---------|------|---------|
| `AuthContext` | `frontend/src/context/AuthContext.tsx` | User auth state, login/register/logout |
| `RestaurantContext` | `frontend/src/context/RestaurantContext.tsx` | Active restaurant selection |
| `MenuContext` | `frontend/src/context/MenuContext.tsx` | Menu editor state |
| `CartContext` | `frontend/src/context/CartContext.tsx` | Shopping cart with localStorage persistence |
| `OrderContext` | `frontend/src/context/OrderContext.tsx` | Order management |
| `AssistanceContext` | `frontend/src/context/AssistanceContext.tsx` | "Call waiter" feature state |

### Context Nesting (App.tsx)

```
Router
  └── AuthProvider
      └── RestaurantProvider
          └── CartProvider
              └── OrderProvider
                  └── AssistanceProvider
                      └── Header + Routes
```

### Routing Structure

| Path | Component | Access |
|------|-----------|--------|
| `/` | `HomePage` | Public |
| `/login` | `LoginPage` | Public |
| `/menu/public/:restaurantId` | `PublicMenuPage` | Public |
| `/checkout` | `CheckoutPage` | Public |
| `/order-confirmation` | `OrderConfirmationPage` | Public |
| `/dashboard` | `DashboardPage` | Protected |
| `/dashboard/menu` | `MenuEditorPage` | Protected |

### Data Fetching

- **Server state:** TanStack Query v5 via custom hooks (`useAuth`, `useMenu`, `usePublicMenu`, `useDashboard`)
- **API client:** Axios instance in `frontend/src/lib/api.ts`
- **Auth token:** Set on Axios default headers after login

### Component Hierarchy

```
App
├── Header (with LoginDialog)
├── Public routes
│   ├── PublicMenuPage → ItemWithOptions, CartDrawer, CartIcon
│   ├── CheckoutPage
│   └── OrderConfirmationPage
└── Protected routes
    ├── DashboardPage → SummaryCard, RecentOrders, OrdersView, AssistanceView
    └── MenuEditorPage → CategoryList, CreateCategoryForm, ItemList, CreateItemForm, ManageOptionsModal
```

### UI Component Library

Custom shadcn/ui-style components in `frontend/src/components/ui/`:
- `button.tsx` — CVA-based variant button
- `card.tsx` — Card layout primitives
- `input.tsx` — Styled input
- `textarea.tsx` — Styled textarea
- `table.tsx` — Table layout primitives
- `modal.tsx` — Basic modal component
- `LoginDialog.tsx` — Radix Dialog-based auth form
- `SortableItem.tsx` — dnd-kit sortable wrapper

## Data Flow

### Customer Order Flow
```
Customer scans QR → PublicMenuPage → Browse menu → Add to Cart (CartContext)
→ Checkout → CheckoutPage → Submit order (POST /api/orders) → OrderConfirmation
```

### Admin Menu Management Flow
```
Login → Dashboard → Menu Editor → CRUD operations
→ Changes persisted via Prisma → Visible on public menu
```

### Data Model Relationships
```
User (owner) ←──1:N──→ Restaurant
Restaurant ←──1:N──→ MenuCategory ←──1:N──→ MenuItem ←──1:N──→ MenuOption
Restaurant ←──1:N──→ Order ←──1:N──→ OrderItem ──→ MenuItem
Restaurant ←──1:N──→ AssistanceRequest
```

## Entry Points

| Entry Point | File | Purpose |
|-------------|------|---------|
| Backend main | `backend/src/main.ts` | NestJS bootstrap, CORS, Swagger, `/api` prefix |
| Frontend main | `frontend/src/index.tsx` | React root render with QueryClientProvider |
| App routes | `frontend/src/App.tsx` | Router + Context providers + Route definitions |
| Docker entry | `docker-compose.yml` | Multi-service orchestration |
| Database seed | `backend/prisma/seed.ts` | Demo data initialization |
