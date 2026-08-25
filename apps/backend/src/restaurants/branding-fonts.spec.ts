import { BRANDING_FONT_NAMES } from './branding-fonts';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('BRANDING_FONT_NAMES', () => {
  it('exposes a non-empty allowlist of font family names', () => {
    expect(BRANDING_FONT_NAMES.length).toBeGreaterThan(0);
  });

  it('contains the classic serif and sans families used by the UI', () => {
    expect(BRANDING_FONT_NAMES).toContain('Playfair Display');
    expect(BRANDING_FONT_NAMES).toContain('Inter');
    expect(BRANDING_FONT_NAMES).toContain('Roboto');
    expect(BRANDING_FONT_NAMES).toContain('Montserrat');
  });

  it('has unique, non-empty entries', () => {
    expect(new Set(BRANDING_FONT_NAMES).size).toBe(BRANDING_FONT_NAMES.length);
    for (const name of BRANDING_FONT_NAMES) {
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  it('stays in sync with the frontend single source of truth', () => {
    // Defense-in-depth invariant: the server allowlist must gate exactly the
    // same names the frontend ships, or owners cannot persist a font the UI
    // offers. Guarded so the test does not fail in a frontend-less build.
    const frontendFile = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'apps',
      'frontend',
      'src',
      'lib',
      'brandingFonts.ts',
    );
    if (!existsSync(frontendFile)) {
      return;
    }
    const src = readFileSync(frontendFile, 'utf8');
    for (const font of BRANDING_FONT_NAMES) {
      expect(src).toMatch(new RegExp(`['"]${font}['"]`));
    }
  });
});
