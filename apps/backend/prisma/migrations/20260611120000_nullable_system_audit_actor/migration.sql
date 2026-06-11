-- Allow automated system jobs to write admin audit rows without depending on a
-- synthetic app_user row. Human-triggered audit rows still keep actorUserId.
ALTER TABLE "admin_audit_log"
  DROP CONSTRAINT IF EXISTS "admin_audit_log_actorUserId_fkey";

ALTER TABLE "admin_audit_log"
  ALTER COLUMN "actorUserId" DROP NOT NULL;

ALTER TABLE "admin_audit_log"
  ADD CONSTRAINT "admin_audit_log_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
