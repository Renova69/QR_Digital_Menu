interface Translatable {
  translations?: Record<
    string,
    Record<string, string | string[] | Record<string, string>>
  > | null;
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
