import { createHash } from 'crypto';
import {
  assessMigrationIntegrity,
  countMigrationIntegrityBlockers,
  sha256Migration,
  type MigrationRow,
} from '../../scripts/verify-preproduction-readonly';

describe('pre-production migration verification', () => {
  it('hashes the exact migration bytes Prisma records', () => {
    const migration = Buffer.from('SELECT 1;\r\nSELECT 2;\r\n', 'utf8');

    expect(sha256Migration(migration)).toBe(
      createHash('sha256').update(migration).digest('hex'),
    );
    expect(sha256Migration(migration)).not.toBe(
      createHash('sha256')
        .update(migration.toString('utf8').replace(/\r\n/g, '\n'))
        .digest('hex'),
    );
  });

  it('classifies every missing, unfinished, rolled-back, or changed migration as a blocker', () => {
    const expected = new Map([
      ['missing', 'expected-missing'],
      ['unfinished', 'expected-unfinished'],
      ['rolled-back', 'expected-rolled-back'],
      ['changed', 'expected-changed'],
    ]);
    const rows: MigrationRow[] = [
      {
        migration_name: 'unfinished',
        checksum: 'expected-unfinished',
        finished_at: null,
        rolled_back_at: null,
      },
      {
        migration_name: 'rolled-back',
        checksum: 'expected-rolled-back',
        finished_at: new Date('2026-08-01T00:00:00.000Z'),
        rolled_back_at: new Date('2026-08-01T00:01:00.000Z'),
      },
      {
        migration_name: 'changed',
        checksum: 'different',
        finished_at: new Date('2026-08-01T00:00:00.000Z'),
        rolled_back_at: null,
      },
    ];

    const audit = assessMigrationIntegrity(expected, rows);

    expect(audit).toEqual([
      expect.objectContaining({ name: 'missing', issues: ['MISSING'] }),
      expect.objectContaining({ name: 'unfinished', issues: ['UNFINISHED'] }),
      expect.objectContaining({ name: 'rolled-back', issues: ['ROLLED_BACK'] }),
      expect.objectContaining({
        name: 'changed',
        issues: ['CHECKSUM_MISMATCH'],
      }),
    ]);
    expect(countMigrationIntegrityBlockers(audit)).toBe(4);
  });
});
