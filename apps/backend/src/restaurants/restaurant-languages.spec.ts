import {
  SUPPORTED_TARGET_LANGUAGE_CODES,
  MAX_TARGET_LANGUAGES,
} from './restaurant-languages';

describe('Restaurant Languages Constants', () => {
  it('should have a defined list of supported target language codes', () => {
    expect(SUPPORTED_TARGET_LANGUAGE_CODES).toBeDefined();
    expect(Array.isArray(SUPPORTED_TARGET_LANGUAGE_CODES)).toBe(true);
    expect(SUPPORTED_TARGET_LANGUAGE_CODES.length).toBeGreaterThan(0);
  });

  it('should include common languages like English and Spanish', () => {
    expect(SUPPORTED_TARGET_LANGUAGE_CODES).toContain('en');
    expect(SUPPORTED_TARGET_LANGUAGE_CODES).toContain('es');
  });

  it('should set MAX_TARGET_LANGUAGES equal to the number of supported languages', () => {
    expect(MAX_TARGET_LANGUAGES).toBe(SUPPORTED_TARGET_LANGUAGE_CODES.length);
  });

  it('should not contain duplicate language codes', () => {
    const uniqueCodes = new Set(SUPPORTED_TARGET_LANGUAGE_CODES);
    expect(uniqueCodes.size).toBe(SUPPORTED_TARGET_LANGUAGE_CODES.length);
  });
});
