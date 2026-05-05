-- AlterTable
ALTER TABLE "menu_category" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isDrinkCategory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "relatedItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "menu_option" ADD COLUMN     "translations" JSONB;

-- AlterTable
ALTER TABLE "restaurant" ADD COLUMN     "fontBody" TEXT DEFAULT 'Outfit',
ADD COLUMN     "fontHeading" TEXT DEFAULT 'Playfair Display',
ADD COLUMN     "themeBgColor" TEXT,
ADD COLUMN     "themeCardColor" TEXT,
ADD COLUMN     "themeTextColor" TEXT,
ADD COLUMN     "trendingMode" TEXT NOT NULL DEFAULT 'AUTO';
