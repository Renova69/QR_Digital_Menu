-- CreateTable
CREATE TABLE "device_enrollment_token" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_enrollment_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollment_token_tokenHash_key" ON "device_enrollment_token"("tokenHash");

-- CreateIndex
CREATE INDEX "device_enrollment_token_restaurantId_idx" ON "device_enrollment_token"("restaurantId");

-- CreateIndex
CREATE INDEX "device_enrollment_token_expiresAt_idx" ON "device_enrollment_token"("expiresAt");

-- AddForeignKey
ALTER TABLE "device_enrollment_token" ADD CONSTRAINT "device_enrollment_token_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollment_token" ADD CONSTRAINT "device_enrollment_token_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
