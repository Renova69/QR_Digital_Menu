import { Test, TestingModule } from '@nestjs/testing';
import { TranslationUsageService } from './translation-usage.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  $executeRaw: jest.fn(),
  translationUsage: {
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
};

describe('TranslationUsageService', () => {
  let service: TranslationUsageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationUsageService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<TranslationUsageService>(TranslationUsageService);
  });

  describe('countCodePoints', () => {
    it('counts plain ASCII text the same as .length', () => {
      expect(service.countCodePoints(['Hello'])).toBe(5);
    });

    it('counts Cyrillic text correctly (BMP characters)', () => {
      expect(service.countCodePoints(['Мезета'])).toBe(6);
    });

    it('counts an astral-plane emoji as 1 code point, not 2 UTF-16 units', () => {
      // '🎉'.length === 2 in JS (surrogate pair); code points should be 1.
      expect(service.countCodePoints(['🎉'])).toBe(1);
      expect('🎉'.length).toBe(2); // sanity check the premise
    });

    it('sums across multiple texts', () => {
      expect(service.countCodePoints(['Hi', 'Bye'])).toBe(5);
    });

    it('returns 0 for an empty array', () => {
      expect(service.countCodePoints([])).toBe(0);
    });
  });

  describe('record', () => {
    it('issues an INSERT ... ON CONFLICT upsert with the given params', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);
      await service.record({
        restaurantId: 'rest-1',
        provider: 'deepl',
        sourceLang: 'bg',
        targetLang: 'en',
        charCount: 42,
      });
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('skips recording when charCount is 0 (glossary-served batch)', async () => {
      await service.record({
        restaurantId: 'rest-1',
        provider: 'deepl',
        sourceLang: 'bg',
        targetLang: 'en',
        charCount: 0,
      });
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('swallows a DB failure rather than throwing (never fails the translation call)', async () => {
      mockPrisma.$executeRaw.mockRejectedValue(new Error('DB down'));
      await expect(
        service.record({
          restaurantId: 'rest-1',
          provider: 'deepl',
          sourceLang: 'bg',
          targetLang: 'en',
          charCount: 10,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('getRestaurantUsage', () => {
    it('sums charCount across all provider/language rows for the month', async () => {
      mockPrisma.translationUsage.findMany.mockResolvedValue([
        { charCount: 100 },
        { charCount: 50 },
      ]);
      const total = await service.getRestaurantUsage('rest-1', '2026-07');
      expect(total).toBe(150);
    });

    it('returns 0 when there are no usage rows', async () => {
      mockPrisma.translationUsage.findMany.mockResolvedValue([]);
      expect(await service.getRestaurantUsage('rest-1', '2026-07')).toBe(0);
    });
  });

  describe('getPlatformUsage', () => {
    it('returns the aggregated sum across all restaurants for the month', async () => {
      mockPrisma.translationUsage.aggregate.mockResolvedValue({
        _sum: { charCount: 12345 },
      });
      expect(await service.getPlatformUsage('2026-07')).toBe(12345);
    });

    it('returns 0 when the aggregate sum is null (no usage yet)', async () => {
      mockPrisma.translationUsage.aggregate.mockResolvedValue({
        _sum: { charCount: null },
      });
      expect(await service.getPlatformUsage('2026-07')).toBe(0);
    });
  });
});
