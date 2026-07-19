/**
 * Server-side allowlist of canonical menu tag keys (allergens + dietary).
 *
 * MUST stay in sync with the frontend single source of truth:
 *   apps/frontend/src/lib/menuTags.ts  (MENU_TAGS)
 *
 * Preset tags are stored on menu items as these stable keys (e.g. "gluten",
 * "milk", "vegetarian") and resolved to icon + localized name on the client.
 * The item DTO stays permissive (arbitrary strings still validate) so legacy /
 * custom free-text tags keep working — this list is used only to SKIP DeepL
 * translation for preset keys (their names come from the frontend locale
 * files, not DeepL) and to build the XLSX export "Tags Reference" legend.
 * If you add a key on the frontend, add it here too.
 */
export const ALLERGEN_KEYS = [
  'gluten',
  'crustaceans',
  'egg',
  'fish',
  'peanut',
  'soy',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'mollusc',
] as const;

export const DIETARY_KEYS = [
  'vegetarian',
  'vegan',
  'gluten-free',
  'lactose-free',
  'halal',
  'kosher',
  'spicy',
  'organic',
  'sugar-free',
  'nut-free',
  'keto',
  'paleo',
] as const;

export const MENU_TAG_KEYS: readonly string[] = [
  ...ALLERGEN_KEYS,
  ...DIETARY_KEYS,
];

const MENU_TAG_KEY_SET: ReadonlySet<string> = new Set(MENU_TAG_KEYS);

/** True when a stored tag value is a preset key (skip DeepL translation). */
export function isPresetTagKey(value: string): boolean {
  return MENU_TAG_KEY_SET.has(value.trim().toLowerCase());
}
