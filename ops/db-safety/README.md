# Production database loss guards

`install-production-guards.sql` adds independent PostgreSQL protections for the
production `public` schema:

- destructive DDL is rejected before a schema/table drop can remove the guard;
- dependent table/column/sequence removal is rejected by `sql_drop` inspection;
- every current and newly created public table receives an always-enabled
  `BEFORE TRUNCATE` trigger.

Installation is additive and idempotent. The installer accepts only the exact
Supabase project, session-pooler host/port, and database, and requires an exact
production confirmation argument:

```powershell
cd apps/backend
npm run db:guard:install -- --confirm-additive-production-guard=scmjaqhiyvzsyyvdygwu
npm run db:guard:verify
```

`deploy.ps1` runs verification before every migration. A missing, disabled, or
altered event trigger, or any public table missing its truncate trigger, stops
the deployment.

The `public`-schema backup includes table triggers but PostgreSQL does not place
database-wide event triggers in that schema-scoped archive. After an authorized
disaster restore, reinstall and verify this guard before migrations or traffic.

A database owner can deliberately alter or disable PostgreSQL protections. No
automated break-glass/reset command is stored in the repository; a genuine
production recovery requires separate owner authorization, a fresh verified
backup, and a reviewed one-off procedure.
