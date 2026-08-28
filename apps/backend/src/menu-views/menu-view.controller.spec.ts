import { BadRequestException } from '@nestjs/common';
import { MenuViewController } from './menu-view.controller';
import { MenuViewService } from './menu-view.service';
import { RestaurantAccessContext } from '../auth/restaurant-access.policy';

describe('MenuViewController', () => {
  let controller: MenuViewController;

  const mockMenuViewService = {
    recordView: jest.fn(),
    getScanStats: jest.fn(),
  };

  beforeEach(() => {
    controller = new MenuViewController(
      mockMenuViewService as unknown as MenuViewService,
    );
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
    const access: RestaurantAccessContext = {
      restaurantId: 'rest-1',
      userId: 'user-1',
      role: 'OWNER',
      tier: 'FREE',
      forceTier: null,
    };
    beforeEach(() => {
      mockMenuViewService.getScanStats.mockResolvedValue({
        totalViews: 10,
        uniqueVisitors: 5,
      });
    });

    it('should return scan stats for owner', async () => {
      const result = await controller.getScanStats(access);

      expect(result).toEqual({ totalViews: 10, uniqueVisitors: 5 });
    });

    it('should throw BadRequestException for invalid period', async () => {
      await expect(controller.getScanStats(access, '99')).rejects.toThrow(
        BadRequestException,
      );
    });

    it.each(['1', '7', '14', '30'])(
      'should accept valid period %s',
      async (period) => {
        const result = await controller.getScanStats(access, period);
        expect(result).toBeDefined();
      },
    );

    it('should throw BadRequestException when only startDate provided', async () => {
      await expect(
        controller.getScanStats(access, undefined, '2026-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when only endDate provided', async () => {
      await expect(
        controller.getScanStats(access, undefined, undefined, '2026-01-31'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid date values', async () => {
      await expect(
        controller.getScanStats(access, undefined, 'not-a-date', '2026-01-31'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when endDate before startDate', async () => {
      await expect(
        controller.getScanStats(access, undefined, '2026-12-31', '2026-01-01'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when range exceeds 366 days', async () => {
      await expect(
        controller.getScanStats(access, undefined, '2025-01-01', '2026-12-31'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid date range up to 366 days', async () => {
      const result = await controller.getScanStats(
        access,
        undefined,
        '2026-01-01',
        '2026-12-31',
      );
      expect(result).toBeDefined();
    });

    it('should pass date range to menuViewService.getScanStats', async () => {
      await controller.getScanStats(
        access,
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
