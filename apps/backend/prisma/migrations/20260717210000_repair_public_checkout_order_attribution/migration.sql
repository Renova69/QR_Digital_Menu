-- Restaurant owners using their own public menu were previously persisted as
-- staff, which skipped both customer ownership and loyalty accrual. Replay the
-- missing accrual in order chronology before restoring customer ownership.
DO $repair_public_checkout_loyalty$
DECLARE
  v_order RECORD;
  v_account_id TEXT;
  v_historical_lifetime INTEGER;
  v_tier_multiplier DOUBLE PRECISION;
  v_happy_hour_multiplier DOUBLE PRECISION;
  v_final_multiplier DOUBLE PRECISION;
  v_local_order_at TIMESTAMP;
  v_order_minutes INTEGER;
  v_start_minutes INTEGER;
  v_end_minutes INTEGER;
  v_effective_weekday INTEGER;
  v_purchase_points INTEGER;
  v_signup_points INTEGER;
  v_points_earned INTEGER;
  v_spendable_points INTEGER;
  v_expires_at TIMESTAMP;
BEGIN
  FOR v_order IN
    SELECT
      o."id" AS order_id,
      o."restaurantId" AS restaurant_id,
      o."staffUserId" AS owner_user_id,
      o."createdAt" AS created_at,
      o."totalPrice" AS total_price,
      COALESCE(r."timezone", 'Europe/Sofia') AS timezone,
      r."happyHourEnable" AS happy_hour_enable,
      r."happyHourDays" AS happy_hour_days,
      r."happyHourStartTime" AS happy_hour_start_time,
      r."happyHourEndTime" AS happy_hour_end_time,
      COALESCE(NULLIF(r."happyHourMultiplier", 0), 1) AS happy_hour_multiplier,
      COALESCE(NULLIF(r."loyaltyExchangeRate", 0), 10) AS loyalty_exchange_rate,
      COALESCE(r."loyaltySignupBonus", 0) AS loyalty_signup_bonus,
      COALESCE(r."loyaltySilverThreshold", 500) AS silver_threshold,
      COALESCE(r."loyaltySilverMultiplier", 1.2) AS silver_multiplier,
      COALESCE(r."loyaltyGoldThreshold", 2000) AS gold_threshold,
      COALESCE(r."loyaltyGoldMultiplier", 1.5) AS gold_multiplier,
      COALESCE(NULLIF(r."loyaltyPointExpiryDays", 0), 90) AS loyalty_point_expiry_days
    FROM "customer_order" AS o
    JOIN "app_user" AS u ON u."id" = o."staffUserId"
    JOIN "restaurant" AS r
      ON r."id" = o."restaurantId"
     AND r."ownerId" = u."id"
    WHERE u."role" = 'OWNER'
      AND o."source" = 'CUSTOMER'
      AND o."customerId" IS NULL
      AND o."pointsEarned" = 0
      AND o."status" <> 'CANCELED'
      AND r."isActive" = TRUE
      AND r."isLoyaltyEnabled" = TRUE
      AND COALESCE(r."forceTier"::text, r."tier"::text)
        IN ('PROFESSIONAL', 'ENTERPRISE')
    ORDER BY
      o."restaurantId",
      o."staffUserId",
      o."createdAt",
      o."id"
  LOOP
    INSERT INTO "loyalty_account" (
      "id",
      "userId",
      "restaurantId",
      "points",
      "createdAt",
      "updatedAt",
      "lifetimePoints"
    )
    VALUES (
      'repair_account_' || md5(
        v_order.owner_user_id || ':' || v_order.restaurant_id
      ),
      v_order.owner_user_id,
      v_order.restaurant_id,
      0,
      v_order.created_at,
      CURRENT_TIMESTAMP,
      0
    )
    ON CONFLICT ("userId", "restaurantId") DO NOTHING;

    SELECT a."id"
    INTO v_account_id
    FROM "loyalty_account" AS a
    WHERE a."userId" = v_order.owner_user_id
      AND a."restaurantId" = v_order.restaurant_id;

    -- Existing ledgers reconstruct the tier at the order time. The account
    -- total is the fallback for legacy accounts that predate ledger batches.
    SELECT
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM "loyalty_point_ledger" AS existing
          WHERE existing."loyaltyAccountId" = a."id"
            AND existing."createdAt" <= v_order.created_at
        )
        THEN GREATEST(
          0,
          COALESCE((
            SELECT SUM(
              CASE
                WHEN historical."type" IN ('EARN', 'SIGNUP')
                  THEN historical."points"
                WHEN historical."type" = 'ADJUSTMENT'
                  AND historical."points" > 0
                  THEN historical."points"
                ELSE 0
              END
            )
            FROM "loyalty_point_ledger" AS historical
            WHERE historical."loyaltyAccountId" = a."id"
              AND historical."createdAt" <= v_order.created_at
          ), 0)
        )
        WHEN NOT EXISTS (
          SELECT 1
          FROM "loyalty_point_ledger" AS any_ledger
          WHERE any_ledger."loyaltyAccountId" = a."id"
        )
        THEN a."lifetimePoints"
        ELSE 0
      END
    INTO v_historical_lifetime
    FROM "loyalty_account" AS a
    WHERE a."id" = v_account_id;

    IF v_historical_lifetime >= v_order.gold_threshold THEN
      v_tier_multiplier := v_order.gold_multiplier;
    ELSIF v_historical_lifetime >= v_order.silver_threshold THEN
      v_tier_multiplier := v_order.silver_multiplier;
    ELSE
      v_tier_multiplier := 1;
    END IF;

    v_happy_hour_multiplier := 1;
    IF v_order.happy_hour_enable
      AND v_order.happy_hour_start_time IS NOT NULL
      AND v_order.happy_hour_end_time IS NOT NULL
    THEN
      v_local_order_at :=
        (v_order.created_at AT TIME ZONE 'UTC') AT TIME ZONE v_order.timezone;
      v_order_minutes :=
        EXTRACT(HOUR FROM v_local_order_at)::INTEGER * 60
        + EXTRACT(MINUTE FROM v_local_order_at)::INTEGER;
      v_start_minutes :=
        split_part(v_order.happy_hour_start_time, ':', 1)::INTEGER * 60
        + split_part(v_order.happy_hour_start_time, ':', 2)::INTEGER;
      v_end_minutes :=
        split_part(v_order.happy_hour_end_time, ':', 1)::INTEGER * 60
        + split_part(v_order.happy_hour_end_time, ':', 2)::INTEGER;
      v_effective_weekday :=
        EXTRACT(ISODOW FROM v_local_order_at)::INTEGER;

      IF v_start_minutes > v_end_minutes
        AND v_order_minutes < v_start_minutes
      THEN
        v_effective_weekday :=
          EXTRACT(ISODOW FROM v_local_order_at - INTERVAL '1 day')::INTEGER;
      END IF;

      IF v_effective_weekday = ANY(
          COALESCE(v_order.happy_hour_days, ARRAY[1, 2, 3, 4, 5, 6, 7])
        )
        AND (
          (
            v_start_minutes <= v_end_minutes
            AND v_order_minutes BETWEEN v_start_minutes AND v_end_minutes
          )
          OR (
            v_start_minutes > v_end_minutes
            AND (
              v_order_minutes >= v_start_minutes
              OR v_order_minutes <= v_end_minutes
            )
          )
        )
      THEN
        v_happy_hour_multiplier := v_order.happy_hour_multiplier;
      END IF;
    END IF;

    v_final_multiplier := GREATEST(
      v_tier_multiplier,
      v_happy_hour_multiplier
    );
    v_purchase_points := FLOOR(
      v_order.total_price
      * v_order.loyalty_exchange_rate
      * v_final_multiplier
    )::INTEGER;

    v_signup_points := 0;
    IF v_historical_lifetime = 0
      AND NOT EXISTS (
        SELECT 1
        FROM "loyalty_point_ledger" AS signup
        WHERE signup."loyaltyAccountId" = v_account_id
          AND signup."type" = 'SIGNUP'
      )
    THEN
      v_signup_points := LEAST(
        75,
        GREATEST(0, v_order.loyalty_signup_bonus)
      );
    END IF;

    v_points_earned := v_purchase_points + v_signup_points;
    v_expires_at := v_order.created_at
      + make_interval(days => v_order.loyalty_point_expiry_days);
    v_spendable_points := CASE
      WHEN v_expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        THEN v_points_earned
      ELSE 0
    END;

    UPDATE "customer_order"
    SET
      "pointsEarned" = v_points_earned,
      "customerId" = v_order.owner_user_id,
      "staffUserId" = NULL
    WHERE "id" = v_order.order_id;

    UPDATE "loyalty_account"
    SET
      "points" = "points" + v_spendable_points,
      "lifetimePoints" = "lifetimePoints" + v_points_earned,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = v_account_id;

    IF v_purchase_points > 0 THEN
      INSERT INTO "loyalty_point_ledger" (
        "id",
        "loyaltyAccountId",
        "orderId",
        "type",
        "points",
        "remainingPoints",
        "expiresAt",
        "createdAt"
      )
      VALUES (
        'repair_earn_' || md5(v_order.order_id),
        v_account_id,
        v_order.order_id,
        'EARN',
        v_purchase_points,
        CASE
          WHEN v_expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            THEN v_purchase_points
          ELSE 0
        END,
        v_expires_at,
        v_order.created_at
      )
      ON CONFLICT ("id") DO NOTHING;
    END IF;

    IF v_signup_points > 0 THEN
      INSERT INTO "loyalty_point_ledger" (
        "id",
        "loyaltyAccountId",
        "orderId",
        "type",
        "points",
        "remainingPoints",
        "expiresAt",
        "createdAt"
      )
      VALUES (
        'repair_signup_' || md5(v_order.order_id),
        v_account_id,
        v_order.order_id,
        'SIGNUP',
        v_signup_points,
        CASE
          WHEN v_expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            THEN v_signup_points
          ELSE 0
        END,
        v_expires_at,
        v_order.created_at
      )
      ON CONFLICT ("id") DO NOTHING;
    END IF;

    IF v_points_earned > 0
      AND v_expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    THEN
      INSERT INTO "loyalty_point_ledger" (
        "id",
        "loyaltyAccountId",
        "orderId",
        "type",
        "points",
        "remainingPoints",
        "createdAt"
      )
      VALUES (
        'repair_expire_' || md5(v_order.order_id),
        v_account_id,
        v_order.order_id,
        'EXPIRE',
        -v_points_earned,
        0,
        v_expires_at
      )
      ON CONFLICT ("id") DO NOTHING;
    END IF;
  END LOOP;
END
$repair_public_checkout_loyalty$;

-- Attribution is repaired even when loyalty is disabled, unavailable on the
-- current tier, canceled, or has no positive points to award.
UPDATE "customer_order" AS o
SET
  "customerId" = o."staffUserId",
  "staffUserId" = NULL
FROM "app_user" AS u
JOIN "restaurant" AS r ON r."ownerId" = u."id"
WHERE o."staffUserId" = u."id"
  AND o."restaurantId" = r."id"
  AND u."role" = 'OWNER'
  AND o."source" = 'CUSTOMER'
  AND o."customerId" IS NULL;
