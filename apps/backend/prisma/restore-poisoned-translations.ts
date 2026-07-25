/**
 * Rolls back a repair-poisoned-translations.ts --apply run by re-merging
 * (never overwriting) each backed-up entity's pre-repair `translations`
 * snapshot. A merge, not a replace, so any translation produced AFTER the
 * repair (e.g. by the worker re-translating a STALE unit) survives the
 * restore instead of being clobbered back to the pre-repair state.
 *
 * Usage:
 *   npx ts-node prisma/restore-poisoned-translations.ts --batch=<id>            (dry-run)
 *   npx ts-node prisma/restore-poisoned-translations.ts --batch=<id> --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TABLE_BY_ENTITY: Record<'CATEGORY' | 'ITEM' | 'OPTION', string> = {
  CATEGORY: 'menu_category',
  ITEM: 'menu_item',
  OPTION: 'menu_option',
};

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const batchArg = args.find((a) => a.startsWith('--batch='));
  const batchId = batchArg?.split('=')[1];

  if (!batchId) {
    console.error(
      'Usage: restore-poisoned-translations.ts --batch=<id> [--apply]',
    );
    process.exit(1);
  }

  if (apply && process.env.NODE_ENV === 'production') {
    console.error(
      '❌ Restore aborted: NODE_ENV=production. Set ALLOW_REMOTE_SEED=true if this really is intended for the live DB.',
    );
    if (process.env.ALLOW_REMOTE_SEED !== 'true') process.exit(1);
    console.warn(
      '⚠️  ALLOW_REMOTE_SEED=true — proceeding with --apply against production.',
    );
  }

  const backups = await prisma.menuTranslationBackup.findMany({
    where: { batchId },
  });

  if (backups.length === 0) {
    console.log(`No backup rows found for batchId "${batchId}".`);
    return;
  }

  console.log(
    `── ${apply ? 'APPLY' : 'DRY RUN'} — restoring batch ${batchId} ──`,
  );
  console.log(`${backups.length} entities to restore.`);

  for (const backup of backups) {
    const table = TABLE_BY_ENTITY[backup.entityType];
    if (apply) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET translations = COALESCE(translations, '{}'::jsonb) || $1::jsonb WHERE id = $2`,
        JSON.stringify(backup.translations),
        backup.entityId,
      );
      // Mark every state row for this entity STALE so the worker re-derives
      // a fresh sourceHash against the restored content rather than trusting
      // whatever hash was current at repair time.
      await prisma.menuTranslationState.updateMany({
        where: { entityType: backup.entityType, entityId: backup.entityId },
        data: { status: 'STALE', nextAttemptAt: null, failureCount: 0 },
      });
    } else {
      console.log(`  would restore ${backup.entityType} ${backup.entityId}`);
    }
  }

  if (!apply) {
    console.log('Re-run with --apply to perform the restore.');
  } else {
    console.log('Restore complete.');
  }
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
