import { transliterateBg } from './transliterate';
import { SLUG_MAX_LENGTH, validateSlug } from './slug-rules';

/**
 * Truncates to SLUG_MAX_LENGTH at a hyphen boundary so a word is never split.
 * If the first token alone exceeds the bound, no legal truncation exists;
 * return an invalid empty candidate so generateSlugBase uses its stable
 * restaurant-id fallback.
 */
function truncateAtBoundary(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastHyphen = cut.lastIndexOf('-');
  if (lastHyphen > 0) {
    return cut.slice(0, lastHyphen).replace(/-+$/, '');
  }
  return '';
}

/**
 * Name -> candidate slug. The result is guaranteed to pass validateSlug();
 * anything that cannot be salvaged falls back to an id-derived name.
 * Truncation to SLUG_MAX_LENGTH never splits a word — see
 * truncateAtBoundary.
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
