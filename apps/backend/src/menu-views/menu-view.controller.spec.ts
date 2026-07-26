import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MenuViewController } from './menu-view.controller';
import { MenuViewService } from './menu-view.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MenuViewController', () => {
  let controller: MenuViewController;

  const mockMenuViewService = {
    recordView: jest.fn(),
    getScanStats: jest.fn(),
  };

  const mockPrisma = {
    restaurant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MenuViewController],
      providers: [
        { provide: MenuViewService, useValue: mockMenuViewService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<MenuViewController>(MenuViewController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('recordView', () => {
    it('should call menuViewService.recordView with restaurantId and body', async () => {
      const body = { table: '5', visitorId: 'visitor-123' };
      mockMenuViewService.recordView.mockResolvedValue(undefined);

      await controller.recordView('rest-1', body);

      expect(mockMenuViewService.recordView).toHaveBeenCalledWith('rest-1', {
        table: '5',
        visitorId: 'visitor-123',
      });
    });

    it('should handle empty body', async () => {
      mockMenuViewService.recordView.mockResolvedValue(undefined);

      await controller.recordView('rest-1', {});

      expect(mockMenuViewService.recordView).toHaveBeenCalledWith('rest-1', {
        table: undefined,
        visitorId: undefined,
      });
    });
  });

  describe('getScanStats', () => {
    const ownerReq = { user: { id: 'user-1' } };
    const staffReq = { user: { id: 'staff-1', sub: 'staff-1' } };

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'user-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
        role: 'OWNER',
      });
      mockMenuViewService.getScanStats.mockResolvedValue({
        totalViews: 10,
        uniqueVisitors: 5,
      });
    });

    it('should return scan stats for owner', async () => {
      const result = await controller.getScanStats('rest-1', ownerReq);

      expect(result).toEqual({ totalViews: 10, uniqueVisitors: 5 });
    });

    it('should return scan stats for staff user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
        role: 'STAFF',
      });

      const result = await controller.getScanStats('rest-1', staffReq);

      expect(result).toEqual({ totalViews: 10, uniqueVisitors: 5 });
    });

    it('should use req.user.sub when id is missing', async () => {
      const subReq = { user: { sub: 'user-sub-1' } };
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'user-sub-1',
      });

      await controller.getScanStats('rest-1', subReq);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-sub-1' },
        select: expect.any(Object),
      });
    });

    it('should throw BadRequestException for invalid period', async () => {
      await expect(
        controller.getScanStats('rest-1', ownerReq, '99'),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['1', '7', '14', '30'])(
      'should accept valid period %s',
      async (period) => {
        const result = await controller.getScanStats(
          'rest-1',
          ownerReq,
          period,
        );
        expect(result).toBeDefined();
      },
    );

    it('should throw BadRequestException when only startDate provided', async () => {
      await expect(
        controller.getScanStats('rest-1', ownerReq, undefined, '2026-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when only endDate provided', async () => {
      await expect(
        controller.getScanStats(
          'rest-1',
          ownerReq,
          undefined,
          undefined,
          '2026-01-31',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid date values', async () => {
      await expect(
        controller.getScanStats(
          'rest-1',
          ownerReq,
          undefined,
          'not-a-date',
          '2026-01-31',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when endDate before startDate', async () => {
      await expect(
        controller.getScanStats(
          'rest-1',
          ownerReq,
          undefined,
          '2026-12-31',
          '2026-01-01',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when range exceeds 366 days', async () => {
      await expect(
        controller.getScanStats(
          'rest-1',
          ownerReq,
          undefined,
          '2025-01-01',
          '2026-12-31',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid date range up to 366 days', async () => {
      const result = await controller.getScanStats(
        'rest-1',
        ownerReq,
        undefined,
        '2026-01-01',
        '2026-12-31',
      );
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when restaurant does not exist', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(
        controller.getScanStats('nonexistent', ownerReq),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for unauthorized user', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ownerId: 'other-user',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest-2',
        role: 'OWNER',
      });

      await expect(controller.getScanStats('rest-1', ownerReq)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should pass date range to menuViewService.getScanStats', async () => {
      await controller.getScanStats(
        'rest-1',
        ownerReq,
        undefined,
        '2026-06-01',
        '2026-06-30',
      );

      expect(mockMenuViewService.getScanStats).toHaveBeenCalledWith('rest-1', {
        period: 7,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
    });
  });
});
