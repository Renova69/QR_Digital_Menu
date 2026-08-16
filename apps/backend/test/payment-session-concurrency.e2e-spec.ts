import { ConflictException } from '@nestjs/common';
import {
  Currency,
  OrderStatus,
  PaymentProvider,
  Prisma,
  PrismaClient,
  SubscriptionTier,
  UserRole,
} from '@prisma/client';
import { FeatureService } from '../src/subscription/feature.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentProviderConfigService } from '../src/payment/payment-provider-config.service';
import { PaymentCoreService } from '../src/payment/core/payment-core.service';
import { PaymentSessionService } from '../src/payment/session/payment-session.service';
import { PaymentSettlementService } from '../src/payment/session/payment-settlement.service';

const concurrencyDatabaseUrl = process.env.CONCURRENCY_DATABASE_URL;
const describeWithDatabase = concurrencyDatabaseUrl ? describe : describe.skip;

jest.setTimeout(30_000);

/**
 * Prisma sizes its connection pool at `num_cpus * 2 + 1`, which is 3 on a
 * single-vCPU CI runner. This suite holds two deliberately-contending
 * transactions open at once AND polls pg_stat_activity from the same client to
 * observe the lock waiters, so a pool of 3 starves the observer: it blocks for
 * the 10s pool-acquire timeout while the two transactions sit on the row lock,
 * and both then die with "Transaction already closed". That reads like a
 * broken invariant but is pure harness starvation — pinning
 * `connection_limit=3` locally reproduces it exactly, and the suite passes
 * unchanged on a many-core machine, which is why it only ever failed in CI.
 *
 * The pool only has to exceed the number of concurrent actors, and this is
 * scoped to the test client; the production PrismaService is untouched.
 */
function withTestPoolSize(url: string, connections: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('connection_limit', String(connections));
  return parsed.toString();
}

function assertIsolatedTestDatabase(url: string): void {
  const parsed = new URL(url);
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  if (!isLocal || !parsed.pathname.slice(1).endsWith('_test')) {
    throw new Error(
      'CONCURRENCY_DATABASE_URL must point to a local database whose name ends in "_test".',
    );
  }
}

describeWithDatabase(
  'Payment/session PostgreSQL concurrency invariants',
  () => {
    let prisma: PrismaClient;
    const runPrefix = `codex-payment-race-${Date.now()}`;

    beforeAll(async () => {
      assertIsolatedTestDatabase(concurrencyDatabaseUrl!);
      prisma = new PrismaClient({
        datasources: {
          db: { url: withTestPoolSize(concurrencyDatabaseUrl!, 10) },
        },
      });
      await prisma.$connect();
    });

    afterAll(async () => {
      await prisma.user.deleteMany({
        where: { email: { startsWith: runPrefix } },
      });
      await prisma.$disconnect();
    });

    async function waitFor(
      assertion: () => Promise<void>,
      timeoutMs = 5_000,
    ): Promise<void> {
      const deadline = Date.now() + timeoutMs;
      let lastError: unknown;
      while (Date.now() < deadline) {
        try {
          await assertion();
          return;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      throw lastError;
    }

    async function waitForLockWaiters(expected: number): Promise<void> {
      await waitFor(async () => {
        const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND pid <> pg_backend_pid()
          AND wait_event_type = 'Lock'
      `;
        expect(row.count).toBeGreaterThanOrEqual(expected);
      });
    }

    async function holdLock(
      acquire: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ): Promise<{ release: () => void; done: Promise<void> }> {
      let markAcquired!: () => void;
      let release!: () => void;
      const acquired = new Promise<void>((resolve) => {
        markAcquired = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const done = prisma.$transaction(async (tx) => {
        await acquire(tx);
        markAcquired();
        await released;
      });
      await acquired;
      return { release, done };
    }

    async function createFixture(suffix: string) {
      const owner = await prisma.user.create({
        data: {
          email: `${runPrefix}-${suffix}-owner@example.test`,
          password: 'not-used',
          role: UserRole.OWNER,
        },
      });
      const restaurant = await prisma.restaurant.create({
        data: {
          name: `Payment race ${suffix}`,
          ownerId: owner.id,
          tier: SubscriptionTier.PROFESSIONAL,
        },
      });
      const table = await prisma.restaurantTable.create({
        data: {
          name: `T-${suffix}`,
          restaurantId: restaurant.id,
        },
      });
      const category = await prisma.menuCategory.create({
        data: {
          name: 'Main',
          restaurantId: restaurant.id,
          order: 1,
          daysOfWeek: [],
        },
      });
      const item = await prisma.menuItem.create({
        data: {
          name: 'Race item',
          price: 10,
          currency: Currency.EUR,
          categoryId: category.id,
          order: 1,
        },
      });
      const session = await prisma.tableSession.create({
        data: {
          tableId: table.id,
          restaurantId: restaurant.id,
        },
      });
      return { owner, restaurant, table, item, session };
    }

    function buildServices() {
      const featureService = new FeatureService();
      const events = {
        emitToRestaurant: jest.fn(),
        emitToTableSession: jest.fn(),
        emitTableStatusChanged: jest.fn(),
        emitOrderEventToRestaurant: jest.fn(),
        dispatchPaidOrder: jest.fn().mockResolvedValue(undefined),
        signOrderToken: jest.fn().mockReturnValue('track-token'),
      };
      const config = new PaymentProviderConfigService(featureService);
      const core = new PaymentCoreService(
        prisma as never,
        events as never,
        featureService,
      );
      const session = new PaymentSessionService(
        prisma as never,
        {
          cancelPaymentIntent: jest.fn().mockResolvedValue(undefined),
        } as never,
        events as never,
        core,
        config,
        featureService,
      );
      const settlement = new PaymentSettlementService(
        prisma as never,
        events as never,
        featureService,
        core,
        session,
      );
      const orders = new OrdersService(
        prisma as never,
        events as never,
        featureService,
        {
          createPrintJobsForOrder: jest.fn().mockResolvedValue([]),
          routeOrderToPrinters: jest.fn().mockResolvedValue(undefined),
        } as never,
        config,
        { commitOnActivity: jest.fn().mockResolvedValue(undefined) } as never,
      );
      return { orders, session, settlement };
    }

    it('rejects a customer order when concurrent close wins the session lock', async () => {
      const fixture = await createFixture('customer-close');
      const services = buildServices();
      const gate = await holdLock(
        (tx) => tx.$queryRaw`
      SELECT id
      FROM "table_session"
      WHERE id = ${fixture.session.id}
      FOR UPDATE
    `,
      );

      const close = services.session.closeSession(
        fixture.session.token,
        fixture.restaurant.id,
        fixture.owner.id,
      );
      await waitForLockWaiters(1);
      const create = services.orders.create({
        customerName: 'Concurrent guest',
        tableId: fixture.table.name,
        sessionToken: fixture.session.token,
        items: [
          {
            menuItemId: fixture.item.id,
            quantity: 1,
            selectedOptions: [],
          },
        ],
      });
      await waitForLockWaiters(2);
      gate.release();

      await gate.done;
      await expect(close).resolves.toBeUndefined();
      await expect(create).rejects.toBeInstanceOf(ConflictException);
      await expect(
        prisma.tableSession.findUniqueOrThrow({
          where: { id: fixture.session.id },
        }),
      ).resolves.toMatchObject({ status: 'CLOSED_NO_PAYMENT' });
      await expect(
        prisma.order.count({ where: { tableSessionId: fixture.session.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.tableSession.count({
          where: {
            tableId: fixture.table.id,
            restaurantId: fixture.restaurant.id,
          },
        }),
      ).resolves.toBe(1);
    });

    it('rejects queued POS work after a concurrent force-open changes the session', async () => {
      const fixture = await createFixture('pos-force-open');
      const services = buildServices();
      const gate = await holdLock(
        (tx) => tx.$queryRaw`
      SELECT id
      FROM "restaurant_table"
      WHERE id = ${fixture.table.id}
      FOR UPDATE
    `,
      );

      const forceOpen = services.session.forceOpenSession(
        fixture.table.id,
        fixture.restaurant.id,
        fixture.owner.id,
      );
      await waitForLockWaiters(1);
      const clientOrderId = `queued-${runPrefix}`;
      const posCreate = services.orders.create(
        {
          customerName: 'Queued POS guest',
          source: 'POS',
          tableId: fixture.table.name,
          posSubmission: {
            clientOrderId,
            restaurantId: fixture.restaurant.id,
            tableId: fixture.table.id,
            expectedTableSessionId: fixture.session.id,
          },
          items: [
            {
              menuItemId: fixture.item.id,
              quantity: 1,
              expectedUnitPrice: fixture.item.price,
              selectedOptions: [],
            },
          ],
        },
        fixture.owner.id,
      );
      await waitForLockWaiters(2);
      gate.release();

      await gate.done;
      const replacement = await forceOpen;
      await expect(posCreate).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TABLE_SESSION_CHANGED' }),
      });
      expect(replacement.session.id).not.toBe(fixture.session.id);
      await expect(
        prisma.order.count({ where: { clientOrderId } }),
      ).resolves.toBe(0);
    });

    it('uses one session-to-request lock order without a cash-confirm deadlock', async () => {
      const fixture = await createFixture('cash-lock-order');
      const services = buildServices();
      await prisma.order.create({
        data: {
          customerName: 'Cash guest',
          restaurantId: fixture.restaurant.id,
          tableId: fixture.table.id,
          tableName: fixture.table.name,
          tableSessionId: fixture.session.id,
          totalPrice: 20,
          status: OrderStatus.NEW,
        },
      });
      const request = await services.settlement.createCashPaymentRequest(
        fixture.session.token,
        fixture.restaurant.id,
      );
      const gate = await holdLock(
        (tx) => tx.$queryRaw`
      SELECT id
      FROM "table_session"
      WHERE id = ${fixture.session.id}
      FOR UPDATE
    `,
      );

      const confirm = services.settlement.confirmCashPaymentRequest(
        request.id,
        fixture.owner.id,
      );
      await waitForLockWaiters(1);
      const refresh = services.settlement.createCashPaymentRequest(
        fixture.session.token,
        fixture.restaurant.id,
      );
      await waitForLockWaiters(2);
      gate.release();

      await gate.done;
      await expect(confirm).resolves.toMatchObject({
        id: request.id,
        status: 'PAID',
      });
      const refreshResult = await Promise.allSettled([refresh]);
      if (refreshResult[0].status === 'rejected') {
        expect(refreshResult[0].reason).toBeInstanceOf(ConflictException);
        expect(String(refreshResult[0].reason)).not.toMatch(/deadlock/i);
      }
      await expect(
        prisma.cashPaymentRequest.findUniqueOrThrow({
          where: { id: request.id },
        }),
      ).resolves.toMatchObject({ status: 'PAID' });
    });

    it('rolls back checkout abandonment when the locked mutation fails', async () => {
      const fixture = await createFixture('abandon-rollback');
      const services = buildServices();
      const payment = await prisma.payment.create({
        data: {
          tableSessionId: fixture.session.id,
          restaurantId: fixture.restaurant.id,
          amount: 10,
          provider: PaymentProvider.EPAY,
          status: 'PENDING',
        },
      });

      const { nonStripeIds } =
        await services.session.findPendingCheckoutPayments(fixture.session.id);

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`
          SELECT id
          FROM "table_session"
          WHERE id = ${fixture.session.id}
          FOR UPDATE
        `;
          await services.session.applyAbandonedPaymentsForLockedSession(
            tx,
            fixture.session.id,
            nonStripeIds,
          );
          throw new Error('forced mutation failure');
        }),
      ).rejects.toThrow('forced mutation failure');

      await expect(
        prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      ).resolves.toMatchObject({
        status: 'PENDING',
        providerStatus: null,
      });
    });
  },
);
