/**
 * Preview-only port of the backend slug pipeline, used to show an owner a
 * live "this is roughly what your menu URL will look like" preview while
 * they type their restaurant name during onboarding — before a restaurant
 * id exists, so the real `/restaurants/:id/slug/...` endpoints cannot be
 * called yet.
 *
 * Source of truth (do not let this drift silently — the test cases in
 * slugPreview.test.ts are carried over from the backend specs):
 *   - apps/backend/src/restaurants/slug/transliterate.ts
 *   - apps/backend/src/restaurants/slug/slug-generator.ts
 *
 * The server remains authoritative. It re-derives the real slug at
 * restaurant-creation time using the same transliteration + slugify
 * pipeline, plus the full validation rule set in
 * apps/backend/src/restaurants/slug/slug-rules.ts (reserved words, punycode
 * guard, length bounds, deterministic collision suffixing). This preview
 * deliberately does NOT reimplement that entire rule set — an owner-typed
 * name that happens to collide with an existing slug or a reserved word is
 * expected to diverge from this preview and come back with a server-assigned
 * suffix (e.g. `bistro-oranzh-2`), exactly like any other collision. That is
 * expected/visible-in-settings behavior, not a bug in this preview.
 */

// Bulgarian Cyrillic -> Latin map. Mirrors transliterate.ts exactly,
// including the two intentional ISO-9 divergences: ъ -> a (not ŭ/ǎ) and
// щ -> sht. Do not "correct" those.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ь: "y",
  ю: "yu",
  я: "ya",
};

// Mirrors slug-rules.ts SLUG_MAX_LENGTH / SLUG_MIN_LENGTH. Only the two
// bounds are ported here (not the full rule set — see file header).
const SLUG_MAX_LENGTH = 40;
const SLUG_MIN_LENGTH = 2;

function transliterateBg(input: string): string {
  const lower = input.toLowerCase();
  // Art. 4 of the standard: word-final "-ия" renders as "-ia"
  // (Пицария -> pitsaria, not pitsariya).
  const withIaRule = lower.replace(/ия(?![а-я])/g, "ia");
  return Array.from(withIaRule)
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join("");
}

/**
 * Truncates to SLUG_MAX_LENGTH at a hyphen boundary so a word is never split.
 * Mirrors truncateAtBoundary in slug-generator.ts exactly, including its
 * fallback signal when no boundary exists inside the length bound.
 */
function truncateAtBoundary(slug: string): string {
  if (slug.length <= SLUG_MAX_LENGTH) return slug;
  const cut = slug.slice(0, SLUG_MAX_LENGTH);
  const lastHyphen = cut.lastIndexOf("-");
  if (lastHyphen > 0) {
    return cut.slice(0, lastHyphen).replace(/-+$/, "");
  }
  return "";
}

/**
 * Deterministic, non-random 6-character fallback suffix derived from the
 * input name. There is no restaurant id yet during onboarding preview, so
 * this cannot literally reuse the backend's `restaurant-<id.slice(0,6)>`
 * fallback — it mirrors the *shape* only (prefix + 6 chars), matching
 * generateSlugBase's "falls back when nothing survives" behavior without a
 * real id to derive from. Deterministic on purpose (same input always
 * previews the same fallback), the same rationale withSuffix documents for
 * never using randomness.
 */
function fallbackSuffix(name: string): string {
  let hash = 0;
  for (const ch of name) {
    hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  }
  return Math.abs(hash).toString(36).padStart(6, "0").slice(-6);
}

/**
 * Name -> previewed slug. Best-effort client-side mirror of
 * generateSlugBase(); the server remains authoritative (see file header).
 */
export function slugifyForPreview(name: string): string {
  const translit = transliterateBg(name);
  const ascii = translit.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = truncateAtBoundary(
    ascii
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, ""),
  );
  const isNumericOnly = /^\d+$/.test(slug);
  const isValidShape =
    slug.length >= SLUG_MIN_LENGTH &&
    slug.length <= SLUG_MAX_LENGTH &&
    !isNumericOnly;
  return isValidShape ? slug : `restaurant-${fallbackSuffix(name)}`;
}
