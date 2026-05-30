import { FeatureFlag } from '../subscription/feature-flag.enum';

/**
 * Restaurant fields gated behind the BRANDING_CUSTOM feature (PROFESSIONAL+).
 * Single source of truth — used by RestaurantsService to strip these from
 * create/update payloads when the restaurant's tier lacks branding.
 *
 * Social URLs (facebook/instagram/etc.) are intentionally NOT here — they
 * belong to the public-menu footer feature, which is ungated.
 */
export const BRANDING_FIELDS = [
  'logoUrl',
  'logoThumbnailUrl',
  'accentColor',
  'defaultTheme',
  'fontHeading',
  'fontBody',
  'themeBgColor',
  'themeTextColor',
  'themeCardColor',
  'themeLightBgColor',
  'themeLightTextColor',
  'themeLightCardColor',
  'themeLightAccentColor',
  'themeDarkBgColor',
  'themeDarkTextColor',
  'themeDarkCardColor',
  'themeDarkAccentColor',
] as const;

const BRANDING_FIELD_SET: ReadonlySet<string> = new Set(BRANDING_FIELDS);

export const BRANDING_FEATURE = FeatureFlag.BRANDING_CUSTOM;

/**
 * Returns a new object with branding fields removed. Immutable — never
 * mutates the input. Used when the caller's tier lacks BRANDING_CUSTOM.
 */
export function stripBrandingFields<T extends Record<string, unknown>>(
  dto: T,
): Omit<T, (typeof BRANDING_FIELDS)[number]> {
  return Object.fromEntries(
    Object.entries(dto).filter(([key]) => !BRANDING_FIELD_SET.has(key)),
  ) as Omit<T, (typeof BRANDING_FIELDS)[number]>;
}
