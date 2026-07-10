# Technology Stack

## Languages & Runtimes

| Layer    | Language         | Version Target                  |
| -------- | ---------------- | ------------------------------- |
| Backend  | TypeScript       | ES2022, CommonJS modules        |
| Frontend | TypeScript / JSX | ES modules (`"type": "module"`) |
| Database | SQL (PostgreSQL) | 15 (Alpine docker image)        |
| Runtime  | Node.js          | 20 (Alpine docker image)        |

## Frameworks

### Backend — NestJS v11

- **Core:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` (v11.0.1)
- **Config:** `@nestjs/config` (v4.0.2) — global config via `ConfigModule.forRoot()`
- **Auth:** `@nestjs/passport` (v11.0.5), `@nestjs/jwt` (v11.0.0)
- **API Docs:** `@nestjs/swagger` (v11.2.0) + `swagger-ui-express` (v5.0.1) — Swagger UI at `/api-docs`
- **Validation:** `class-validator` (v0.14.2), `class-transformer` (v0.5.1)
- **Build:** NestJS CLI (`@nestjs/cli` v11.0.0), `nest build` output to `dist/`

### Frontend — React 18 + Vite

- **React:** v18.2.0 with `react-dom` v18.2.0
- **Build tool:** Vite v6.2.7 with `@vitejs/plugin-react` (v4.7.0)
- **Routing:** `react-router-dom` v7.8.2
- **State/Data Fetching:** `@tanstack/react-query` v5.85.5
- **UI Library:** Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-slot`, `@radix-ui/react-icons`)
- **Styling:** Tailwind CSS v4.1.12 + `tailwindcss-animate`, `autoprefixer`, PostCSS
- **Drag-and-drop:** `@dnd-kit/core` v6.3.1, `@dnd-kit/sortable` v10.0.0
- **HTTP Client:** Axios v1.11.0
- **QR Code:** `react-qr-code` v2.0.18
- **Icons:** `lucide-react` v0.542.0
- **Utilities:** `clsx`, `tailwind-merge`, `class-variance-authority` (CVA)

## ORM & Database

- **ORM:** Prisma v6.15.0 (`@prisma/client` v6.15.0)
- **Database:** PostgreSQL 15 (dockerized)
- **Schema:** `backend/prisma/schema.prisma`
- **Migrations:** 2 migrations in `backend/prisma/migrations/`
  - `20250828133005_init` — Initial schema
  - `20250830151200_add_order_field` — Added `order` field for sorting
- **Seed:** `backend/prisma/seed.ts` — creates admin user, demo restaurant, and sample menu items
- **Config:** `backend/prisma.config.js`

## Authentication

- **Passport.js** with 3 strategies:
  - `passport-local` — Email/password login
  - `passport-jwt` — JWT token verification
  - `passport-google-oauth20` — Google OAuth 2.0
- **Password hashing:** `bcryptjs` v3.0.2
- **Token storage:** JWT in `localStorage` (frontend sets `Authorization: Bearer` header)

## Build & Tooling

### Backend

- **Compiler:** TypeScript v5.7.3 via `ts-jest`, `ts-node`, `ts-loader`
- **Linter:** ESLint v9.18.0 with `typescript-eslint`, flat config (`eslint.config.mjs`)
- **Formatter:** Prettier v3.4.2 — single quotes, trailing commas
- **Dev server:** `nodemon` — rebuilds and restarts on changes
- **Test runner:** Jest v30.0.0 with `ts-jest`, `supertest` for E2E

### Frontend

- **Build:** Vite v6.2.7
- **TypeScript:** v5.9.2 with `vite-tsconfig-paths` for path aliases
- **CSS Processing:** PostCSS with `@tailwindcss/postcss` v4.1.12
- **Test runner:** Vitest v3.0.7 with `jsdom` environment
- **Production server:** `serve` v14.2.0 (static file server)

## Configuration Files

| File                          | Purpose                                          |
| ----------------------------- | ------------------------------------------------ |
| `backend/tsconfig.json`       | Backend TS config (CommonJS, ES2022, decorators) |
| `backend/tsconfig.build.json` | Production build excludes                        |
| `backend/nest-cli.json`       | NestJS CLI options                               |
| `backend/eslint.config.mjs`   | ESLint flat config                               |
| `backend/.prettierrc`         | Prettier settings                                |
| `frontend/vite.config.js`     | Vite + React plugin + tsconfig paths             |
| `frontend/tailwind.config.js` | Tailwind theme with shadcn/ui design tokens      |
| `frontend/postcss.config.js`  | PostCSS with Tailwind                            |
| `frontend/tsconfig.json`      | Frontend TS config                               |
| `docker-compose.yml`          | Multi-service deployment orchestration           |

## Environment Variables

| Variable               | Service  | Purpose                                            |
| ---------------------- | -------- | -------------------------------------------------- |
| `DATABASE_URL`         | Backend  | PostgreSQL connection string                       |
| `JWT_SECRET`           | Backend  | JWT signing secret                                 |
| `GOOGLE_CLIENT_ID`     | Backend  | Google OAuth client ID                             |
| `GOOGLE_CLIENT_SECRET` | Backend  | Google OAuth client secret                         |
| `GOOGLE_CALLBACK_URL`  | Backend  | Google OAuth redirect URL                          |
| `FRONTEND_URL`         | Backend  | CORS origin (`http://localhost:3001`)              |
| `VITE_API_URL`         | Frontend | Backend API base URL (`http://localhost:3000/api`) |
