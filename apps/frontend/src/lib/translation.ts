import type { MenuTranslationMap } from "../types";

interface Translatable {
  translations?: MenuTranslationMap | null;
}

const SOURCE_CONTENT_FIELDS = new Set(["name", "description", "choices"]);

const normalizeLanguageCode = (language: string | null | undefined): string =>
  String(language || "bg")
    .toLowerCase()
    .split("-")[0];

/**
 * Public APIs already resolve source-language name/description fields from the
 * canonical owner-authored columns. Remove only those duplicated fields from
 * the source locale's translation block so downstream display components
 * cannot overlay an older snapshot. Allergen/dietary-tag translations remain.
 */
export function preserveCanonicalSourceFields<T extends Translatable>(
  obj: T,
  requestedLang: string | null | undefined,
  sourceLang: string | null | undefined,
): T {
  if (
    normalizeLanguageCode(requestedLang) !== normalizeLanguageCode(sourceLang)
  ) {
    return obj;
  }

  const translations = obj.translations;
  if (!translations) return obj;

  const sourceKey = Object.keys(translations).find(
    (key) => normalizeLanguageCode(key) === normalizeLanguageCode(sourceLang),
  );
  if (!sourceKey) return obj;

  const sourceEntry = translations[sourceKey];
  const preservedEntry = Object.fromEntries(
    Object.entries(sourceEntry).filter(
      ([field]) => !SOURCE_CONTENT_FIELDS.has(field),
    ),
  );

  return {
    ...obj,
    translations: {
      ...translations,
      [sourceKey]: preservedEntry,
    },
  };
}

export function getTranslatedField<T extends Translatable>(
  obj: T,
  lang: string | null | undefined,
  field: string,
): string | undefined {
  if (!lang) return undefined;
  const t = obj.translations;
  if (!t) return undefined;
  const langBlock = t[lang];
  if (!langBlock) return undefined;
  const value = langBlock[field];
  return typeof value === "string" ? value : undefined;
}

export function getTranslatedArray<T extends Translatable>(
  obj: T,
  lang: string | null | undefined,
  field: string,
): string[] | undefined {
  if (!lang) return undefined;
  const t = obj.translations;
  if (!t) return undefined;
  const langBlock = t[lang];
  if (!langBlock) return undefined;
  const value = langBlock[field];
  // Allergens / dietaryTags are stored as a map { original: translated } in the
  // current schema, but older rows used a plain string[]. Support both so the
  // chips translate against `lang` instead of silently falling back to the
  // fetch-time top-level array (which froze them on one language).
  if (Array.isArray(value)) return value as string[];
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, string>);
  }
  return undefined;
}
