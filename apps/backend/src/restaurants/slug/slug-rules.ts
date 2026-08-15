export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 40;

/**
 * ASCII-only by design. This is not merely a formatting rule — it is the
 * homoglyph defense. Cyrillic "а" (U+0430) and Latin "a" render identically in
 * a URL bar, so widening this class would let one tenant register a slug
 * visually indistinguishable from a competitor's. Transliteration
 * (transliterate.ts) is what serves international names.
 *
 * Length is deliberately NOT encoded here — see validateSlug.
 */
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'app',
  'admin',
  'administrator',
  'dashboard',
  'staff',
  'kitchen',
  'pos',
  'docs',
  'mail',
  'smtp',
  'imap',
  'cdn',
  'static',
  'assets',
  'img',
  'images',
  'media',
  'ftp',
  'ns',
  'ns1',
  'ns2',
  'mx',
  'webmail',
  'blog',
  'shop',
  'store',
  'help',
  'support',
  'status',
  'dev',
  'test',
  'staging',
  'prod',
  'production',
  'demo',
  'sandbox',
  'auth',
  'login',
  'register',
  'account',
  'billing',
  'payment',
  'payments',
  'checkout',
  'stripe',
  'webhook',
  'socket',
  'ws',
  'graphql',
  'v1',
  'v2',
  'public',
  'internal',
  'root',
  'system',
  'security',
  'abuse',
  'postmaster',
  'null',
  'undefined',
  // Reserved because they are literal path segments in the public menu
  // controller's route table (apps/backend/src/menu/public-menu.controller.ts:
  // public/resolve, public/:restaurantId/meta, /items, /trending,
  // /categories/:categoryId/items). A restaurant slug equal to any of these
  // would collide with a sibling route on the same 3-segment shape as
  // public/resolve/:slug (e.g. /menu/public/resolve/meta matches both
  // resolveSlug(slug="meta") and getPublicMenuMeta(restaurantId="resolve")).
  // Declaration order picks a winner, so without this reservation the
  // outcome would silently depend on controller ordering rather than being
  // structurally impossible. Do not remove without re-auditing that route
  // table.
  'resolve',
  'meta',
  'items',
  'trending',
  'categories',
]);

export type SlugRuleError =
  | 'LENGTH'
  | 'FORMAT'
  | 'PUNYCODE'
  | 'NUMERIC'
  | 'RESERVED';

export function validateSlug(slug: string): SlugRuleError | null {
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return 'LENGTH';
  }
  if (!SLUG_PATTERN.test(slug)) return 'FORMAT';
  // Reserved for IDN encoding; would collide with punycode hostnames.
  if (slug.startsWith('xn--')) return 'PUNYCODE';
  // Ambiguous with internal identifiers — /m/12345 reads as an ID.
  if (/^\d+$/.test(slug)) return 'NUMERIC';
  if (RESERVED_SLUGS.has(slug)) return 'RESERVED';
  return null;
}
