import { main } from './payment-secret-migration.cli';
import { migratePaymentSecrets } from './payment-secret-migration';
import {
  assertPaymentSecretMigrationApplySafety,
  getPaymentSecretMigrationDatabaseIdentity,
  getPaymentSecretMigrationKeyFingerprint,
} from './payment-secret-migration-cli-policy';
import { validatePaymentSecretV2Key } from './secret-crypto';

jest.mock('./payment-secret-migration', () => ({
  migratePaymentSecrets: jest.fn(),
}));
jest.mock('./payment-secret-migration-cli-policy', () => ({
  assertPaymentSecretMigrationApplySafety: jest.fn(),
  getPaymentSecretMigrationDatabaseIdentity: jest.fn(),
  getPaymentSecretMigrationKeyFingerprint: jest.fn(),
}));
jest.mock('./secret-crypto', () => ({
  validatePaymentSecretV2Key: jest.fn(),
}));
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}));

const mockedMigrate = migratePaymentSecrets as jest.Mock;
const mockedAssertApplySafety =
  assertPaymentSecretMigrationApplySafety as jest.Mock;
const mockedDatabaseIdentity =
  getPaymentSecretMigrationDatabaseIdentity as jest.Mock;
const mockedKeyFingerprint =
  getPaymentSecretMigrationKeyFingerprint as jest.Mock;
const mockedValidateKey = validatePaymentSecretV2Key as jest.Mock;

const originalArgv = process.argv;
const originalExitCode = process.exitCode;

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  jest.clearAllMocks();
});

function setArgv(...args: string[]) {
  process.argv = ['node', 'cli', ...args];
}

describe('payment-secret-migration CLI', () => {
  it('runs a dry-run by default with the identity and fingerprint in the output', async () => {
    setArgv();
    mockedDatabaseIdentity.mockReturnValue({ name: 'neon-prod' });
    mockedKeyFingerprint.mockReturnValue('fp-abc');
    mockedMigrate.mockResolvedValue({
      failures: 0,
      conflicts: 0,
      migrated: 2,
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await main();

    expect(mockedValidateKey).toHaveBeenCalled();
    expect(mockedAssertApplySafety).not.toHaveBeenCalled();
    expect(mockedMigrate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dryRun: true,
        allowLegacyPlaintext: false,
        batchSize: 100,
      }),
    );
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output).toMatchObject({
      mode: 'dry-run',
      databaseIdentity: { name: 'neon-prod' },
      keyFingerprint: 'fp-abc',
      migrated: 2,
    });
    expect(process.exitCode).toBeUndefined();
    logSpy.mockRestore();
  });

  it('runs an apply with the safety assertion and legacy plaintext flag', async () => {
    setArgv('--apply', '--allow-legacy-plaintext', '--batch-size=25');
    mockedAssertApplySafety.mockResolvedValue({ approved: true });
    mockedMigrate.mockResolvedValue({ failures: 0, conflicts: 0 });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await main();

    expect(mockedAssertApplySafety).toHaveBeenCalledWith([
      '--apply',
      '--allow-legacy-plaintext',
      '--batch-size=25',
    ]);
    expect(mockedMigrate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dryRun: false,
        allowLegacyPlaintext: true,
        batchSize: 25,
      }),
    );
    const output = JSON.parse(logSpy.mock.calls[0][0]);
    expect(output.mode).toBe('apply');
    logSpy.mockRestore();
  });

  it('sets a failing exit code when the migration reports failures or conflicts', async () => {
    setArgv();
    mockedMigrate.mockResolvedValue({ failures: 2, conflicts: 0 });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await main();

    expect(process.exitCode).toBe(1);
    logSpy.mockRestore();
  });

  it('rejects on an out-of-range batch size', async () => {
    setArgv('--batch-size=0');

    await expect(main()).rejects.toThrow(
      '--batch-size must be an integer from 1 to 500',
    );
  });

  it('rejects a non-integer batch size', async () => {
    setArgv('--batch-size=abc');

    await expect(main()).rejects.toThrow(
      '--batch-size must be an integer from 1 to 500',
    );
  });

  it('logs per-restaurant failures through the onFailure callback', async () => {
    setArgv();
    let onFailure: (info: unknown) => void = () => {};
    mockedMigrate.mockImplementation(
      async (
        _prisma: unknown,
        options: { onFailure: (info: unknown) => void },
      ) => {
        onFailure = options.onFailure;
        return { failures: 0, conflicts: 0 };
      },
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await main();

    onFailure({
      restaurantId: 'r1',
      field: 'epaySecret',
      error: new Error('decrypt failed'),
    });
    expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({
      restaurantId: 'r1',
      field: 'epaySecret',
      error: 'decrypt failed',
    });

    onFailure({ restaurantId: 'r2', field: 'boricaKey', error: 'plain text' });
    expect(JSON.parse(errorSpy.mock.calls[1][0])).toEqual({
      restaurantId: 'r2',
      field: 'boricaKey',
      error: 'Unknown migration failure',
    });
    errorSpy.mockRestore();
  });
});
