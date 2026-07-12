-- Covering index for the nightly session retention sweep
-- (status='OPEN', createdAt < cutoff, ORDER BY createdAt). Additive + idempotent.
-- Name matches Prisma's generated name for @@index([status, createdAt]) on
-- table_session to avoid migration drift.
CREATE INDEX IF NOT EXISTS "table_session_status_createdAt_idx"
  ON "table_session" ("status", "createdAt");
