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
   - Ensure `VITE_API_URL` is set to `http://localhost:3000/api`.

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

## Troubleshooting

- **"Module not found"**: Always run `npm install` at the root, not inside subfolders.
- **"Database Error"**: Ensure your Neon DB URL includes `?sslmode=require` at the end.
- **"Port Conflict"**: If localhost:3000 or 3001 is taken, check for hanging node processes in your task manager.
- **"HMR not working"**: Ensure you are running `npm run dev` from the root folder.
