-- A confirmed refund can drop paidSubtotal below billSubtotal on a session
-- that isn't OPEN (already PAID/CLOSED_*). We never auto-reopen the session
-- for this — staff must explicitly reopen it via the reconciliation queue.
ALTER TYPE "PaymentReconciliationReason" ADD VALUE IF NOT EXISTS 'REFUND_LEFT_BALANCE';
