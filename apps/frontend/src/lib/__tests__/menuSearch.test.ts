import { describe, it, expect } from "vitest";
import { searchMenuItems } from "../menuSearch";
import type { Item } from "../../types";

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    name: "Greek Salad",
    description: "Tomatoes, cucumbers, olives, feta",
    price: 9.9,
    currency: "EUR",
    categoryId: "cat-1",
    allergens: ["milk"],
    dietaryTags: ["vegetarian"],
    options: [
      {
        id: "opt-1",
        name: "Size",
        type: "VARIATION",
        choices: [{ name: "Large", priceModifier: 1.5 }],
        menuItemId: "item-1",
      },
    ],
    ...overrides,
  } as Item;
}

const labelize = (key: string) =>
  key
    .replace("presetMenuTags.allergen.", "")
    .replace("presetMenuTags.dietary.", "");

describe("searchMenuItems", () => {
  const itemsByCategory = { "cat-1": [makeItem()] };
  const categoryNameById = { "cat-1": "Salads" };

  it("matches by item name", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "greek",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("matches by description", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "feta",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("matches by price", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "9.90",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("matches by allergen key", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "milk",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("matches by dietary tag label", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "vegetarian",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("matches by category name", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "salads",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("matches by option choice name", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "large",
      labelize,
    );
    expect(results).toHaveLength(1);
  });

  it("returns nothing for an unmatched query", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "sushi",
      labelize,
    );
    expect(results).toHaveLength(0);
  });

  it("returns nothing for an empty query", () => {
    const results = searchMenuItems(
      itemsByCategory,
      categoryNameById,
      "  ",
      labelize,
    );
    expect(results).toHaveLength(0);
  });
});
