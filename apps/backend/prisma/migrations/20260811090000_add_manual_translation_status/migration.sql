-- Owner-authored translations. Terminal status: claimBatch only claims
-- STALE/FAILED, so the worker never re-translates a MANUAL row.
--
-- Postgres allows ALTER TYPE ... ADD VALUE inside a transaction (which is how
-- Prisma runs migrations) only if the new value is not USED in that same
-- transaction. Adding the label is therefore safe here; nothing below may
-- reference 'MANUAL'.
ALTER TYPE "MenuTranslationStatus" ADD VALUE IF NOT EXISTS 'MANUAL';
