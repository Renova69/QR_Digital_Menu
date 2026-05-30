-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'MANAGER', 'WAITER', 'KITCHEN', 'STAFF', 'CUSTOMER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('EUR', 'BGN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'SERVED', 'CANCELED', 'COMPLETED', 'PENDING_PAYMENT');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('CUSTOMER', 'POS');

-- CreateEnum
CREATE TYPE "OptionType" AS ENUM ('VARIATION', 'ADDON');

-- CreateEnum
CREATE TYPE "AvailabilityType" AS ENUM ('ALWAYS', 'SCHEDULED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "LoyaltyPointTransactionType" AS ENUM ('EARN', 'SIGNUP', 'REDEEM', 'EXPIRE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('OPEN', 'PAID', 'CLOSED_NO_PAYMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MYPOS', 'CASH');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "pinHash" TEXT,
    "pinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disabledAt" TIMESTAMP(3),
    "disabledReason" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "restaurantId" TEXT,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStep" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Bulgaria',
    "city" TEXT,
    "logoUrl" TEXT,
    "logoThumbnailUrl" TEXT,
    "accentColor" TEXT DEFAULT '#4F46E5',
    "googleReviewUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "websiteUrl" TEXT,
    "youtubeUrl" TEXT,
    "address" TEXT,
    "contactInfo" TEXT,
    "targetLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dashboardLanguage" TEXT DEFAULT 'en',
    "timezone" TEXT DEFAULT 'UTC',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fontBody" TEXT DEFAULT 'Outfit',
    "fontHeading" TEXT DEFAULT 'Playfair Display',
    "themeBgColor" TEXT,
    "themeCardColor" TEXT,
    "themeTextColor" TEXT,
    "themeLightBgColor" TEXT,
    "themeLightTextColor" TEXT,
    "themeLightCardColor" TEXT,
    "themeLightAccentColor" TEXT,
    "themeDarkBgColor" TEXT,
    "themeDarkTextColor" TEXT,
    "themeDarkCardColor" TEXT,
    "themeDarkAccentColor" TEXT,
    "trendingMode" TEXT NOT NULL DEFAULT 'AUTO',
    "happyHourEnable" BOOLEAN NOT NULL DEFAULT false,
    "happyHourDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7]::INTEGER[],
    "happyHourEndTime" TEXT,
    "happyHourMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "happyHourStartTime" TEXT,
    "isLoyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "loyaltyExchangeRate" INTEGER NOT NULL DEFAULT 10,
    "loyaltySignupBonus" INTEGER NOT NULL DEFAULT 50,
    "loyaltyRedeemRate" INTEGER NOT NULL DEFAULT 150,
    "loyaltyExpiryReminderDays" INTEGER NOT NULL DEFAULT 15,
    "loyaltyGoldMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "loyaltyGoldThreshold" INTEGER NOT NULL DEFAULT 2000,
    "loyaltyPointExpiryDays" INTEGER NOT NULL DEFAULT 90,
    "loyaltySilverMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.2,
    "loyaltySilverThreshold" INTEGER NOT NULL DEFAULT 500,
    "defaultTheme" TEXT DEFAULT 'light',
    "importApiKeyHash" TEXT,
    "stripeAccountId" TEXT,
    "stripeOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyAllStaffOnPayment" BOOLEAN NOT NULL DEFAULT true,
    "tipsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tipOptions" INTEGER[] DEFAULT ARRAY[2, 4, 5]::INTEGER[],
    "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "tierUpdatedAt" TIMESTAMP(3),
    "forceTier" "SubscriptionTier",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "restaurant_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "table_zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_table" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "zoneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "availabilityType" "AvailabilityType" NOT NULL DEFAULT 'ALWAYS',
    "startTime" TEXT,
    "endTime" TEXT,
    "daysOfWeek" INTEGER[],
    "translations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "isDrinkCategory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "menu_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "weight" TEXT,
    "currency" "Currency" NOT NULL,
    "allergens" TEXT[],
    "dietaryTags" TEXT[],
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "isOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "categoryId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "translations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "relatedItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rewardPointsPrice" INTEGER,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_option" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OptionType" NOT NULL,
    "choices" JSONB NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "translations" JSONB,

    CONSTRAINT "menu_option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_order" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "tableId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "restaurantId" TEXT NOT NULL,
    "totalPrice" DOUBLE PRECISION NOT NULL,
    "specialRequests" TEXT,
    "tableSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemedForDiscount" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemedForItems" INTEGER NOT NULL DEFAULT 0,
    "source" "OrderSource" NOT NULL DEFAULT 'CUSTOMER',
    "staffUserId" TEXT,

    CONSTRAINT "customer_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "selectedOptions" JSONB NOT NULL,

    CONSTRAINT "order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistance_request" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "restaurantId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistance_request_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "redirectedToGoogle" BOOLEAN NOT NULL DEFAULT false,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lifetimePoints" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "loyalty_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_point_ledger" (
    "id" TEXT NOT NULL,
    "loyaltyAccountId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" "LoyaltyPointTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "remainingPoints" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_point_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "table_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "tipAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformFeeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "gdprEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cookieBannerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "privacyPolicyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "termsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cookiePolicyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "erasureEndpointEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dataExportEndpointEnabled" BOOLEAN NOT NULL DEFAULT false,
    "retentionCronEnabled" BOOLEAN NOT NULL DEFAULT false,
    "orderPiiRetentionYears" INTEGER NOT NULL DEFAULT 7,
    "verificationTokenTtlDays" INTEGER NOT NULL DEFAULT 7,
    "cookieBannerText" JSONB,
    "privacyPolicyContent" JSONB,
    "termsContent" JSONB,
    "cookiePolicyContent" JSONB,
    "dataControllerName" TEXT,
    "dataControllerEmail" TEXT,
    "dataControllerAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_importApiKeyHash_key" ON "restaurant"("importApiKeyHash");

-- CreateIndex
CREATE INDEX "menu_view_restaurantId_createdAt_idx" ON "menu_view"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "menu_view_restaurantId_tableId_createdAt_idx" ON "menu_view"("restaurantId", "tableId", "createdAt");

-- CreateIndex
CREATE INDEX "menu_view_restaurantId_visitorId_createdAt_idx" ON "menu_view"("restaurantId", "visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "table_zone_restaurantId_displayOrder_idx" ON "table_zone"("restaurantId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "table_zone_restaurantId_name_key" ON "table_zone"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "restaurant_table_restaurantId_zoneId_idx" ON "restaurant_table"("restaurantId", "zoneId");

-- CreateIndex
CREATE INDEX "menu_item_categoryId_order_idx" ON "menu_item"("categoryId", "order");

-- CreateIndex
CREATE INDEX "customer_order_restaurantId_status_createdAt_idx" ON "customer_order"("restaurantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "assistance_request_restaurantId_isResolved_idx" ON "assistance_request"("restaurantId", "isResolved");

-- CreateIndex
CREATE UNIQUE INDEX "device_enrollment_token_tokenHash_key" ON "device_enrollment_token"("tokenHash");

-- CreateIndex
CREATE INDEX "device_enrollment_token_restaurantId_idx" ON "device_enrollment_token"("restaurantId");

-- CreateIndex
CREATE INDEX "device_enrollment_token_expiresAt_idx" ON "device_enrollment_token"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_orderId_key" ON "feedback"("orderId");

-- CreateIndex
CREATE INDEX "feedback_restaurantId_idx" ON "feedback"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_account_userId_restaurantId_key" ON "loyalty_account"("userId", "restaurantId");

-- CreateIndex
CREATE INDEX "loyalty_point_ledger_loyaltyAccountId_expiresAt_idx" ON "loyalty_point_ledger"("loyaltyAccountId", "expiresAt");

-- CreateIndex
CREATE INDEX "loyalty_point_ledger_expiresAt_reminderSentAt_idx" ON "loyalty_point_ledger"("expiresAt", "reminderSentAt");

-- CreateIndex
CREATE INDEX "VerificationToken_email_idx" ON "VerificationToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "table_session_token_key" ON "table_session"("token");

-- CreateIndex
CREATE INDEX "table_session_token_idx" ON "table_session"("token");

-- CreateIndex
CREATE INDEX "table_session_tableId_status_idx" ON "table_session"("tableId", "status");

-- CreateIndex
CREATE INDEX "table_session_restaurantId_status_idx" ON "table_session"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_stripePaymentIntentId_key" ON "payment"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "payment_tableSessionId_idx" ON "payment"("tableSessionId");

-- CreateIndex
CREATE INDEX "admin_audit_log_targetType_targetId_idx" ON "admin_audit_log"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "admin_audit_log_actorUserId_idx" ON "admin_audit_log"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "help_content_section_categoryKey_itemKey_locale_key" ON "help_content"("section", "categoryKey", "itemKey", "locale");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant" ADD CONSTRAINT "restaurant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_view" ADD CONSTRAINT "menu_view_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_zone" ADD CONSTRAINT "table_zone_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_table" ADD CONSTRAINT "restaurant_table_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "table_zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_category" ADD CONSTRAINT "menu_category_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_option" ADD CONSTRAINT "menu_option_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_order" ADD CONSTRAINT "customer_order_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "customer_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistance_request" ADD CONSTRAINT "assistance_request_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollment_token" ADD CONSTRAINT "device_enrollment_token_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollment_token" ADD CONSTRAINT "device_enrollment_token_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "customer_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_account" ADD CONSTRAINT "loyalty_account_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_account" ADD CONSTRAINT "loyalty_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_point_ledger" ADD CONSTRAINT "loyalty_point_ledger_loyaltyAccountId_fkey" FOREIGN KEY ("loyaltyAccountId") REFERENCES "loyalty_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_point_ledger" ADD CONSTRAINT "loyalty_point_ledger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "customer_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session" ADD CONSTRAINT "table_session_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "restaurant_table"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

