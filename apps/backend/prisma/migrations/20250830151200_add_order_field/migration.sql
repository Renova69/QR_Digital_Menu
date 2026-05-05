/*
  Warnings:

  - Added the required column `order` to the `MenuCategory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `order` to the `MenuItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."MenuCategory" ADD COLUMN     "order" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."MenuItem" ADD COLUMN     "order" INTEGER NOT NULL;
