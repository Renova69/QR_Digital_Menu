import { ConflictException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import { RestaurantSlugService } from '../src/restaurants/slug/restaurant-slug.service';

const concurrencyDatabaseUrl = process.env.CONCURRENCY_DATABASE_URL;
const describeWithDatabase = concurrencyDatabaseUrl ? describe : describe.skip;

jest.setTimeout(30_000);

const TARGET_SLUG = 'slug-lock-order-race';
const TRIGGER_NAME = 'restaurant_slug_lock_order_pause';
const FUNCTION_NAME = 'restaurant_slug_lock_order_pause_fn';

function assertIsolatedTestDatabase(url: string): void {
  const parsed = new URL(url);
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!isLocal || !parsed.pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'CONCURRENCY_DATABASE_URL must point to a local database whose name ends in "_test".',
    );
  }
}

function dedicatedDatabaseUrl(label: string): string {
  const url = new URL(concurrencyDatabaseUrl!);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('application_name', label);
  return url.toString();
}

describeWithDatabase('Restaurant slug PostgreSQL lock order', () => {
  const runPrefix = `codex-slug-lock-${Date.now()}`;
  const createApplicationName = `${runPrefix}-create`;
  let observer: PrismaClient;
  let createClient: PrismaClient;
  let renameClient: PrismaClient;
  let clientsConnected = false;

  async function removePauseTrigger(): Promise<void> {
    await observer.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${TRIGGER_NAME}" ON "restaurant"`,
    );
    await observer.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${FUNCTION_NAME}"()`,
    );
  }

  async function waitUntilCreateIsPaused(): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const [row] = await observer.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND application_name = ${createApplicationName}
          AND wait_event = 'PgSleep'
      `;
      if (row.count > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('Timed out waiting for the create transaction to pause');
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase(concurrencyDatabaseUrl!);
    observer = new PrismaClient({
      datasources: {
        db: { url: dedicatedDatabaseUrl(`${runPrefix}-observer`) },
      },
    });
    createClient = new PrismaClient({
      datasources: { db: { url: dedicatedDatabaseUrl(createApplicationName) } },
      transactionOptions: { maxWait: 5_000, timeout: 15_000 },
    });
    renameClient = new PrismaClient({
      datasources: { db: { url: dedicatedDatabaseUrl(`${runPrefix}-rename`) } },
      transactionOptions: { maxWait: 5_000, timeout: 15_000 },
    });
    await Promise.all([
      observer.$connect(),
      createClient.$connect(),
      renameClient.$connect(),
    ]);
    clientsConnected = true;
  });

  afterEach(async () => {
    if (!clientsConnected) return;
    await removePauseTrigger();
    await observer.user.deleteMany({
      where: { email: { startsWith: runPrefix } },
    });
  });

  afterAll(async () => {
    if (!clientsConnected) return;
    await removePauseTrigger();
    await Promise.all([
      observer.$disconnect(),
      createClient.$disconnect(),
      renameClient.$disconnect(),
    ]);
  });

  it('turns a concurrent create-vs-rename collision into a conflict, never a deadlock', async () => {
    const existingOwner = await observer.user.create({
      data: {
        email: `${runPrefix}-existing@example.test`,
        password: 'not-used',
        role: UserRole.OWNER,
      },
    });
    const creatingOwner = await observer.user.create({
      data: {
        email: `${runPrefix}-creating@example.test`,
        password: 'not-used',
        role: UserRole.OWNER,
      },
    });
    const oldSlug = `${runPrefix}-old`.slice(0, 60);
    const existingRestaurant = await observer.restaurant.create({
      data: {
        name: 'Existing lock-order restaurant',
        slug: oldSlug,
        ownerId: existingOwner.id,
        slugs: {
          create: {
            slug: oldSlug,
            isPrimary: true,
            committedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          },
        },
      },
    });

    await observer.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${FUNCTION_NAME}"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."slug" = '${TARGET_SLUG}' THEN
          PERFORM pg_sleep(2);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await observer.$executeRawUnsafe(`
      CREATE TRIGGER "${TRIGGER_NAME}"
      AFTER INSERT OR UPDATE OF "slug" ON "restaurant"
      FOR EACH ROW EXECUTE FUNCTION "${FUNCTION_NAME}"()
    `);

    const createService = new RestaurantSlugService(createClient as never);
    const renameService = new RestaurantSlugService(renameClient as never);
    const createAttempt = createService.createRestaurantWithInitialSlug(
      {
        name: 'Creating lock-order restaurant',
        ownerId: creatingOwner.id,
      },
      TARGET_SLUG,
    );

    await waitUntilCreateIsPaused();
    const renameAttempt = renameService.renameSlug(
      existingRestaurant.id,
      TARGET_SLUG,
    );

    const [createResult, renameResult] = await Promise.allSettled([
      createAttempt,
      renameAttempt,
    ]);

    if (createResult.status === 'rejected') {
      throw createResult.reason;
    }
    expect(createResult.status).toBe('fulfilled');
    expect(renameResult.status).toBe('rejected');
    if (renameResult.status === 'rejected') {
      expect(renameResult.reason).toBeInstanceOf(ConflictException);
      expect(renameResult.reason).toHaveProperty(
        'message',
        'This slug is already taken',
      );
    }
  });
});
