import {
  buildPhonePlaceholderEmail,
  isPhonePlaceholderEmail,
} from './phone-placeholder';

describe('phone-placeholder', () => {
  describe('buildPhonePlaceholderEmail', () => {
    it('strips all non-digit characters from the phone', () => {
      expect(buildPhonePlaceholderEmail('+359 88 123 4567')).toBe(
        'phone-359881234567@phone.local',
      );
    });

    it('handles digits-only input', () => {
      expect(buildPhonePlaceholderEmail('0881234567')).toBe(
        'phone-0881234567@phone.local',
      );
    });

    it('handles an empty phone', () => {
      expect(buildPhonePlaceholderEmail('')).toBe('phone-@phone.local');
    });
  });

  describe('isPhonePlaceholderEmail', () => {
    it('matches the canonical placeholder address', () => {
      expect(isPhonePlaceholderEmail('phone-359881234567@phone.local')).toBe(
        true,
      );
    });

    it('is case-insensitive', () => {
      expect(isPhonePlaceholderEmail('PHONE-123@PHONE.LOCAL')).toBe(true);
    });

    it('rejects null and undefined', () => {
      expect(isPhonePlaceholderEmail(null)).toBe(false);
      expect(isPhonePlaceholderEmail(undefined)).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(isPhonePlaceholderEmail(123 as any)).toBe(false);
    });

    it('rejects real email addresses', () => {
      expect(isPhonePlaceholderEmail('ivan@example.com')).toBe(false);
    });

    it('rejects strings that merely contain the domain', () => {
      expect(isPhonePlaceholderEmail('x@phone.local.evil.com')).toBe(false);
      expect(isPhonePlaceholderEmail('phone.local@example.com')).toBe(false);
    });
  });
});
