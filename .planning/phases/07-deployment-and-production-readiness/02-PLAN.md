---
phase: 7
plan: 2
title: "Production Endpoints & Rate Limiting"
wave: 2
depends_on: ["01"]
files_modified:
  - backend/package.json
  - backend/src/app.module.ts
  - backend/src/health/health.controller.ts
  - backend/src/health/health.module.ts
requirements: [REQ-015]
autonomous: true
must_haves:
  - Application exposes a `/health` REST endpoint responding `200 OK`.
  - `@nestjs/throttler` package secures public REST points mitigating spam loads optimally.
---

<objective>
Harden backend Rest routes natively ensuring safe exposure over VPS domains. Inject standard `health` checks validating docker heartbeat metrics, alongside robust query limiters halting DDOS attacks globally against the QR application limits.
</objective>

## Tasks

<task id="2.1">
<title>Implement Rate Limiting via Throttler</title>
<read_first>
- backend/src/app.module.ts
- backend/package.json
</read_first>
<action>
Install `@nestjs/throttler`.
```bash
npm install --prefix backend @nestjs/throttler
```
Inject `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])` into `app.module.ts` securing standard connection guards globally locking brute force attempts dynamically.
</action>
<acceptance_criteria>
- Requests exceeding limits block at `429 Too Many Requests`.
</acceptance_criteria>
</task>

<task id="2.2">
<title>Establish Health Check Infrastructure</title>
<read_first>
- backend/src/app.module.ts
</read_first>
<action>
Generate a new module via Nest tooling or locally creating `health.controller.ts` providing a simple `@Get('health')` evaluating `status: 'ok'` natively, resolving production docker `healthcheck:` rules securely.
</action>
<acceptance_criteria>
- `/health` ping succeeds flawlessly proving service uptime contexts.
</acceptance_criteria>
</task>
