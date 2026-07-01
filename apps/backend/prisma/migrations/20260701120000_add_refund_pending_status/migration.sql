-- F-PAY-1: additive enum value. A refund claimed but not yet confirmed by
-- Stripe (ambiguous/timeout outcome) sits here until a webhook or the
-- reconciliation cron resolves it to REFUNDED or back to SUCCEEDED.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
