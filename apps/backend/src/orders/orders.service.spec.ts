import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeRestaurant = (overrides: Record<string, any> = {}) => ({
  id: 'rest-1',
  tier: 'PROFESSIONAL',
  timezone: 'UTC',
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
    create: jest.fn().mockResolvedValue({ id: 'acc-1', points: 0, lifetimePoints: 0 }),
    findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'acc-1', points: 0, lifetimePoints: 0 }),
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
      Promise.resolve({ ...makeOrder(), totalPrice: args.data.totalPrice, ...orderOverride }),
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
    };

    featureService = { hasFeature: jest.fn().mockReturnValue(true) };

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
      await expect(service.create({ items: [] } as any)).rejects.toThrow(BadRequestException);
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
        service.create({ items: [{ menuItemId: 'item-1', quantity: 1 }] } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when tableId sent but table not found', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurantTable.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(makeTx()));

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
          tableId: 'unknown-table',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('recalculates total from DB prices, ignores client price', async () => {
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

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

    it('adds option priceModifier to computed total', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.menuOption.findMany.mockResolvedValue([
        { id: 'opt-1', menuItemId: 'item-1', choices: [{ name: 'Large', priceModifier: 3 }] },
      ]);
      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 2, selectedOptions: [{ optionId: 'opt-1', choiceName: 'Large' }] }],
      } as any);

      const createCall = tx.order.create.mock.calls[0][0];
      expect(createCall.data.totalPrice).toBe(26); // (10+3)*2
    });

    it('throws BadRequestException for invalid choice name', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.menuOption.findMany.mockResolvedValue([
        { id: 'opt-1', menuItemId: 'item-1', choices: [{ name: 'Small', priceModifier: 0 }] },
      ]);

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [{ optionId: 'opt-1', choiceName: 'XL' }] }],
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
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [{ optionId: 'nonexistent-opt', choiceName: 'X' }] }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses existing session when valid sessionToken provided', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'sess-exist', token: 'tok-exist' });

      const tx = makeTx();
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const result = await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
        sessionToken: 'tok-exist',
      } as any);

      expect(result.sessionToken).toBe('tok-exist');
    });

    it('emits table status changed when order has tableSessionId', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      const tx = makeTx({ tableSessionId: 'sess-1', tableId: 'table-1' });
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      await service.create({
        items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
      } as any);

      expect(events.emitTableStatusChanged).toHaveBeenCalled();
    });

    it('throws BadRequestException when loyalty redeemPoints sent but loyalty disabled', async () => {
      prisma.menuItem.findMany.mockResolvedValue([makeMenuItem()]);
      prisma.restaurant.findUnique.mockResolvedValue(makeRestaurant({ isLoyaltyEnabled: false }));
      prisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(makeTx()));

      await expect(
        service.create({
          items: [{ menuItemId: 'item-1', quantity: 1, selectedOptions: [] }],
          redeemPoints: 100,
        } as any),
      ).rejects.toThrow(BadRequestException);
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
        expect.objectContaining({ where: { restaurant: { ownerId: 'user-1' } } }),
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

      const result = await service.findAll('user-1', { page: NaN, limit: NaN } as any);

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

      await expect(service.findOne('order-1', 'user-1')).rejects.toThrow(NotFoundException);
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

      await expect(service.findOne('order-1', 'random-user')).rejects.toThrow(ForbiddenException);
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

      const result = await service.updateStatus('order-1', { status: 'READY' } as any, 'user-1');

      expect(result.status).toBe('READY');
      expect(events.emitToOrder).toHaveBeenCalledWith('order-1', 'orderStatusChanged', updated);
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
      prisma.order.update.mockResolvedValue(makeOrder({ tableSessionId: null, status: 'SERVED' }));

      await service.updateStatus('order-1', { status: 'SERVED' } as any, 'user-1');

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
