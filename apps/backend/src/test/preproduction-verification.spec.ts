import { createHash } from 'crypto';
import {
  assertCanonicalMigrationBytes,
  assessMigrationIntegrity,
  countFailedDatabasePostconditions,
  countMigrationIntegrityBlockers,
  sha256Migration,
  type MigrationRow,
} from '../../scripts/verify-preproduction-readonly';

describe('pre-production migration verification', () => {
  it('hashes the exact canonical migration bytes Prisma records', () => {
    const migration = Buffer.from('SELECT 1;\nSELECT 2;\n', 'utf8');

    expect(() =>
      assertCanonicalMigrationBytes('canonical', migration),
    ).not.toThrow();
    expect(sha256Migration(migration)).toBe(
      createHash('sha256').update(migration).digest('hex'),
    );
  });

  it('rejects platform-dependent migration line endings before hashing', () => {
    expect(() =>
      assertCanonicalMigrationBytes(
        'windows.sql',
        Buffer.from('SELECT 1;\r\n', 'utf8'),
      ),
    ).toThrow(
      'Migration windows.sql contains carriage returns. Prisma records exact file bytes',
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
    expect(countMigrationIntegrityBlockers(audit, true)).toBe(3);
  });

  it('counts only failed database postconditions as blockers', () => {
    expect(
      countFailedDatabasePostconditions([
        { checkName: 'extension', passed: true, details: null },
        { checkName: 'column', passed: false, details: 'missing' },
        { checkName: 'index', passed: false, details: null },
      ]),
    ).toBe(2);
  });
});
