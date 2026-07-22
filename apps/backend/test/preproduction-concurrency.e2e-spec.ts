import { ConflictException } from '@nestjs/common';
import {
  Currency,
  LoyaltyPointTransactionType,
  OptionType,
  OrderStatus,
  PrismaClient,
  ReservationStatus,
  SubscriptionTier,
  UserRole,
} from '@prisma/client';
import { MenuCrudService } from '../src/menu/menu-crud.service';
import { OrdersService } from '../src/orders/orders.service';
import { MenuTranslationService } from '../src/menu/menu-translation.service';
import { ensureLoyaltyAccount } from '../src/loyalty/loyalty-ledger.utils';
import { PaymentCoreService } from '../src/payment/core/payment-core.service';
import { PaymentProviderConfigService } from '../src/payment/payment-provider-config.service';
import { PaymentSessionService } from '../src/payment/session/payment-session.service';
import { PatronService } from '../src/reservations/patron.service';
import { ReservationAvailabilityService } from '../src/reservations/reservation-availability.service';
import { ReservationsService } from '../src/reservations/reservations.service';
import { FeatureService } from '../src/subscription/feature.service';
import { SuperAdminService } from '../src/super-admin/super-admin.service';

const concurrencyDatabaseUrl = process.env.CONCURRENCY_DATABASE_URL;
const describeWithDatabase = concurrencyDatabaseUrl ? describe : describe.skip;

jest.setTimeout(30_000);

function assertIsolatedTestDatabase(url: string): void {
  const parsed = new URL(url);
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const databaseName = parsed.pathname.slice(1);
  if (!isLocal || !databaseName.endsWith('_test')) {
    throw new Error(
      'CONCURRENCY_DATABASE_URL must point to a local database whose name ends in "_test".',
    );
  }
}

describeWithDatabase('Pre-production PostgreSQL concurrency invariants', () => {
  let prisma: PrismaClient;
  const runPrefix = `codex-concurrency-${Date.now()}`;

  beforeAll(async () => {
    assertIsolatedTestDatabase(concurrencyDatabaseUrl!);
    prisma = new PrismaClient({
      datasources: { db: { url: concurrencyDatabaseUrl } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: runPrefix } },
    });
    await prisma.$disconnect();
  });

  async function createRestaurantFixture(suffix: string) {
    const owner = await prisma.user.create({
      data: {
        email: `${runPrefix}-${suffix}-owner@example.test`,
        password: 'not-used',
        role: UserRole.OWNER,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `${runPrefix}-${suffix}-customer@example.test`,
        password: 'not-used',
        role: UserRole.CUSTOMER,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        name: `Concurrency ${suffix}`,
        ownerId: owner.id,
        targetLanguages: ['de', 'fr'],
      },
    });
    return { owner, customer, restaurant };
  }

  async function createReservationFixture(suffix: string) {
    const fixture = await createRestaurantFixture(suffix);
    const restaurant = await prisma.restaurant.update({
      where: { id: fixture.restaurant.id },
      data: {
        tier: SubscriptionTier.PROFESSIONAL,
        timezone: 'UTC',
      },
    });
    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    startsAt.setUTCHours(19, 0, 0, 0);
    const weekday = startsAt.getUTCDay() || 7;
    await prisma.reservationSettings.create({
      data: {
        restaurantId: restaurant.id,
        enabled: true,
        slotIntervalMinutes: 30,
        minLeadMinutes: 0,
        bookingHorizonDays: 60,
        maxTotalGuests: 12,
        maxCoversPerSlot: 4,
        requirePhone: true,
      },
    });
    await prisma.reservationServiceHours.create({
      data: {
        restaurantId: restaurant.id,
        weekday,
        openMinute: 18 * 60 + 30,
        lastSlotMinute: 19 * 60,
      },
    });
    return { ...fixture, restaurant, startsAt };
  }

  function buildReservationService() {
    const events = {
      emitReservationCreated: jest.fn(),
      emitReservationUpdated: jest.fn(),
    };
    const notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyOwner: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReservationsService(
      prisma as never,
      new ReservationAvailabilityService(prisma as never),
      {} as never,
      new PatronService(prisma as never),
      new FeatureService(),
      events as never,
      notifications as never,
    );
    return { service, events, notifications };
  }

  function createDedicatedPrisma(label: string): PrismaClient {
    const url = new URL(concurrencyDatabaseUrl!);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('application_name', `${runPrefix}-${label}`);
    return new PrismaClient({
      datasources: { db: { url: url.toString() } },
      transactionOptions: { maxWait: 5_000, timeout: 15_000 },
    });
  }

  function buildOrderService(client: PrismaClient): OrdersService {
    const featureService = new FeatureService();
    return new OrdersService(
      client as never,
      {
        emitOrderEventToRestaurant: jest.fn(),
        emitTableStatusChanged: jest.fn(),
        signOrderToken: jest.fn((orderId: string) => `track-${orderId}`),
      } as never,
      featureService,
      { routeOrderToPrinters: jest.fn().mockResolvedValue(undefined) } as never,
      new PaymentProviderConfigService(featureService),
    );
  }

  function buildPaymentSessionService(
    client: PrismaClient,
  ): PaymentSessionService {
    const featureService = new FeatureService();
    const events = {
      emitBillPaymentCleared: jest.fn(),
      emitTableStatusChanged: jest.fn(),
      emitToRestaurant: jest.fn(),
      emitToTableSession: jest.fn(),
    };
    const core = new PaymentCoreService(
      client as never,
      events as never,
      featureService,
    );
    return new PaymentSessionService(
      client as never,
      { cancelPaymentIntent: jest.fn().mockResolvedValue(undefined) } as never,
      events as never,
      core,
      new PaymentProviderConfigService(featureService),
      featureService,
    );
  }

  async function createOrderSessionFixture(suffix: string) {
    const { owner, restaurant: initialRestaurant } =
      await createRestaurantFixture(suffix);
    const restaurant = await prisma.restaurant.update({
      where: { id: initialRestaurant.id },
      data: { tier: SubscriptionTier.PROFESSIONAL },
    });
    const table = await prisma.restaurantTable.create({
      data: {
        name: `Race table ${suffix}`,
        restaurantId: restaurant.id,
        type: 'TABLE',
      },
    });
    const category = await prisma.menuCategory.create({
      data: {
        name: `Race menu ${suffix}`,
        restaurantId: restaurant.id,
        order: 1,
        daysOfWeek: [],
      },
    });
    const menuItem = await prisma.menuItem.create({
      data: {
        name: `Race item ${suffix}`,
        price: 12,
        currency: Currency.EUR,
        allergens: [],
        dietaryTags: [],
        categoryId: category.id,
        order: 1,
      },
    });
    const session = await prisma.tableSession.create({
      data: { tableId: table.id, restaurantId: restaurant.id },
    });
    return { owner, restaurant, table, menuItem, session };
  }

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

  async function waitForDatabaseLock(pid: number): Promise<void> {
    await waitFor(async () => {
      const activity = await prisma.$queryRaw<
        Array<{ waitEventType: string | null }>
      >`
        SELECT wait_event_type AS "waitEventType"
        FROM pg_stat_activity
        WHERE pid = ${pid}
      `;
      expect(activity[0]?.waitEventType).toBe('Lock');
    });
  }

  async function runOrderBeforeSessionMutation(
    label: string,
    sessionId: string,
    orderInput: Parameters<OrdersService['create']>[0],
    authenticatedUserId: string | null,
    mutate: (client: PrismaClient) => Promise<unknown>,
    orderFirst = true,
    lockKind: 'session' | 'table' = 'session',
  ) {
    const blocker = createDedicatedPrisma(`${label}-blocker`);
    const orderClient = createDedicatedPrisma(`${label}-order`);
    const mutationClient = createDedicatedPrisma(`${label}-mutation`);
    await Promise.all([
      blocker.$connect(),
      orderClient.$connect(),
      mutationClient.$connect(),
    ]);

    let releaseSessionLock!: () => void;
    let sessionLocked!: () => void;
    const releaseSession = new Promise<void>((resolve) => {
      releaseSessionLock = resolve;
    });
    const sessionLockReady = new Promise<void>((resolve) => {
      sessionLocked = resolve;
    });
    const blockerTransaction = blocker.$transaction(async (tx) => {
      if (lockKind === 'session') {
        await tx.$queryRaw`
          SELECT id
          FROM "table_session"
          WHERE id = ${sessionId}
          FOR UPDATE
        `;
      } else {
        await tx.$queryRaw`
          SELECT id
          FROM "restaurant_table"
          WHERE id = ${sessionId}
          FOR UPDATE
        `;
      }
      sessionLocked();
      await releaseSession;
    });

    try {
      await sessionLockReady;
      const [orderPidRow] = await orderClient.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS pid
      `;
      const [mutationPidRow] = await mutationClient.$queryRaw<
        Array<{ pid: number }>
      >`
        SELECT pg_backend_pid() AS pid
      `;

      let orderPromise: ReturnType<OrdersService['create']>;
      let mutationPromise: Promise<unknown>;
      if (orderFirst) {
        orderPromise = buildOrderService(orderClient).create(
          orderInput,
          authenticatedUserId,
        );
        await waitForDatabaseLock(orderPidRow.pid);
        mutationPromise = mutate(mutationClient);
        await waitForDatabaseLock(mutationPidRow.pid);
      } else {
        mutationPromise = mutate(mutationClient);
        await waitForDatabaseLock(mutationPidRow.pid);
        orderPromise = buildOrderService(orderClient).create(
          orderInput,
          authenticatedUserId,
        );
        await waitForDatabaseLock(orderPidRow.pid);
      }

      releaseSessionLock();
      const [orderResult, mutationResult] = await Promise.allSettled([
        orderPromise,
        mutationPromise,
      ]);
      await blockerTransaction;
      return { orderResult, mutationResult };
    } finally {
      releaseSessionLock();
      await blockerTransaction.catch(() => undefined);
      await Promise.all([
        blocker.$disconnect(),
        orderClient.$disconnect(),
        mutationClient.$disconnect(),
      ]);
    }
  }

  it('creates one loyalty account when first-order upserts race', async () => {
    const { customer, restaurant } =
      await createRestaurantFixture('loyalty-upsert');

    await Promise.all(
      Array.from({ length: 24 }, () =>
        prisma.$transaction((tx) =>
          ensureLoyaltyAccount(tx, customer.id, restaurant.id),
        ),
      ),
    );

    await expect(
      prisma.loyaltyAccount.count({
        where: {
          userId: customer.id,
          restaurantId: restaurant.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps an order on its open session when it wins a race with force-open', async () => {
    const { owner, restaurant, table, menuItem, session } =
      await createOrderSessionFixture('order-force-open');
    const clientOrderId = `${runPrefix}-order-force-open`;
    const { orderResult, mutationResult } = await runOrderBeforeSessionMutation(
      'force-open',
      session.id,
      {
        customerName: 'Race order',
        source: 'POS',
        items: [
          {
            menuItemId: menuItem.id,
            quantity: 1,
            expectedUnitPrice: menuItem.price,
          },
        ],
        posSubmission: {
          clientOrderId,
          restaurantId: restaurant.id,
          tableId: table.id,
          expectedTableSessionId: session.id,
        },
      },
      owner.id,
      (client) =>
        buildPaymentSessionService(client).forceOpenSession(
          table.id,
          restaurant.id,
          owner.id,
        ),
    );

    expect(orderResult.status).toBe('fulfilled');
    expect(mutationResult.status).toBe('rejected');
    if (mutationResult.status === 'rejected') {
      if (!(mutationResult.reason instanceof ConflictException)) {
        throw mutationResult.reason;
      }
    }

    const persistedOrder = await prisma.order.findUniqueOrThrow({
      where: {
        restaurantId_clientOrderId: {
          restaurantId: restaurant.id,
          clientOrderId,
        },
      },
    });
    await expect(
      prisma.tableSession.findUniqueOrThrow({
        where: { id: persistedOrder.tableSessionId! },
      }),
    ).resolves.toMatchObject({ id: session.id, status: 'OPEN' });
    await expect(
      prisma.tableSession.count({
        where: { tableId: table.id, restaurantId: restaurant.id },
      }),
    ).resolves.toBe(1);
  });

  it('creates no order items when force-open wins the session race', async () => {
    const { owner, restaurant, table, menuItem, session } =
      await createOrderSessionFixture('force-open-wins');
    const clientOrderId = `${runPrefix}-force-open-wins`;
    const { orderResult, mutationResult } = await runOrderBeforeSessionMutation(
      'force-open-wins',
      session.id,
      {
        customerName: 'Losing race order',
        source: 'POS',
        items: [
          {
            menuItemId: menuItem.id,
            quantity: 1,
            expectedUnitPrice: menuItem.price,
          },
        ],
        posSubmission: {
          clientOrderId,
          restaurantId: restaurant.id,
          tableId: table.id,
          expectedTableSessionId: session.id,
        },
      },
      owner.id,
      (client) =>
        buildPaymentSessionService(client).forceOpenSession(
          table.id,
          restaurant.id,
          owner.id,
        ),
      false,
    );

    expect(mutationResult.status).toBe('fulfilled');
    expect(orderResult.status).toBe('rejected');
    if (orderResult.status === 'rejected') {
      expect(orderResult.reason).toBeInstanceOf(ConflictException);
    }
    await expect(
      prisma.order.count({
        where: { restaurantId: restaurant.id, clientOrderId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.orderItem.count({
        where: { order: { restaurantId: restaurant.id } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ status: 'CLOSED_NO_PAYMENT' });
    await expect(
      prisma.tableSession.count({
        where: {
          tableId: table.id,
          restaurantId: restaurant.id,
          status: 'OPEN',
        },
      }),
    ).resolves.toBe(1);
  });

  it('keeps an expected-empty POS order when it creates the session before force-open', async () => {
    const { owner, restaurant, table, menuItem, session } =
      await createOrderSessionFixture('expected-empty-order');
    await prisma.tableSession.delete({ where: { id: session.id } });
    const clientOrderId = `${runPrefix}-expected-empty-order`;
    const { orderResult, mutationResult } = await runOrderBeforeSessionMutation(
      'expected-empty-order',
      table.id,
      {
        customerName: 'Expected empty race order',
        source: 'POS',
        items: [
          {
            menuItemId: menuItem.id,
            quantity: 1,
            expectedUnitPrice: menuItem.price,
          },
        ],
        posSubmission: {
          clientOrderId,
          restaurantId: restaurant.id,
          tableId: table.id,
          expectedTableSessionId: null,
        },
      },
      owner.id,
      (client) =>
        buildPaymentSessionService(client).forceOpenSession(
          table.id,
          restaurant.id,
          owner.id,
        ),
      true,
      'table',
    );

    expect(orderResult.status).toBe('fulfilled');
    expect(mutationResult.status).toBe('rejected');
    if (mutationResult.status === 'rejected') {
      expect(mutationResult.reason).toBeInstanceOf(ConflictException);
    }
    const persistedOrder = await prisma.order.findUniqueOrThrow({
      where: {
        restaurantId_clientOrderId: {
          restaurantId: restaurant.id,
          clientOrderId,
        },
      },
    });
    expect(persistedOrder.tableSessionId).not.toBeNull();
    await expect(
      prisma.tableSession.findUniqueOrThrow({
        where: { id: persistedOrder.tableSessionId! },
      }),
    ).resolves.toMatchObject({ status: 'OPEN' });
    await expect(
      prisma.tableSession.count({
        where: { tableId: table.id, restaurantId: restaurant.id },
      }),
    ).resolves.toBe(1);
  });

  it('keeps a customer order on its open session when it wins a race with close', async () => {
    const { owner, restaurant, menuItem, session } =
      await createOrderSessionFixture('order-close');
    const { orderResult, mutationResult } = await runOrderBeforeSessionMutation(
      'close-session',
      session.id,
      {
        customerName: 'Customer race order',
        sessionToken: session.token,
        items: [{ menuItemId: menuItem.id, quantity: 1 }],
      },
      null,
      (client) =>
        buildPaymentSessionService(client).closeSession(
          session.token,
          restaurant.id,
          owner.id,
        ),
    );

    expect(orderResult.status).toBe('fulfilled');
    expect(mutationResult.status).toBe('rejected');
    if (mutationResult.status === 'rejected') {
      expect(mutationResult.reason).toBeInstanceOf(ConflictException);
    }
    await expect(
      prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ status: 'OPEN' });
    await expect(
      prisma.order.count({ where: { tableSessionId: session.id } }),
    ).resolves.toBe(1);
  });

  it('settles a customer order that wins the session lock before cash close', async () => {
    const { owner, restaurant, menuItem, session } =
      await createOrderSessionFixture('order-cash-close');
    const { orderResult, mutationResult } = await runOrderBeforeSessionMutation(
      'cash-close-session',
      session.id,
      {
        customerName: 'Cash close race order',
        sessionToken: session.token,
        items: [{ menuItemId: menuItem.id, quantity: 1 }],
      },
      null,
      (client) =>
        buildPaymentSessionService(client).closeSessionWithCash(
          session.token,
          restaurant.id,
          owner.id,
        ),
    );

    expect(orderResult.status).toBe('fulfilled');
    expect(mutationResult.status).toBe('fulfilled');
    await expect(
      prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ status: 'PAID' });
    await expect(
      prisma.payment.findFirstOrThrow({
        where: { tableSessionId: session.id, provider: 'CASH' },
      }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED', amount: menuItem.price });
  });

  it('keeps a customer order on its open session when it wins a race with admin force-close', async () => {
    const { owner, restaurant, menuItem, session } =
      await createOrderSessionFixture('order-admin-close');
    const { orderResult, mutationResult } = await runOrderBeforeSessionMutation(
      'admin-close-session',
      session.id,
      {
        customerName: 'Admin close race order',
        sessionToken: session.token,
        items: [{ menuItemId: menuItem.id, quantity: 1 }],
      },
      null,
      (client) =>
        new SuperAdminService(
          client as never,
          {} as never,
          {} as never,
        ).forceCloseSession(restaurant.id, session.id, owner.id),
    );

    expect(orderResult.status).toBe('fulfilled');
    expect(mutationResult.status).toBe('rejected');
    if (mutationResult.status === 'rejected') {
      if (!(mutationResult.reason instanceof ConflictException)) {
        throw mutationResult.reason;
      }
    }
    await expect(
      prisma.tableSession.findUniqueOrThrow({ where: { id: session.id } }),
    ).resolves.toMatchObject({ status: 'OPEN' });
    await expect(
      prisma.order.count({ where: { tableSessionId: session.id } }),
    ).resolves.toBe(1);
  });

  it('never exceeds the reservation cover cap when public bookings race', async () => {
    const { restaurant, startsAt } = await createReservationFixture(
      'reservation-capacity',
    );
    const { service } = buildReservationService();

    const results = await Promise.allSettled([
      service.createPublic(restaurant.id, {
        guestName: 'Capacity One',
        guestPhone: '+359888000001',
        startsAt: startsAt.toISOString(),
        adultsCount: 3,
        idempotencyKey: 'capacity-one',
      }),
      service.createPublic(restaurant.id, {
        guestName: 'Capacity Two',
        guestPhone: '+359888000002',
        startsAt: startsAt.toISOString(),
        adultsCount: 3,
        idempotencyKey: 'capacity-two',
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const reservations = await prisma.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        startsAt,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    expect(
      reservations.reduce(
        (sum, row) => sum + row.adultsCount + row.childrenCount,
        0,
      ),
    ).toBe(3);
  });

  it('creates one reservation and one set of effects when idempotent requests race', async () => {
    const { restaurant, startsAt } = await createReservationFixture(
      'reservation-idempotency',
    );
    const { service, events, notifications } = buildReservationService();
    const request = {
      guestName: 'Idempotent Guest',
      guestPhone: '+359888000003',
      startsAt: startsAt.toISOString(),
      adultsCount: 2,
      idempotencyKey: 'same-reservation-request',
    };

    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        service.createPublic(restaurant.id, request),
      ),
    );

    expect(new Set(results.map((result) => result.referenceCode)).size).toBe(1);
    await expect(
      prisma.reservation.count({
        where: {
          restaurantId: restaurant.id,
          idempotencyKey: request.idempotencyKey,
        },
      }),
    ).resolves.toBe(1);
    expect(events.emitReservationCreated).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('allows only one capacity-increasing write when a guest move races a public booking', async () => {
    const { restaurant, startsAt } =
      await createReservationFixture('reservation-move');
    const { service } = buildReservationService();
    const originalStartsAt = new Date(startsAt.getTime() - 30 * 60_000);
    const existing = await prisma.reservation.create({
      data: {
        restaurantId: restaurant.id,
        referenceCode: 'MOVE01',
        status: ReservationStatus.CONFIRMED,
        guestName: 'Moving Guest',
        guestPhone: '+359888000004',
        startsAt: originalStartsAt,
        adultsCount: 3,
        manageToken: `move-${runPrefix}`,
      },
    });

    const results = await Promise.allSettled([
      service.modifyByManageToken(restaurant.id, existing.manageToken!, {
        startsAt: startsAt.toISOString(),
      }),
      service.createPublic(restaurant.id, {
        guestName: 'Competing Guest',
        guestPhone: '+359888000005',
        startsAt: startsAt.toISOString(),
        adultsCount: 3,
        idempotencyKey: 'competing-public-booking',
      }),
    ]);

    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const targetReservations = await prisma.reservation.findMany({
      where: {
        restaurantId: restaurant.id,
        startsAt,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });
    expect(
      targetReservations.reduce(
        (sum, row) => sum + row.adultsCount + row.childrenCount,
        0,
      ),
    ).toBe(3);
  });

  it('allows only one cancellation to reverse loyalty under concurrent requests', async () => {
    const { owner, customer, restaurant } =
      await createRestaurantFixture('cancel');
    const account = await prisma.loyaltyAccount.create({
      data: {
        userId: customer.id,
        restaurantId: restaurant.id,
        points: 20,
        lifetimePoints: 100,
      },
    });
    const order = await prisma.order.create({
      data: {
        customerName: 'Concurrency Customer',
        customerId: customer.id,
        restaurantId: restaurant.id,
        totalPrice: 25,
        status: OrderStatus.NEW,
        pointsEarned: 20,
        pointsRedeemed: 15,
        pointsRedeemedForDiscount: 10,
        pointsRedeemedForItems: 5,
      },
    });
    const earned = await prisma.loyaltyPointLedger.create({
      data: {
        loyaltyAccountId: account.id,
        orderId: order.id,
        type: LoyaltyPointTransactionType.EARN,
        points: 20,
        remainingPoints: 20,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const events = {
      emitToOrder: jest.fn(),
      emitOrderEventToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
    };
    const service = new OrdersService(
      prisma as never,
      events as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        service.updateStatus(
          order.id,
          { status: OrderStatus.CANCELED },
          owner.id,
        ),
      ),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELED });
    await expect(
      prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } }),
    ).resolves.toMatchObject({ points: 15, lifetimePoints: 80 });
    await expect(
      prisma.loyaltyPointLedger.findUniqueOrThrow({
        where: { id: earned.id },
      }),
    ).resolves.toMatchObject({ remainingPoints: 0 });

    const adjustments = await prisma.loyaltyPointLedger.findMany({
      where: {
        loyaltyAccountId: account.id,
        orderId: order.id,
        type: LoyaltyPointTransactionType.ADJUSTMENT,
      },
      orderBy: { points: 'asc' },
    });
    expect(
      adjustments.map(({ points, remainingPoints }) => ({
        points,
        remainingPoints,
      })),
    ).toEqual([
      { points: -20, remainingPoints: 0 },
      { points: 15, remainingPoints: 15 },
    ]);
  });

  it('preserves every lazy-translation JSONB fragment when languages race', async () => {
    const { restaurant } = await createRestaurantFixture('translations');
    const category = await prisma.menuCategory.create({
      data: {
        name: 'Starters',
        restaurantId: restaurant.id,
        order: 1,
        daysOfWeek: [],
      },
    });
    const item = await prisma.menuItem.create({
      data: {
        name: 'Soup',
        description: 'Hot soup',
        price: 5,
        currency: Currency.EUR,
        allergens: ['milk'],
        dietaryTags: ['vegetarian'],
        categoryId: category.id,
        order: 1,
      },
    });
    const option = await prisma.menuOption.create({
      data: {
        name: 'Size',
        type: OptionType.ADDON,
        choices: [{ name: 'Large', price: 2 }],
        menuItemId: item.id,
      },
    });

    let arrivals = 0;
    let release!: () => void;
    const bothTranslationsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const translator = {
      translateTexts: jest.fn(async (texts: string[], lang: string) => {
        arrivals += 1;
        if (arrivals === 2) release();
        await bothTranslationsReady;
        return texts.map((text) => `${text}-${lang}`);
      }),
    };
    const germanService = new MenuTranslationService(
      prisma as never,
      translator as never,
    );
    const frenchService = new MenuTranslationService(
      prisma as never,
      translator as never,
    );
    const menuSnapshot = () => [
      {
        ...category,
        translations: null,
        items: [
          {
            ...item,
            translations: null,
            options: [{ ...option, translations: null }],
          },
        ],
      },
    ];

    await Promise.all([
      germanService.applyLazyTranslations(menuSnapshot(), 'de'),
      frenchService.applyLazyTranslations(menuSnapshot(), 'fr'),
    ]);

    const [storedCategory, storedItem, storedOption] = await Promise.all([
      prisma.menuCategory.findUniqueOrThrow({ where: { id: category.id } }),
      prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } }),
      prisma.menuOption.findUniqueOrThrow({ where: { id: option.id } }),
    ]);
    expect(storedCategory.translations).toMatchObject({
      de: { name: 'Starters-de' },
      fr: { name: 'Starters-fr' },
    });
    expect(storedItem.translations).toMatchObject({
      de: {
        name: 'Soup-de',
        description: 'Hot soup-de',
        allergens: { milk: 'milk-de' },
        dietaryTags: { vegetarian: 'vegetarian-de' },
      },
      fr: {
        name: 'Soup-fr',
        description: 'Hot soup-fr',
        allergens: { milk: 'milk-fr' },
        dietaryTags: { vegetarian: 'vegetarian-fr' },
      },
    });
    expect(storedOption.translations).toMatchObject({
      de: { name: 'Size-de', choices: { Large: 'Large-de' } },
      fr: { name: 'Size-fr', choices: { Large: 'Large-fr' } },
    });
  });

  it('preserves concurrent lazy writes across every category/item/option pre-warm path', async () => {
    const previousDeepLKey = process.env.DEEPL_API_KEY;
    process.env.DEEPL_API_KEY = 'concurrency-test';

    try {
      const { owner, restaurant } = await createRestaurantFixture(
        'translation-prewarm',
      );
      const category = await prisma.menuCategory.create({
        data: {
          name: 'Starters',
          restaurantId: restaurant.id,
          order: 1,
          daysOfWeek: [],
        },
      });
      const item = await prisma.menuItem.create({
        data: {
          name: 'Soup',
          description: 'Hot soup',
          price: 5,
          currency: Currency.EUR,
          allergens: ['milk'],
          dietaryTags: ['vegetarian'],
          categoryId: category.id,
          order: 1,
        },
      });
      const option = await prisma.menuOption.create({
        data: {
          name: 'Size',
          type: OptionType.ADDON,
          choices: [{ name: 'Large', price: 2 }],
          menuItemId: item.id,
        },
      });

      const lazyTranslator = {
        translateTexts: jest.fn(async (texts: string[], lang: string) =>
          texts.map((text) => `${text}-${lang}`),
        ),
      };
      const lazyService = new MenuTranslationService(
        prisma as never,
        lazyTranslator as never,
      );
      const prewarmTranslator = {
        translateObject: jest.fn(),
      };
      const crud = new MenuCrudService(
        prisma as never,
        prewarmTranslator as never,
        lazyService,
        {
          getEffectiveTier: () => 'FREE',
          hasFeature: () => false,
          restaurantHasFeature: () => true,
        } as never,
        { delete: jest.fn() } as never,
        { emitPublicMenuItemAvailability: jest.fn() } as never,
        { getContexts: jest.fn().mockResolvedValue(new Set()) } as never,
      );

      const loadMenuSnapshot = () =>
        prisma.menuCategory.findMany({
          where: { id: category.id },
          include: { items: { include: { options: true } } },
        });

      const racePrewarmWithLazy = async (
        startPrewarm: () => Promise<unknown>,
        prewarmResult: Record<string, unknown>,
        lazyLanguage: string,
        readTranslations: () => Promise<unknown>,
      ) => {
        let releasePrewarm!: (value: Record<string, unknown>) => void;
        const prewarmBlocked = new Promise<Record<string, unknown>>(
          (resolve) => {
            releasePrewarm = resolve;
          },
        );
        prewarmTranslator.translateObject.mockReturnValueOnce(prewarmBlocked);

        await startPrewarm();
        expect(prewarmTranslator.translateObject).toHaveBeenCalled();
        await lazyService.applyLazyTranslations(
          await loadMenuSnapshot(),
          lazyLanguage,
        );
        releasePrewarm(prewarmResult);

        await waitFor(async () => {
          expect(await readTranslations()).toMatchObject({
            de: expect.any(Object),
            [lazyLanguage]: expect.any(Object),
          });
        });
      };

      await racePrewarmWithLazy(
        () =>
          crud.updateCategory(
            category.id,
            { name: 'Updated starters' },
            owner.id,
          ),
        { de: { name: 'Vorspeisen' } },
        'fr',
        async () =>
          (
            await prisma.menuCategory.findUniqueOrThrow({
              where: { id: category.id },
            })
          ).translations,
      );

      await racePrewarmWithLazy(
        () => crud.updateItem(item.id, { name: 'Updated soup' }, owner.id),
        { de: { name: 'Suppe' } },
        'es',
        async () =>
          (
            await prisma.menuItem.findUniqueOrThrow({
              where: { id: item.id },
            })
          ).translations,
      );

      await racePrewarmWithLazy(
        () =>
          crud.updateMenuOption(option.id, { name: 'Updated size' }, owner.id),
        { de: { name: 'Größe' } },
        'it',
        async () =>
          (
            await prisma.menuOption.findUniqueOrThrow({
              where: { id: option.id },
            })
          ).translations,
      );
    } finally {
      if (previousDeepLKey === undefined) {
        delete process.env.DEEPL_API_KEY;
      } else {
        process.env.DEEPL_API_KEY = previousDeepLKey;
      }
    }
  });
});
