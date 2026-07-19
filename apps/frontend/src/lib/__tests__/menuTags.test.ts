import { describe, expect, it } from "vitest";
import {
  ALLERGEN_TAGS,
  DIETARY_TAGS,
  MENU_TAGS,
  resolveTag,
} from "../menuTags";

describe("resolveTag", () => {
  it("resolves a canonical key", () => {
    expect(resolveTag("gluten")?.key).toBe("gluten");
    expect(resolveTag("gluten-free")?.key).toBe("gluten-free");
  });

  it("resolves case-insensitively and trims whitespace", () => {
    expect(resolveTag("  Gluten  ")?.key).toBe("gluten");
    expect(resolveTag("MILK")?.key).toBe("milk");
  });

  it("resolves a legacy free-text alias", () => {
    expect(resolveTag("млечни продукти")?.key).toBe("milk");
    expect(resolveTag("dairy")?.key).toBe("milk");
    expect(resolveTag("вегетарианец")?.key).toBe("vegetarian");
  });

  it("returns null for genuinely custom text", () => {
    expect(resolveTag("chef's secret spice blend")).toBeNull();
    expect(resolveTag("")).toBeNull();
  });
});

describe("MENU_TAGS registry", () => {
  it("has no duplicate keys", () => {
    const keys = MENU_TAGS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers the EU-14 allergens and standard-10 + keto/paleo dietary set", () => {
    expect(ALLERGEN_TAGS).toHaveLength(14);
    expect(DIETARY_TAGS).toHaveLength(12);
    expect(DIETARY_TAGS.map((t) => t.key)).toEqual(
      expect.arrayContaining(["keto", "paleo"]),
    );
  });

  it("every tag has a resolvable labelKey namespace", () => {
    for (const tag of MENU_TAGS) {
      expect(tag.labelKey).toMatch(/^presetMenuTags\.(allergen|dietary)\./);
    }
  });
});
