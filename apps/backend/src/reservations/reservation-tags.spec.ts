import {
  hasDietaryPreference,
  sanitizeCustomerPreferences,
  sanitizeStaffTags,
} from './reservation-tags';

describe('reservation-tags', () => {
  describe('sanitizeCustomerPreferences', () => {
    it('keeps only recognized values and de-dupes', () => {
      expect(
        sanitizeCustomerPreferences([
          'VEGAN',
          'VEGAN',
          'PET',
          'NONSENSE',
          123,
          null,
        ]),
      ).toEqual(['VEGAN', 'PET']);
    });
    it('returns [] for non-arrays', () => {
      expect(sanitizeCustomerPreferences('VEGAN')).toEqual([]);
      expect(sanitizeCustomerPreferences(undefined)).toEqual([]);
    });
  });

  describe('sanitizeStaffTags', () => {
    it('rejects customer-only and unknown values', () => {
      expect(sanitizeStaffTags(['VIP', 'VEGAN', 'OFTEN_LATE', 'x'])).toEqual([
        'VIP',
        'OFTEN_LATE',
      ]);
    });
  });

  describe('hasDietaryPreference', () => {
    it('is true when a health-sensitive dietary item is present', () => {
      expect(hasDietaryPreference(['PET', 'GLUTEN_INTOLERANT'])).toBe(true);
      expect(hasDietaryPreference(['VEGAN'])).toBe(true);
    });
    it('is false for non-dietary preferences only', () => {
      expect(hasDietaryPreference(['PET', 'HIGH_CHAIR', 'QUIET_TABLE'])).toBe(
        false,
      );
    });
  });
});
