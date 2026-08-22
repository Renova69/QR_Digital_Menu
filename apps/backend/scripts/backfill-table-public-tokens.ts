/**
 * P0-2 — issue a QR `publicToken` to every physical table that lacks one.
 *
 * Background: a table used to be identified on the public ordering path by its
 * *name* ("5"), which is not a secret. Anyone who knew a restaurant id could
 * post an order for a named table, be joined to the session already open there,
 * and receive that session's token — which authorises reading the bill and
 * driving its payment. Enforcement is now conditional on the table having a
 * token, so this backfill is what actually closes the hole for existing rows.
 *
 * Safety model:
 *
 *  1. Dry run by default. Pass `--apply` to write.
 *  2. Refuses to run while any table session is OPEN. Issuing a token
 *     invalidates the QR code currently on that table, so a diner mid-meal
 *     would find their menu link dead. Running between seatings is the
 *     operational equivalent of "reprint between seatings", and it is cheaper
 *     than carrying a per-session legacy flag in the schema forever.
 *     Override with `--force` only when you know the open sessions are stale.
 *  3. Idempotent — only rows with a NULL token are touched, so a re-run after
 *     a partial failure resumes rather than rotating tokens already issued.
 *
 * After running, every affected restaurant must regenerate and reprint its QR
 * codes; the old ones encode `?table=<name>` and will no longer resolve.
 *
 *   npx ts-node scripts/backfill-table-public-tokens.ts
 *   npx ts-node scripts/backfill-table-public-tokens.ts --apply
 */
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

// Same generator as TablesService.createPublicToken — 144 bits, URL-safe.
const createPublicToken = () => randomBytes(18).toString('base64url');

async function main() {
  const openSessions = await prisma.tableSession.count({
    where: { status: 'OPEN' },
  });

  if (openSessions > 0 && !FORCE) {
    console.error(
      `Refusing to run: ${openSessions} table session(s) are OPEN.\n` +
        'Issuing a token invalidates the QR code on that table, which would ' +
        'break the menu link for anyone currently seated. Re-run between ' +
        'seatings, or pass --force if you have confirmed these sessions are stale.',
    );
    process.exitCode = 1;
    return;
  }

  const pending = await prisma.restaurantTable.findMany({
    where: { type: 'TABLE', publicToken: null },
    select: { id: true, name: true, restaurantId: true },
    orderBy: [{ restaurantId: 'asc' }, { name: 'asc' }],
  });

  if (pending.length === 0) {
    console.log('Nothing to do — every physical table already has a token.');
    return;
  }

  const byRestaurant = new Map<string, number>();
  for (const table of pending) {
    byRestaurant.set(
      table.restaurantId,
      (byRestaurant.get(table.restaurantId) ?? 0) + 1,
    );
  }

  console.log(
    `${pending.length} table(s) across ${byRestaurant.size} restaurant(s) need a token:`,
  );
  for (const [restaurantId, count] of byRestaurant) {
    console.log(`  ${restaurantId}  ${count} table(s)`);
  }

  if (!APPLY) {
    console.log('\nDry run — no changes written. Re-run with --apply.');
    return;
  }

  let issued = 0;
  for (const table of pending) {
    // One statement per row rather than a batch: publicToken is @unique, and a
    // collision (astronomically unlikely at 144 bits, but the constraint is
    // real) must not roll back tokens already issued to other tables.
    await prisma.restaurantTable.update({
      where: { id: table.id },
      data: { publicToken: createPublicToken() },
    });
    issued += 1;
  }

  console.log(`\nIssued ${issued} token(s).`);
  console.log(
    'Every affected restaurant must now regenerate and reprint its table QR ' +
      'codes — the previous codes encode ?table=<name> and no longer resolve.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
