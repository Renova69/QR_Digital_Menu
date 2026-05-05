---
phase: 6
plan: 3
title: "Fix Docker Build Errors (Gap Closure)"
gap_closure: true
files_modified:
  - backend/package.json
  - backend/src/orders/orders.controller.ts
  - backend/src/tables/tables.controller.ts
autonomous: true
---

# Phase 6 Fix: Docker Build Errors

<objective>
Fix local TypeScript schema crashes and dependency faults halting `docker compose build`. Addresses the raw `Multer` TS definitions failing alongside missing case-sensitive Unix guard directory imports that passed locally on Windows.
</objective>

## Tasks

<task id="3.1">
<title>Install Missing `@types/multer` Dependency</title>
<read_first>
- backend/package.json
</read_first>
<action>
Add `@types/multer` to `devDependencies` inside `backend/package.json`, or run `npm install -D @types/multer` within the `backend` boundary fixing `Express.Multer.File` lookup scopes.
</action>
<acceptance_criteria>
- Builds no longer fail with `TS2694: Namespace 'global.Express' has no exported member 'Multer'.`
</acceptance_criteria>
</task>

<task id="3.2">
<title>Fix AuthGuard Absolute Path Referencing</title>
<read_first>
- backend/src/orders/orders.controller.ts
- backend/src/tables/tables.controller.ts
</read_first>
<action>
Change imports targeting `../auth/guards/jwt-auth.guard` towards `../auth/jwt-auth.guard` removing the nonexistent `guards/` mid-pathing.
</action>
<acceptance_criteria>
- Build no longer throws `error TS2307: Cannot find module` on AuthGuards under stricter Linux case limits.
</acceptance_criteria>
</task>
