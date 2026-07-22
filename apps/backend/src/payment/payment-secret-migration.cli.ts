import { PrismaClient } from '@prisma/client';
import { migratePaymentSecrets } from './payment-secret-migration';
import {
  assertPaymentSecretMigrationApplySafety,
  getPaymentSecretMigrationDatabaseIdentity,
  getPaymentSecretMigrationKeyFingerprint,
} from './payment-secret-migration-cli-policy';
import { validatePaymentSecretV2Key } from './secret-crypto';

function readBatchSize(args: string[]): number {
  const raw = args
    .find((arg) => arg.startsWith('--batch-size='))
    ?.split('=', 2)[1];
  if (!raw) return 100;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new Error('--batch-size must be an integer from 1 to 500');
  }
  return parsed;
}

export async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  validatePaymentSecretV2Key();

  const approval = apply
    ? assertPaymentSecretMigrationApplySafety(args)
    : {
        databaseIdentity: getPaymentSecretMigrationDatabaseIdentity(
          process.env,
        ),
        keyFingerprint: getPaymentSecretMigrationKeyFingerprint(process.env),
      };
  const prisma = new PrismaClient({ log: ['warn', 'error'] });
  try {
    const result = await migratePaymentSecrets(prisma, {
      dryRun: !apply,
      allowLegacyPlaintext: args.includes('--allow-legacy-plaintext'),
      batchSize: readBatchSize(args),
      onFailure: ({ restaurantId, field, error }) => {
        const message =
          error instanceof Error ? error.message : 'Unknown migration failure';
        console.error(JSON.stringify({ restaurantId, field, error: message }));
      },
    });

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          ...approval,
          ...result,
        },
        null,
        2,
      ),
    );
    if (result.failures > 0 || result.conflicts > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Payment secret migration failed',
    );
    process.exitCode = 1;
  });
}
