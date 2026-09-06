import { useState, useRef, useCallback, useContext, useEffect } from "react";
import {
  Upload,
  Key,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  FileJson,
  FileText,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
import { readSheet as readXlsxSheet } from "read-excel-file/browser";
import { downloadMenuExport } from "../../lib/menuExport";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { resolveTag } from "../../lib/menuTags";
import {
  getImportApiKey,
  regenerateImportApiKey,
  confirmMenuImport,
  exportMenu,
} from "../../lib/api";
import { getApiError } from "../../lib/apiError";
import { DashboardButton } from "../../components/dashboard/DashboardButton";
import { dashboardSurface } from "../../components/dashboard/dashboardUi";

type SubTabId = "import" | "export";

const KNOWN_ALLERGENS = [
  "nuts",
  "dairy",
  "soy",
  "gluten",
  "peanuts",
  "shellfish",
  "egg",
];
const MAX_IMPORT_FILE_SIZE = 1 * 1024 * 1024; // 1MB — matches server body-parser limit
const IMPORT_ERROR_DEFAULTS = {
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
    "The file could not be read. Check its format and try again.",
  "importExport.errors.invalidPrice":
    "Use a valid euro price with at most two decimal places (for example 12.50 or 12,50).",
  "importExport.errors.eurOnly": "Only EUR prices can be imported.",
} as const;

type ImportErrorKey = keyof typeof IMPORT_ERROR_DEFAULTS;

// Normalizes a raw imported tag to its canonical preset key (e.g. "Gluten" /
// "gluten-free" / "без глутен" -> "gluten-free") when it matches a known
// allergen/dietary preset; otherwise passes the trimmed text through
// unchanged (legacy/custom tags keep working).
function normalizeTag(raw: string): string {
  const trimmed = raw.trim();
  return resolveTag(trimmed)?.key ?? trimmed;
}

// Splits a single combined "tags" column into allergens vs. dietary tags —
// used by import formats that don't separate the two (legacy CSV/XLSX/JSON).
// Preset values are classified via the shared registry (and normalized to
// their canonical key); anything unrecognized falls back to the old
// substring heuristic so custom/legacy tags keep their prior behavior.
function splitTags(tags: string[]) {
  const allergens: string[] = [];
  const dietaryTags: string[] = [];
  for (const raw of tags) {
    const preset = resolveTag(raw);
    if (preset) {
      (preset.kind === "allergen" ? allergens : dietaryTags).push(preset.key);
      continue;
    }
    const trimmed = raw.trim();
    const isKnownAllergen = KNOWN_ALLERGENS.some((a) =>
      trimmed.toLowerCase().includes(a),
    );
    (isKnownAllergen ? allergens : dietaryTags).push(trimmed);
  }
  return { allergens, dietaryTags };
}

export function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      fields.push(field);
      if (fields.some((value) => value.trim())) rows.push(fields);
      fields = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("importExport.errors.csvUnclosedQuote");
  fields.push(field);
  if (fields.some((value) => value.trim())) rows.push(fields);
  return rows;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["true", "1", "yes", "y", "available", "check"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n", "unavailable", "cross"].includes(normalized)) {
    return false;
  }
  return undefined;
}

function normalizeCurrency(value: unknown): "EUR" {
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
  if (!Number.isFinite(amount))
    throw new Error("importExport.errors.invalidPrice");
  return amount;
}

function parseVariants(str: string) {
  if (!str) return [];
  return str
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const parts = v.split(":");
      return {
        name: parts[0]?.trim() || "",
        priceModifier: parseImportPrice(parts[1]),
        weight: parts[2]?.trim() || null,
      };
    });
}

function splitCommaList(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

// Resolves allergens/dietaryTags for one imported row. Prefers separate
// "allergens" / "dietary_tags" columns (our own export's shape — each token
// normalized to its preset key via the registry); falls back to splitting a
// single combined "tags" column (legacy/external spreadsheet shape) when
// those columns aren't present.
function resolveRowTags(row: Record<string, string>): {
  allergens: string[];
  dietaryTags: string[];
} {
  const hasSeparateColumns =
    row["allergens"] !== undefined || row["dietary_tags"] !== undefined;
  if (hasSeparateColumns) {
    return {
      allergens: splitCommaList(row["allergens"]).map(normalizeTag),
      dietaryTags: splitCommaList(row["dietary_tags"]).map(normalizeTag),
    };
  }
  return splitTags(splitCommaList(row["tags"]));
}

export function csvToPayload(text: string): any[] {
  const rows = parseCSVRows(text);
  if (rows.length < 2) throw new Error("importExport.errors.csvNoRows");
  const headers = rows[0].map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_"),
  );
  if (!headers.includes("category") || !headers.includes("item_name")) {
    throw new Error("importExport.errors.csvMissingColumns");
  }
  const catMap = new Map<string, any[]>();
  for (const fields of rows.slice(1)) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (fields[i] || "").trim();
    });
    const catName = row["category"];
    if (!catName) continue;
    if (!catMap.has(catName)) catMap.set(catName, []);
    const { allergens, dietaryTags } = resolveRowTags(row);
    const variants = parseVariants(row["variants"] || "");
    const isAvailable = parseBoolean(row["is_available"]);
    const isOutOfStock = parseBoolean(row["is_out_of_stock"]);
    const isFeatured = parseBoolean(row["is_featured"]);
    catMap.get(catName)!.push({
      name: row["item_name"] || "",
      description: row["description"] || "",
      price: parseImportPrice(row["price"]),
      weight: row["weight"] || null,
      currency: normalizeCurrency(row["currency"]),
      allergens,
      dietaryTags,
      options: variants.length
        ? [{ name: "Size / Variant", type: "VARIATION", choices: variants }]
        : [],
      ...(isOutOfStock !== undefined
        ? { isOutOfStock }
        : isAvailable !== undefined
          ? { isOutOfStock: !isAvailable }
          : {}),
      ...(isFeatured !== undefined ? { isFeatured } : {}),
    });
  }
  return Array.from(catMap.entries()).map(([name, items], i) => ({
    name,
    order: i + 1,
    items,
  }));
}

export function jsonToPayload(text: string): any[] {
  const obj = JSON.parse(text);
  normalizeCurrency(obj.currency);
  const cats = obj.categories || obj.menu || obj.sections || [];
  return cats.map((cat: any, i: number) => {
    const items = (cat.items || cat.dishes || cat.products || []).map(
      (item: any) => {
        let allergens = (item.allergens || []).map(normalizeTag);
        let dietaryTags = (item.dietaryTags || []).map(normalizeTag);
        if (item.tags && !item.allergens) {
          const split = splitTags(item.tags);
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
                  choices: item.variants.map((v: any) => ({
                    name: v.name,
                    priceModifier: v.priceModifier ?? v.price,
                    weight: v.weight || null,
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
          currency: normalizeCurrency(item.currency ?? obj.currency),
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
      },
    );
    return {
      name: cat.name,
      order: cat.sort_order || cat.order || i + 1,
      items,
      ...(cat.translations ? { translations: cat.translations } : {}),
      ...(cat.availabilityType
        ? { availabilityType: cat.availabilityType }
        : {}),
      ...(cat.imageUrl ? { imageUrl: cat.imageUrl } : {}),
      ...(cat.thumbnailUrl ? { thumbnailUrl: cat.thumbnailUrl } : {}),
      ...(cat.startTime ? { startTime: cat.startTime } : {}),
      ...(cat.endTime ? { endTime: cat.endTime } : {}),
      ...(cat.daysOfWeek?.length ? { daysOfWeek: cat.daysOfWeek } : {}),
      ...(typeof cat.isDrinkCategory === "boolean"
        ? { isDrinkCategory: cat.isDrinkCategory }
        : {}),
    };
  });
}

// XLSX export column order: Category, Item Name, Description, Price, Weight, Currency, Tags, Variants
export async function xlsxToPayload(file: File): Promise<any[]> {
  const rows = (await readXlsxSheet(file)) as unknown as any[][];
  if (rows.length < 2) throw new Error("importExport.errors.xlsxNoRows");

  const headers = rows[0].map((h: any) =>
    String(h ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_"),
  );

  const col = (name: string) => headers.indexOf(name);
  const catIdx = col("category");
  const nameIdx = col("item_name");
  const descIdx = col("description");
  const priceIdx = col("price");
  const weightIdx = col("weight");
  const currencyIdx = col("currency");
  const tagsIdx = col("tags");
  const allergensIdx = col("allergens");
  const dietaryTagsIdx = col("dietary_tags");
  const variantsIdx = col("variants");
  const availableIdx = col("is_available");
  const outOfStockIdx = col("is_out_of_stock");
  const featuredIdx = col("is_featured");

  if (catIdx === -1 || nameIdx === -1)
    throw new Error("importExport.errors.xlsxMissingColumns");

  const catMap = new Map<string, any[]>();
  for (const row of rows.slice(1)) {
    const catName = String(row[catIdx] ?? "").trim();
    if (!catName) continue;
    if (!catMap.has(catName)) catMap.set(catName, []);

    // Prefer separate Allergens / Dietary Tags columns (our own export's
    // shape — each token normalized to its preset key) over a single
    // combined "tags" column (legacy/external spreadsheet shape).
    const hasSeparateTagColumns = allergensIdx >= 0 || dietaryTagsIdx >= 0;
    const { allergens, dietaryTags } = hasSeparateTagColumns
      ? {
          allergens: (allergensIdx >= 0 && row[allergensIdx]
            ? String(row[allergensIdx]).split(",")
            : []
          )
            .map((t: string) => t.trim())
            .filter(Boolean)
            .map(normalizeTag),
          dietaryTags: (dietaryTagsIdx >= 0 && row[dietaryTagsIdx]
            ? String(row[dietaryTagsIdx]).split(",")
            : []
          )
            .map((t: string) => t.trim())
            .filter(Boolean)
            .map(normalizeTag),
        }
      : splitTags(
          tagsIdx >= 0 && row[tagsIdx]
            ? String(row[tagsIdx])
                .split(",")
                .map((t: string) => t.trim())
                .filter(Boolean)
            : [],
        );
    const variants =
      variantsIdx >= 0 ? parseVariants(String(row[variantsIdx] ?? "")) : [];
    const isAvailable =
      availableIdx >= 0 ? parseBoolean(row[availableIdx]) : undefined;
    const isOutOfStock =
      outOfStockIdx >= 0 ? parseBoolean(row[outOfStockIdx]) : undefined;
    const isFeatured =
      featuredIdx >= 0 ? parseBoolean(row[featuredIdx]) : undefined;

    catMap.get(catName)!.push({
      name: String(row[nameIdx] ?? "").trim(),
      description: descIdx >= 0 ? String(row[descIdx] ?? "").trim() : "",
      price: parseImportPrice(priceIdx >= 0 ? row[priceIdx] : undefined),
      weight: weightIdx >= 0 && row[weightIdx] ? String(row[weightIdx]) : null,
      currency: normalizeCurrency(
        currencyIdx >= 0 ? row[currencyIdx] : undefined,
      ),
      allergens,
      dietaryTags,
      options: variants.length
        ? [{ name: "Size / Variant", type: "VARIATION", choices: variants }]
        : [],
      ...(isOutOfStock !== undefined
        ? { isOutOfStock }
        : isAvailable !== undefined
          ? { isOutOfStock: !isAvailable }
          : {}),
      ...(isFeatured !== undefined ? { isFeatured } : {}),
    });
  }
  return Array.from(catMap.entries()).map(([name, items], i) => ({
    name,
    order: i + 1,
    items,
  }));
}

// ── API Key Panel ──────────────────────────────────────────────────────────────

function ApiKeyPanel({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  // Plaintext key captured the one time it's returned (first creation or
  // regeneration). The stored key is hashed and can never be re-displayed (#10).
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRegen, setShowRegen] = useState(false);

  useEffect(() => {
    setFullKey(null);
    setCopied(false);
    setShowRegen(false);
  }, [restaurantId]);

  const { data } = useQuery({
    queryKey: ["import-api-key", restaurantId],
    queryFn: () => getImportApiKey(restaurantId),
    enabled: !!restaurantId,
  });

  // First load on a fresh restaurant returns a freshly-generated key once.
  const oneTimeKey = fullKey ?? data?.apiKey ?? null;
  const isConfigured = !!oneTimeKey || !!data?.configured;

  const regenMutation = useMutation({
    mutationFn: () => regenerateImportApiKey(restaurantId),
    onSuccess: (d) => {
      setFullKey(d.apiKey);
      setShowRegen(false);
      queryClient.invalidateQueries({
        queryKey: ["import-api-key", restaurantId],
      });
    },
  });

  const copyKey = async () => {
    if (!oneTimeKey) return;
    await navigator.clipboard.writeText(oneTimeKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apiUrl = `${(import.meta as any).env?.VITE_API_URL || "http://localhost:3000/api"}/restaurants/${restaurantId}/menu/import`;

  return (
    <div
      className={`glass-panel ${dashboardSurface.roomy} space-y-5 rounded-2xl border border-white/10`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Key className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-sm uppercase tracking-widest text-foreground">
            {t("importExport.ocrApiKey", "OCR API Key")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              "importExport.ocrApiKeyDesc",
              "Used by the offline OCR tool to push menus directly",
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 bg-secondary/60 rounded-xl px-4 py-3 text-sm font-mono text-foreground truncate border border-border/40">
          {oneTimeKey ??
            (isConfigured
              ? "•••••••• " +
                t("importExport.keyHidden", "key hidden") +
                " ••••••••"
              : "—")}
        </code>
        {oneTimeKey && (
          <DashboardButton
            density="icon"
            onClick={copyKey}
            className="border border-border/40 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            title={t("importExport.copyKey", "Copy")}
            aria-label={t("importExport.copyKey", "Copy")}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </DashboardButton>
        )}
      </div>

      {oneTimeKey ? (
        <p className="text-xs text-amber-500 font-medium">
          {t(
            "importExport.saveKeyNow",
            "Copy this key now — for security it is not stored in readable form and cannot be shown again.",
          )}
        </p>
      ) : (
        isConfigured && (
          <p className="text-xs text-muted-foreground">
            {t(
              "importExport.keyConfigured",
              "A key is configured. It cannot be displayed again — regenerate to issue a new one.",
            )}
          </p>
        )
      )}

      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold uppercase tracking-wider">
          {t("importExport.curlExample", "curl example")}
        </summary>
        <pre className="mt-2 bg-secondary/40 rounded-xl p-4 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
          {`POST ${apiUrl}
Authorization: Bearer <API_KEY>
Content-Type: application/json

{ "restaurantId": "${restaurantId}", "categories": [...] }`}
        </pre>
      </details>

      {showRegen ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive flex-1">
            {t(
              "importExport.regenerateWarning",
              "This will invalidate the current key. The OCR tool will need the new key.",
            )}
          </p>
          <DashboardButton
            density="compact"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            className="bg-destructive text-white hover:bg-destructive/80"
          >
            {regenMutation.isPending ? "..." : t("common.confirm", "Confirm")}
          </DashboardButton>
          <DashboardButton
            density="compact"
            onClick={() => setShowRegen(false)}
            className="text-muted-foreground hover:bg-background/70 hover:text-foreground"
          >
            {t("common.cancel", "Cancel")}
          </DashboardButton>
        </div>
      ) : (
        <DashboardButton
          density="compact"
          onClick={() => setShowRegen(true)}
          className="text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <RefreshCw className="w-3 h-3" />
          {t("importExport.regenerateKey", "Regenerate key")}
        </DashboardButton>
      )}
    </div>
  );
}

// ── File Importer ──────────────────────────────────────────────────────────────

interface ParsedMenu {
  categories: any[];
  filename: string;
  format: "json" | "csv";
  totalItems: number;
  error?: string;
}

function FileImporter({
  onParsed,
}: {
  onParsed: (m: ParsedMenu | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const getImportError = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      const key: ImportErrorKey = Object.prototype.hasOwnProperty.call(
        IMPORT_ERROR_DEFAULTS,
        message,
      )
        ? (message as ImportErrorKey)
        : "importExport.errors.parseFailed";
      return t(key, IMPORT_ERROR_DEFAULTS[key]);
    },
    [t],
  );

  const processFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        onParsed({
          categories: [],
          filename: file.name,
          format: "json",
          totalItems: 0,
          error: t(
            "importExport.errors.fileTooLarge",
            "Import files must be 1MB or smaller.",
          ),
        });
        return;
      }
      if (ext !== "json" && ext !== "csv" && ext !== "xlsx") {
        onParsed({
          categories: [],
          filename: file.name,
          format: "json",
          totalItems: 0,
          error: t(
            "importExport.errors.unsupportedFormat",
            "Only .json, .csv, and .xlsx files are supported.",
          ),
        });
        return;
      }
      if (ext === "xlsx") {
        xlsxToPayload(file)
          .then((categories) => {
            const totalItems = categories.reduce(
              (s: number, c: any) => s + (c.items?.length || 0),
              0,
            );
            onParsed({
              categories,
              filename: file.name,
              format: "json",
              totalItems,
            });
          })
          .catch((err: any) => {
            onParsed({
              categories: [],
              filename: file.name,
              format: "json",
              totalItems: 0,
              error: getImportError(err),
            });
          });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const categories =
            ext === "csv" ? csvToPayload(text) : jsonToPayload(text);
          const totalItems = categories.reduce(
            (s: number, c: any) => s + (c.items?.length || 0),
            0,
          );
          onParsed({
            categories,
            filename: file.name,
            format: ext as "json" | "csv",
            totalItems,
          });
        } catch (err: any) {
          onParsed({
            categories: [],
            filename: file.name,
            format: ext as "json" | "csv",
            totalItems: 0,
            error: getImportError(err),
          });
        }
      };
      reader.readAsText(file, "utf-8");
    },
    [getImportError, onParsed, t],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-all sm:p-10 ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border/40 hover:border-primary/50 hover:bg-secondary/30"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".json,.csv,.xlsx"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) processFile(f);
        }}
      />
      <div className="flex flex-col items-center gap-3">
        <Upload
          className={`w-8 h-8 transition-colors ${dragging ? "text-primary" : "text-muted-foreground"}`}
        />
        <div>
          <p className="font-bold text-sm text-foreground">
            {t(
              "importExport.dropFileHere",
              "Drop file here or click to browse",
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("importExport.acceptsFormats", "Accepts")}{" "}
            <code className="bg-secondary px-1 rounded">
              {t("auto.Json", ".json")}
            </code>{" "}
            <code className="bg-secondary px-1 rounded">
              {t("auto.Csv", ".csv")}
            </code>{" "}
            <code className="bg-secondary px-1 rounded">
              {t("auto.Xlsx", ".xlsx")}
            </code>
          </p>
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileJson className="w-3.5 h-3.5" />
            <span>
              {t("importExport.fullJsonFormat", "Full JSON / SaaS push format")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            <span>{t("importExport.csvFlatExport", "CSV flat export")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5 text-green-500" />
            <span>{t("importExport.xlsxImport", "XLSX (exported menu)")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Preview Table ──────────────────────────────────────────────────────────────

function PreviewTable({
  parsed,
  onClear,
}: {
  parsed: ParsedMenu;
  onClear: () => void;
}) {
  const totalCats = parsed.categories.length;
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-black text-sm uppercase tracking-widest text-foreground">
            {parsed.filename}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCats}{" "}
            {totalCats === 1
              ? t("importExport.category", "category")
              : t("importExport.categories", "categories")}{" "}
            · {parsed.totalItems} {t("importExport.items", "items")}
          </p>
        </div>
        <DashboardButton
          density="compact"
          onClick={onClear}
          className="text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t("common.clear", "Clear")}
        </DashboardButton>
      </div>

      <div className="rounded-2xl border border-border/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/60 border-b border-border/40">
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                {t("importExport.categoryHeader", "Category")}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                {t("importExport.itemHeader", "Item")}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                {t("importExport.priceHeader", "Price")}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">
                {t("importExport.weightHeader", "Weight")}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden lg:table-cell">
                {t("importExport.tagsHeader", "Tags")}
              </th>
            </tr>
          </thead>
          <tbody>
            {parsed.categories.flatMap((cat) =>
              (cat.items || []).map((item: any, i: number) => (
                <tr
                  key={`${cat.name}-${i}`}
                  className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                >
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">
                    {i === 0 ? cat.name : ""}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {item.name}
                  </td>
                  <td
                    className={`px-4 py-2.5 font-mono text-sm ${!item.price ? "text-amber-500" : "text-foreground"}`}
                  >
                    {item.price ? `${item.price} EUR` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {item.weight || "—"}
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {[
                        ...(item.allergens || []),
                        ...(item.dietaryTags || []),
                      ].map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>

      {parsed.categories
        .flatMap((c: any) => c.items || [])
        .some((i: any) => !i.price) && (
        <p className="flex items-center gap-2 text-xs text-amber-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {t(
            "importExport.noPrice",
            "Items with no price are highlighted in amber. They will import with price 0.",
          )}
        </p>
      )}
    </div>
  );
}

// ── Import Tab ─────────────────────────────────────────────────────────────────

function ImportTab({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [parsed, setParsed] = useState<ParsedMenu | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    created: number;
    updated: number;
    categories: number;
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: (payload: any) => confirmMenuImport(restaurantId, payload),
    onSuccess: (data) => {
      setResult(data);
      setParsed(null);
      queryClient.invalidateQueries({ queryKey: ["menu"] });
      queryClient.invalidateQueries({ queryKey: ["categories", restaurantId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const handleConfirm = () => {
    if (!parsed) return;
    importMutation.mutate({ categories: parsed.categories });
  };

  return (
    <div className="space-y-8">
      {result && (
        <div className="flex items-start gap-4 rounded-2xl border border-green-500/20 bg-green-500/5 p-4 sm:p-5">
          <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm text-foreground">
              {t("importExport.importComplete", "Import complete")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                "importExport.importResult",
                "{{created}} items created · {{updated}} items updated · {{categories}} new categories",
                {
                  created: result.created,
                  updated: result.updated,
                  categories: result.categories,
                },
              )}
            </p>
          </div>
          <DashboardButton
            density="compact"
            onClick={() => setResult(null)}
            className="ml-auto text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            {t("common.dismiss", "Dismiss")}
          </DashboardButton>
        </div>
      )}

      <ApiKeyPanel key={restaurantId} restaurantId={restaurantId} />

      <div
        className={`glass-panel ${dashboardSurface.roomy} space-y-6 rounded-2xl border border-white/10`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-foreground">
              {t("importExport.fileImport", "File Import")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "importExport.fileImportDesc",
                "Upload a JSON or CSV export from the OCR tool",
              )}
            </p>
          </div>
        </div>

        {parsed?.error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{parsed.error}</p>
            <DashboardButton
              density="compact"
              onClick={() => setParsed(null)}
              className="ml-auto text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              {t("common.dismiss", "Dismiss")}
            </DashboardButton>
          </div>
        ) : parsed ? (
          <>
            <PreviewTable parsed={parsed} onClear={() => setParsed(null)} />
            <div className="flex items-center justify-end gap-3 pt-2">
              <DashboardButton
                onClick={() => setParsed(null)}
                className="text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              >
                {t("common.cancel", "Cancel")}
              </DashboardButton>
              <DashboardButton
                onClick={handleConfirm}
                disabled={importMutation.isPending}
                className="brand-cta text-white hover:opacity-90"
              >
                {importMutation.isPending
                  ? t("importExport.importing", "Importing…")
                  : t(
                      "importExport.confirmImport",
                      "Confirm Import ({{count}} items)",
                      { count: parsed.totalItems },
                    )}
              </DashboardButton>
            </div>
            {importMutation.isError && (
              <p className="text-xs text-destructive">
                {t(getApiError(importMutation.error))}
              </p>
            )}
          </>
        ) : (
          <FileImporter onParsed={setParsed} />
        )}
      </div>
    </div>
  );
}

// ── Export Tab ─────────────────────────────────────────────────────────────────

function ExportTab({ restaurantId }: { restaurantId: string }) {
  const { t } = useTranslation();
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["menu-export", restaurantId],
    queryFn: () => exportMenu(restaurantId),
    enabled: false, // fetch only on button click
  });

  const downloadJSON = useCallback(
    (exportData: any) => {
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `menu-export-${restaurantId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [restaurantId],
  );

  const copyJSON = async (exportData: any) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable in this context
    }
  };

  const handleExport = async () => {
    const result = await refetch();
    if (result.data) {
      downloadJSON(result.data);
    }
  };

  const handleExportXLSX = async () => {
    const result = await refetch();
    if (result.data) {
      await downloadMenuExport(result.data, t, activeRestaurant?.name);
    }
  };

  const handleCopyJSON = async () => {
    const result = await refetch();
    if (result.data) {
      await copyJSON(result.data);
    }
  };

  const catCount = data?.categories?.length || 0;
  const itemCount =
    data?.categories?.reduce(
      (s: number, c: any) => s + (c.items?.length || 0),
      0,
    ) || 0;

  return (
    <div className="space-y-6">
      {/* Export actions */}
      <div
        className={`glass-panel ${dashboardSurface.roomy} space-y-5 rounded-2xl border border-white/10`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-foreground">
              {t("importExport.exportMenu", "Export Menu")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "importExport.exportMenuDesc",
                "Download your full menu as JSON or CSV for backup, cross-location cloning, or offline editing.",
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <DashboardButton
            onClick={handleExport}
            disabled={isLoading}
            className="bg-foreground text-background hover:-translate-y-0.5 hover:shadow-lg"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileJson className="w-4 h-4" />
            )}
            {t("importExport.downloadJson", "Download JSON")}
          </DashboardButton>
          <DashboardButton
            onClick={handleExportXLSX}
            disabled={isLoading}
            className="border border-border/40 hover:bg-secondary/60"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {t("importExport.downloadXlsx", "Download XLSX")}
          </DashboardButton>
          <DashboardButton
            onClick={handleCopyJSON}
            disabled={isLoading}
            className="border border-border/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied
              ? t("common.copied", "Copied")
              : t("importExport.copyJson", "Copy JSON")}
          </DashboardButton>
        </div>

        {/* Preview stats if data loaded */}
        {data && !isLoading && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/40 text-xs text-muted-foreground">
            <Check className="w-3.5 h-3.5 text-green-500" />
            {t(
              "importExport.menuReady",
              "Menu ready: {{catCount}} {{catLabel}} · {{itemCount}} {{itemLabel}}",
              {
                catCount,
                catLabel:
                  catCount === 1
                    ? t("importExport.category", "category")
                    : t("importExport.categories", "categories"),
                itemCount,
                itemLabel:
                  itemCount === 1
                    ? t("importExport.item", "item")
                    : t("importExport.items", "items"),
              },
            )}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{t(getApiError(error))}</p>
          </div>
        )}
      </div>

      {/* Format info */}
      <div
        className={`glass-panel ${dashboardSurface.roomy} space-y-4 rounded-2xl border border-white/10`}
      >
        <h4 className="font-black text-xs uppercase tracking-widest text-muted-foreground">
          {t("importExport.exportFormat", "Export Format")}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-secondary/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs text-foreground">
                {t("importExport.jsonFormat", "JSON (round-trip safe)")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "importExport.jsonFormatDesc",
                "Full export with all metadata: translations, options, images, availability. Safe to re-import via the Import tab or OCR tool.",
              )}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs text-foreground">
                {t("importExport.xlsxFormat", "XLSX (styled spreadsheet)")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "importExport.xlsxFormatDesc",
                "Excel spreadsheet with styled headers, proper column widths, and correct encoding for all languages including Cyrillic.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────

export default function MenuImportExportView() {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const { t } = useTranslation();
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>("import");

  if (!activeRestaurant) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-display font-black text-foreground">
          {t("importExport.title", "Import & Export")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "importExport.description",
            "Import menus digitized by the offline OCR tool, or export your menu for backup and cross-location cloning.",
          )}
        </p>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-border/40 pb-1">
        {[
          {
            id: "import" as SubTabId,
            label: t("importExport.import", "Import"),
            icon: Upload,
          },
          {
            id: "export" as SubTabId,
            label: t("importExport.export", "Export"),
            icon: Download,
          },
        ].map(({ id, label, icon: Icon }) => {
          const isActive = activeSubTab === id;
          return (
            <DashboardButton
              density="tab"
              key={id}
              onClick={() => setActiveSubTab(id)}
              className={`${
                isActive
                  ? "bg-foreground text-background shadow-lg"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }
                flex-1 sm:flex-none`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon className="w-4 h-4" />
              {label}
            </DashboardButton>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div>
        {activeSubTab === "import" && (
          <ImportTab restaurantId={activeRestaurant.id} />
        )}
        {activeSubTab === "export" && (
          <ExportTab restaurantId={activeRestaurant.id} />
        )}
      </div>
    </div>
  );
}
