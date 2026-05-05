---
phase: 7
plan: 1
title: "Docker Setup & Configuration Optimization"
wave: 1
depends_on: []
files_modified:
  - docker-compose.yml
  - frontend/Dockerfile
  - backend/Dockerfile
  - .env.example
requirements: [REQ-015]
autonomous: true
must_haves:
  - `docker-compose.yml` correctly orchestrates `frontend`, `backend` (api), and `db` clusters natively.
  - `Dockerfile` definitions use rigorous layered logic.
  - Generates `.env.example` capturing environment constants securely.
---

<objective>
Refactor Docker orchestrator logic securing production readiness. Standardize `docker-compose.yml` adding the frontend React/Vite node, resolve caching build orders on `Dockerfile` contexts, and explicitly track `.env.example` payloads documenting VPS dependencies natively.
</objective>

## Tasks

<task id="1.1">
<title>Optimize Frontend Dockerfile</title>
<read_first>
- frontend/Dockerfile
</read_first>
<action>
Ensure `frontend/Dockerfile` utilizes an efficient build trace. Since the `frontend` `package.json` contains `serve`, ensure EXPOSE correctly binds (3001) and `npm run build` runs efficiently. (Already somewhat correct, ensure no hidden bottlenecks).
</action>
<acceptance_criteria>
- Frontend container launches `serve` flawlessly.
</acceptance_criteria>
</task>

<task id="1.2">
<title>Integrate Frontend into Docker Compose</title>
<read_first>
- docker-compose.yml
</read_first>
<action>
Update `docker-compose.yml` injecting the `frontend` service binding `build: ./frontend` and `volumes` if needed for dev or purely relying on static bundles. Expose `3001:3001` natively connecting internal DNS via depends_on towards `app` (backend).
</action>
<acceptance_criteria>
- Running `docker-compose up` cleanly launches backend, frontend, and DB together.
</acceptance_criteria>
</task>

<task id="1.3">
<title>Update Backend Dockerfile for Migrations</title>
<read_first>
- backend/Dockerfile
</read_first>
<action>
Modify the `CMD` sequence securely executing `npx prisma migrate deploy` prior to `npm run start:prod` ensuring the production database maps explicitly upon cold starts natively.
</action>
<acceptance_criteria>
- Backend pushes DB migration schema safely over restarts.
</acceptance_criteria>
</task>

<task id="1.4">
<title>Generate `.env.example` configurations</title>
<action>
Create standard `.env.example` instances enumerating:
```env
DATABASE_URL=postgresql://postgres:postgres@db:5432/qr_menu?schema=public
JWT_SECRET=super_secret
VITE_API_URL=http://localhost:3000
```
This safely prepares VPS orchestration structures.
</action>
<acceptance_criteria>
- Secrets documentation exists.
</acceptance_criteria>
</task>
