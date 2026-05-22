-- CreateTable
CREATE TABLE "help_content" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "help_content_section_categoryKey_itemKey_locale_key" ON "help_content"("section", "categoryKey", "itemKey", "locale");
