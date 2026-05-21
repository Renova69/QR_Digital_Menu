# QR Menu Application: Monorepo Developer Setup Guide

Welcome to the modernized QR Menu project! This guide will walk you through setting up the new **Turborepo** monorepo architecture. We have moved away from mandatory Docker-heavy development to a **"Native-First"** workflow that is significantly faster and more reliable.

### Prerequisites
Before you start, make sure you have:
1. **Node.js** (v20+ recommended)
2. **Neon.tech Account**: Get a free Serverless PostgreSQL database URL.
3. **NPM**: (Standard with Node.js)

---

## Step 1: Initialize the Monorepo

Open a terminal at the project root (`codespaces-react`) and run:

```bash
# Install all dependencies for both apps at once
npm install
```

This command uses **NPM Workspaces** to install and link everything in one go.

---

## Step 2: Configure Environment Secrets

The application now uses app-specific environment files.

1. **Backend**:
   - Copy `apps/backend/.env.example` to `apps/backend/.env`.
   - Update `DATABASE_URL` with your **Neon.tech** connection string.
   - Set a custom `JWT_SECRET`.
   - **Stripe payments** — set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`.
   - **SaaS subscription billing** — set 6 Stripe price IDs (monthly + yearly per tier) and the subscription webhook secret:
     - `STRIPE_PRICE_STARTER_MONTHLY`, `STRIPE_PRICE_STARTER_YEARLY`
     - `STRIPE_PRICE_PROFESSIONAL_MONTHLY`, `STRIPE_PRICE_PROFESSIONAL_YEARLY`
     - `STRIPE_PRICE_ENTERPRISE_MONTHLY`, `STRIPE_PRICE_ENTERPRISE_YEARLY`
     - `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (separate from Connect webhook secret)
     - See `apps/backend/.env.example` for Stripe Dashboard setup instructions.
   - **Email OTP** — set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
   - **Translation** — set `DEEPL_API_KEY` (platform-managed; never exposed to restaurant owners).
   - **Image storage** — set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` for Cloudflare R2.

2. **Frontend**:
   - Copy `apps/frontend/.env.example` to `apps/frontend/.env`.
   - Set `VITE_API_URL` to your backend origin + `/api` (e.g., `http://192.168.0.3:3000/api` or `http://localhost:3000/api`).
     - **Note:** The frontend does NOT call this URL directly. It uses `/api` as baseURL (same-origin). Vite's dev server proxies `/api` to the backend target derived from `VITE_API_URL`. This keeps httpOnly cookies working (no cross-origin blocking).

---

## Step 3: Synchronize the Database

Instead of local Docker Postgres, we use a cloud-native database. You must sync your schema once:

```bash
cd apps/backend
npx prisma db push
```

---

## Step 4: Start the Applications (The Fast Way)

You no longer need to manage multiple terminals. From the **root folder**, simply run:

```bash
npm run dev
```

This command uses **Turborepo** to start both the NestJS Backend and the React Frontend in parallel. Logs from both apps will be streamed to this single terminal.

---

## Step 5: Start using the application!

Your environment is now running natively on your host machine for maximum performance.

- **Frontend (Dashboard):** [http://localhost:3001](http://localhost:3001)
- **Backend (API Docs):** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

---

## Why this is better?

| Feature | Old (Docker) | New (Monorepo) |
|---------|--------------|----------------|
| **Start Time** | 2-5 Minutes | **~5 Seconds** |
| **HMR Speed** | 5-10 Seconds | **Instant (<100ms)** |
| **DB Reliability** | Hard to reset | **Cloud-persisted (Neon)** |
| **Complexity** | High (Docker YAML) | **Low (NPM Scripts)** |

---

## Auth Architecture — httpOnly Cookies + Vite Proxy (Dev) / Cross-Origin (Prod)

### How authentication works

1. User logs in → backend sets httpOnly cookie `token` with `sameSite: 'none'` in production, `'lax'` in dev, 1-day expiry
2. Frontend axios instance sends `withCredentials: true` → browser attaches cookie to all API requests
3. Backend `jwt.strategy.ts` reads token from `request.cookies.token` first, Bearer header fallback
4. On logout, backend clears the cookie

### Development: Same-Origin Vite Proxy

Frontend uses `/api/v1` as baseURL (same-origin). Vite dev server proxies `/api` and `/socket.io` to the real backend. Browser sees all requests as same-origin → `sameSite: 'lax'` cookies work.

### Production: Cross-Origin (Vercel → Cloud Run)

Frontend on Vercel and backend on Cloud Run are different origins. Vite proxy is not available on static hosting.

1. **`COOKIE_SAMESITE`** defaults to `'none'` in production (required for cross-origin cookies). `secure: true` already set.
2. **CORS** backend allows `.vercel.app` origins + `localhost` ports.
3. **`api.ts`** uses `VITE_API_URL` env directly in production: `VITE_API_URL=https://qr-menu-backend-822584248302.europe-west1.run.app/api/v1`.
4. **SPA routing** via `vercel.json` rewrites all paths to `/index.html`.

```javascript
// vite.config.js — proxy configuration (dev only)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendOrigin = (env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api\/?$/, '');
  return {
    server: {
      proxy: {
        '/api': { target: backendOrigin, changeOrigin: true },
        '/socket.io': { target: backendOrigin, changeOrigin: true, ws: true },
      },
    },
  };
});
```

### CSRF protection

Even though cookies are httpOnly, they're sent automatically. To prevent cross-site request forgery:

1. Frontend calls `GET /api/v1/auth/csrf-token` → receives `{ csrfToken }`, cookie `csrf-token` set (also `sameSite: 'none'` in production)
2. Frontend attaches `X-CSRF-Token` header on all POST/PATCH/DELETE/PUT requests
3. Backend validates header matches cookie before processing
4. Skipped in dev mode (`NODE_ENV !== 'production'`)
5. CSRF exempt: `/api/v1/auth/login`, `/api/v1/auth/register`, `/api/v1/auth/otp/send`, `/api/v1/auth/otp/verify`, `/api/v1/auth/google`, `/api/v1/auth/google/callback`

> **Google OAuth callback URL:** The authorized redirect URI registered in Google Cloud Console must be `https://<backend-url>/api/v1/auth/google/callback` (including `/v1/`). All frontend OAuth buttons construct their redirect as `/v1/auth/google`. A URL missing `/v1/` will return 404 — this was the root cause of the May 18, 2026 OAuth outage.

---

## Production Deployment

The app is deployed with a cross-origin architecture:

| Component | Platform | URL |
|-----------|----------|-----|
| **Frontend** | Vercel (Static) | `https://qr-digital-menu-ivory.vercel.app` |
| **Backend** | Google Cloud Run (Docker) | `https://qr-menu-backend-822584248302.europe-west1.run.app` |
| **Database** | Neon PostgreSQL | Serverless, auto-scaling |

### Deploy Backend (Cloud Run)

```bash
cd apps/backend
docker build -t gcr.io/<project>/qr-menu-backend .
docker push gcr.io/<project>/qr-menu-backend
gcloud run deploy qr-menu-backend \
  --image gcr.io/<project>/qr-menu-backend \
  --region europe-west1 \
  --allow-unauthenticated \
  --update-env-vars NODE_ENV=production,COOKIE_SAMESITE=none,...
```

> **WARNING:** Always use `--update-env-vars`, NEVER `--set-env-vars`. The `--set-env-vars` flag **wipes all existing env vars** and replaces them with only the values you pass — this will delete your database URL, JWT secret, API keys, and everything else in Cloud Run.

### Deploy Frontend (Vercel)

Set environment variable in Vercel dashboard:
- `VITE_API_URL=https://qr-menu-backend-822584248302.europe-west1.run.app/api`

Then push to trigger automatic deploy via Vercel GitHub integration.

### Key Production Env Vars

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `COOKIE_SAMESITE` | `none` (default in prod, override to `lax` for same-origin deploys) |
| `VITE_API_URL` | `https://<cloud-run-url>/api` |
| `FRONTEND_URL` | `https://<vercel-url>` |

---

## CI Gate

A GitHub Actions workflow at `.github/workflows/ci.yml` blocks merging to `main`/`master` if any check fails:

1. Backend unit tests — `npx jest --reporters=default --ci`
2. Frontend type-check — `npx tsc --noEmit`
3. Frontend tests — `npx vitest run`
4. Full build — `npx turbo run build`

After the first successful CI run, enable branch protection in GitHub → Settings → Branches → `main` → require status check `verify`.

## Troubleshooting

- **"Module not found"**: Always run `npm install` at the root, not inside subfolders.
- **"Database Error"**: Ensure your Neon DB URL includes `?sslmode=require` at the end.
- **"Port Conflict"**: If localhost:3000 or 3001 is taken, check for hanging node processes in your task manager.
- **"HMR not working"**: Ensure you are running `npm run dev` from the root folder.
- **"CI tests fail with tdd-guard-jest path error"**: The project has a `tdd-guard-jest` reporter with a hardcoded Windows path in `jest.config.js`. CI overrides it with `--reporters=default --ci`, which is correct. If you see this locally, use `npm test` (which uses the jest config), not `npx jest --reporters=default`.
