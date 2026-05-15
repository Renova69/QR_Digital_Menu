interface Translatable {
  translations?: Record<string, Record<string, string | string[]>> | null;
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
  return Array.isArray(value) ? (value as string[]) : undefined;
}
