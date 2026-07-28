CREATE TABLE "payment_notification_cursor" (
  "userId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "readThrough" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_notification_cursor_pkey"
    PRIMARY KEY ("userId", "restaurantId")
);

CREATE INDEX "payment_notification_cursor_restaurantId_readThrough_idx"
  ON "payment_notification_cursor"("restaurantId", "readThrough");

ALTER TABLE "payment_notification_cursor"
  ADD CONSTRAINT "payment_notification_cursor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "app_user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_notification_cursor"
  ADD CONSTRAINT "payment_notification_cursor_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
