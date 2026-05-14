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

## Auth Architecture — httpOnly Cookies + Vite Proxy

### How authentication works

1. User logs in → backend sets httpOnly cookie `token` with `sameSite: 'lax'`, 1-day expiry
2. Frontend axios instance sends `withCredentials: true` → browser attaches cookie to all `/api` requests
3. Backend `jwt.strategy.ts` reads token from `request.cookies.token`
4. On logout, backend clears the cookie

### Why same-origin proxy?

httpOnly cookies with `sameSite: 'lax'` are NOT sent by browsers on cross-site AJAX requests. `localhost:3001` (frontend) and `192.168.0.3:3000` (backend) are different sites.

The fix: frontend uses `/api` as baseURL (same-origin). Vite dev server proxies `/api` and `/socket.io` to the real backend. The browser sees all requests as same-origin → cookies work.

```javascript
// vite.config.js — proxy configuration
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

1. Frontend calls `GET /api/auth/csrf-token` → receives `{ csrfToken }`, cookie `csrf-token` set
2. Frontend attaches `X-CSRF-Token` header on all POST/PATCH/DELETE/PUT requests
3. Backend validates header matches cookie before processing
4. Skipped in dev mode (`NODE_ENV !== 'production'`)

---

## Troubleshooting

- **"Module not found"**: Always run `npm install` at the root, not inside subfolders.
- **"Database Error"**: Ensure your Neon DB URL includes `?sslmode=require` at the end.
- **"Port Conflict"**: If localhost:3000 or 3001 is taken, check for hanging node processes in your task manager.
- **"HMR not working"**: Ensure you are running `npm run dev` from the root folder.
