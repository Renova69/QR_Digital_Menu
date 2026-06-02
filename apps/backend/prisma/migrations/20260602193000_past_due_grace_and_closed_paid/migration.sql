-- Add the terminal paid-session status used by autoClosePaidSessions.
ALTER TYPE "TableSessionStatus" ADD VALUE IF NOT EXISTS 'CLOSED_PAID';

-- Persist subscription grace expiry so the hourly downgrade job can enforce
-- past_due downgrades even when Stripe sends no follow-up lifecycle event.
ALTER TABLE "restaurant"
  ADD COLUMN IF NOT EXISTS "pastDueGraceExpiry" TIMESTAMP(3);
