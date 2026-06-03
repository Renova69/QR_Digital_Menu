import { Test, TestingModule } from '@nestjs/testing';
import { FeatureService } from './feature.service';
import { FeatureFlag } from './feature-flag.enum';

describe('FeatureService', () => {
  let service: FeatureService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FeatureService],
    }).compile();
    service = module.get<FeatureService>(FeatureService);
  });

  describe('getFeatures', () => {
    it('returns menu+qr+import features for FREE tier', () => {
      const features = service.getFeatures('FREE');
      expect(features).toContain(FeatureFlag.MENU_VIEW);
      expect(features).toContain(FeatureFlag.MENU_EDIT);
      expect(features).toContain(FeatureFlag.MENU_IMPORT);
      expect(features).toContain(FeatureFlag.QR_MANAGE);
      expect(features).not.toContain(FeatureFlag.ORDERS_RECEIVE);
      expect(features).not.toContain(FeatureFlag.POS);
    });

    it('returns orders+call-waiter+analytics for STARTER tier', () => {
      const features = service.getFeatures('STARTER');
      expect(features).toContain(FeatureFlag.ORDERS_RECEIVE);
      expect(features).toContain(FeatureFlag.ORDERS_CALL_WAITER);
      expect(features).toContain(FeatureFlag.ANALYTICS_BASIC);
      expect(features).toContain(FeatureFlag.MENU_IMPORT);
      expect(features).not.toContain(FeatureFlag.PAYMENTS_STRIPE);
      expect(features).not.toContain(FeatureFlag.LOYALTY);
    });

    it('returns payments+loyalty+branding for PROFESSIONAL tier', () => {
      const features = service.getFeatures('PROFESSIONAL');
      expect(features).toContain(FeatureFlag.PAYMENTS_STRIPE);
      expect(features).toContain(FeatureFlag.LOYALTY);
      expect(features).toContain(FeatureFlag.BRANDING_CUSTOM);
      expect(features).toContain(FeatureFlag.LANGUAGES_MULTI);
      expect(features).not.toContain(FeatureFlag.POS);
      expect(features).not.toContain(FeatureFlag.KDS);
    });

    it('returns all features for ENTERPRISE tier', () => {
      const features = service.getFeatures('ENTERPRISE');
      expect(features).toContain(FeatureFlag.POS);
      expect(features).toContain(FeatureFlag.KDS);
      expect(features).toContain(FeatureFlag.RBAC);
      expect(features).toContain(FeatureFlag.MULTILOCATION);
      expect(features).toContain(FeatureFlag.PRINTERS_THERMAL);
    });
  });

  describe('hasFeature', () => {
    it('returns true when tier has the feature', () => {
      expect(service.hasFeature('ENTERPRISE', FeatureFlag.POS)).toBe(true);
      expect(
        service.hasFeature('PROFESSIONAL', FeatureFlag.PAYMENTS_STRIPE),
      ).toBe(true);
      expect(service.hasFeature('STARTER', FeatureFlag.ORDERS_RECEIVE)).toBe(
        true,
      );
    });

    it('returns false when tier lacks the feature', () => {
      expect(service.hasFeature('FREE', FeatureFlag.POS)).toBe(false);
      expect(service.hasFeature('STARTER', FeatureFlag.LOYALTY)).toBe(false);
      expect(service.hasFeature('PROFESSIONAL', FeatureFlag.KDS)).toBe(false);
    });
  });

  describe('getFeatures — unknown tier fallback', () => {
    it('falls back to FREE features for an unknown tier string', () => {
      const features = service.getFeatures('UNKNOWN_TIER');
      expect(features).toContain(FeatureFlag.MENU_VIEW);
      expect(features).not.toContain(FeatureFlag.LOYALTY);
    });
  });

  describe('getStaffLimit', () => {
    it('returns 0 for FREE tier (owner only)', () => {
      expect(service.getStaffLimit('FREE')).toBe(0);
    });

    it('returns 1 for STARTER tier', () => {
      expect(service.getStaffLimit('STARTER')).toBe(1);
    });

    it('returns 5 for PROFESSIONAL tier', () => {
      expect(service.getStaffLimit('PROFESSIONAL')).toBe(5);
    });

    it('returns 999999 for ENTERPRISE tier', () => {
      expect(service.getStaffLimit('ENTERPRISE')).toBe(999999);
    });

    it('returns 0 for unknown tier (default)', () => {
      expect(service.getStaffLimit('UNKNOWN')).toBe(0);
    });
  });

  describe('getAllowedStaffRoles', () => {
    it('returns [] for FREE tier', () => {
      expect(service.getAllowedStaffRoles('FREE')).toEqual([]);
    });

    it('returns [STAFF] for STARTER tier', () => {
      expect(service.getAllowedStaffRoles('STARTER')).toEqual(['STAFF']);
    });

    it('returns [STAFF, MANAGER] for PROFESSIONAL tier', () => {
      expect(service.getAllowedStaffRoles('PROFESSIONAL')).toEqual([
        'STAFF',
        'MANAGER',
      ]);
    });

    it('returns [STAFF, MANAGER, WAITER, KITCHEN] for ENTERPRISE tier', () => {
      expect(service.getAllowedStaffRoles('ENTERPRISE')).toEqual([
        'STAFF',
        'MANAGER',
        'WAITER',
        'KITCHEN',
      ]);
    });

    it('returns [] for unknown tier', () => {
      expect(service.getAllowedStaffRoles('UNKNOWN')).toEqual([]);
    });
  });
});
