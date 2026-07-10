import { readFileSync } from 'fs';
import { join } from 'path';

describe('Prisma financial retention schema', () => {
  const backendRoot = join(__dirname, '..', '..');

  it('preserves cash-payment requests when historical table sessions are deleted', () => {
    const schema = readFileSync(
      join(backendRoot, 'prisma', 'schema.prisma'),
      'utf8',
    );
    const migration = readFileSync(
      join(
        backendRoot,
        'prisma',
        'migrations',
        '20260710143000_cash_payment_request_session_set_null',
        'migration.sql',
      ),
      'utf8',
    );

    expect(schema).toMatch(/tableSessionId\s+String\?/);
    expect(schema).toMatch(
      /tableSession\s+TableSession\?\s+@relation\(fields: \[tableSessionId\], references: \[id\], onDelete: SetNull\)/,
    );
    expect(migration).toContain(
      'ALTER TABLE "cash_payment_request" ALTER COLUMN "tableSessionId" DROP NOT NULL;',
    );
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE;');
  });
});
