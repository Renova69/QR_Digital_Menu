import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('RefundAttempt deployment migration (F-PAY-1)', () => {
  it('fails closed when legacy REFUND_PENDING payments still require reconciliation', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260702090000_add_refund_attempt/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toMatch(
      /IF EXISTS[\s\S]*FROM "payment"[\s\S]*"status" = 'REFUND_PENDING'/,
    );
    expect(migration).toMatch(
      /RAISE EXCEPTION[\s\S]*legacy REFUND_PENDING payment rows/i,
    );
  });
});
