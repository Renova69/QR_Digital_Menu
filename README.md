# QR Menu App

> **Status:** 🚀 Migrated to Monorepo (Turborepo) - April 21, 2026
> **Stack:** React + NestJS + PostgreSQL (Neon)  
> **Workflow:** Turborepo-powered native development

A full-stack digital menu platform for restaurants. Owners create and manage menus, generate QR codes for each table, and customers scan to browse, order, and call for assistance — all from their phone, no app download required.

---

## 1. App Overview

**Purpose:**  
The QR Menu app allows restaurant owners to create, manage, and publish digital menus. Customers scan a QR code to instantly access the menu, place contactless orders, and call for a waiter — all from their device.

**Target Audience:**
- Restaurant owners and staff (admin dashboard)
- Restaurant patrons (customer-facing menu)

**Constraints:**
- Web-based, responsive for desktop & mobile
- Backend runs self-hosted or cloud-native (managed DB)
- PostgreSQL database (Neon Serverless)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo Tooling**| **Turborepo** (Fast task orchestration) |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Radix UI, TanStack Query, dnd-kit |
| **Backend** | NestJS 11, TypeScript, Prisma 6 ORM |
| **Database** | **Neon** (Serverless PostgreSQL) |
| **Authentication** | JWT + Google OAuth (via Passport.js) |
| **API Docs** | Swagger/OpenAPI (available at `/api-docs`) |
| **Deployment** | Docker Compose (optional for production simulation) |

---

## 3. Features

(Internal features remain the same...)

---

## 4. Quick Start (Monorepo Workflow)

This project uses **Turborepo**. You no longer need to manage separate terminal processes or bulky Docker containers for daily development.

**TL;DR:**
```bash
# 1. Install dependencies at the root
npm install

# 2. Setup environment variables
# Copy .env.example to apps/backend/.env and apps/frontend/.env

# 3. Synchronize Database (Neon)
cd apps/backend
npx prisma db push

# 4. Start everything (Frontend + Backend)
cd ../..
npm run dev
```

**Access Points:**
| Service | URL |
|---------|-----|
| Frontend (Dashboard) | http://localhost:3001 |
| Backend (API) | http://localhost:3000/api |
| API Documentation | http://localhost:3000/api-docs |

---

## 5. Directory Structure (Monorepo)

```
apps/
  backend/               # NestJS API (Prisma + PostgreSQL)
    prisma/              # DB Schema & Config
    src/                 # API Logic
  frontend/              # Vite React App (Dashboard + Public Menu)
    src/                 # UI Logic
packages/
  ts-config/             # Shared TypeScript configuration
```

### Backend Details
```
apps/backend/src/
  auth/                  # JWT + Google OAuth
  restaurant/            # Restaurant CRUD
  menu/                  # Categories, items, options
  orders/                # Order placement & status management
  tables/                # Table CRUD per restaurant
  dashboard/             # Summary statistics & analytics
  assistance/            # "Call waiter" request handling
  health/                # Health check endpoints
  main.ts                # App bootstrap (Static assets from uploads/)
```

### Frontend (React + Vite)
```
frontend/
  src/
    pages/                 # Route pages
      HomePage.tsx         # Landing page
      LoginPage.tsx        # Login form
      RegisterPage.tsx     # Registration form
      OAuthCallbackPage.tsx # Google OAuth callback handler
      DashboardPage.tsx    # Admin dashboard (tabbed)
      MenuEditorPage.tsx   # Menu builder interface
      PublicMenuPage.tsx   # Customer-facing menu (QR link target)
      CheckoutPage.tsx     # Cart checkout flow
      OrderConfirmationPage.tsx  # Post-order confirmation
      Dashboard/           # Dashboard sub-views (OrdersView, AssistanceView, SummaryView)
    components/
      Header.tsx           # Navigation header
      ProtectedRoute.tsx   # Auth-gated route wrapper
      ErrorBoundary.tsx    # React error boundary
      CreateRestaurantForm.tsx  # New restaurant onboarding
      RestaurantList.tsx   # Restaurant selector
      menu/                # Menu editor components (CategoryList, ItemList, forms, options)
      cart/                # Cart drawer & icon
      tables/              # Table management & QR code generation
      dashboard/           # Summary cards & recent orders
      ui/                  # UI primitives (Button, Input, Modal, BrandingEditor)
    context/               # React context providers
      AuthContext.tsx       # Authentication state
      RestaurantContext.tsx # Active restaurant state
      MenuContext.tsx       # Menu editor state
      CartContext.tsx       # Shopping cart state
      OrderContext.tsx      # Order management state
      AssistanceContext.tsx # Assistance request state
    hooks/                 # Custom React hooks
      useMenu.ts           # Menu CRUD operations
      usePublicMenu.ts     # Public menu data fetching
      useDashboard.ts      # Dashboard data fetching
    services/              # Service layer
      menuService.ts       # Menu API calls
      restaurantService.ts # Restaurant API calls
    lib/
      api.ts               # Axios client with interceptors
      utils.ts             # Utility functions
    types/                 # TypeScript type definitions
```

---

## 6. Database Schema

Key models in `prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `User` | Restaurant owners (email, password, role) |
| `Restaurant` | Restaurant profiles (name, country, branding) |
| `RestaurantTable` | Tables per restaurant (for QR codes) |
| `MenuCategory` | Menu sections with ordering |
| `MenuItem` | Individual dishes (price, allergens, dietary tags, image) |
| `MenuOption` | Variations & add-ons (VARIATION or ADDON type) |
| `Order` | Customer orders with status tracking |
| `OrderItem` | Individual items within an order |
| `AssistanceRequest` | "Call Waiter" requests |

---

## 7. Scaling Plan

**Now (MVP / Self-host):**
- Docker Compose on VPS (backend + frontend + Postgres)
- Local file storage for uploads
- Polling for data updates

**V2 (Growth):**
- WebSockets for real-time order tracking & notifications
- Stripe for digital payments
- Multi-language menu support
- Smart analytics dashboard
- Staff role management

**V3 (Enterprise):**
- Database → AWS RDS / Cloud SQL
- Uploads → S3 / GCS
- Backend → AWS ECS (Fargate) / GCP Cloud Run
- Redis for caching & message queues
- CDN for static assets
- POS integration (Square, Toast)

---

## 8. API Endpoints

Full interactive API documentation is available at `/api-docs` (Swagger UI) when the backend is running.

**Key endpoint groups:**
| Prefix | Description | Auth |
|--------|-------------|------|
| `POST /api/auth/*` | Login, register, Google OAuth | Public |
| `GET /api/auth/me` | Get current user | JWT |
| `CRUD /api/restaurants` | Restaurant management | JWT (owner) |
| `CRUD /api/menu/*` | Categories, items, options | JWT (owner) |
| `GET /api/menu/public/:id` | Public menu for customers | Public |
| `CRUD /api/restaurants/:id/tables` | Table management | JWT (owner) |
| `POST /api/orders` | Create order | Public |
| `GET /api/orders` | List orders (owner's restaurants) | JWT |
| `PATCH /api/orders/:id/status` | Update order status | JWT |
| `CRUD /api/assistance-requests` | Waiter call requests | Mixed |
| `GET /api/dashboard/summary` | Dashboard statistics | JWT |

---

## License

See [LICENSE](./LICENSE) for details.
