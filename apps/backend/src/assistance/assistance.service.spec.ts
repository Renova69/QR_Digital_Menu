import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AssistanceService } from './assistance.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';

const mockPrisma = {
  assistanceRequest: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
  },
  restaurantTable: {
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockEvents = {
  emitToRestaurant: jest.fn(),
};

const mockFeatureService = {
  hasFeature: jest.fn().mockReturnValue(true),
  getEffectiveTier: jest.fn().mockImplementation((tier: string) => tier),
  restaurantHasFeature: jest.fn(function (this: any, r: any, f: any) {
    return this.hasFeature(
      this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
      f,
    );
  }),
};

describe('AssistanceService', () => {
  let service: AssistanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistanceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsGateway, useValue: mockEvents },
        { provide: FeatureService, useValue: mockFeatureService },
      ],
    }).compile();

    service = module.get<AssistanceService>(AssistanceService);
    jest.clearAllMocks();
    mockFeatureService.hasFeature.mockReturnValue(true);
  });

  describe('create', () => {
    const dto = { tableId: 't-1', restaurantId: 'rest-1' };
    const req = { id: 'req-1', tableId: 't-1', restaurantId: 'rest-1' };

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        tier: 'PROFESSIONAL',
      });
      mockPrisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'tbl-1',
        name: 't-1',
      });
      mockPrisma.assistanceRequest.count.mockResolvedValue(0);
      mockPrisma.assistanceRequest.findFirst.mockResolvedValue(null);
      mockPrisma.assistanceRequest.create.mockResolvedValue(req);
    });

    it('creates a request and emits socket event', async () => {
      const result = await service.create(dto);

      expect(result).toEqual(req);
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'newAssistanceRequest',
        req,
      );
    });

    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when ORDERS_CALL_WAITER feature is locked', async () => {
      mockFeatureService.hasFeature.mockReturnValue(false);

      await expect(service.create(dto)).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when table not found (Issue 4)', async () => {
      mockPrisma.restaurantTable.findFirst.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when a recent same-type request exists (Issue 54)', async () => {
      mockPrisma.assistanceRequest.findFirst.mockResolvedValue({ id: 'dup' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('scopes the dedupe query to the request type and a recent time window', async () => {
      await service.create({ ...dto, type: 'URGENT' });

      expect(mockPrisma.assistanceRequest.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tableId: 't-1',
            restaurantId: 'rest-1',
            isResolved: false,
            type: 'URGENT',
            createdAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('allows URGENT escalation while a STANDARD request is pending (Bug 3)', async () => {
      // findFirst is scoped to the requested type, so an URGENT create never matches
      // a pending STANDARD request and is therefore allowed through.
      mockPrisma.assistanceRequest.findFirst.mockResolvedValue(null);

      const result = await service.create({ ...dto, type: 'URGENT' });

      expect(result).toEqual(req);
      expect(mockPrisma.assistanceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'URGENT' }),
        }),
      );
    });

    it('creates a cash payment request type for waiter collection', async () => {
      await service.create({ ...dto, type: 'CASH_PAYMENT' });

      expect(mockPrisma.assistanceRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CASH_PAYMENT' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.assistanceRequest.findMany.mockResolvedValue([
        { id: 'req-1' },
      ]);
      mockPrisma.assistanceRequest.count.mockResolvedValue(1);
    });

    it('filters by restaurantId when user is staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });

      const result = await service.findAll('user-1', { page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.assistanceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: 'rest-1' } }),
      );
    });

    it('filters by ownerId when user is owner (no restaurantId)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      await service.findAll('owner-1', { page: 1, limit: 10 });

      expect(mockPrisma.assistanceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurant: { ownerId: 'owner-1' } },
        }),
      );
    });

    it('scopes an owner request to the explicitly selected restaurant', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      await service.findAll('owner-1', {
        restaurantId: 'rest-2',
        isResolved: false,
        page: 1,
        limit: 10,
      });

      expect(mockPrisma.assistanceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            restaurantId: 'rest-2',
            restaurant: { ownerId: 'owner-1' },
            isResolved: false,
          },
        }),
      );
    });

    it('rejects staff access to a different restaurant', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });

      await expect(
        service.findAll('user-1', {
          restaurantId: 'rest-2',
          page: 1,
          limit: 10,
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.assistanceRequest.findMany).not.toHaveBeenCalled();
    });

    it('returns paginated result with correct shape', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });

      const result = await service.findAll('user-1', { page: 2, limit: 5 });

      expect(result).toHaveProperty('page', 2);
      expect(result).toHaveProperty('totalPages');
      expect(result).toHaveProperty('total', 1);
    });

    it('defaults page=1 and limit=50 when pagination values are not finite', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
      mockPrisma.assistanceRequest.findMany.mockResolvedValue([]);
      mockPrisma.assistanceRequest.count.mockResolvedValue(0);

      const result = await service.findAll('user-1', {
        page: NaN,
        limit: NaN,
      });

      expect(result.page).toBe(1);
      expect(mockPrisma.assistanceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when request not found', async () => {
      mockPrisma.assistanceRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-id', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no access', async () => {
      mockPrisma.assistanceRequest.findUnique.mockResolvedValue({
        id: 'req-1',
        restaurantId: 'rest-1',
        restaurant: { ownerId: 'other-owner' },
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest-other',
      });

      await expect(service.findOne('req-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns request when user is owner', async () => {
      const req = {
        id: 'req-1',
        restaurantId: 'rest-1',
        restaurant: { ownerId: 'owner-1' },
      };
      mockPrisma.assistanceRequest.findUnique.mockResolvedValue(req);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      const result = await service.findOne('req-1', 'owner-1');

      expect(result).toEqual(req);
    });

    it('returns request when user is assigned staff', async () => {
      const req = {
        id: 'req-1',
        restaurantId: 'rest-1',
        restaurant: { ownerId: 'different-owner' },
      };
      mockPrisma.assistanceRequest.findUnique.mockResolvedValue(req);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });

      const result = await service.findOne('req-1', 'staff-1');

      expect(result).toEqual(req);
    });
  });

  describe('update', () => {
    it('updates request and emits socket event', async () => {
      const req = {
        id: 'req-1',
        restaurantId: 'rest-1',
        restaurant: { ownerId: 'owner-1' },
      };
      const updated = { ...req, isResolved: true };
      mockPrisma.assistanceRequest.findUnique.mockResolvedValue(req);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      mockPrisma.assistanceRequest.update.mockResolvedValue(updated);

      const result = await service.update(
        'req-1',
        { isResolved: true },
        'owner-1',
      );

      expect(result.isResolved).toBe(true);
      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'assistanceStatusChanged',
        updated,
      );
    });
  });

  describe('remove', () => {
    it('deletes request after verifying access', async () => {
      const req = {
        id: 'req-1',
        restaurantId: 'rest-1',
        restaurant: { ownerId: 'owner-1' },
      };
      mockPrisma.assistanceRequest.findUnique.mockResolvedValue(req);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      mockPrisma.assistanceRequest.delete.mockResolvedValue(req);

      await service.remove('req-1', 'owner-1');

      expect(mockPrisma.assistanceRequest.delete).toHaveBeenCalledWith({
        where: { id: 'req-1' },
      });
    });
  });
});
