import { migratePaymentSecrets } from './payment-secret-migration';
import { encryptSecret } from './secret-crypto';

type MigrationPrisma = Parameters<typeof migratePaymentSecrets>[0];

function asMigrationPrisma(value: object): MigrationPrisma {
  return value as unknown as MigrationPrisma;
}

describe('payment secret migration', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.EPAY_SECRET_ENCRYPTION_KEY = '01234567890123456789012345678901';
    process.env.PAYMENT_SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      'base64',
    );
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v1';
  });

  afterEach(() => {
    delete process.env.PAYMENT_SECRET_ENCRYPTION_KEY;
    delete process.env.PAYMENT_SECRET_WRITE_VERSION;
  });

  it('re-encrypts a legacy value with a compare-and-swap update', async () => {
    const legacy = encryptSecret('merchant-secret');
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'restaurant-1',
          epaySecretEncrypted: legacy,
          boricaPrivateKeyEncrypted: null,
          myposPrivateKeyEncrypted: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = asMigrationPrisma({
      restaurant: { findMany, updateMany },
    });

    const result = await migratePaymentSecrets(prisma, {
      dryRun: false,
      batchSize: 10,
    });

    expect(result).toEqual({
      scanned: 1,
      alreadyV2: 0,
      legacyV1: 1,
      plaintext: 0,
      eligible: 1,
      migrated: 1,
      conflicts: 0,
      failures: 0,
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    const update = updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: 'restaurant-1',
      epaySecretEncrypted: legacy,
    });
    expect(update.data.epaySecretEncrypted).toMatch(/^v2:/);
  });

  it('validates every credential during a dry run without writing', async () => {
    const legacy = encryptSecret('merchant-secret');
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'restaurant-1',
          epaySecretEncrypted: legacy,
          boricaPrivateKeyEncrypted: null,
          myposPrivateKeyEncrypted: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn();

    const result = await migratePaymentSecrets(
      asMigrationPrisma({ restaurant: { findMany, updateMany } }),
      { dryRun: true, batchSize: 10 },
    );

    expect(result.eligible).toBe(1);
    expect(result.migrated).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reports a compare-and-swap conflict instead of overwriting a newer setting', async () => {
    const legacy = encryptSecret('merchant-secret');
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'restaurant-1',
          epaySecretEncrypted: legacy,
          boricaPrivateKeyEncrypted: null,
          myposPrivateKeyEncrypted: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });

    const result = await migratePaymentSecrets(
      asMigrationPrisma({ restaurant: { findMany, updateMany } }),
      { dryRun: false },
    );

    expect(result.conflicts).toBe(1);
    expect(result.migrated).toBe(0);
  });

  it('reports a non-null empty credential as invalid instead of silently skipping it', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'restaurant-1',
          epaySecretEncrypted: '',
          boricaPrivateKeyEncrypted: null,
          myposPrivateKeyEncrypted: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const updateMany = jest.fn();

    const result = await migratePaymentSecrets(
      asMigrationPrisma({ restaurant: { findMany, updateMany } }),
      { dryRun: true },
    );

    expect(result.failures).toBe(1);
    expect(result.eligible).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('reports plaintext separately and requires its migration-only allowance in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYMENT_SECRET_WRITE_VERSION = 'v2';
    delete process.env.PAYMENT_SECRET_ALLOW_LEGACY_PLAINTEXT;
    const row = {
      id: 'restaurant-plain',
      epaySecretEncrypted: 'historical-plaintext',
      boricaPrivateKeyEncrypted: null,
      myposPrivateKeyEncrypted: null,
    };
    const blockedFindMany = jest
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);

    const blocked = await migratePaymentSecrets(
      asMigrationPrisma({
        restaurant: {
          findMany: blockedFindMany,
          updateMany: jest.fn(),
        },
      }),
      { dryRun: true },
    );

    expect(blocked).toMatchObject({
      plaintext: 1,
      legacyV1: 0,
      eligible: 0,
      failures: 1,
    });

    const allowedFindMany = jest
      .fn()
      .mockResolvedValueOnce([row])
      .mockResolvedValueOnce([]);
    const allowed = await migratePaymentSecrets(
      asMigrationPrisma({
        restaurant: {
          findMany: allowedFindMany,
          updateMany: jest.fn(),
        },
      }),
      { dryRun: true, allowLegacyPlaintext: true },
    );

    expect(allowed).toMatchObject({
      plaintext: 1,
      legacyV1: 0,
      eligible: 1,
      failures: 0,
    });
  });

  it('paginates, migrates every populated field, and is idempotent on rerun', async () => {
    const row1 = {
      id: 'restaurant-1',
      epaySecretEncrypted: encryptSecret('epay'),
      boricaPrivateKeyEncrypted: encryptSecret('borica'),
      myposPrivateKeyEncrypted: null,
    };
    const row2 = {
      id: 'restaurant-2',
      epaySecretEncrypted: null,
      boricaPrivateKeyEncrypted: null,
      myposPrivateKeyEncrypted: encryptSecret('mypos'),
    };
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([row1])
      .mockResolvedValueOnce([row2])
      .mockResolvedValueOnce([]);
    const replacements: string[] = [];
    const updateMany = jest.fn().mockImplementation(({ data }) => {
      replacements.push(Object.values(data)[0] as string);
      return { count: 1 };
    });

    const first = await migratePaymentSecrets(
      asMigrationPrisma({ restaurant: { findMany, updateMany } }),
      { dryRun: false, batchSize: 1 },
    );

    expect(first).toMatchObject({
      scanned: 2,
      legacyV1: 3,
      plaintext: 0,
      eligible: 3,
      migrated: 3,
      failures: 0,
    });
    expect(findMany.mock.calls[1][0]).toMatchObject({
      cursor: { id: 'restaurant-1' },
      skip: 1,
    });

    const rerunRows = [
      {
        id: 'restaurant-1',
        epaySecretEncrypted: replacements[0],
        boricaPrivateKeyEncrypted: replacements[1],
        myposPrivateKeyEncrypted: null,
      },
      {
        id: 'restaurant-2',
        epaySecretEncrypted: null,
        boricaPrivateKeyEncrypted: null,
        myposPrivateKeyEncrypted: replacements[2],
      },
    ];
    const rerunFindMany = jest
      .fn()
      .mockResolvedValueOnce(rerunRows)
      .mockResolvedValueOnce([]);
    const rerunUpdateMany = jest.fn();
    const rerun = await migratePaymentSecrets(
      asMigrationPrisma({
        restaurant: {
          findMany: rerunFindMany,
          updateMany: rerunUpdateMany,
        },
      }),
      { dryRun: false },
    );

    expect(rerun).toMatchObject({
      scanned: 2,
      alreadyV2: 3,
      legacyV1: 0,
      plaintext: 0,
      eligible: 0,
      migrated: 0,
      failures: 0,
    });
    expect(rerunUpdateMany).not.toHaveBeenCalled();
  });

  it('continues processing after one credential fails', async () => {
    const valid = encryptSecret('merchant-secret');
    const onFailure = jest.fn();
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'restaurant-1',
          epaySecretEncrypted: 'v1:not-valid',
          boricaPrivateKeyEncrypted: valid,
          myposPrivateKeyEncrypted: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await migratePaymentSecrets(
      asMigrationPrisma({
        restaurant: {
          findMany,
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
      { dryRun: false, onFailure },
    );

    expect(result).toMatchObject({
      legacyV1: 2,
      eligible: 1,
      migrated: 1,
      failures: 1,
    });
    expect(onFailure).toHaveBeenCalledTimes(1);
  });
});
