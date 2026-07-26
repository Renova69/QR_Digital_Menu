import type { BulkEditItem } from "./api";

export type BulkColumnId =
  | "name"
  | "description"
  | "price"
  | "costPrice"
  | "weight"
  | "allergens"
  | "dietaryTags"
  | "isFeatured"
  | "isOutOfStock"
  | "rewardPointsMode"
  | "rewardPointsPrice";

export type BulkColumnType =
  | "text"
  | "longtext"
  | "number"
  | "tags"
  | "boolean"
  | "rewardMode";

export interface BulkColumnConfig {
  id: BulkColumnId;
  type: BulkColumnType;
  labelKey: string;
  labelDefault: string;
  alwaysVisible?: boolean;
  /** Tailwind min-width class — keeps header/body cells aligned and gives
   *  longer-content columns (name, description) room to actually be edited. */
  minWidthClass: string;
}

// The checkbox column is a fixed 2.5rem (w-10) — every sticky-left offset
// downstream (the frozen name column, the category-header bar) is pinned to
// that same value so there's no gap for scrolled-past columns to peek through.
export const CHECKBOX_COLUMN_WIDTH_CLASS = "w-10";
export const CHECKBOX_COLUMN_STICKY_OFFSET_CLASS = "left-10";

export const BULK_COLUMNS: Record<BulkColumnId, BulkColumnConfig> = {
  name: {
    id: "name",
    type: "text",
    labelKey: "bulkEdit.columns.name",
    labelDefault: "Item name",
    alwaysVisible: true,
    minWidthClass: "min-w-[11rem]",
  },
  description: {
    id: "description",
    type: "longtext",
    labelKey: "bulkEdit.columns.description",
    labelDefault: "Description",
    alwaysVisible: true,
    minWidthClass: "min-w-[22rem]",
  },
  price: {
    id: "price",
    type: "number",
    labelKey: "bulkEdit.columns.price",
    labelDefault: "Price (EUR)",
    alwaysVisible: true,
    minWidthClass: "min-w-[8rem]",
  },
  costPrice: {
    id: "costPrice",
    type: "number",
    labelKey: "bulkEdit.columns.costPrice",
    labelDefault: "Cost price",
    minWidthClass: "min-w-[8rem]",
  },
  weight: {
    id: "weight",
    type: "text",
    labelKey: "bulkEdit.columns.weight",
    labelDefault: "Weight",
    minWidthClass: "min-w-[7rem]",
  },
  allergens: {
    id: "allergens",
    type: "tags",
    labelKey: "bulkEdit.columns.allergens",
    labelDefault: "Allergens",
    minWidthClass: "min-w-[12rem]",
  },
  dietaryTags: {
    id: "dietaryTags",
    type: "tags",
    labelKey: "bulkEdit.columns.dietaryTags",
    labelDefault: "Dietary tags",
    minWidthClass: "min-w-[12rem]",
  },
  isFeatured: {
    id: "isFeatured",
    type: "boolean",
    labelKey: "bulkEdit.columns.isFeatured",
    labelDefault: "Featured",
    minWidthClass: "min-w-[7rem]",
  },
  isOutOfStock: {
    id: "isOutOfStock",
    type: "boolean",
    labelKey: "bulkEdit.columns.isOutOfStock",
    labelDefault: "Out of stock",
    minWidthClass: "min-w-[7rem]",
  },
  rewardPointsMode: {
    id: "rewardPointsMode",
    type: "rewardMode",
    labelKey: "bulkEdit.columns.rewardPointsMode",
    labelDefault: "Reward points mode",
    minWidthClass: "min-w-[9rem]",
  },
  rewardPointsPrice: {
    id: "rewardPointsPrice",
    type: "number",
    labelKey: "bulkEdit.columns.rewardPointsPrice",
    labelDefault: "Reward points price",
    minWidthClass: "min-w-[9rem]",
  },
};

export interface OptionalColumnGroup {
  id: string;
  labelKey: string;
  labelDefault: string;
  columns: BulkColumnId[];
}

// The "+" column picker adds/removes these as bundles, matching how the
// feature was scoped: allergens travel with dietary tags, weight with cost
// price, featured with out-of-stock, and the two reward-points fields together.
export const OPTIONAL_COLUMN_GROUPS: OptionalColumnGroup[] = [
  {
    id: "allergensDietary",
    labelKey: "bulkEdit.columnGroups.allergensDietary",
    labelDefault: "Allergens + Dietary tags",
    columns: ["allergens", "dietaryTags"],
  },
  {
    id: "weightCost",
    labelKey: "bulkEdit.columnGroups.weightCost",
    labelDefault: "Weight + Cost price",
    columns: ["weight", "costPrice"],
  },
  {
    id: "featuredStock",
    labelKey: "bulkEdit.columnGroups.featuredStock",
    labelDefault: "Featured + Out-of-stock",
    columns: ["isFeatured", "isOutOfStock"],
  },
  {
    id: "rewardPoints",
    labelKey: "bulkEdit.columnGroups.rewardPoints",
    labelDefault: "Reward points mode/price",
    columns: ["rewardPointsMode", "rewardPointsPrice"],
  },
];

export const ALWAYS_VISIBLE_COLUMNS: BulkColumnId[] = Object.values(
  BULK_COLUMNS,
)
  .filter((c) => c.alwaysVisible)
  .map((c) => c.id);

// ── Parsing (shared by manual cell edits and clipboard paste) ───────────────

export function parseBulkBoolean(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "y", "featured", "check"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", ""].includes(normalized)) {
    return false;
  }
  return undefined;
}

export function parseBulkNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return undefined;
  const parsed = parseFloat(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseBulkTagList(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const REWARD_POINTS_MODES = ["OFF", "AUTO", "CUSTOM"] as const;

export function parseRewardMode(
  raw: unknown,
): "OFF" | "AUTO" | "CUSTOM" | undefined {
  const normalized = String(raw ?? "")
    .trim()
    .toUpperCase();
  return (REWARD_POINTS_MODES as readonly string[]).includes(normalized)
    ? (normalized as "OFF" | "AUTO" | "CUSTOM")
    : undefined;
}

/** Parses one raw cell string into the typed value a column stores. */
export function parseCellValue(type: BulkColumnType, raw: unknown): unknown {
  switch (type) {
    case "number":
      return parseBulkNumber(raw);
    case "boolean":
      return parseBulkBoolean(raw);
    case "tags":
      return parseBulkTagList(raw);
    case "rewardMode":
      return parseRewardMode(raw);
    case "text":
    case "longtext":
    default:
      return String(raw ?? "").trim();
  }
}

/** Renders a typed cell value back to plain text — used for copy and display. */
export function serializeCellValue(
  type: BulkColumnType,
  value: unknown,
): string {
  if (value === null || value === undefined) return "";
  if (type === "tags" && Array.isArray(value)) return value.join(", ");
  if (type === "boolean") return value ? "true" : "false";
  return String(value);
}

// ── TSV clipboard (Excel/Sheets paste + copy) ────────────────────────────────

export function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
    .map((line) => line.split("\t"));
}

export function serializeTsv(rows: string[][]): string {
  return rows.map((row) => row.join("\t")).join("\n");
}

// ── Dirty-state diffing ──────────────────────────────────────────────────────

function valuesEqual(type: BulkColumnType, a: unknown, b: unknown): boolean {
  if (type === "tags") {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    return arrA.length === arrB.length && arrA.every((v, i) => v === arrB[i]);
  }
  // Treat null/undefined/"" as equivalent "empty" for text-like columns so a
  // cleared cell doesn't stay dirty when the original was also empty.
  if (type === "text" || type === "longtext") {
    return (a ?? "") === (b ?? "");
  }
  return a === b;
}

export type BulkEdits = Record<string, Partial<BulkEditItem>>;

/**
 * Immutably updates the edits map for one cell. Clears the field (and the
 * row entirely, if it was the last edited field) when the new value matches
 * the original — keeps the dirty count and the save payload minimal.
 */
export function setFieldEdit(
  edits: BulkEdits,
  itemId: string,
  field: BulkColumnId,
  newValue: unknown,
  original: BulkEditItem,
): BulkEdits {
  const type = BULK_COLUMNS[field].type;
  const isReverted = valuesEqual(type, newValue, (original as any)[field]);

  const existingRow = { ...(edits[itemId] || {}) };
  if (isReverted) {
    delete (existingRow as any)[field];
  } else {
    (existingRow as any)[field] = newValue;
  }

  const { [itemId]: _dropped, ...rest } = edits;
  return Object.keys(existingRow).length > 0
    ? { ...rest, [itemId]: existingRow }
    : rest;
}

export function effectiveValue(
  edits: BulkEdits,
  original: BulkEditItem,
  field: BulkColumnId,
): unknown {
  const row = edits[original.id];
  return row && field in row ? (row as any)[field] : (original as any)[field];
}

export function buildBulkUpdatePayload(
  edits: BulkEdits,
): { id: string }[] & Record<number, any> {
  return Object.entries(edits).map(([id, fields]) => ({ id, ...fields }));
}

// ── Bulk price adjustment ────────────────────────────────────────────────────

export type PriceAdjustMode = "percentage" | "fixed";

export interface PriceAdjustOptions {
  mode: PriceAdjustMode;
  sign: 1 | -1;
  value: number;
}

const MIN_PRICE = 0.01;

/** Applies a %/fixed adjustment, rounds to 2dp, floors at MIN_PRICE. */
export function applyPriceAdjustment(
  price: number,
  options: PriceAdjustOptions,
): number {
  const delta =
    options.mode === "percentage"
      ? price * (options.value / 100)
      : options.value;
  const raw = price + options.sign * delta;
  const rounded = Math.round(raw * 100) / 100;
  return Math.max(rounded, MIN_PRICE);
}
