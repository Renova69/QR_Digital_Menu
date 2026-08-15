import { transliterateBg } from './transliterate';
import { SLUG_MAX_LENGTH, validateSlug } from './slug-rules';

/**
 * Truncates to SLUG_MAX_LENGTH, preferring a hyphen boundary so a word is
 * not split. When the 40-char window contains no hyphen at all (e.g. the
 * first token alone is already >= SLUG_MAX_LENGTH), there is no boundary to
 * prefer, so this deliberately hard-cuts the window instead of discarding
 * the name in favor of an id-derived slug — a truncated fragment of the
 * name still reads as the owner's restaurant, and the slug is owner-editable
 * during onboarding anyway.
 */
function truncateAtBoundary(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastHyphen = cut.lastIndexOf('-');
  if (lastHyphen > 0) {
    return cut.slice(0, lastHyphen).replace(/-+$/, '');
  }
  // No hyphen boundary in the window: hard-cut is deliberate, not an
  // accidental fallthrough.
  return cut.replace(/-+$/, '');
}

/**
 * Name -> candidate slug. The result is guaranteed to pass validateSlug();
 * anything that cannot be salvaged falls back to an id-derived name.
 * Truncation to SLUG_MAX_LENGTH prefers a hyphen boundary and hard-cuts
 * mid-word only when the 40-char window has none — see truncateAtBoundary.
 */
export function generateSlugBase(name: string, restaurantId: string): string {
  const translit = transliterateBg(name);
  const ascii = translit.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const slug = truncateAtBoundary(
    ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, ''),
  );
  return validateSlug(slug) === null
    ? slug
    : `restaurant-${restaurantId.slice(0, 6)}`;
}

/**
 * Deterministic collision suffix. Never random — a predictable second choice
 * is easier for an owner to recognize as theirs.
 */
export function withSuffix(base: string, attempt: number): string {
  const suffix = `-${attempt}`;
  const room = SLUG_MAX_LENGTH - suffix.length;
  return `${base.slice(0, room).replace(/-+$/, '')}${suffix}`;
}
