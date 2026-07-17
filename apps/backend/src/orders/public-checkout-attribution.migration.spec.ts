import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Public checkout attribution deployment migration', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260717210000_repair_public_checkout_order_attribution/migration.sql',
    ),
    'utf8',
  );

  it('moves only owner public checkout rows to customer ownership', () => {
    expect(migration).toMatch(
      /SET[\s\S]*"customerId" = o\."staffUserId"[\s\S]*"staffUserId" = NULL/,
    );
    expect(migration).toMatch(
      /FROM "app_user" AS u[\s\S]*JOIN "restaurant" AS r[\s\S]*r\."ownerId" = u\."id"/,
    );
    expect(migration).toMatch(/o\."staffUserId" = u\."id"/);
    expect(migration).toMatch(/o\."restaurantId" = r\."id"/);
    expect(migration).toMatch(/u\."role" = 'OWNER'/);
    expect(migration).toMatch(/o\."source" = 'CUSTOMER'/);
    expect(migration).toMatch(/o\."customerId" IS NULL/);
  });

  it('replays loyalty earnings in chronological order for eligible orders', () => {
    expect(migration).toMatch(
      /ORDER BY[\s\S]*o\."restaurantId"[\s\S]*o\."staffUserId"[\s\S]*o\."createdAt"[\s\S]*o\."id"/,
    );
    expect(migration).toMatch(/o\."pointsEarned" = 0/);
    expect(migration).toMatch(/o\."status" <> 'CANCELED'/);
    expect(migration).toMatch(/r\."isLoyaltyEnabled" = TRUE/);
    expect(migration).toMatch(
      /COALESCE\(r\."forceTier"::text, r\."tier"::text\)[\s\S]*'PROFESSIONAL'[\s\S]*'ENTERPRISE'/,
    );
    expect(migration).toMatch(
      /FLOOR\([\s\S]*total_price[\s\S]*loyalty_exchange_rate[\s\S]*final_multiplier[\s\S]*\)/i,
    );
  });

  it('keeps the order, account balance, lifetime total, and ledger aligned', () => {
    expect(migration).toMatch(
      /UPDATE "customer_order"[\s\S]*"pointsEarned" = v_points_earned/,
    );
    expect(migration).toMatch(
      /UPDATE "loyalty_account"[\s\S]*"points" = "points" \+ v_spendable_points[\s\S]*"lifetimePoints" = "lifetimePoints" \+ v_points_earned/,
    );
    expect(migration).toMatch(
      /INSERT INTO "loyalty_point_ledger"[\s\S]*'EARN'[\s\S]*v_purchase_points/,
    );
    expect(migration).toMatch(
      /"orderId"[\s\S]*v_order\.order_id[\s\S]*"expiresAt"[\s\S]*v_expires_at/,
    );
  });

  it('does not award a duplicate signup bonus', () => {
    expect(migration).toMatch(
      /NOT EXISTS[\s\S]*"loyalty_point_ledger"[\s\S]*"type" = 'SIGNUP'/,
    );
    expect(migration).toMatch(
      /LEAST\(\s*75,\s*GREATEST\(\s*0,\s*v_order\.loyalty_signup_bonus\s*\)\s*\)/,
    );
  });
});
