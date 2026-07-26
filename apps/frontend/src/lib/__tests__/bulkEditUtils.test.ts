import { describe, expect, it } from "vitest";
import type { BulkEditItem } from "../api";
import {
  applyPriceAdjustment,
  buildBulkUpdatePayload,
  effectiveValue,
  parseBulkBoolean,
  parseBulkNumber,
  parseBulkTagList,
  parseCellValue,
  parseRewardMode,
  parseTsv,
  serializeCellValue,
  serializeTsv,
  setFieldEdit,
  type BulkEdits,
} from "../bulkEditUtils";

function makeItem(overrides: Partial<BulkEditItem> = {}): BulkEditItem {
  return {
    id: "item-1",
    name: "Margherita",
    description: "Classic",
    price: 10,
    costPrice: 3,
    weight: "300g",
    currency: "EUR",
    categoryId: "cat-1",
    allergens: ["gluten"],
    dietaryTags: ["vegetarian"],
    tags: [],
    isFeatured: false,
    isOutOfStock: false,
    rewardPointsMode: "OFF",
    rewardPointsPrice: null,
    ...overrides,
  };
}

describe("parseBulkBoolean", () => {
  it.each([
    ["true", true],
    ["1", true],
    ["yes", true],
    ["Featured", true],
    ["false", false],
    ["0", false],
    ["no", false],
    ["", false],
  ])("parses %s -> %s", (raw, expected) => {
    expect(parseBulkBoolean(raw)).toBe(expected);
  });

  it("returns undefined for unrecognized text", () => {
    expect(parseBulkBoolean("maybe")).toBeUndefined();
  });

  it("passes booleans through unchanged", () => {
    expect(parseBulkBoolean(true)).toBe(true);
    expect(parseBulkBoolean(false)).toBe(false);
  });
});

describe("parseBulkNumber", () => {
  it("parses plain numbers", () => {
    expect(parseBulkNumber("9.99")).toBe(9.99);
  });

  it("accepts comma as decimal separator", () => {
    expect(parseBulkNumber("9,99")).toBe(9.99);
  });

  it("returns undefined for empty or non-numeric input", () => {
    expect(parseBulkNumber("")).toBeUndefined();
    expect(parseBulkNumber("abc")).toBeUndefined();
  });

  it("passes finite numbers through unchanged", () => {
    expect(parseBulkNumber(5)).toBe(5);
    expect(parseBulkNumber(NaN)).toBeUndefined();
  });
});

describe("parseBulkTagList", () => {
  it("splits, trims, and drops empty entries", () => {
    expect(parseBulkTagList("gluten,  dairy ,, nuts")).toEqual([
      "gluten",
      "dairy",
      "nuts",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseBulkTagList("")).toEqual([]);
    expect(parseBulkTagList(undefined)).toEqual([]);
  });
});

describe("parseRewardMode", () => {
  it("accepts known modes case-insensitively", () => {
    expect(parseRewardMode("auto")).toBe("AUTO");
    expect(parseRewardMode("CUSTOM")).toBe("CUSTOM");
  });

  it("returns undefined for unknown values", () => {
    expect(parseRewardMode("nope")).toBeUndefined();
  });
});

describe("parseCellValue / serializeCellValue", () => {
  it("round-trips a tags column", () => {
    const parsed = parseCellValue("tags", "gluten, dairy");
    expect(parsed).toEqual(["gluten", "dairy"]);
    expect(serializeCellValue("tags", parsed)).toBe("gluten, dairy");
  });

  it("round-trips a boolean column", () => {
    expect(parseCellValue("boolean", "true")).toBe(true);
    expect(serializeCellValue("boolean", true)).toBe("true");
  });

  it("round-trips a number column", () => {
    expect(parseCellValue("number", "12.5")).toBe(12.5);
    expect(serializeCellValue("number", 12.5)).toBe("12.5");
  });

  it("serializes null/undefined as empty string", () => {
    expect(serializeCellValue("text", null)).toBe("");
    expect(serializeCellValue("text", undefined)).toBe("");
  });
});

describe("parseTsv / serializeTsv", () => {
  it("parses tab/newline separated clipboard text", () => {
    expect(parseTsv("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("ignores a single trailing newline (common Excel/Sheets copy artifact)", () => {
    expect(parseTsv("a\tb\n")).toEqual([["a", "b"]]);
  });

  it("round-trips through serializeTsv", () => {
    const rows = [
      ["1", "2"],
      ["3", "4"],
    ];
    expect(parseTsv(serializeTsv(rows))).toEqual(rows);
  });
});

describe("setFieldEdit", () => {
  const original = makeItem();

  it("adds a field edit when the value differs from the original", () => {
    const edits = setFieldEdit({}, "item-1", "price", 12, original);
    expect(edits).toEqual({ "item-1": { price: 12 } });
  });

  it("clears the field (and the row) when reverted back to the original value", () => {
    const withEdit: BulkEdits = { "item-1": { price: 12 } };
    const cleared = setFieldEdit(withEdit, "item-1", "price", 10, original);
    expect(cleared).toEqual({});
  });

  it("clears only the touched field, keeping sibling edits on the same row", () => {
    const withEdits: BulkEdits = { "item-1": { price: 12, name: "New Name" } };
    const result = setFieldEdit(withEdits, "item-1", "price", 10, original);
    expect(result).toEqual({ "item-1": { name: "New Name" } });
  });

  it("treats tag-array edits as equal by content, not reference", () => {
    const edits = setFieldEdit({}, "item-1", "allergens", ["gluten"], original);
    expect(edits).toEqual({});
  });

  it("treats null and empty-string description as equivalent", () => {
    const withNullDescription = makeItem({ description: null });
    const edits = setFieldEdit(
      {},
      "item-1",
      "description",
      "",
      withNullDescription,
    );
    expect(edits).toEqual({});
  });
});

describe("effectiveValue", () => {
  const original = makeItem();

  it("returns the original value when there is no edit", () => {
    expect(effectiveValue({}, original, "price")).toBe(10);
  });

  it("returns the edited value when present", () => {
    const edits: BulkEdits = { "item-1": { price: 15 } };
    expect(effectiveValue(edits, original, "price")).toBe(15);
  });
});

describe("buildBulkUpdatePayload", () => {
  it("maps the edits map into an array of {id, ...fields}", () => {
    const edits: BulkEdits = {
      "item-1": { price: 12 },
      "item-2": { name: "Renamed" },
    };
    expect(buildBulkUpdatePayload(edits)).toEqual([
      { id: "item-1", price: 12 },
      { id: "item-2", name: "Renamed" },
    ]);
  });

  it("returns an empty array when there are no edits", () => {
    expect(buildBulkUpdatePayload({})).toEqual([]);
  });
});

describe("applyPriceAdjustment", () => {
  it("increases by a percentage", () => {
    expect(
      applyPriceAdjustment(10, { mode: "percentage", sign: 1, value: 10 }),
    ).toBe(11);
  });

  it("decreases by a percentage", () => {
    expect(
      applyPriceAdjustment(10, { mode: "percentage", sign: -1, value: 10 }),
    ).toBe(9);
  });

  it("applies a fixed amount", () => {
    expect(
      applyPriceAdjustment(10, { mode: "fixed", sign: 1, value: 0.5 }),
    ).toBe(10.5);
  });

  it("rounds to 2 decimal places", () => {
    expect(
      applyPriceAdjustment(10.004, { mode: "fixed", sign: 1, value: 0 }),
    ).toBe(10);
    expect(
      applyPriceAdjustment(10.006, { mode: "fixed", sign: 1, value: 0 }),
    ).toBe(10.01);
  });

  it("floors at the minimum price instead of going to zero or negative", () => {
    expect(applyPriceAdjustment(1, { mode: "fixed", sign: -1, value: 5 })).toBe(
      0.01,
    );
  });
});
