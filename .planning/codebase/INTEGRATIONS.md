# External Integrations

## Database — PostgreSQL

- **Provider:** PostgreSQL 15 (Alpine) via Docker
- **Connection:** `DATABASE_URL` environment variable
- **ORM:** Prisma Client with auto-retry connection logic (15 retries, 2s delay)
- **Docker service:** `db` in `docker-compose.yml` with healthcheck
- **Volume:** Named volume `pg` for data persistence
- **Schema:** `backend/prisma/schema.prisma`

### Connection Pattern
```typescript
// backend/src/prisma/prisma.service.ts
// PrismaService extends PrismaClient with retry logic on module init
async onModuleInit() {
  const maxRetries = 15;
  const retryDelay = 2000;
  // Retry loop with $connect()
}
```

## Authentication — Google OAuth 2.0

- **Library:** `passport-google-oauth20`
- **Strategy:** `backend/src/auth/google.strategy.ts`
- **Guard:** `backend/src/auth/google-auth.guard.ts`
- **Endpoints:**
  - `GET /api/auth/google` — Initiates OAuth flow
  - `GET /api/auth/google/callback` — Handles OAuth callback
- **Behavior:** Creates user if not exists, generates JWT on success
- **Config:**
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_CALLBACK_URL` (default: `http://localhost:3000/auth/google/callback`)

## API Communication (Frontend ↔ Backend)

- **HTTP Client:** Axios with base URL `http://localhost:3000/api`
- **Auth:** Bearer token in `Authorization` header (set via interceptor)
- **CORS:** Enabled on backend for `http://localhost:3001` with credentials
- **Config file:** `frontend/src/lib/api.ts`

### API Endpoints Consumed by Frontend

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/auth/login` | POST | Email/password login | No |
| `/auth/register` | POST | User registration | No |
| `/auth/me` | GET | Get current user | Yes |
| `/menu/public/:restaurantId` | GET | Public menu for customers | No |
| `/restaurants` | GET/POST | Restaurant CRUD | Yes |
| `/restaurants/:id` | GET/PATCH/DELETE | Single restaurant operations | Yes |
| `/orders` | GET/POST | Order management | Partial |
| `/orders/:id/status` | PATCH | Update order status | Yes |
| `/assistance-requests` | GET/POST | Assistance request management | Partial |
| `/assistance-requests/:id` | PATCH | Resolve assistance request | Yes |
| `/dashboard/summary` | GET | Dashboard statistics | Yes |
| `/menu/categories` | GET/POST | Category management | Yes |
| `/menu/items` | GET/POST | Item management | Yes |
| `/menu/options` | GET/POST | Menu option management | Yes |

## API Documentation — Swagger

- **URL:** `/api-docs`
- **Library:** `@nestjs/swagger` + `swagger-ui-express`
- **Config:** `backend/src/main.ts` — `DocumentBuilder` with tags and bearer auth
- **Tags:** `authentication`, `menu`, `restaurants`, `dashboard`

## Containerization — Docker

### Backend Service (`app`)
- **Dockerfile:** `backend/Dockerfile` (Node 20 Alpine)
- **Port:** 3000
- **Build steps:** `npm install` → `prisma generate` → `nest build`
- **Volumes:** Source code mounted, `node_modules` and `dist` excluded

### Frontend Service
- **Dockerfile:** `frontend/Dockerfile` (Node 20 Alpine)
- **Port:** 3001 (via `serve`)
- **Note:** Dockerfile has a bug — runs `npm run build` before `COPY . .`

### Test Service (`test-app`)
- **Same image as backend**
- **Command:** `npm run test:e2e`
- **Environment:** `NODE_ENV=test`, separate test database (`qr_menu_test`)

### Database Service (`db`)
- **Image:** `postgres:15-alpine`
- **Healthcheck:** `pg_isready -U postgres` every 5s

## DevContainers

- **Config:** `.devcontainer/devcontainer.json`
- **Purpose:** GitHub Codespaces / VS Code Remote development support

## Future Integrations (Planned)

Per `README.md` and `CODING_ROADMAP.md`:
- **File Storage:** Currently local → planned migration to AWS S3 / GCP Cloud Storage
- **Managed Database:** AWS RDS / GCP Cloud SQL
- **Container Orchestration:** AWS ECS/Fargate, GCP Cloud Run, or Kubernetes
- **Caching:** Redis for caching/order queue
- **Real-time:** WebSockets for live waiter call notifications
- **Payments:** Stripe integration (post-MVP)
