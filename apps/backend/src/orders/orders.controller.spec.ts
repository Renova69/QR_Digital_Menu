import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { OrdersController } from './orders.controller';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrderStatus } from '@prisma/client';
import { OrderQueryDto } from './dto/order-query.dto';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';

describe('OrdersController', () => {
  let controller: OrdersController;
  let service: OrdersService;

  const mockOrdersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateStatus: jest.fn(),
    bulkUpdateStatus: jest.fn(),
  };

  const mockFeatureService = {
    hasFeature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        {
          provide: OrdersService,
          useValue: mockOrdersService,
        },
        {
          provide: FeatureService,
          useValue: mockFeatureService,
        },
        {
          provide: PrismaService,
          useValue: {},
        },
        {
          provide: Reflector,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<OrdersController>(OrdersController);
    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each(['findAll', 'findOne', 'update', 'bulkUpdate'] as const)(
    'requires orders:receive for %s',
    (method) => {
      expect(
        Reflect.getMetadata(
          REQUIRE_FEATURE_KEY,
          OrdersController.prototype[method],
        ),
      ).toEqual([FeatureFlag.ORDERS_RECEIVE]);
    },
  );

  describe('create', () => {
    it('should call ordersService.create with dto and userId when authenticated', async () => {
      const dto = {
        restaurantId: 'r1',
        items: [],
        tipAmount: 0,
      } as Partial<CreateOrderDto> as CreateOrderDto;
      const req = { user: { id: 'user1' } };
      mockOrdersService.create.mockResolvedValue('order1');

      const result = await controller.create(dto, req);

      expect(mockOrdersService.create).toHaveBeenCalledWith(dto, 'user1');
      expect(result).toBe('order1');
    });

    it('should call ordersService.create with null userId when unauthenticated', async () => {
      const dto = {
        restaurantId: 'r1',
        items: [],
        tipAmount: 0,
      } as Partial<CreateOrderDto> as CreateOrderDto;
      const req = {}; // no user
      mockOrdersService.create.mockResolvedValue('order2');

      const result = await controller.create(dto, req);

      expect(mockOrdersService.create).toHaveBeenCalledWith(dto, null);
      expect(result).toBe('order2');
    });
  });

  describe('findAll', () => {
    it('should call ordersService.findAll with userId and query', async () => {
      const query: OrderQueryDto = { limit: 10 };
      const req = { user: { id: 'user1' } };
      mockOrdersService.findAll.mockResolvedValue(['order1', 'order2']);

      const result = await controller.findAll(req, query);

      expect(mockOrdersService.findAll).toHaveBeenCalledWith('user1', query);
      expect(result).toEqual(['order1', 'order2']);
    });
  });

  describe('findOne', () => {
    it('should call ordersService.findOne with id and userId', async () => {
      const req = { user: { id: 'user1' } };
      mockOrdersService.findOne.mockResolvedValue('order1');

      const result = await controller.findOne('o1', req);

      expect(mockOrdersService.findOne).toHaveBeenCalledWith('o1', 'user1');
      expect(result).toBe('order1');
    });
  });

  describe('update', () => {
    it('should call ordersService.updateStatus with id, dto, and userId', async () => {
      const dto: UpdateOrderDto = { status: OrderStatus.COMPLETED };
      const req = { user: { id: 'user1' } };
      mockOrdersService.updateStatus.mockResolvedValue('updatedOrder');

      const result = await controller.update('o1', dto, req);

      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        'o1',
        dto,
        'user1',
      );
      expect(result).toBe('updatedOrder');
    });
  });

  describe('bulkUpdate', () => {
    it('updates the selected restaurant orders through one service call', async () => {
      const dto = {
        restaurantId: 'r1',
        orderIds: ['o1', 'o2', 'o3', 'o4'],
        fromStatus: OrderStatus.NEW,
        status: OrderStatus.IN_PROGRESS,
      };
      const req = { user: { id: 'user1' } };
      const response = { updated: dto.orderIds, failed: [] };
      mockOrdersService.bulkUpdateStatus.mockResolvedValue(response);

      const result = await controller.bulkUpdate(dto, req);

      expect(mockOrdersService.bulkUpdateStatus).toHaveBeenCalledWith(
        dto,
        'user1',
      );
      expect(result).toBe(response);
    });
  });
});
