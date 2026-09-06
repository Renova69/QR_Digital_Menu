import { resolveTag } from "./menuTags";

export const IMPORT_ERROR_DEFAULTS = {
  "importExport.errors.csvUnclosedQuote":
    "The CSV contains an unclosed quoted field.",
  "importExport.errors.csvNoRows": "The CSV does not contain any data rows.",
  "importExport.errors.csvMissingColumns":
    "The CSV must include category and item_name columns.",
  "importExport.errors.xlsxNoRows":
    "The spreadsheet does not contain any data rows.",
  "importExport.errors.xlsxMissingColumns":
    "The spreadsheet must include category and item_name columns.",
  "importExport.errors.parseFailed":
    "We couldn't read this menu file. Make sure it is valid JSON, CSV, or XLSX and try again.",
  "importExport.errors.invalidJson":
    "We couldn't read this menu file. Make sure it is valid JSON and try again.",
  "importExport.errors.invalidPrice":
    "Use a valid euro price with at most two decimal places (for example 12.50 or 12,50).",
  "importExport.errors.eurOnly": "Only EUR prices can be imported.",
  "importExport.errors.validationFailed":
    "Some menu data is invalid. Check item names, EUR prices, and options, then try again.",
} as const;

export type ImportErrorKey = keyof typeof IMPORT_ERROR_DEFAULTS;

const KNOWN_ALLERGENS = [
  "nuts",
  "dairy",
  "soy",
  "gluten",
  "peanuts",
  "shellfish",
  "egg",
];

export function isImportErrorKey(value: unknown): value is ImportErrorKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(IMPORT_ERROR_DEFAULTS, value)
  );
}

// Normalizes a raw imported tag to its canonical preset key (e.g. "Gluten" /
// "gluten-free" / "без глутен" -> "gluten-free") when it matches a known
// allergen/dietary preset; otherwise preserves custom and legacy tags.
export function normalizeImportTag(raw: string): string {
  const trimmed = raw.trim();
  return resolveTag(trimmed)?.key ?? trimmed;
}

// Splits a combined legacy tags collection into the canonical fields used by
// the import API. Both owner and super-admin imports go through this seam so
// they cannot silently accept different JSON formats.
export function splitImportTags(tags: string[]) {
  const allergens: string[] = [];
  const dietaryTags: string[] = [];
  for (const raw of tags) {
    const preset = resolveTag(raw);
    if (preset) {
      (preset.kind === "allergen" ? allergens : dietaryTags).push(preset.key);
      continue;
    }
    const trimmed = raw.trim();
    const isKnownAllergen = KNOWN_ALLERGENS.some((allergen) =>
      trimmed.toLowerCase().includes(allergen),
    );
    (isKnownAllergen ? allergens : dietaryTags).push(trimmed);
  }
  return { allergens, dietaryTags };
}

export function normalizeImportCurrency(value: unknown): "EUR" {
  const currency = String(value ?? "")
    .trim()
    .toUpperCase();
  if (currency && currency !== "EUR") {
    throw new Error("importExport.errors.eurOnly");
  }
  return "EUR";
}

// Accept explicit decimal/grouping formats; never truncate malformed money
// or guess whether a lone separator followed by three digits means cents.
export function parseImportPrice(value: unknown): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    if (Number.isFinite(value) && value >= 0) return value;
    throw new Error("importExport.errors.invalidPrice");
  }
  if (typeof value !== "string") {
    throw new Error("importExport.errors.invalidPrice");
  }
  const price = value
    .trim()
    .replace(/^(?:EUR|€)\s*|\s*(?:EUR|€)$/gi, "")
    .trim();
  let normalized: string;
  if (/^\d+(?:[.,]\d{1,2})?$/.test(price)) {
    normalized = price.replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(price)) {
    normalized = price.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(price)) {
    normalized = price.replace(/,/g, "");
  } else if (/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?$/.test(price)) {
    normalized = price.replace(/[ \u00a0\u202f]/g, "").replace(",", ".");
  } else {
    throw new Error("importExport.errors.invalidPrice");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) {
    throw new Error("importExport.errors.invalidPrice");
  }
  return amount;
}

export function jsonToPayload(text: string): any[] {
  const obj = JSON.parse(text);
  normalizeImportCurrency(obj.currency);
  const categories = obj.categories || obj.menu || obj.sections || [];
  return categories.map((category: any, categoryIndex: number) => {
    const items = (
      category.items ||
      category.dishes ||
      category.products ||
      []
    ).map((item: any) => {
      let allergens = (item.allergens || []).map(normalizeImportTag);
      let dietaryTags = (item.dietaryTags || []).map(normalizeImportTag);
      if (item.tags && !item.allergens) {
        const split = splitImportTags(item.tags);
        allergens = split.allergens;
        dietaryTags = split.dietaryTags;
      }
      const options =
        item.options ||
        (item.variants?.length
          ? [
              {
                name: "Size / Variant",
                type: "VARIATION",
                choices: item.variants.map((variant: any) => ({
                  name: variant.name,
                  priceModifier: variant.priceModifier ?? variant.price,
                  weight: variant.weight || null,
                })),
              },
            ]
          : []);
      return {
        name: item.name,
        description: item.description || "",
        price: parseImportPrice(item.price),
        ...(item.costPrice != null
          ? { costPrice: parseImportPrice(item.costPrice) }
          : {}),
        weight: item.weight || null,
        currency: normalizeImportCurrency(item.currency ?? obj.currency),
        allergens,
        dietaryTags,
        options: options.map((option: any) => ({
          ...option,
          choices: (option.choices ?? []).map((choice: any) => ({
            name: choice.name,
            priceModifier: parseImportPrice(
              choice.priceModifier ?? choice.price,
            ),
            ...(choice.weight ? { weight: choice.weight } : {}),
          })),
        })),
        ...(item.translations ? { translations: item.translations } : {}),
        ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
        ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
        ...(typeof item.isOutOfStock === "boolean"
          ? { isOutOfStock: item.isOutOfStock }
          : typeof item.isAvailable === "boolean"
            ? { isOutOfStock: !item.isAvailable }
            : {}),
        ...(typeof item.isFeatured === "boolean"
          ? { isFeatured: item.isFeatured }
          : {}),
        ...(item.rewardPointsMode
          ? { rewardPointsMode: item.rewardPointsMode }
          : {}),
        ...(item.rewardPointsPrice
          ? { rewardPointsPrice: item.rewardPointsPrice }
          : {}),
      };
    });
    return {
      name: category.name,
      order: category.sort_order || category.order || categoryIndex + 1,
      items,
      ...(category.translations ? { translations: category.translations } : {}),
      ...(category.availabilityType
        ? { availabilityType: category.availabilityType }
        : {}),
      ...(category.imageUrl ? { imageUrl: category.imageUrl } : {}),
      ...(category.thumbnailUrl ? { thumbnailUrl: category.thumbnailUrl } : {}),
      ...(category.startTime ? { startTime: category.startTime } : {}),
      ...(category.endTime ? { endTime: category.endTime } : {}),
      ...(category.daysOfWeek?.length
        ? { daysOfWeek: category.daysOfWeek }
        : {}),
      ...(typeof category.isDrinkCategory === "boolean"
        ? { isDrinkCategory: category.isDrinkCategory }
        : {}),
    };
  });
}
