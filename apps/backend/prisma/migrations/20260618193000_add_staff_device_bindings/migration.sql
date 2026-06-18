ALTER TABLE "app_user" ADD COLUMN "lastLoginDeviceTokenId" TEXT;

ALTER TABLE "app_user"
  ADD CONSTRAINT "app_user_lastLoginDeviceTokenId_fkey"
  FOREIGN KEY ("lastLoginDeviceTokenId") REFERENCES "device_enrollment_token"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "staff_device_binding" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceTokenId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_device_binding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_device_binding_userId_deviceTokenId_key"
  ON "staff_device_binding"("userId", "deviceTokenId");

CREATE INDEX "staff_device_binding_restaurantId_userId_idx"
  ON "staff_device_binding"("restaurantId", "userId");

CREATE INDEX "staff_device_binding_deviceTokenId_idx"
  ON "staff_device_binding"("deviceTokenId");

ALTER TABLE "staff_device_binding"
  ADD CONSTRAINT "staff_device_binding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "app_user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_device_binding"
  ADD CONSTRAINT "staff_device_binding_deviceTokenId_fkey"
  FOREIGN KEY ("deviceTokenId") REFERENCES "device_enrollment_token"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_device_binding"
  ADD CONSTRAINT "staff_device_binding_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_pin_login_audit" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "deviceTokenId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_pin_login_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "staff_pin_login_audit_restaurantId_createdAt_idx"
  ON "staff_pin_login_audit"("restaurantId", "createdAt");

CREATE INDEX "staff_pin_login_audit_userId_createdAt_idx"
  ON "staff_pin_login_audit"("userId", "createdAt");

CREATE INDEX "staff_pin_login_audit_deviceTokenId_createdAt_idx"
  ON "staff_pin_login_audit"("deviceTokenId", "createdAt");
