import {
  getTierInfo,
  tierConfigFromRestaurant,
  TierConfig,
} from './loyalty-tiers.utils';

describe('loyalty-tiers.utils', () => {
  const defaultConfig: TierConfig = {
    silverThreshold: 500,
    goldThreshold: 2000,
    silverMultiplier: 1.2,
    goldMultiplier: 1.5,
  };

  describe('getTierInfo', () => {
    it('should return Bronze for 0 points', () => {
      const info = getTierInfo(0, defaultConfig);
      expect(info.tier).toBe('Bronze');
      expect(info.multiplier).toBe(1.0);
      expect(info.nextTierName).toBe('Silver');
      expect(info.pointsToNext).toBe(500);
    });

    it('should return Bronze just before silver threshold', () => {
      const info = getTierInfo(499, defaultConfig);
      expect(info.tier).toBe('Bronze');
      expect(info.pointsToNext).toBe(1);
    });

    it('should return Silver at threshold', () => {
      const info = getTierInfo(500, defaultConfig);
      expect(info.tier).toBe('Silver');
      expect(info.multiplier).toBe(1.2);
      expect(info.nextTierName).toBe('Gold');
      expect(info.pointsToNext).toBe(1500);
    });

    it('should return Gold at threshold', () => {
      const info = getTierInfo(2000, defaultConfig);
      expect(info.tier).toBe('Gold');
      expect(info.multiplier).toBe(1.5);
      expect(info.nextTierName).toBe('Max Tier');
      expect(info.pointsToNext).toBe(0);
      expect(info.progressPercent).toBe(100);
    });

    it('should return Gold above threshold', () => {
      const info = getTierInfo(99999, defaultConfig);
      expect(info.tier).toBe('Gold');
      expect(info.progressPercent).toBe(100);
    });

    it('should calculate progress percent for Silver', () => {
      const info = getTierInfo(1250, defaultConfig);
      // (1250 - 500) / (2000 - 500) = 750/1500 = 50%
      expect(info.progressPercent).toBe(50);
    });
  });

  describe('tierConfigFromRestaurant', () => {
    it('should return defaults when restaurant has no tier config', () => {
      const config = tierConfigFromRestaurant({});
      expect(config.silverThreshold).toBe(500);
      expect(config.goldThreshold).toBe(2000);
      expect(config.silverMultiplier).toBe(1.2);
      expect(config.goldMultiplier).toBe(1.5);
    });

    it('should read custom tier thresholds from restaurant', () => {
      const config = tierConfigFromRestaurant({
        loyaltySilverThreshold: 1000,
        loyaltyGoldThreshold: 5000,
        loyaltySilverMultiplier: 1.5,
        loyaltyGoldMultiplier: 2.0,
      });
      expect(config.silverThreshold).toBe(1000);
      expect(config.goldThreshold).toBe(5000);
      expect(config.silverMultiplier).toBe(1.5);
      expect(config.goldMultiplier).toBe(2.0);
    });
  });
});
