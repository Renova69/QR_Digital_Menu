/**
 * Server-side allowlist of branding font family names.
 *
 * MUST stay in sync with the frontend single source of truth:
 *   apps/frontend/src/lib/brandingFonts.ts  (BRANDING_FONTS)
 *
 * The frontend uses its list to gate which fonts load on the public menu
 * (the values are interpolated into a Google Fonts URL). That guard is
 * client-only, so this list is the server-side enforcement: update-restaurant
 * DTO validates fontHeading/fontBody against it. Defense in depth — keeps
 * arbitrary/unbounded strings out of the persisted branding columns.
 *
 * If you add a font on the frontend, add it here too or owners cannot save it.
 */
export const BRANDING_FONT_NAMES = [
  'Playfair Display',
  'Merriweather',
  'Lora',
  'Crimson Text',
  'PT Serif',
  'Inter',
  'Outfit',
  'Roboto',
  'Open Sans',
  'Montserrat',
  'Lato',
  'Poppins',
  'Karla',
  'Sofia Sans',
  'Oswald',
  'Bebas Neue',
  'Lobster',
  'Pacifico',
] as const;
