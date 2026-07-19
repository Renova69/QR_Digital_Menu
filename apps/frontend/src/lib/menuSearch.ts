import type { Item } from "../types";
import { resolveTag } from "./menuTags";

export interface MenuSearchResult {
  item: Item;
  categoryId: string;
  categoryName: string;
}

/**
 * Matches a raw tag value against both its stored key ("gluten-free") and its
 * localized display label ("Gluten Free") so searching either finds it.
 */
function tagMatches(tag: string, q: string, labelize: (key: string) => string) {
  if (tag.toLowerCase().includes(q)) return true;
  const preset = resolveTag(tag);
  if (preset && labelize(preset.labelKey).toLowerCase().includes(q))
    return true;
  return false;
}

/**
 * Searches every field an owner might plausibly look an item up by — name,
 * description, price, weight, currency, allergens/dietary tags (key or
 * label), option/choice names, and the parent category name — across the
 * whole menu (all categories), not just the one currently selected in the
 * editor.
 */
export function searchMenuItems(
  itemsByCategory: Record<string, Item[]> | undefined,
  categoryNameById: Record<string, string>,
  query: string,
  labelize: (key: string) => string,
): MenuSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q || !itemsByCategory) return [];

  const results: MenuSearchResult[] = [];

  for (const [categoryId, items] of Object.entries(itemsByCategory)) {
    const categoryName = categoryNameById[categoryId] ?? "";

    for (const item of items) {
      const haystacks: string[] = [
        item.name,
        item.originalName ?? "",
        item.description ?? "",
        item.originalDescription ?? "",
        item.currency ?? "",
        categoryName,
        String(item.price ?? ""),
        typeof item.price === "number" ? item.price.toFixed(2) : "",
      ];

      let matched = haystacks.some((h) => h.toLowerCase().includes(q));

      if (!matched) {
        matched =
          (item.allergens ?? []).some((tag) => tagMatches(tag, q, labelize)) ||
          (item.dietaryTags ?? []).some((tag) => tagMatches(tag, q, labelize));
      }

      if (!matched) {
        matched = (item.options ?? []).some(
          (opt) =>
            opt.name.toLowerCase().includes(q) ||
            opt.choices.some((c) => c.name.toLowerCase().includes(q)),
        );
      }

      if (matched) {
        results.push({ item, categoryId, categoryName });
      }
    }
  }

  return results;
}
