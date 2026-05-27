-- CreateTable
CREATE TABLE "menu_view" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "tableName" TEXT,
    "visitorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_view_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_view_restaurantId_createdAt_idx" ON "menu_view"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "menu_view_restaurantId_tableId_createdAt_idx" ON "menu_view"("restaurantId", "tableId", "createdAt");

-- CreateIndex
CREATE INDEX "menu_view_restaurantId_visitorId_createdAt_idx" ON "menu_view"("restaurantId", "visitorId", "createdAt");

-- AddForeignKey
ALTER TABLE "menu_view" ADD CONSTRAINT "menu_view_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
