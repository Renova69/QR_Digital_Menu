-- Preserve historical print-job audit rows while selecting one canonical job
-- per order/station for future idempotent routing. Any duplicate that could
-- still be retried is made visibly terminal before the unique key is assigned.
ALTER TABLE "print_job"
  ADD COLUMN "deduplicationKey" TEXT,
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "claimExpiresAt" TIMESTAMP(3),
  ADD COLUMN "assignedAgentTokenId" TEXT,
  ADD COLUMN "outcomeUncertain" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "orderId", "printStationId"
      ORDER BY
        CASE WHEN "status" = 'PRINTED' THEN 0 ELSE 1 END,
        "createdAt" DESC,
        "id" DESC
    ) AS position
  FROM "print_job"
  WHERE "printStationId" IS NOT NULL
)
-- A superseded row that was already 'SENT' (or even still 'PENDING' — we
-- cannot tell from this backfill whether an agent already received it
-- before this migration ran) may have already reached a physical printer
-- with its outcome never acknowledged. Mark it outcomeUncertain so the
-- claim/retry path (print-station.service.ts) refuses to auto-reprint it
-- and instead surfaces it to an operator, rather than risking a duplicate
-- physical ticket on a later "retry failed job" call.
UPDATE "print_job" AS job
SET
  "status" = 'FAILED',
  "errorMessage" = 'Superseded by canonical durable print job',
  "outcomeUncertain" = true
FROM ranked
WHERE job."id" = ranked."id"
  AND ranked.position > 1
  AND job."status" IN ('PENDING', 'SENT');

WITH canonical AS (
  SELECT DISTINCT ON ("orderId", "printStationId")
    "id",
    "orderId",
    "printStationId"
  FROM "print_job"
  WHERE "printStationId" IS NOT NULL
  ORDER BY "orderId", "printStationId", "createdAt" DESC, "id" DESC
)
UPDATE "print_job" AS job
SET "deduplicationKey" = canonical."orderId" || ':' || canonical."printStationId"
FROM canonical
WHERE job."id" = canonical."id";

CREATE UNIQUE INDEX "print_job_deduplicationKey_key"
  ON "print_job"("deduplicationKey");
CREATE INDEX "print_job_claimExpiresAt_idx"
  ON "print_job"("claimExpiresAt");
CREATE INDEX "print_job_assignedAgentTokenId_idx"
  ON "print_job"("assignedAgentTokenId");
