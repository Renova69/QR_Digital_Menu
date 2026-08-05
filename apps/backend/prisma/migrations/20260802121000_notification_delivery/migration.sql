CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'SMS');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'ACCEPTED', 'FAILED');

CREATE TABLE "notification_delivery" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "deduplicationKey" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "outcomeUncertain" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_delivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_delivery_restaurantId_deduplicationKey_channel_key"
ON "notification_delivery"("restaurantId", "deduplicationKey", "channel");
CREATE INDEX "notification_delivery_status_nextAttemptAt_idx"
ON "notification_delivery"("status", "nextAttemptAt");
CREATE INDEX "notification_delivery_status_leaseExpiresAt_idx"
ON "notification_delivery"("status", "leaseExpiresAt");
CREATE INDEX "notification_delivery_restaurantId_status_createdAt_idx"
ON "notification_delivery"("restaurantId", "status", "createdAt");
CREATE INDEX "notification_delivery_sourceType_sourceId_idx"
ON "notification_delivery"("sourceType", "sourceId");

ALTER TABLE "notification_delivery"
ADD CONSTRAINT "notification_delivery_restaurantId_fkey"
FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
