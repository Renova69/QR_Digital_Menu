import { isLoyaltyAvailable } from './loyalty-availability.util';

describe('isLoyaltyAvailable', () => {
  const mockFeatureService = {
    getEffectiveTier: jest.fn(),
    hasFeature: jest.fn(),
  };

  it('returns false for null restaurant', () => {
    expect(isLoyaltyAvailable(null, mockFeatureService as any)).toBe(false);
    expect(isLoyaltyAvailable(undefined, mockFeatureService as any)).toBe(
      false,
    );
  });

  it('returns false when restaurant is inactive', () => {
    expect(
      isLoyaltyAvailable({ isActive: false }, mockFeatureService as any),
    ).toBe(false);
  });

  it('returns false when tier lacks LOYALTY feature', () => {
    mockFeatureService.getEffectiveTier.mockReturnValue('FREE');
    mockFeatureService.hasFeature.mockReturnValue(false);

    expect(
      isLoyaltyAvailable(
        { tier: 'FREE', isLoyaltyEnabled: true, isActive: true },
        mockFeatureService as any,
      ),
    ).toBe(false);
  });

  it('returns false when owner has disabled loyalty', () => {
    mockFeatureService.getEffectiveTier.mockReturnValue('PROFESSIONAL');
    mockFeatureService.hasFeature.mockReturnValue(true);

    expect(
      isLoyaltyAvailable(
        { tier: 'PROFESSIONAL', isLoyaltyEnabled: false, isActive: true },
        mockFeatureService as any,
      ),
    ).toBe(false);
  });

  it('returns true when tier has LOYALTY and owner enabled it', () => {
    mockFeatureService.getEffectiveTier.mockReturnValue('PROFESSIONAL');
    mockFeatureService.hasFeature.mockReturnValue(true);

    expect(
      isLoyaltyAvailable(
        { tier: 'PROFESSIONAL', isLoyaltyEnabled: true, isActive: true },
        mockFeatureService as any,
      ),
    ).toBe(true);
  });

  it('honors forceTier override', () => {
    mockFeatureService.getEffectiveTier.mockReturnValue('PROFESSIONAL');
    mockFeatureService.hasFeature.mockReturnValue(true);

    expect(
      isLoyaltyAvailable(
        {
          tier: 'FREE',
          forceTier: 'PROFESSIONAL',
          isLoyaltyEnabled: true,
          isActive: true,
        },
        mockFeatureService as any,
      ),
    ).toBe(true);
  });
});
