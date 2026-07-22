import type { PrismaService } from '../prisma/prisma.service';
import {
  decryptSecret,
  encryptSecretV2,
  type PaymentSecretPurpose,
} from './secret-crypto';

const SECRET_FIELDS = [
  {
    field: 'epaySecretEncrypted',
    purpose: 'epay-secret',
  },
  {
    field: 'boricaPrivateKeyEncrypted',
    purpose: 'borica-private-key',
  },
  {
    field: 'myposPrivateKeyEncrypted',
    purpose: 'mypos-private-key',
  },
] as const satisfies ReadonlyArray<{
  field:
    | 'epaySecretEncrypted'
    | 'boricaPrivateKeyEncrypted'
    | 'myposPrivateKeyEncrypted';
  purpose: PaymentSecretPurpose;
}>;

export interface PaymentSecretMigrationOptions {
  dryRun: boolean;
  allowLegacyPlaintext?: boolean;
  batchSize?: number;
  onFailure?: (details: {
    restaurantId: string;
    field: (typeof SECRET_FIELDS)[number]['field'];
    error: unknown;
  }) => void;
}

export interface PaymentSecretMigrationResult {
  scanned: number;
  alreadyV2: number;
  legacyV1: number;
  plaintext: number;
  eligible: number;
  migrated: number;
  conflicts: number;
  failures: number;
}

type PaymentSecretMigrationPrisma = Pick<PrismaService, 'restaurant'>;

export async function migratePaymentSecrets(
  prisma: PaymentSecretMigrationPrisma,
  options: PaymentSecretMigrationOptions,
): Promise<PaymentSecretMigrationResult> {
  const batchSize = Math.max(1, Math.min(options.batchSize ?? 100, 500));
  const result: PaymentSecretMigrationResult = {
    scanned: 0,
    alreadyV2: 0,
    legacyV1: 0,
    plaintext: 0,
    eligible: 0,
    migrated: 0,
    conflicts: 0,
    failures: 0,
  };
  let cursor: string | undefined;

  while (true) {
    const rows = await prisma.restaurant.findMany({
      where: {
        OR: SECRET_FIELDS.map(({ field }) => ({ [field]: { not: null } })),
      },
      select: {
        id: true,
        epaySecretEncrypted: true,
        boricaPrivateKeyEncrypted: true,
        myposPrivateKeyEncrypted: true,
      },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      result.scanned += 1;
      for (const { field, purpose } of SECRET_FIELDS) {
        const current = row[field];
        if (current === null) continue;
        const context = { restaurantId: row.id, purpose };

        try {
          if (current.length === 0) {
            throw new Error('Stored payment credential is empty');
          }
          if (current.startsWith('v2:')) {
            decryptSecret(current, context);
            result.alreadyV2 += 1;
            continue;
          }

          const isLegacyV1 = current.startsWith('v1:');
          if (isLegacyV1) {
            result.legacyV1 += 1;
          } else {
            result.plaintext += 1;
          }
          if (!isLegacyV1 && !options.allowLegacyPlaintext) {
            throw new Error(
              'Legacy plaintext credential found; rerun the migration with the explicit plaintext allowance',
            );
          }

          const plaintext = isLegacyV1
            ? decryptSecret(current, context)
            : current;
          const replacement = encryptSecretV2(plaintext, context);
          result.eligible += 1;
          if (options.dryRun) continue;

          const updated = await prisma.restaurant.updateMany({
            where: { id: row.id, [field]: current },
            data: { [field]: replacement },
          });
          if (updated.count === 1) {
            result.migrated += 1;
          } else {
            result.conflicts += 1;
          }
        } catch (error) {
          result.failures += 1;
          options.onFailure?.({
            restaurantId: row.id,
            field,
            error,
          });
        }
      }
    }

    cursor = rows.at(-1)!.id;
  }

  return result;
}
