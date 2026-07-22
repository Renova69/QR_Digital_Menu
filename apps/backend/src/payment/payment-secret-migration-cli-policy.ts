import * as crypto from 'crypto';

type MigrationEnvironment = Record<string, string | undefined>;

function readRequiredArg(args: string[], name: string): string {
  return (
    args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''
  );
}

function decodeMigrationKey(env: MigrationEnvironment): Buffer {
  const encoded = env.PAYMENT_SECRET_ENCRYPTION_KEY?.trim() ?? '';
  const decoded = Buffer.from(encoded, 'base64');
  if (
    !encoded ||
    decoded.length !== 32 ||
    decoded.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')
  ) {
    throw new Error(
      'PAYMENT_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  }
  return decoded;
}

export function getPaymentSecretMigrationKeyFingerprint(
  env: MigrationEnvironment,
): string {
  return crypto
    .createHash('sha256')
    .update(decodeMigrationKey(env))
    .digest('hex')
    .slice(0, 16);
}

export function getPaymentSecretMigrationDatabaseIdentity(
  env: MigrationEnvironment,
): string {
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is required');
  const parsed = new URL(raw);
  const database = parsed.pathname.replace(/^\/+/, '');
  if (!parsed.hostname || !database) {
    throw new Error('DATABASE_URL must identify a host and database');
  }
  const port = parsed.port && parsed.port !== '5432' ? `:${parsed.port}` : '';
  return `${parsed.hostname}${port}/${database}`;
}

export function assertPaymentSecretMigrationApplySafety(
  args: string[],
  env: MigrationEnvironment = process.env,
): { databaseIdentity: string; keyFingerprint: string } {
  if (!args.includes('--confirm=MIGRATE_PAYMENT_SECRETS')) {
    throw new Error('Apply mode requires --confirm=MIGRATE_PAYMENT_SECRETS');
  }
  if (env.PAYMENT_SECRET_WRITE_VERSION !== 'v2') {
    throw new Error(
      'Apply mode requires PAYMENT_SECRET_WRITE_VERSION=v2 on the migration job',
    );
  }
  if (!args.includes('--confirm-old-revisions-drained')) {
    throw new Error(
      'Apply mode requires --confirm-old-revisions-drained after every v1-only revision is out of service',
    );
  }

  const databaseIdentity = getPaymentSecretMigrationDatabaseIdentity(env);
  const keyFingerprint = getPaymentSecretMigrationKeyFingerprint(env);
  if (readRequiredArg(args, '--confirm-database') !== databaseIdentity) {
    throw new Error(
      `Apply mode requires --confirm-database=${databaseIdentity}`,
    );
  }
  if (readRequiredArg(args, '--confirm-key') !== keyFingerprint) {
    throw new Error(`Apply mode requires --confirm-key=${keyFingerprint}`);
  }
  return { databaseIdentity, keyFingerprint };
}
