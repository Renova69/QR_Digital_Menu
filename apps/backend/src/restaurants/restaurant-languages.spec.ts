import {
  SUPPORTED_TARGET_LANGUAGE_CODES,
  MAX_TARGET_LANGUAGES,
} from './restaurant-languages';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

  it('defaults existing restaurants to Bulgarian instead of inferring menu language from dashboard locale', () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        'prisma/migrations/20260809190000_separate_menu_source_language/migration.sql',
      ),
      'utf8',
    );

    expect(migration).toContain(`DEFAULT 'bg'`);
    expect(migration).not.toContain('dashboardLanguage');
  });
});
