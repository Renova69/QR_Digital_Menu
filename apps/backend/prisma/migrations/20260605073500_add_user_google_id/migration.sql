-- AlterTable
ALTER TABLE "app_user" ADD COLUMN "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "app_user_googleId_key" ON "app_user"("googleId");
