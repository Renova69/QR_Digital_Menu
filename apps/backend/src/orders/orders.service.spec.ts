import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

describe('OrdersService — create', () => {
  let service: OrdersService;
  let prisma: any;
  let events: any;

  const mockRestaurant = {
    id: 'rest-1',
    timezone: 'UTC',
    happyHourEnable: false,
    isLoyaltyEnabled: false,
  };

  const mockMenuItems = [
    { id: 'item-1', price: 10, category: { restaurantId: 'rest-1' } },
    { id: 'item-2', price: 5, category: { restaurantId: 'rest-1' } },
  ];

  beforeEach(async () => {
    prisma = {
      menuItem: { findMany: jest.fn().mockResolvedValue(mockMenuItems) },
      menuOption: { findMany: jest.fn().mockResolvedValue([]) },
      restaurant: { findUnique: jest.fn().mockResolvedValue(mockRestaurant) },
      tableSession: { findFirst: jest.fn().mockResolvedValue(null) },
      restaurantTable: { findFirst: jest.fn().mockResolvedValue(null) },
      loyaltyAccount: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn() },
      loyaltyPointLedger: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      order: { create: jest.fn().mockImplementation((args: any) => ({ id: 'order-1', ...args.data })) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    events = {
      emitToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should reject empty items array', async () => {
    await expect(
      service.create({ items: [] } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should recalculate total from DB prices (ignore client price)', async () => {
    const result = await service.create({
      items: [
        { menuItemId: 'item-1', quantity: 2, selectedOptions: [] },
        { menuItemId: 'item-2', quantity: 1, selectedOptions: [] },
      ],
    } as any);

    // 10*2 + 5*1 = 25
    expect(result.totalPrice).toBe(25);
  });

  it('should reject items from different restaurants', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      { id: 'item-1', price: 10, category: { restaurantId: 'rest-1' } },
      { id: 'item-2', price: 5, category: { restaurantId: 'rest-2' } },
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

  it('should throw NotFoundException when menu item not in DB', async () => {
    prisma.menuItem.findMany.mockResolvedValue([mockMenuItems[0]]);

    await expect(
      service.create({
        items: [
          { menuItemId: 'item-1', quantity: 1, selectedOptions: [] },
          { menuItemId: 'item-missing', quantity: 1, selectedOptions: [] },
        ],
      } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw on invalid option choice', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      { id: 'item-1', price: 10, category: { restaurantId: 'rest-1' } },
    ]);
    prisma.menuOption.findMany.mockResolvedValue([
      {
        id: 'opt-1',
        menuItemId: 'item-1',
        choices: [
          { name: 'Large', priceModifier: 2 },
          { name: 'Medium', priceModifier: 0 },
        ],
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

  it('should add option price modifiers to computed total', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      { id: 'item-1', price: 10, category: { restaurantId: 'rest-1' } },
    ]);
    prisma.menuOption.findMany.mockResolvedValue([
      {
        id: 'opt-1',
        menuItemId: 'item-1',
        choices: [{ name: 'Large', priceModifier: 3 }],
      },
    ]);

    const result = await service.create({
      items: [
        {
          menuItemId: 'item-1',
          quantity: 2,
          selectedOptions: [{ optionId: 'opt-1', choiceName: 'Large' }],
        },
      ],
    } as any);

    // (10 + 3) * 2 = 26
    expect(result.totalPrice).toBe(26);
  });
});
