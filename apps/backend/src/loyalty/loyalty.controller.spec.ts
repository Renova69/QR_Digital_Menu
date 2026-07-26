import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { FeatureService } from '../subscription/feature.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyHistoryQueryDto } from './dto/loyalty-history-query.dto';

describe('LoyaltyController', () => {
  let controller: LoyaltyController;
  let service: LoyaltyService;

  const mockLoyaltyService = {
    getLoyaltyAccounts: jest.fn(),
    getHistory: jest.fn(),
    getAnalytics: jest.fn(),
    getExpiryReminderCandidates: jest.fn(),
    notifyExpiryReminders: jest.fn(),
    getPublicConfig: jest.fn(),
    enroll: jest.fn(),
    getPoints: jest.fn(),
  };

  const mockFeatureService = {
    hasFeature: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoyaltyController],
      providers: [
        { provide: LoyaltyService, useValue: mockLoyaltyService },
        { provide: FeatureService, useValue: mockFeatureService },
        { provide: Reflector, useValue: { get: jest.fn() } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<LoyaltyController>(LoyaltyController);
    service = module.get<LoyaltyService>(LoyaltyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLoyaltyAccounts', () => {
    it('should call loyaltyService.getLoyaltyAccounts with userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockLoyaltyService.getLoyaltyAccounts.mockResolvedValue([]);

      const result = await controller.getLoyaltyAccounts(req);

      expect(mockLoyaltyService.getLoyaltyAccounts).toHaveBeenCalledWith(
        'user-1',
      );
      expect(result).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('should call loyaltyService.getHistory with userId and query', async () => {
      const req = { user: { id: 'user-1' } };
      const query: LoyaltyHistoryQueryDto = { limit: 10 };
      mockLoyaltyService.getHistory.mockResolvedValue({
        data: [],
        cursor: null,
      });

      const result = await controller.getHistory(req, query);

      expect(mockLoyaltyService.getHistory).toHaveBeenCalledWith(
        'user-1',
        query,
      );
      expect(result).toEqual({ data: [], cursor: null });
    });
  });

  describe('getAnalytics', () => {
    it('should call loyaltyService.getAnalytics with restaurantId and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockLoyaltyService.getAnalytics.mockResolvedValue({ totalPoints: 500 });

      const result = await controller.getAnalytics('rest-1', req);

      expect(mockLoyaltyService.getAnalytics).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ totalPoints: 500 });
    });
  });

  describe('getExpiryReminders', () => {
    it('should call loyaltyService.getExpiryReminderCandidates with restaurantId and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockLoyaltyService.getExpiryReminderCandidates.mockResolvedValue([]);

      const result = await controller.getExpiryReminders('rest-1', req);

      expect(
        mockLoyaltyService.getExpiryReminderCandidates,
      ).toHaveBeenCalledWith('rest-1', 'user-1');
      expect(result).toEqual([]);
    });
  });

  describe('notifyExpiryReminders', () => {
    it('should call loyaltyService.notifyExpiryReminders with restaurantId and userId', async () => {
      const req = { user: { id: 'user-1' } };
      mockLoyaltyService.notifyExpiryReminders.mockResolvedValue({ sent: 3 });

      const result = await controller.notifyExpiryReminders('rest-1', req);

      expect(mockLoyaltyService.notifyExpiryReminders).toHaveBeenCalledWith(
        'rest-1',
        'user-1',
      );
      expect(result).toEqual({ sent: 3 });
    });
  });

  describe('getPublicConfig', () => {
    it('should call loyaltyService.getPublicConfig with restaurantId', async () => {
      mockLoyaltyService.getPublicConfig.mockResolvedValue({
        enabled: true,
        exchangeRate: 10,
      });

      const result = await controller.getPublicConfig('rest-1');

      expect(mockLoyaltyService.getPublicConfig).toHaveBeenCalledWith('rest-1');
      expect(result).toEqual({ enabled: true, exchangeRate: 10 });
    });
  });

  describe('enroll', () => {
    it('should call loyaltyService.enroll with userId and restaurantId', async () => {
      const req = { user: { id: 'user-1' } };
      mockLoyaltyService.enroll.mockResolvedValue({ id: 'acc-1' });

      const result = await controller.enroll('rest-1', req);

      expect(mockLoyaltyService.enroll).toHaveBeenCalledWith(
        'user-1',
        'rest-1',
      );
      expect(result).toEqual({ id: 'acc-1' });
    });
  });

  describe('getPoints', () => {
    it('should call loyaltyService.getPoints with userId and restaurantId', async () => {
      const req = { user: { id: 'user-1' } };
      mockLoyaltyService.getPoints.mockResolvedValue({ points: 250 });

      const result = await controller.getPoints('rest-1', req);

      expect(mockLoyaltyService.getPoints).toHaveBeenCalledWith(
        'user-1',
        'rest-1',
      );
      expect(result).toEqual({ points: 250 });
    });
  });
});
