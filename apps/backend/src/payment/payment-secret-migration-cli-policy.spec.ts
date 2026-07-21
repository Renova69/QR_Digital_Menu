import {
  assertPaymentSecretMigrationApplySafety,
  getPaymentSecretMigrationKeyFingerprint,
} from './payment-secret-migration-cli-policy';

describe('payment secret migration apply safety', () => {
  const safeEnv = {
    PAYMENT_SECRET_WRITE_VERSION: 'v2',
    PAYMENT_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    PAYMENT_SECRET_ENCRYPTION_KEY_ID: 'primary',
    DATABASE_URL: 'postgresql://app:secret@db.internal:5432/qr_menu',
  };

  it('requires an explicit v2 write switch and drained old revisions', () => {
    expect(() =>
      assertPaymentSecretMigrationApplySafety(
        ['--apply', '--confirm=MIGRATE_PAYMENT_SECRETS'],
        { ...safeEnv, PAYMENT_SECRET_WRITE_VERSION: 'v1' },
      ),
    ).toThrow('PAYMENT_SECRET_WRITE_VERSION=v2');

    expect(() =>
      assertPaymentSecretMigrationApplySafety(
        ['--apply', '--confirm=MIGRATE_PAYMENT_SECRETS'],
        safeEnv,
      ),
    ).toThrow('--confirm-old-revisions-drained');
  });

  it('binds apply approval to the target database and key fingerprint', () => {
    expect(() =>
      assertPaymentSecretMigrationApplySafety(
        [
          '--apply',
          '--confirm=MIGRATE_PAYMENT_SECRETS',
          '--confirm-old-revisions-drained',
          '--confirm-database=wrong/db',
          '--confirm-key=wrong',
        ],
        safeEnv,
      ),
    ).toThrow('--confirm-database=db.internal/qr_menu');
  });

  it('accepts approvals bound to the exact database and key', () => {
    const fingerprint = getPaymentSecretMigrationKeyFingerprint(safeEnv);

    expect(
      assertPaymentSecretMigrationApplySafety(
        [
          '--apply',
          '--confirm=MIGRATE_PAYMENT_SECRETS',
          '--confirm-old-revisions-drained',
          '--confirm-database=db.internal/qr_menu',
          `--confirm-key=${fingerprint}`,
        ],
        safeEnv,
      ),
    ).toEqual({
      databaseIdentity: 'db.internal/qr_menu',
      keyFingerprint: fingerprint,
    });
  });

  it('rejects approval generated for a different encryption key', () => {
    const wrongFingerprint = getPaymentSecretMigrationKeyFingerprint({
      ...safeEnv,
      PAYMENT_SECRET_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    });

    expect(() =>
      assertPaymentSecretMigrationApplySafety(
        [
          '--apply',
          '--confirm=MIGRATE_PAYMENT_SECRETS',
          '--confirm-old-revisions-drained',
          '--confirm-database=db.internal/qr_menu',
          `--confirm-key=${wrongFingerprint}`,
        ],
        safeEnv,
      ),
    ).toThrow('--confirm-key=');
  });
});
