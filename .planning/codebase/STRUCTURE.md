# Directory Structure

## Root Layout

```
codespaces-react/
├── .devcontainer/          # GitHub Codespaces / VS Code Remote config
│   ├── devcontainer.json
│   └── icon.svg
├── .vscode/                # VS Code workspace settings
├── backend/                # NestJS API server
├── frontend/               # React SPA client
├── jules-scratch/          # Scratch/experimental directory
├── docker-compose.yml      # Multi-service Docker orchestration
├── package.json            # Root workspace dependencies (shared types)
├── package-lock.json       # Root lockfile
├── .dockerignore
├── .gitignore
├── CODING_ROADMAP.md       # Step-by-step development plan
├── README.md               # Project overview and architecture
├── LICENSE                 # MIT License
├── backend.log             # Backend process log (gitignored)
└── frontend.log            # Frontend process log (gitignored)
```

## Backend Structure (`backend/`)

```
backend/
├── src/
│   ├── main.ts                          # App bootstrap, CORS, Swagger
│   ├── app.module.ts                    # Root module imports
│   ├── app.controller.ts               # Root / and /api endpoints
│   ├── app.controller.spec.ts           # Unit test for AppController
│   ├── app.service.ts                   # Root service (minimal)
│   │
│   ├── prisma/                          # Database access layer
│   │   ├── prisma.module.ts             # Exports PrismaService
│   │   └── prisma.service.ts            # PrismaClient wrapper with retry
│   │
│   ├── auth/                            # Authentication module
│   │   ├── auth.module.ts               # JwtModule, PassportModule config
│   │   ├── auth.controller.ts           # /auth/* endpoints
│   │   ├── auth.service.ts              # Login, register, Google OAuth logic
│   │   ├── jwt.strategy.ts              # JWT Passport strategy
│   │   ├── jwt-auth.guard.ts            # JWT guard
│   │   ├── local.strategy.ts            # Local (email/password) strategy
│   │   ├── local-auth.guard.ts          # Local auth guard
│   │   ├── google.strategy.ts           # Google OAuth strategy
│   │   ├── google-auth.guard.ts         # Google auth guard
│   │   ├── auth-user.decorator.ts       # @AuthUser() param decorator
│   │   ├── dto/                         # Auth DTOs
│   │   └── entities/                    # Auth entities
│   │
│   ├── users/                           # User data access
│   │   ├── users.module.ts
│   │   └── users.service.ts             # findByEmail, create
│   │
│   ├── restaurants/                     # Restaurant management
│   │   ├── restaurants.module.ts
│   │   ├── restaurants.controller.ts    # /restaurants/* CRUD
│   │   ├── restaurants.service.ts       # CRUD with ownership checks
│   │   ├── dto/
│   │   └── entities/
│   │
│   ├── menu/                            # Menu management (largest module)
│   │   ├── menu.module.ts
│   │   ├── menu.service.ts              # Categories, items, options CRUD
│   │   ├── category.controller.ts       # /menu/categories/*
│   │   ├── item.controller.ts           # /menu/items/*
│   │   ├── menu-option.controller.ts    # /menu/options/*
│   │   ├── public-menu.controller.ts    # /menu/public/:restaurantId
│   │   ├── dto/
│   │   └── entities/
│   │
│   ├── orders/                          # Order management (stub)
│   │   ├── orders.module.ts
│   │   ├── orders.controller.ts
│   │   ├── orders.service.ts            # Placeholder implementation
│   │   ├── dto/
│   │   └── entities/
│   │
│   ├── assistance/                      # Waiter call feature (stub)
│   │   ├── assistance.module.ts
│   │   ├── assistance.controller.ts
│   │   ├── assistance.service.ts        # Placeholder implementation
│   │   ├── dto/
│   │   └── entities/
│   │
│   └── dashboard/                       # Dashboard statistics
│       ├── dashboard.module.ts
│       ├── dashboard.controller.ts
│       └── dashboard.service.ts         # Summary aggregations
│
├── prisma/
│   ├── schema.prisma                    # Database schema (8 models)
│   ├── seed.ts                          # Demo data seeder
│   └── migrations/                      # Prisma migrations (2)
│       ├── 20250828133005_init/
│       └── 20250830151200_add_order_field/
│
├── test/
│   ├── app.e2e-spec.ts                  # App E2E test
│   ├── dashboard.e2e-spec.ts            # Dashboard E2E test
│   └── jest-e2e.json                    # E2E test config
│
├── Dockerfile                           # Backend container (Node 20 Alpine)
├── package.json                         # Backend dependencies & scripts
├── tsconfig.json                        # TypeScript config
├── tsconfig.build.json                  # Build-specific TS config
├── nest-cli.json                        # NestJS CLI config
├── eslint.config.mjs                    # ESLint flat config
├── .prettierrc                          # Prettier config
├── prisma.config.js                     # Prisma config
└── .gitignore
```

## Frontend Structure (`frontend/`)

```
frontend/
├── src/
│   ├── index.tsx                        # React root, QueryClientProvider
│   ├── App.tsx                          # Router, context providers, routes
│   ├── App.css                          # App-level styles
│   ├── App.test.tsx                     # Basic App render test
│   ├── index.css                        # Tailwind + shadcn/ui CSS variables
│   ├── logo.svg
│   ├── reportWebVitals.js
│   ├── setupTests.js
│   │
│   ├── pages/                           # Route-level components
│   │   ├── HomePage.tsx                 # Landing page (minimal)
│   │   ├── LoginPage.tsx                # Login redirect/page
│   │   ├── DashboardPage.tsx            # Admin dashboard (summary, orders, assistance tabs)
│   │   ├── MenuEditorPage.tsx           # Menu builder (categories + items)
│   │   ├── PublicMenuPage.tsx           # Customer-facing menu display
│   │   ├── CheckoutPage.tsx             # Cart checkout form
│   │   ├── OrderConfirmationPage.tsx    # Post-order confirmation
│   │   └── Dashboard/                   # Dashboard sub-views
│   │       ├── OrdersView.tsx           # Orders management tab
│   │       └── AssistanceView.tsx       # Assistance requests tab
│   │
│   ├── components/                      # Shared components
│   │   ├── Header.tsx                   # App header/navbar
│   │   ├── ProtectedRoute.tsx           # Auth route guard
│   │   ├── CreateRestaurantForm.tsx     # New restaurant form
│   │   ├── RestaurantList.tsx           # Restaurant listing
│   │   │
│   │   ├── ui/                          # UI primitives (shadcn/ui-style)
│   │   │   ├── button.tsx              # CVA variant button
│   │   │   ├── card.tsx                # Card layout components
│   │   │   ├── input.tsx               # Styled input
│   │   │   ├── textarea.tsx            # Styled textarea
│   │   │   ├── table.tsx               # Table layout components
│   │   │   ├── modal.tsx               # Basic modal
│   │   │   ├── LoginDialog.tsx         # Auth dialog (Radix)
│   │   │   └── SortableItem.tsx        # dnd-kit wrapper
│   │   │
│   │   ├── menu/                        # Menu-specific components
│   │   │   ├── CategoryList.tsx
│   │   │   ├── CreateCategoryForm.tsx
│   │   │   ├── CreateItemForm.tsx
│   │   │   ├── ItemList.tsx
│   │   │   ├── ItemWithOptions.tsx     # Public menu item card
│   │   │   ├── ManageOptionsModal.tsx  # Item options editor
│   │   │   └── Cart.tsx                # Cart component
│   │   │
│   │   ├── cart/                        # Cart overlay components
│   │   │   ├── CartDrawer.tsx          # Slide-out cart
│   │   │   └── CartIcon.tsx            # Cart badge icon
│   │   │
│   │   └── dashboard/                   # Dashboard widgets
│   │       ├── SummaryCard.tsx          # Stat card
│   │       └── RecentOrders.tsx        # Recent orders list
│   │
│   ├── context/                         # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── RestaurantContext.tsx
│   │   ├── MenuContext.tsx
│   │   ├── CartContext.tsx
│   │   ├── OrderContext.tsx
│   │   └── AssistanceContext.tsx
│   │
│   ├── hooks/                           # Custom React hooks
│   │   ├── useAuth.ts                  # TanStack Query auth hook
│   │   ├── useMenu.ts                  # Menu data hooks
│   │   ├── usePublicMenu.ts            # Public menu data hook
│   │   └── useDashboard.ts             # Dashboard data hook
│   │
│   ├── services/                        # API service wrappers
│   │   ├── menuService.ts              # Menu API calls
│   │   └── restaurantService.ts        # Restaurant API calls
│   │
│   ├── lib/                             # Utilities
│   │   ├── api.ts                      # Axios instance + API functions
│   │   └── utils.ts                    # cn() utility (clsx + tailwind-merge)
│   │
│   └── types/                           # TypeScript type definitions
│       └── index.ts                    # Order, Item, Category interfaces
│
├── public/                              # Static assets
├── backend/                             # (appears to be empty/unused)
├── Dockerfile                           # Frontend container
├── package.json                         # Frontend dependencies & scripts
├── vite.config.js                       # Vite configuration
├── tailwind.config.js                   # Tailwind CSS configuration
├── postcss.config.js                    # PostCSS configuration
├── tsconfig.json                        # TypeScript configuration
├── jsconfig.json                        # JS config (path aliases)
├── index.html                           # Vite HTML entry point
└── build.log                            # Build output log
```

## Naming Conventions

### Files
- **Backend controllers:** `{domain}.controller.ts` (e.g., `restaurants.controller.ts`)
- **Backend services:** `{domain}.service.ts`
- **Backend modules:** `{domain}.module.ts`
- **Backend DTOs:** `create-{domain}.dto.ts`, `update-{domain}.dto.ts`
- **Frontend pages:** `{Name}Page.tsx` (PascalCase)
- **Frontend components:** `{Name}.tsx` (PascalCase)
- **Frontend hooks:** `use{Name}.ts` (camelCase with `use` prefix)
- **Frontend contexts:** `{Name}Context.tsx`

### Code
- **Backend:** Classes use PascalCase, methods use camelCase
- **Frontend:** Components use PascalCase, hooks use camelCase with `use` prefix
- **Database tables:** snake_case (via Prisma `@@map()`)
- **Database IDs:** CUID (`@default(cuid())`)

## Key Locations

| What | Where |
|------|-------|
| API routes | `backend/src/*/[name].controller.ts` |
| Business logic | `backend/src/*/[name].service.ts` |
| Database schema | `backend/prisma/schema.prisma` |
| App routes | `frontend/src/App.tsx` |
| API client | `frontend/src/lib/api.ts` |
| Design tokens | `frontend/src/index.css` |
| Type definitions | `frontend/src/types/index.ts` |
| Docker config | `docker-compose.yml` |
