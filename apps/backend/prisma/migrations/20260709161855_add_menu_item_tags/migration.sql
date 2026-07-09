-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
