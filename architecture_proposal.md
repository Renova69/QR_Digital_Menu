# QR Menu - Advanced Architecture Migration Guide

This document provides the full technical roadmap, account requirements, and cost analysis for migrating the QR Menu application from a Docker-locked setup to a **Modern Native-First Monorepo**.

---

## 💰 Cost & Account Analysis (The "Free Forever" Tier)

The goal is to keep your development costs at **$0** while you build and scale, using the most reliable providers in the industry.

| Service | Provider | Recommended Plan | Cost | Benefit for QR Menu |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | [Neon.tech](https://neon.tech/) | Free Tier (0.5GB) | $0 | Instant branching (create a DB for a new feature in 1s). |
| **Monorepo / API** | [Vercel](https://vercel.com/) | Hobby | $0 | Instant deployments and "Remote Caching" (super fast builds). |
| **File Storage** | [Supabase](https://supabase.com/) | Free (5GB) | $0 | Replacing local `uploads` folder with a Global CDN for images. |
| **DNS / Auth** | [Cloudflare](https://cloudflare.com/) | Free | $0 | DDoS protection and free SSL for your custom restaurant domains. |

---

## 🏗️ Phase 1: Preparation (Accounts Needed)

Before we touch a single line of code, you will need to create the following accounts:

1.  **Neon.tech**:
    - Sign up and create a new project named `qr-menu-db`.
    - Copy the `DATABASE_URL` string (starts with `postgresql://...`).
2.  **Supabase** (Recommended for Images):
    - Create a project to use their "Storage" bucket for menu images.
    - This replaces the bulky Docker volumes for images.
3.  **Vercel Account**:
    - Link your GitHub repository. Vercel will handle the Turborepo orchestration automatically.

---

## 🏗️ Phase 2: Project Restructuring (Turborepo)

We will move from a "Two separate folders" structure to a "Unified Workspace".

### The New Folder Structure:
```text
/                      (Root)
├── apps/
│   ├── backend/       (The NestJS Backend)
│   └── frontend/      (The Vite + React Frontend)
├── packages/
│   └── ts-config/     (Shared TypeScript rules)
├── package.json       (Root workspace config)
├── turbo.json         (Turbo orchestration)
└── .env               (Universal Environment variables)
```

### Setup Steps:
1.  **Initialize Turbo**:
    ```powershell
    npx -y turbo init .
    ```
2.  **Define Workspaces**:
    Update root `package.json` to include `"workspaces": [ "apps/*" ]`.
3.  **Unified Dev Command**:
    You will now start the entire project with one command:
    ```powershell
    npm run dev
    ```
    *Turbo will start the Backend and Frontend in parallel and stream both logs to one terminal.*

---

## 🚀 Phase 3: The "Native-First" Shift

### 1. Kill the Docker Tax
You will no longer run `docker-compose up` during daily coding.
- **Backend**: Run NestJS natively via `npm run start:dev`.
- **Frontend**: Run Vite natively via `npm run dev`.

### 2. Update Environment Variables
Update your root `.env`:
- Change `DATABASE_URL` from the local `db:5432` to your **Neon.tech** cloud URL.
- No more connectivity issues between containers!

---

## 🔄 Phase 4: Migration Walkthrough (The Plan)

1.  **Stop Docker Containers**: Free up your local RAM and CPU.
2.  **Move Files**: Move current `backend` and `frontend` into an `apps/` directory.
3.  **Setup Turbo**: Create the `turbo.json` and root `package.json`.
4.  **Sync DB**: Run `npx prisma db push` from the backend to point your schema to **Neon**.
5.  **Verify**: Run `npm run dev` at the root and watch both apps start in < 5 seconds.

---

## 💎 Why This Wins

- **Speed**: You go from 5-minute cold starts to **5-second** warm starts.
- **Reliability**: Your database is in the cloud. If your laptop dies, your data is safe.
- **Portability**: You can code this from any machine (Codespaces, a new laptop, etc.) just by running `npm install`.
- **HMR**: Hot Module Replacement will be instantaneous because file watchers won't be fighting the Docker filesystem.

---

### 🏁 Ready to begin?
When you have your **Neon.tech DATABASE_URL** ready, let me know, and I will begin **Phase 2: Project Restructuring**.
