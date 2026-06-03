import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeRestaurant = (overrides: Record<string, any> = {}) => ({
  id: 'rest-1',
  isActive: true,
  tier: 'PROFESSIONAL',
  timezone: 'Europe/Sofia',
  happyHourEnable: false,
  happyHourStartTime: null,
  happyHourEndTime: null,
  happyHourMultiplier: 100,
  isLoyaltyEnabled: false,
  loyaltyExchangeRate: 10,
  loyaltyRedeemRate: 150,
  loyaltyPointExpiryDays: 90,
  loyaltySignupBonus: 0,
  loyaltySilverThreshold: 500,
  loyaltyGoldThreshold: 2000,
  loyaltySilverMultiplier: 120,
  loyaltyGoldMultiplier: 150,
  ...overrides,
});

const makeMenuItem = (overrides: Record<string, any> = {}) => ({
  id: 'item-1',
  name: 'Pizza',
  price: 10,
  rewardPointsPrice: null,
  category: { restaurantId: 'rest-1' },
  ...overrides,
});

const makeOrder = (overrides: Record<string, any> = {}) => ({
  id: 'order-1',
  restaurantId: 'rest-1',
  tableId: 'table-1',
  tableSessionId: 'sess-1',
  status: 'PENDING',
  totalPrice: 10,
  pointsEarned: 0,
  pointsRedeemed: 0,
  pointsRedeemedForDiscount: 0,
  pointsRedeemedForItems: 0,
  items: [],
  restaurant: { ownerId: 'user-1' },
  ...overrides,
});

// tx passed to the main $transaction in create()
const makeTx = (orderOverride: Record<string, any> = {}) => ({
  tableSession: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'sess-new', token: 'tok-new' }),
  },
  loyaltyAccount: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest
      .fn()
      .mockResolvedValue({ id: 'acc-1', points: 0, lifetimePoints: 0 }),
    findUniqueOrThrow: jest
      .fn()
      .mockResolvedValue({ id: 'acc-1', points: 0, lifetimePoints: 0 }),
    update: jest.fn().mockResolvedValue({}),
  },
  loyaltyPointLedger: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  order: {
    create: jest.fn().mockImplementation((args: any) =>
      Promise.resolve({
        ...makeOrder(),
        totalPrice: args.data.totalPrice,
        ...orderOverride,
      }),
    ),
  },
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: any;
  let events: any;
  let featureService: any;

  const twoItems = [
    makeMenuItem({ id: 'item-1', price: 10 }),
    makeMenuItem({ id: 'item-2', price: 5 }),
  ];

  beforeEach(async () => {
    prisma = {
      menuItem: { findMany: jest.fn().mockResolvedValue(twoItems) },
      menuOption: { findMany: jest.fn().mockResolvedValue([]) },
      restaurant: { findUnique: jest.fn().mockResolvedValue(makeRestaurant()) },
      tableSession: { findFirst: jest.fn().mockResolvedValue(null) },
      restaurantTable: { findFirst: jest.fn().mockResolvedValue(null) },
      loyaltyAccount: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      loyaltyPointLedger: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(makeOrder()),
      },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    events = {
      emitToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
      emitToOrder: jest.fn(),
      signOrderToken: jest.fn().mockReturnValue('order-track-token'),
    };

    featureService = {
      hasFeature: jest.fn().mockReturnValue(true),
      getEffectiveTier: jest.fn().mockImplementation((tier: string) => tier),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
        { provide: FeatureService, useValue: featureService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('rejects empty items array', async () => {
      await expect(service.create({ items: [] } as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when menu items missing from DB', async () => {
      prisma.menuItem.findMany.mockResolvedValue([twoItems[0]]);

      await expect(
        service.create({
          items: [
            { menuItemId: 'item-1', quantity: 1, selectedOptions: [] },
            { menuItemId: 'item-missing', quantity: 1, selectedOptions: [] },
          ],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects items from different restaurants', async () => {
      prisma.menuItem.findMany.mockResolvedValue([
        makeMenuItem({ id: 'item-1', category: { restaurantId: 'rest-1' } }),
        makeMenuItem({ id: 'item-2', category: { restaurantId: 'rest-2' } }),
      ]);

      await expect(
        service.create({
          items: [
            { menuItemId: 'item-1', quantity: 1, selectedOptions: [] },
            { menuItemId: 'item-2', quantity: 1, selectedOptions: [] },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when feature flag blocks ordering on plan', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      featureService.hasFeature.mockReturnValue(false);

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1 }],
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when tableId sent but table not found', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(makeTx()),
      );

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
          tableId: 'unknown-table',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('recalculates total from DB prices, ignores client price', async () => {
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      const result = await service.create({
        items: [
          { menuItemId: 'item-1', quantity: 2, selectedOptions: [] },
          { menuItemId: 'item-2', quantity: 1, selectedOptions: [] },
        ],
      } as any);

      // price computed inside tx.order.create arg; we check the call arg
      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.totalPrice).toBe(25); // 10*2 + 5*1
    });

    it('attributes the order to CUSTOMER when the caller is not restaurant staff (#4)', async () => {
      const tx = makeTx();
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'owner-1' }),
      );
      prisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'STAFF',
      }); // a logged-in customer
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create(
        {
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        } as any,
        'customer-user',
      );

      const data = tx.order.create.mock.calls[0][0].data;
      expect(data.source).toBe('CUSTOMER');
      expect(data.staffUserId).toBeUndefined();
    });

    it('attributes the order to POS for an assigned staff member (#4)', async () => {
      const tx = makeTx();
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'owner-1' }),
      );
      prisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
        role: 'WAITER',
      });
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create(
        {
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        } as any,
        'waiter-1',
      );

      const data = tx.order.create.mock.calls[0][0].data;
      expect(data.source).toBe('POS');
      expect(data.staffUserId).toBe('waiter-1');
    });

    it('adds option priceModifier to computed total', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.menuOption.findMany.mockResolvedValue([
        {
          id: 'opt-1',
          menuItemId: 'item-1',
          choices: [{ name: 'Large', priceModifier: 3 }],
        },
      ]);
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [
          {
            menuItemId: 'item-1',
            quantity: 2,
            selectedOptions: [{ optionId: 'opt-1', choiceName: 'Large' }],
          },
        ],
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.totalPrice).toBe(26); // (10+3)*2
    });

    it('throws BadRequestException for invalid choice name', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.menuOption.findMany.mockResolvedValue([
        {
          id: 'opt-1',
          menuItemId: 'item-1',
          choices: [{ name: 'Small', priceModifier: 0 }],
        },
      ]);

      await expect(
        service.create({
          items: [
            {
              menuItemId: 'item-1',
              quantity: 1,
              selectedOptions: [{ optionId: 'opt-1', choiceName: 'XL' }],
            },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid option id', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.menuOption.findMany.mockResolvedValue([
        { id: 'opt-1', menuItemId: 'item-1', choices: [] },
      ]);

      await expect(
        service.create({
          items: [
            {
              menuItemId: 'item-1',
              quantity: 1,
              selectedOptions: [
                { optionId: 'nonexistent-opt', choiceName: 'X' },
              ],
            },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses existing session when valid sessionToken provided', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.tableSession.findFirst.mockResolvedValue({
        id: 'sess-exist',
        token: 'tok-exist',
      });

      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      const result = await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        sessionToken: 'tok-exist',
      } as any);

      expect(result.sessionToken).toBe('tok-exist');
    });

    it('emits table status changed when order has tableSessionId', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-cuid-1',
        name: 'T1',
      });
      const tx = makeTx({ tableSessionId: 'sess-1', tableId: 'table-cuid-1' });
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        tableId: 'T1',
      } as any);

      expect(events.emitTableStatusChanged).toHaveBeenCalled();
    });

    it('persists the table cuid in tableId and the name in tableName (#M1)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-cuid-1',
        name: 'T1',
      });
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        tableId: 'T1',
      } as any);

      const createArgs = tx.order.create.mock.calls[0][0];
      expect(createArgs.data.tableId).toBe('table-cuid-1');
      expect(createArgs.data.tableName).toBe('T1');
    });

    it('emits table status with the table cuid, not the name (#M1)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-cuid-1',
        name: 'T1',
      });
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        tableId: 'T1',
      } as any);

      // makeOrder() returns tableSessionId 'sess-1'; the key assertion is the
      // second arg is the cuid 'table-cuid-1', never the name 'T1'.
      expect(events.emitTableStatusChanged).toHaveBeenCalledWith(
        'rest-1',
        'table-cuid-1',
        'sess-1',
      );
    });

    it('resolves tableId from the existing session on the sessionToken path (#M1)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.tableSession.findFirst.mockResolvedValue({
        id: 'sess-exist',
        token: 'tok-exist',
        tableId: 'table-cuid-9',
      });
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        tableId: 'T9',
        sessionToken: 'tok-exist',
      } as any);

      const createArgs = tx.order.create.mock.calls[0][0];
      expect(createArgs.data.tableId).toBe('table-cuid-9');
      expect(createArgs.data.tableName).toBe('T9');
    });

    it('throws BadRequestException when loyalty discount requested but loyalty disabled', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: false }),
      );
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(makeTx()),
      );

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
          usePoints: true,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when restaurant not found after item validation', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('ignores sessionToken when no matching OPEN session found and proceeds without session', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.tableSession.findFirst.mockResolvedValue(null);
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        sessionToken: 'stale-token',
      } as any);

      // The stale-token lookup ran (tableSession.findFirst was called)
      expect(prisma.tableSession.findFirst).toHaveBeenCalled();
      expect(tx.order.create).toHaveBeenCalled();
    });

    it('creates new table session when table found but no existing OPEN session', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-cuid-1',
        name: 'T1',
      });
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        tableId: 'T1',
      } as any);

      expect(tx.tableSession.create).toHaveBeenCalled();
    });

    it('reuses existing OPEN session within table session transaction', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'table-cuid-1',
        name: 'T1',
      });
      const tx = makeTx();
      tx.tableSession.findFirst.mockResolvedValue({
        id: 'sess-open',
        token: 'tok-open',
      });
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        tableId: 'T1',
      } as any);

      expect(tx.tableSession.create).not.toHaveBeenCalled();
    });

    it('executes happy hour path (normal range 00:00-23:59)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({
          happyHourEnable: true,
          happyHourStartTime: '00:00',
          happyHourEndTime: '23:59',
          happyHourMultiplier: 2,
          isLoyaltyEnabled: true,
        }),
      );
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        customerId: 'cust-1',
      } as any);

      expect(tx.order.create).toHaveBeenCalled();
    });

    it('executes overnight happy hour branch (e.g. 22:00–02:00)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({
          happyHourEnable: true,
          happyHourStartTime: '22:00',
          happyHourEndTime: '02:00',
          happyHourMultiplier: 1.5,
          isLoyaltyEnabled: false,
        }),
      );
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
      } as any);

      expect(tx.order.create).toHaveBeenCalled();
    });

    // Overnight happy hour belongs to the START day (#L4). 2026-01-10 is a
    // Saturday; 01:00 falls inside a Fri→Sat 22:00–02:00 window, which is the
    // FRIDAY happy hour, not Saturday. Timezone UTC avoids DST ambiguity.
    describe('overnight happy-hour weekday attribution (#L4)', () => {
      afterEach(() => jest.useRealTimers());

      const runAt = async (activeDays: number[]) => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-01-10T01:00:00Z')); // Sat 01:00 UTC
        prisma.menuItem.findMany.mockResolvedValue([
          makeMenuItem({ price: 10 }),
        ]);
        prisma.restaurant.findUnique.mockResolvedValue(
          makeRestaurant({
            timezone: 'UTC',
            happyHourEnable: true,
            happyHourStartTime: '22:00',
            happyHourEndTime: '02:00',
            happyHourMultiplier: 1.5,
            happyHourDays: activeDays,
            isLoyaltyEnabled: true,
            loyaltyExchangeRate: 10,
          }),
        );
        const tx = makeTx();
        prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
          fn(tx),
        );
        await service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
          customerId: 'cust-1',
        } as any);
        return tx;
      };

      it('applies the multiplier when Friday is active (start day)', async () => {
        const tx = await runAt([5]); // Friday
        // base = 10 * 10 = 100, ×1.5 = 150 points
        expect(tx.loyaltyAccount.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ points: { increment: 150 } }),
          }),
        );
      });

      it('does NOT apply the multiplier when only Saturday is active (current day)', async () => {
        const tx = await runAt([6]); // Saturday only — must NOT match a Friday window
        // no multiplier → base 100 points
        expect(tx.loyaltyAccount.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ points: { increment: 100 } }),
          }),
        );
      });
    });

    it('zeroes price for items in redeemItemIds when rewardPointsPrice set', async () => {
      prisma.menuItem.findMany.mockResolvedValue([
        makeMenuItem({ rewardPointsPrice: 100 }),
      ]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      tx.loyaltyAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyPointLedger.findMany.mockResolvedValue([
        { id: 'batch-1', remainingPoints: 100 },
      ]);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        customerId: 'cust-1',
        redeemItemIds: ['item-1'],
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.pointsRedeemedForItems).toBe(100);
      expect(createCall.data.totalPrice).toBe(0);
    });

    it('redeemCartIds comps the exact cart line specified, not just the first matching menuItemId', async () => {
      // Two lines for the same burger: cheap options ($2 total) and expensive options ($8 total).
      // User redeems only the expensive line (cartId 'cart-b').
      // Verify: expensive line is zeroed, cheap line is charged at full price.
      const burger = makeMenuItem({
        id: 'burger',
        price: 10,
        rewardPointsPrice: 50,
      });
      prisma.menuItem.findMany.mockResolvedValue([burger]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      tx.loyaltyAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyPointLedger.findMany.mockResolvedValue([
        { id: 'batch-1', remainingPoints: 500 },
      ]);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [
          {
            menuItemId: 'burger',
            cartId: 'cart-a',
            quantity: 1,
            selectedOptions: [],
          }, // cheap — NOT redeemed
          {
            menuItemId: 'burger',
            cartId: 'cart-b',
            quantity: 1,
            selectedOptions: [],
          }, // expensive — redeemed
        ],
        customerId: 'cust-1',
        redeemCartIds: ['cart-b'], // redeem only the second line
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      // Points cost = rewardPointsPrice (50) × quantity (1) for the one redeemed line.
      expect(createCall.data.pointsRedeemedForItems).toBe(50);
      // Total: cheap line at full price (10) + expensive line zeroed (0) = 10.
      expect(createCall.data.totalPrice).toBe(10);
    });

    it('redeemCartIds: redeeming both duplicate lines charges points twice and zeroes both', async () => {
      const burger = makeMenuItem({
        id: 'burger',
        price: 10,
        rewardPointsPrice: 50,
      });
      prisma.menuItem.findMany.mockResolvedValue([burger]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      tx.loyaltyAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyPointLedger.findMany.mockResolvedValue([
        { id: 'batch-1', remainingPoints: 500 },
      ]);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [
          {
            menuItemId: 'burger',
            cartId: 'cart-a',
            quantity: 1,
            selectedOptions: [],
          },
          {
            menuItemId: 'burger',
            cartId: 'cart-b',
            quantity: 1,
            selectedOptions: [],
          },
        ],
        customerId: 'cust-1',
        redeemCartIds: ['cart-a', 'cart-b'],
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.pointsRedeemedForItems).toBe(100); // 50 × 2
      expect(createCall.data.totalPrice).toBe(0);
    });

    it('falls back to count-based matching when redeemCartIds is absent (legacy redeemItemIds)', async () => {
      const burger = makeMenuItem({
        id: 'burger',
        price: 10,
        rewardPointsPrice: 50,
      });
      prisma.menuItem.findMany.mockResolvedValue([burger]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      tx.loyaltyAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'acc-1',
        points: 500,
        lifetimePoints: 500,
      });
      tx.loyaltyPointLedger.findMany.mockResolvedValue([
        { id: 'batch-1', remainingPoints: 500 },
      ]);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [
          { menuItemId: 'burger', quantity: 1, selectedOptions: [] },
          { menuItemId: 'burger', quantity: 1, selectedOptions: [] },
        ],
        customerId: 'cust-1',
        redeemItemIds: ['burger'], // one redemption of burger — only first line comped
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.pointsRedeemedForItems).toBe(50); // one line only
      expect(createCall.data.totalPrice).toBe(10); // second line at full price
    });

    it('creates new loyalty account and awards points on first order', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      // Default: loyaltyAccount.findUnique returns null → account created
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        customerId: 'cust-1',
      } as any);

      expect(tx.loyaltyAccount.create).toHaveBeenCalled();
      expect(tx.loyaltyAccount.update).toHaveBeenCalled();
    });

    it('reuses existing loyalty account (skips create) and still awards points', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      const existingAcc = {
        id: 'acc-existing',
        points: 200,
        lifetimePoints: 500,
      };
      tx.loyaltyAccount.findUnique.mockResolvedValue(existingAcc);
      tx.loyaltyAccount.findUniqueOrThrow.mockResolvedValue(existingAcc);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        customerId: 'cust-1',
      } as any);

      expect(tx.loyaltyAccount.create).not.toHaveBeenCalled();
      expect(tx.loyaltyAccount.update).toHaveBeenCalled();
    });

    it('awards signup bonus on first order (lifetimePoints === 0)', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({
          isLoyaltyEnabled: true,
          loyaltySignupBonus: 50,
        }),
      );
      const tx = makeTx();
      // Default account has lifetimePoints: 0
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        customerId: 'cust-1',
      } as any);

      // Both EARN and SIGNUP batches created (purchasePoints > 0 and signupBonus > 0)
      expect(tx.loyaltyPointLedger.create).toHaveBeenCalledTimes(2);
    });

    it('calculates loyalty discount from DB points and ignores legacy redeemPoints input', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ isLoyaltyEnabled: true }),
      );
      const tx = makeTx();
      tx.loyaltyAccount.findUnique.mockResolvedValue({
        id: 'acc-1',
        points: 5,
        lifetimePoints: 100,
      });
      tx.loyaltyAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'acc-1',
        points: 5,
        lifetimePoints: 100,
      });
      tx.loyaltyPointLedger.findMany.mockResolvedValue([
        { id: 'batch-1', remainingPoints: 5 },
      ]);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(tx),
      );

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        customerId: 'cust-1',
        usePoints: true,
        redeemPoints: 10000,
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.pointsRedeemedForDiscount).toBe(5);
      expect(createCall.data.totalPrice).toBeCloseTo(10 - 5 / 150);
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('filters by ownerId when user has no restaurantId', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      prisma.order.findMany.mockResolvedValue([makeOrder()]);
      prisma.order.count.mockResolvedValue(1);

      const result = await service.findAll('user-1', { page: 1, limit: 10 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurant: { ownerId: 'user-1' } },
        }),
      );
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('filters by restaurantId when user is staff', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      await service.findAll('staff-1', { page: 1, limit: 10 });

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: 'rest-1' } }),
      );
    });

    it('uses default page=1 and limit=50 for NaN pagination', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(0);

      const result = await service.findAll('user-1', {
        page: NaN,
        limit: NaN,
      });

      expect(result.page).toBe(1);
    });

    it('returns correct totalPages', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      prisma.order.findMany.mockResolvedValue([]);
      prisma.order.count.mockResolvedValue(25);

      const result = await service.findAll('user-1', { page: 1, limit: 10 });

      expect(result.totalPages).toBe(3);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      await expect(service.findOne('order-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns order for restaurant owner', async () => {
      const order = makeOrder({ restaurant: { ownerId: 'user-1' } });
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      const result = await service.findOne('order-1', 'user-1');
      expect(result).toBe(order);
    });

    it('returns order for staff assigned to the restaurant', async () => {
      const order = makeOrder({ restaurant: { ownerId: 'owner-1' } });
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });

      const result = await service.findOne('order-1', 'staff-1');
      expect(result).toBe(order);
    });

    it('throws ForbiddenException for unrelated user', async () => {
      const order = makeOrder({ restaurant: { ownerId: 'owner-1' } });
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'other-rest' });

      await expect(service.findOne('order-1', 'random-user')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('updates order status and emits events', async () => {
      const order = makeOrder();
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      const updated = makeOrder({ status: 'READY' });
      prisma.order.update.mockResolvedValue(updated);

      const result = await service.updateStatus(
        'order-1',
        { status: 'READY' } as any,
        'user-1',
      );

      expect(result.status).toBe('READY');
      expect(events.emitToOrder).toHaveBeenCalledWith(
        'order-1',
        'orderStatusChanged',
        updated,
      );
      expect(events.emitToRestaurant).toHaveBeenCalledWith(
        updated.restaurantId,
        'orderStatusChanged',
        updated,
      );
      expect(events.emitTableStatusChanged).toHaveBeenCalled();
    });

    it('does not emit table status when no tableSessionId', async () => {
      const order = makeOrder({ tableSessionId: null });
      prisma.order.findUnique.mockResolvedValue(order);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      prisma.order.update.mockResolvedValue(
        makeOrder({ tableSessionId: null, status: 'SERVED' }),
      );

      await service.updateStatus(
        'order-1',
        { status: 'SERVED' } as any,
        'user-1',
      );

      expect(events.emitTableStatusChanged).not.toHaveBeenCalled();
    });

    it('propagates NotFoundException from findOne', async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      await expect(
        service.updateStatus('order-1', { status: 'READY' } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
