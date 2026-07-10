import { Test, TestingModule } from '@nestjs/testing';
import { UsersDataService } from './users-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ForbiddenException, ConflictException } from '@nestjs/common';

type PrismaMock = {
  user: {
    findUniqueOrThrow: jest.Mock;
    delete: jest.Mock;
  };
  order: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  loyaltyAccount: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  restaurant: {
    count: jest.Mock;
  };
  feedback: {
    updateMany: jest.Mock;
  };
  deviceEnrollmentToken: {
    deleteMany: jest.Mock;
  };
  verificationToken: {
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type PlatformSettingsMock = {
  getSettings: jest.Mock;
};

describe('UsersDataService', () => {
  let service: UsersDataService;
  let prisma: PrismaMock;
  let platformSettings: PlatformSettingsMock;

  beforeEach(async () => {
    prisma = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test',
          phone: null,
          role: 'CUSTOMER',
          createdAt: new Date(),
        }),
        delete: jest.fn(),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      loyaltyAccount: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      restaurant: {
        count: jest.fn().mockResolvedValue(0),
      },
      feedback: {
        updateMany: jest.fn(),
      },
      deviceEnrollmentToken: {
        deleteMany: jest.fn(),
      },
      verificationToken: {
        deleteMany: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation((arr: Promise<unknown>[]) => Promise.all(arr)),
    };

    platformSettings = {
      getSettings: jest.fn().mockResolvedValue({
        dataExportEndpointEnabled: true,
        erasureEndpointEnabled: true,
        orderPiiRetentionYears: 1,
        dataControllerName: 'Test Corp',
        dataControllerEmail: 'privacy@test.com',
        dataControllerAddress: '123 Test St',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersDataService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlatformSettingsService, useValue: platformSettings },
      ],
    }).compile();

    service = module.get<UsersDataService>(UsersDataService);
  });

  describe('exportSelf (GDPR Art 20)', () => {
    it('throws ForbiddenException if export endpoint is disabled', async () => {
      platformSettings.getSettings.mockResolvedValueOnce({
        dataExportEndpointEnabled: false,
      });
      await expect(service.exportSelf('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns structured user data including orders and loyalty', async () => {
      const result = await service.exportSelf('user-1');
      expect(result).toHaveProperty('user');
      expect(result.user.id).toBe('user-1');
      expect(result).toHaveProperty('orders', []);
      expect(result).toHaveProperty('loyalty', []);
      expect(result).toHaveProperty('dataController');
    });

    it('includes the correct retention notice from settings', async () => {
      const result = await service.exportSelf('user-1');
      expect(result.retentionNotice).toBe(
        'Order contact data is retained for 1 year(s) for tax and legal purposes.',
      );
    });

    it('maps feedback properly when it exists', async () => {
      prisma.order.findMany.mockResolvedValueOnce([
        {
          id: 'order-1',
          restaurantId: 'rest-1',
          items: [],
          feedback: { rating: 5, comment: 'Great!' },
        },
      ]);
      const result = await service.exportSelf('user-1');
      expect(result.orders[0].feedback).toEqual({
        rating: 5,
        comment: 'Great!',
      });
    });
  });

  describe('eraseSelf (GDPR Art 17)', () => {
    it('throws ForbiddenException if erasure endpoint is disabled', async () => {
      platformSettings.getSettings.mockResolvedValueOnce({
        erasureEndpointEnabled: false,
      });
      await expect(service.eraseSelf('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ConflictException if user owns restaurants', async () => {
      prisma.restaurant.count.mockResolvedValueOnce(1);
      await expect(service.eraseSelf('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('redacts order PII and deletes the user data', async () => {
      prisma.order.findMany.mockResolvedValueOnce([{ id: 'order-1' }]);
      await service.eraseSelf('user-1');

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { customerId: 'user-1' },
        data: {
          customerName: '[REDACTED]',
          customerPhone: null,
          specialRequests: null,
          customerId: null,
        },
      });
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
    });

    it('deletes related user data like loyalty, tokens, and feedback comments', async () => {
      prisma.order.findMany.mockResolvedValueOnce([{ id: 'order-1' }]);
      await service.eraseSelf('user-1');

      expect(prisma.feedback.updateMany).toHaveBeenCalledWith({
        where: { orderId: { in: ['order-1'] } },
        data: { comment: null },
      });
      expect(prisma.loyaltyAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(prisma.deviceEnrollmentToken.deleteMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1' },
      });
      expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });
  });
});
