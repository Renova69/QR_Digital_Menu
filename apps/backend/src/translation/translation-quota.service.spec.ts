import { Test, TestingModule } from '@nestjs/testing';
import { TranslationQuotaService } from './translation-quota.service';
import { TranslationUsageService } from './translation-usage.service';

const mockUsage = {
  getRestaurantUsage: jest.fn(),
  getPlatformUsage: jest.fn(),
};

describe('TranslationQuotaService', () => {
  let service: TranslationQuotaService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.TRANSLATION_PLATFORM_MONTHLY_CAP;
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationQuotaService,
        { provide: TranslationUsageService, useValue: mockUsage },
      ],
    }).compile();
    service = module.get<TranslationQuotaService>(TranslationQuotaService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getPolicy', () => {
    it('returns FREE policy with a zero cap (FREE never has LANGUAGES_MULTI)', () => {
      expect(service.getPolicy('FREE')).toEqual({
        monthlyCharCap: 0,
        maxTargetLanguages: 0,
      });
    });

    it('returns increasing caps for STARTER < PROFESSIONAL < ENTERPRISE', () => {
      const starter = service.getPolicy('STARTER');
      const pro = service.getPolicy('PROFESSIONAL');
      const enterprise = service.getPolicy('ENTERPRISE');
      expect(starter.monthlyCharCap).toBeLessThan(pro.monthlyCharCap);
      expect(pro.monthlyCharCap).toBeLessThan(enterprise.monthlyCharCap);
      expect(starter.maxTargetLanguages).toBeLessThan(pro.maxTargetLanguages);
      expect(pro.maxTargetLanguages).toBeLessThan(
        enterprise.maxTargetLanguages,
      );
    });

    it('falls back to FREE policy for an unknown tier', () => {
      expect(service.getPolicy('NOT_A_TIER')).toEqual(
        service.getPolicy('FREE'),
      );
    });

    it('applies a per-restaurant override when provided', () => {
      const policy = service.getPolicy('STARTER', 999_999);
      expect(policy.monthlyCharCap).toBe(999_999);
      // maxTargetLanguages is untouched by the char-cap override
      expect(policy.maxTargetLanguages).toBe(
        service.getPolicy('STARTER').maxTargetLanguages,
      );
    });

    it('ignores a null override and uses the tier default', () => {
      expect(service.getPolicy('STARTER', null)).toEqual(
        service.getPolicy('STARTER'),
      );
    });
  });

  describe('assertCanSpend', () => {
    const restaurant = { id: 'rest-1', tier: 'PROFESSIONAL' };

    it('allows a spend well within both platform and tenant caps', async () => {
      mockUsage.getPlatformUsage.mockResolvedValue(1000);
      mockUsage.getRestaurantUsage.mockResolvedValue(1000);

      const result = await service.assertCanSpend(restaurant, 500);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('blocks when the PLATFORM cap would be exceeded, even if the tenant has room', async () => {
      mockUsage.getPlatformUsage.mockResolvedValue(449_900);
      mockUsage.getRestaurantUsage.mockResolvedValue(0);

      const result = await service.assertCanSpend(restaurant, 500);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('platform_quota_exceeded');
    });

    it('blocks when the RESTAURANT cap would be exceeded, even if platform has room', async () => {
      mockUsage.getPlatformUsage.mockResolvedValue(0);
      mockUsage.getRestaurantUsage.mockResolvedValue(149_900); // PROFESSIONAL cap = 150,000

      const result = await service.assertCanSpend(restaurant, 500);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('restaurant_quota_exceeded');
    });

    it('honors forceTier over the raw tier when checking the restaurant cap', async () => {
      mockUsage.getPlatformUsage.mockResolvedValue(0);
      mockUsage.getRestaurantUsage.mockResolvedValue(0);

      // FREE tier's own cap is 0, but forceTier=ENTERPRISE should apply
      // ENTERPRISE's 400,000 cap instead.
      const result = await service.assertCanSpend(
        { id: 'rest-1', tier: 'FREE', forceTier: 'ENTERPRISE' },
        1000,
      );

      expect(result.allowed).toBe(true);
    });

    it('honors a per-restaurant translationCharCapOverride', async () => {
      mockUsage.getPlatformUsage.mockResolvedValue(0);
      mockUsage.getRestaurantUsage.mockResolvedValue(100);

      const result = await service.assertCanSpend(
        { id: 'rest-1', tier: 'STARTER', translationCharCapOverride: 200 },
        50,
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(50); // 200 - 100 - 50
    });

    it('respects TRANSLATION_PLATFORM_MONTHLY_CAP env override', async () => {
      process.env.TRANSLATION_PLATFORM_MONTHLY_CAP = '1000';
      mockUsage.getPlatformUsage.mockResolvedValue(900);
      mockUsage.getRestaurantUsage.mockResolvedValue(0);

      const result = await service.assertCanSpend(restaurant, 200);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('platform_quota_exceeded');
    });
  });

  describe('getPlatformStatus / getRestaurantStatus', () => {
    it('computes pct correctly', async () => {
      mockUsage.getPlatformUsage.mockResolvedValue(225_000);
      const status = await service.getPlatformStatus();
      expect(status.pct).toBeCloseTo(50, 0);
    });

    it('does not divide by zero for a tier with a 0 cap', async () => {
      mockUsage.getRestaurantUsage.mockResolvedValue(0);
      const status = await service.getRestaurantStatus({
        id: 'rest-1',
        tier: 'FREE',
      });
      expect(Number.isFinite(status.pct)).toBe(true);
    });
  });
});
