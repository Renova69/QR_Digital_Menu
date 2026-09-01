-- Additive polling watermark for SMS Gateway delivery-status reconciliation.
-- Existing rows remain eligible through NULL; no application data is changed,
-- cleared, or backfilled.
ALTER TABLE "notification_delivery"
ADD COLUMN "smsLastReconciledAt" TIMESTAMP(3);

CREATE INDEX "notification_delivery_sms_reconcile_idx"
ON "notification_delivery"(
  "channel",
  "status",
  "smsProvider",
  "smsDeliveryStatus",
  "smsLastReconciledAt"
);
