import {
  assertRepairApplySafety,
  classifyRepairState,
  EXPECTED_RECORDED_CHECKSUM,
  getRepairDatabaseIdentity,
  TARGET_MIGRATION,
} from '../../scripts/repair-migration-checksum';

const DIRECT_URL =
  'postgresql://user:secret@ep-safe.eu-central-1.aws.neon.tech/neondb?sslmode=require';
const TARGET_CHECKSUM = 'target-checksum';

describe('migration checksum repair safety', () => {
  it('requires the unpooled direct database endpoint', () => {
    expect(() => getRepairDatabaseIdentity({})).toThrow(
      'DIRECT_URL is required',
    );
    expect(() =>
      getRepairDatabaseIdentity({
        DIRECT_URL: DIRECT_URL.replace('ep-safe', 'ep-safe-pooler'),
      }),
    ).toThrow('requires the unpooled DIRECT_URL endpoint');
    expect(getRepairDatabaseIdentity({ DIRECT_URL })).toEqual({
      databaseUrl: DIRECT_URL,
      databaseIdentity: 'ep-safe.eu-central-1.aws.neon.tech/neondb',
    });
    expect(() =>
      getRepairDatabaseIdentity({
        DIRECT_URL: 'postgresql://postgres:test@127.0.0.1:55433/checksum_test',
      }),
    ).toThrow('refuses a local database');
    expect(
      getRepairDatabaseIdentity(
        {
          DIRECT_URL:
            'postgresql://postgres:test@127.0.0.1:55433/checksum_test',
        },
        { allowLocalDisposable: true },
      ).databaseIdentity,
    ).toBe('127.0.0.1:55433/checksum_test');
    expect(() =>
      getRepairDatabaseIdentity(
        {
          DIRECT_URL: 'postgresql://postgres:test@127.0.0.1:55433/neondb',
        },
        { allowLocalDisposable: true },
      ),
    ).toThrow('targets checksum_test');
  });

  it('requires exact migration, database, old checksum, and new checksum confirmations', () => {
    const args = [
      '--confirm=REPAIR_MIGRATION_CHECKSUM',
      `--confirm-migration=${TARGET_MIGRATION}`,
      `--confirm-from=${EXPECTED_RECORDED_CHECKSUM}`,
      `--confirm-to=${TARGET_CHECKSUM}`,
      '--confirm-database=ep-safe.eu-central-1.aws.neon.tech/neondb',
    ];

    expect(
      assertRepairApplySafety(args, TARGET_CHECKSUM, { DIRECT_URL }),
    ).toEqual({
      databaseUrl: DIRECT_URL,
      databaseIdentity: 'ep-safe.eu-central-1.aws.neon.tech/neondb',
    });
    expect(() =>
      assertRepairApplySafety(args.slice(1), TARGET_CHECKSUM, { DIRECT_URL }),
    ).toThrow('--confirm=REPAIR_MIGRATION_CHECKSUM');
  });

  it('only repairs the known successful migration state', () => {
    const applied = {
      migration_name: TARGET_MIGRATION,
      checksum: EXPECTED_RECORDED_CHECKSUM,
      finished_at: new Date('2026-06-20T00:00:00.000Z'),
      rolled_back_at: null,
    };

    expect(classifyRepairState(applied, TARGET_CHECKSUM)).toBe('needs-repair');
    expect(
      classifyRepairState(
        { ...applied, checksum: TARGET_CHECKSUM },
        TARGET_CHECKSUM,
      ),
    ).toBe('already-repaired');
    expect(() =>
      classifyRepairState(
        { ...applied, checksum: 'unexpected' },
        TARGET_CHECKSUM,
      ),
    ).toThrow('unexpected checksum unexpected; refusing repair');
    expect(() =>
      classifyRepairState({ ...applied, finished_at: null }, TARGET_CHECKSUM),
    ).toThrow('is unfinished');
  });
});
