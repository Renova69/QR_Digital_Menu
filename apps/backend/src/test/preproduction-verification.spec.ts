import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  assertCanonicalMigrationBytes,
  assessMigrationIntegrity,
  countFailedDatabasePostconditions,
  countMigrationIntegrityBlockers,
  sha256Migration,
  type MigrationRow,
} from '../../scripts/verify-preproduction-readonly';

describe('pre-production migration verification', () => {
  it('gates migration deploy on the complete slug invariant verifier against the migration database', () => {
    const deployScript = readFileSync(
      resolve(__dirname, '../../../../deploy.ps1'),
      'utf8',
    );
    const directDatabaseAssignment = deployScript.indexOf(
      '$env:DATABASE_URL = $effectiveDirectUrl',
    );
    const migrationSafetyGate = deployScript.indexOf(
      'node scripts/check-migration-safety.js',
    );
    const preMigrationBackup = deployScript.indexOf(
      '$GCLOUD run jobs execute $BACKUP_JOB',
    );
    const directUrlAssignment = deployScript.indexOf(
      '$env:DIRECT_URL = $effectiveDirectUrl',
    );
    const guardedTry = deployScript.indexOf('try {', directUrlAssignment);
    const pushLocation = deployScript.indexOf(
      'Push-Location',
      directUrlAssignment,
    );
    const databaseGuard = deployScript.indexOf('npm run db:guard:verify');
    const slugGate = deployScript.indexOf('npm run slug:verify');
    const migration = deployScript.indexOf('npm run migrate:deploy');
    const guardedFinally = deployScript.indexOf('} finally {', migration);

    expect(deployScript).toContain(
      '$DB_HOST = "aws-0-eu-central-1.pooler.supabase.com"',
    );
    expect(deployScript).toContain('$DB_PORT = 5432');
    expect(migrationSafetyGate).toBeGreaterThan(-1);
    expect(preMigrationBackup).toBeGreaterThan(migrationSafetyGate);
    expect(directDatabaseAssignment).toBeGreaterThan(preMigrationBackup);
    expect(directUrlAssignment).toBeGreaterThan(directDatabaseAssignment);
    expect(guardedTry).toBeGreaterThan(directUrlAssignment);
    expect(pushLocation).toBeGreaterThan(guardedTry);
    expect(databaseGuard).toBeGreaterThan(pushLocation);
    expect(slugGate).toBeGreaterThan(databaseGuard);
    expect(migration).toBeGreaterThan(slugGate);
    expect(guardedFinally).toBeGreaterThan(migration);
    expect(deployScript).toContain('$env:DATABASE_URL = $previousDatabaseUrl');
    expect(deployScript).toContain('$env:DIRECT_URL = $previousDirectUrl');
    expect(deployScript).toContain('Remove-Item Env:DATABASE_URL');
    expect(deployScript).toContain('Remove-Item Env:DIRECT_URL');
  });

  it('documents the compatibility rule for contract migrations', () => {
    const deployScript = readFileSync(
      resolve(__dirname, '../../../../deploy.ps1'),
      'utf8',
    );
    const dockerfile = readFileSync(
      resolve(__dirname, '../../Dockerfile'),
      'utf8',
    );
    const normalizedDockerfileComments = dockerfile.replace(/\r?\n#\s?/g, ' ');

    expect(deployScript).toContain(
      'Contract migrations require their readiness revision to be fully deployed first.',
    );
    expect(normalizedDockerfileComments).toContain(
      'Contract migrations require a separately deployed readiness revision first.',
    );
  });

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
