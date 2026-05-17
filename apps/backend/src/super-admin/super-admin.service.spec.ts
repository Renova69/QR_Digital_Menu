import { Test, TestingModule } from '@nestjs/testing';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let prisma: PrismaService;

  const mockPrisma = {
    restaurant: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('getStats', () => {
    it('should return platform stats', async () => {
      mockPrisma.restaurant.count.mockResolvedValueOnce(10);
      mockPrisma.user.count.mockResolvedValueOnce(50);
      mockPrisma.restaurant.count.mockResolvedValueOnce(8);
      mockPrisma.restaurant.count.mockResolvedValueOnce(2);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { tier: 'FREE', count: BigInt(5) },
        { tier: 'STARTER', count: BigInt(3) },
        { tier: 'PROFESSIONAL', count: BigInt(1) },
        { tier: 'ENTERPRISE', count: BigInt(1) },
      ]);

      const result = await service.getStats();

      expect(result.totalRestaurants).toBe(10);
      expect(result.totalUsers).toBe(50);
      expect(result.activeSubscriptions).toBe(8);
      expect(result.suspendedCount).toBe(2);
      expect(result.byTier.FREE).toBe(5);
      expect(result.byTier.STARTER).toBe(3);
    });
  });

  describe('updateTier', () => {
    it('should set forceTier on restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({ id: '1', name: 'Test' });
      mockPrisma.restaurant.update.mockResolvedValueOnce({
        id: '1', name: 'Test', tier: 'FREE', forceTier: 'PROFESSIONAL',
      });

      const result = await service.updateTier('1', 'PROFESSIONAL');

      expect(result.forceTier).toBe('PROFESSIONAL');
    });

    it('should throw NotFoundException for missing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(null);

      await expect(service.updateTier('nonexistent', 'FREE')).rejects.toThrow();
    });
  });

  describe('updateStatus', () => {
    it('should set isActive on restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({ id: '1', name: 'Test' });
      mockPrisma.restaurant.update.mockResolvedValueOnce({
        id: '1', name: 'Test', isActive: false,
      });

      const result = await service.updateStatus('1', false);

      expect(result.isActive).toBe(false);
    });
  });
});
