ALTER TABLE "app_user" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "app_user" ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "app_user" ADD COLUMN "disabledReason" TEXT;
