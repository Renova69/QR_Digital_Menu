import { useState, useRef, useCallback, useContext } from 'react';
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
} from 'lucide-react';
import writeXlsxFile from 'write-excel-file/browser';
import { readSheet as readXlsxSheet } from 'read-excel-file/browser';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import RestaurantContext from '../../context/RestaurantContext';
import {
  getImportApiKey,
  regenerateImportApiKey,
  confirmMenuImport,
  exportMenu,
} from '../../lib/api';

type SubTabId = 'import' | 'export';

const KNOWN_ALLERGENS = [
  'nuts',
  'dairy',
  'soy',
  'gluten',
  'peanuts',
  'shellfish',
  'egg',
];
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;

function splitTags(tags: string[]) {
  const allergens = tags.filter((t) =>
    KNOWN_ALLERGENS.some((a) => t.toLowerCase().includes(a)),
  );
  const dietaryTags = tags.filter(
    (t) => !KNOWN_ALLERGENS.some((a) => t.toLowerCase().includes(a)),
  );
  return { allergens, dietaryTags };
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseVariants(str: string) {
  if (!str) return [];
  return str
    .split(';')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const parts = v.split(':');
      return {
        name: parts[0]?.trim() || '',
        price: parseFloat(parts[1]) || 0,
        weight: parts[2]?.trim() || null,
      };
    });
}

function csvToPayload(text: string): any[] {
  const lines = text
    .replace(/^﻿/, '')
    .split('\n')
    .filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const headers = parseCSVLine(lines[0]).map((h) =>
    h.trim().toLowerCase().replace(/"/g, ''),
  );
  const catMap = new Map<string, any[]>();
  for (const line of lines.slice(1)) {
    const fields = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (fields[i] || '').trim();
    });
    const catName = row['category'];
    if (!catName) continue;
    if (!catMap.has(catName)) catMap.set(catName, []);
    const rawTags = row['tags']
      ? row['tags']
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    const { allergens, dietaryTags } = splitTags(rawTags);
    const variants = parseVariants(row['variants'] || '');
    catMap.get(catName)!.push({
      name: row['item_name'] || '',
      description: row['description'] || '',
      price: parseFloat(row['price']) || 0,
      weight: row['weight'] || null,
      currency: 'BGN',
      allergens,
      dietaryTags,
      options: variants.length
        ? [{ name: 'Size / Variant', type: 'VARIATION', choices: variants }]
        : [],
    });
  }
  return Array.from(catMap.entries()).map(([name, items], i) => ({
    name,
    order: i + 1,
    items,
  }));
}

function jsonToPayload(text: string): any[] {
  const obj = JSON.parse(text);
  const cats = obj.categories || obj.menu || obj.sections || [];
  return cats.map((cat: any, i: number) => {
    const items = (cat.items || cat.dishes || cat.products || []).map(
      (item: any) => {
        let allergens = item.allergens || [];
        let dietaryTags = item.dietaryTags || [];
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
                  name: 'Size / Variant',
                  type: 'VARIATION',
                  choices: item.variants.map((v: any) => ({
                    name: v.name,
                    price: v.price,
                    weight: v.weight || null,
                  })),
                },
              ]
            : []);
        return {
          name: item.name,
          description: item.description || '',
          price: item.price ?? 0,
          weight: item.weight || null,
          currency: obj.currency === 'BGN' ? 'BGN' : 'EUR',
          allergens,
          dietaryTags,
          options,
          ...(item.translations ? { translations: item.translations } : {}),
        };
      },
    );
    return {
      name: cat.name,
      order: cat.sort_order || cat.order || i + 1,
      items,
      ...(cat.translations ? { translations: cat.translations } : {}),
    };
  });
}

// XLSX export column order: Category, Item Name, Description, Price, Weight, Currency, Tags, Variants
async function xlsxToPayload(file: File): Promise<any[]> {
  const rows = (await readXlsxSheet(file)) as unknown as any[][];
  if (rows.length < 2) throw new Error('XLSX has no data rows');

  const headers = rows[0].map((h: any) =>
    String(h ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_'),
  );

  const col = (name: string) => headers.indexOf(name);
  const catIdx = col('category');
  const nameIdx = col('item_name');
  const descIdx = col('description');
  const priceIdx = col('price');
  const weightIdx = col('weight');
  const currencyIdx = col('currency');
  const tagsIdx = col('tags');
  const variantsIdx = col('variants');

  if (catIdx === -1 || nameIdx === -1)
    throw new Error('XLSX missing required columns: category, item_name');

  const catMap = new Map<string, any[]>();
  for (const row of rows.slice(1)) {
    const catName = String(row[catIdx] ?? '').trim();
    if (!catName) continue;
    if (!catMap.has(catName)) catMap.set(catName, []);

    const rawTags =
      tagsIdx >= 0 && row[tagsIdx]
        ? String(row[tagsIdx])
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean)
        : [];
    const { allergens, dietaryTags } = splitTags(rawTags);
    const variants =
      variantsIdx >= 0 ? parseVariants(String(row[variantsIdx] ?? '')) : [];

    catMap.get(catName)!.push({
      name: String(row[nameIdx] ?? '').trim(),
      description: descIdx >= 0 ? String(row[descIdx] ?? '').trim() : '',
      price:
        priceIdx >= 0
          ? typeof row[priceIdx] === 'number'
            ? row[priceIdx]
            : parseFloat(String(row[priceIdx])) || 0
          : 0,
      weight: weightIdx >= 0 && row[weightIdx] ? String(row[weightIdx]) : null,
      currency:
        currencyIdx >= 0 && row[currencyIdx] ? String(row[currencyIdx]) : 'BGN',
      allergens,
      dietaryTags,
      options: variants.length
        ? [{ name: 'Size / Variant', type: 'VARIATION', choices: variants }]
        : [],
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

  const { data } = useQuery({
    queryKey: ['import-api-key', restaurantId],
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
        queryKey: ['import-api-key', restaurantId],
      });
    },
  });

  const copyKey = async () => {
    if (!oneTimeKey) return;
    await navigator.clipboard.writeText(oneTimeKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const apiUrl = `${(import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api'}/restaurants/${restaurantId}/menu/import`;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Key className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-sm uppercase tracking-widest text-foreground">
            {t('importExport.ocrApiKey', 'OCR API Key')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'importExport.ocrApiKeyDesc',
              'Used by the offline OCR tool to push menus directly',
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 bg-secondary/60 rounded-xl px-4 py-3 text-sm font-mono text-foreground truncate border border-border/40">
          {oneTimeKey ?? (isConfigured ? '•••••••• ' + t('importExport.keyHidden', 'key hidden') + ' ••••••••' : '—')}
        </code>
        {oneTimeKey && (
          <button
            onClick={copyKey}
            className="p-3 rounded-xl bg-secondary/60 border border-border/40 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            title={t('importExport.copyKey', 'Copy')}
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {oneTimeKey ? (
        <p className="text-xs text-amber-500 font-medium">
          {t(
            'importExport.saveKeyNow',
            'Copy this key now — for security it is not stored in readable form and cannot be shown again.',
          )}
        </p>
      ) : (
        isConfigured && (
          <p className="text-xs text-muted-foreground">
            {t(
              'importExport.keyConfigured',
              'A key is configured. It cannot be displayed again — regenerate to issue a new one.',
            )}
          </p>
        )
      )}

      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold uppercase tracking-wider">
          {t('importExport.curlExample', 'curl example')}
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
              'importExport.regenerateWarning',
              'This will invalidate the current key. The OCR tool will need the new key.',
            )}
          </p>
          <button
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            className="text-xs font-black uppercase tracking-wider px-3 py-2 rounded-lg bg-destructive text-white hover:bg-destructive/80 transition-colors"
          >
            {regenMutation.isPending ? '...' : t('common.confirm', 'Confirm')}
          </button>
          <button
            onClick={() => setShowRegen(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowRegen(true)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold"
        >
          <RefreshCw className="w-3 h-3" />
          {t('importExport.regenerateKey', 'Regenerate key')}
        </button>
      )}
    </div>
  );
}

// ── File Importer ──────────────────────────────────────────────────────────────

interface ParsedMenu {
  categories: any[];
  filename: string;
  format: 'json' | 'csv';
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

  const processFile = useCallback(
    (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (file.size > MAX_IMPORT_FILE_SIZE) {
        onParsed({
          categories: [],
          filename: file.name,
          format: 'json',
          totalItems: 0,
          error: 'Import files must be 5MB or smaller',
        });
        return;
      }
      if (ext !== 'json' && ext !== 'csv' && ext !== 'xlsx') {
        onParsed({
          categories: [],
          filename: file.name,
          format: 'json',
          totalItems: 0,
          error: 'Only .json, .csv, and .xlsx files are supported',
        });
        return;
      }
      if (ext === 'xlsx') {
        xlsxToPayload(file)
          .then((categories) => {
            const totalItems = categories.reduce(
              (s: number, c: any) => s + (c.items?.length || 0),
              0,
            );
            onParsed({
              categories,
              filename: file.name,
              format: 'json',
              totalItems,
            });
          })
          .catch((err: any) => {
            onParsed({
              categories: [],
              filename: file.name,
              format: 'json',
              totalItems: 0,
              error: err.message,
            });
          });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const categories =
            ext === 'csv' ? csvToPayload(text) : jsonToPayload(text);
          const totalItems = categories.reduce(
            (s: number, c: any) => s + (c.items?.length || 0),
            0,
          );
          onParsed({
            categories,
            filename: file.name,
            format: ext as 'json' | 'csv',
            totalItems,
          });
        } catch (err: any) {
          onParsed({
            categories: [],
            filename: file.name,
            format: ext as 'json' | 'csv',
            totalItems: 0,
            error: err.message,
          });
        }
      };
      reader.readAsText(file, 'utf-8');
    },
    [onParsed],
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
      className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer p-10 text-center ${
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-border/40 hover:border-primary/50 hover:bg-secondary/30'
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
          className={`w-8 h-8 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`}
        />
        <div>
          <p className="font-bold text-sm text-foreground">
            {t(
              'importExport.dropFileHere',
              'Drop file here or click to browse',
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('importExport.acceptsFormats', 'Accepts')}{' '}
            <code className="bg-secondary px-1 rounded">.json</code>{' '}
            <code className="bg-secondary px-1 rounded">.csv</code>{' '}
            <code className="bg-secondary px-1 rounded">.xlsx</code>
          </p>
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileJson className="w-3.5 h-3.5" />
            <span>
              {t('importExport.fullJsonFormat', 'Full JSON / SaaS push format')}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            <span>{t('importExport.csvFlatExport', 'CSV flat export')}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5 text-green-500" />
            <span>{t('importExport.xlsxImport', 'XLSX (exported menu)')}</span>
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
            {totalCats}{' '}
            {totalCats === 1
              ? t('importExport.category', 'category')
              : t('importExport.categories', 'categories')}{' '}
            · {parsed.totalItems} {t('importExport.items', 'items')}
          </p>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {t('common.clear', 'Clear')}
        </button>
      </div>

      <div className="rounded-2xl border border-border/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/60 border-b border-border/40">
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                {t('importExport.categoryHeader', 'Category')}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                {t('importExport.itemHeader', 'Item')}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">
                {t('importExport.priceHeader', 'Price')}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">
                {t('importExport.weightHeader', 'Weight')}
              </th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden lg:table-cell">
                {t('importExport.tagsHeader', 'Tags')}
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
                    {i === 0 ? cat.name : ''}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {item.name}
                  </td>
                  <td
                    className={`px-4 py-2.5 font-mono text-sm ${!item.price ? 'text-amber-500' : 'text-foreground'}`}
                  >
                    {item.price
                      ? `${item.price} ${item.currency || 'BGN'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">
                    {item.weight || '—'}
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
            'importExport.noPrice',
            'Items with no price are highlighted in amber. They will import with price 0.',
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
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      queryClient.invalidateQueries({ queryKey: ['categories', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  const handleConfirm = () => {
    if (!parsed) return;
    importMutation.mutate({ categories: parsed.categories });
  };

  return (
    <div className="space-y-8">
      {result && (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 flex items-start gap-4">
          <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm text-foreground">
              {t('importExport.importComplete', 'Import complete')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'importExport.importResult',
                '{{created}} items created · {{updated}} items updated · {{categories}} new categories',
                {
                  created: result.created,
                  updated: result.updated,
                  categories: result.categories,
                },
              )}
            </p>
          </div>
          <button
            onClick={() => setResult(null)}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.dismiss', 'Dismiss')}
          </button>
        </div>
      )}

      <ApiKeyPanel restaurantId={restaurantId} />

      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-foreground">
              {t('importExport.fileImport', 'File Import')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                'importExport.fileImportDesc',
                'Upload a JSON or CSV export from the OCR tool',
              )}
            </p>
          </div>
        </div>

        {parsed?.error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{parsed.error}</p>
            <button
              onClick={() => setParsed(null)}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('common.dismiss', 'Dismiss')}
            </button>
          </div>
        ) : parsed ? (
          <>
            <PreviewTable parsed={parsed} onClear={() => setParsed(null)} />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setParsed(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={importMutation.isPending}
                className="px-6 py-2.5 rounded-xl brand-cta text-white text-sm font-black uppercase tracking-widest transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importMutation.isPending
                  ? t('importExport.importing', 'Importing…')
                  : t(
                      'importExport.confirmImport',
                      'Confirm Import ({{count}} items)',
                      { count: parsed.totalItems },
                    )}
              </button>
            </div>
            {importMutation.isError && (
              <p className="text-xs text-destructive">
                {(importMutation.error as any)?.response?.data?.message ||
                  t('importExport.importFailed', 'Import failed')}
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

async function downloadMenuXLSX(
  data: { restaurantId: string; categories: any[] },
  restaurantId: string,
) {
  const h = (value: string) => ({
    value,
    fontWeight: 'bold' as const,
    backgroundColor: '#1e3a5f',
    textColor: '#ffffff',
  });

  const rows: any[][] = [
    [
      h('Category'),
      h('Item Name'),
      h('Description'),
      h('Price'),
      h('Weight'),
      h('Currency'),
      h('Tags'),
      h('Variants'),
    ],
  ];

  for (const cat of data.categories) {
    for (const item of cat.items || []) {
      const tags = [
        ...(item.allergens || []),
        ...(item.dietaryTags || []),
      ].join(', ');
      const variants = (item.options?.[0]?.choices || [])
        .map(
          (v: any) =>
            `${v.name}:${v.priceModifier ?? v.price}${v.weight ? `:${v.weight}` : ''}`,
        )
        .join('; ');
      rows.push([
        { value: cat.name },
        { value: item.name },
        { value: item.description || '' },
        { value: item.price ?? 0, type: Number },
        { value: item.weight || '' },
        { value: item.currency || 'BGN' },
        { value: tags },
        { value: variants },
      ]);
    }
  }

  const wb = writeXlsxFile([
    {
      sheet: 'Menu',
      columns: [
        { width: 20 },
        { width: 30 },
        { width: 45 },
        { width: 10 },
        { width: 12 },
        { width: 10 },
        { width: 30 },
        { width: 40 },
      ],
      data: rows,
    },
  ]);
  await wb.toFile(`menu-export-${restaurantId}.xlsx`);
}

function ExportTab({ restaurantId }: { restaurantId: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['menu-export', restaurantId],
    queryFn: () => exportMenu(restaurantId),
    enabled: false, // fetch only on button click
  });

  const downloadJSON = useCallback(
    (exportData: any) => {
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
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
      await downloadMenuXLSX(result.data, restaurantId);
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
      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-foreground">
              {t('importExport.exportMenu', 'Export Menu')}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t(
                'importExport.exportMenuDesc',
                'Download your full menu as JSON or CSV for backup, cross-location cloning, or offline editing.',
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background text-sm font-black uppercase tracking-widest transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileJson className="w-4 h-4" />
            )}
            {t('importExport.downloadJson', 'Download JSON')}
          </button>
          <button
            onClick={handleExportXLSX}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border/40 text-sm font-black uppercase tracking-widest transition-all hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {t('importExport.downloadXlsx', 'Download XLSX')}
          </button>
          <button
            onClick={handleCopyJSON}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border/40 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            {copied
              ? t('common.copied', 'Copied')
              : t('importExport.copyJson', 'Copy JSON')}
          </button>
        </div>

        {/* Preview stats if data loaded */}
        {data && !isLoading && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/40 text-xs text-muted-foreground">
            <Check className="w-3.5 h-3.5 text-green-500" />
            {t(
              'importExport.menuReady',
              'Menu ready: {{catCount}} {{catLabel}} · {{itemCount}} {{itemLabel}}',
              {
                catCount,
                catLabel:
                  catCount === 1
                    ? t('importExport.category', 'category')
                    : t('importExport.categories', 'categories'),
                itemCount,
                itemLabel:
                  itemCount === 1
                    ? t('importExport.item', 'item')
                    : t('importExport.items', 'items'),
              },
            )}
          </div>
        )}

        {isError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">
              {(error as any)?.response?.data?.message ||
                t('importExport.fetchFailed', 'Failed to fetch menu data')}
            </p>
          </div>
        )}
      </div>

      {/* Format info */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-4">
        <h4 className="font-black text-xs uppercase tracking-widest text-muted-foreground">
          {t('importExport.exportFormat', 'Export Format')}
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl bg-secondary/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs text-foreground">
                {t('importExport.jsonFormat', 'JSON (round-trip safe)')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'importExport.jsonFormatDesc',
                'Full export with all metadata: translations, options, images, availability. Safe to re-import via the Import tab or OCR tool.',
              )}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <span className="font-bold text-xs text-foreground">
                {t('importExport.xlsxFormat', 'XLSX (styled spreadsheet)')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'importExport.xlsxFormatDesc',
                'Excel spreadsheet with styled headers, proper column widths, and correct encoding for all languages including Cyrillic.',
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
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>('import');

  if (!activeRestaurant) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-display font-black text-foreground">
          {t('importExport.title', 'Import & Export')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            'importExport.description',
            'Import menus digitized by the offline OCR tool, or export your menu for backup and cross-location cloning.',
          )}
        </p>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-border/40 pb-1">
        {[
          {
            id: 'import' as SubTabId,
            label: t('importExport.import', 'Import'),
            icon: Upload,
          },
          {
            id: 'export' as SubTabId,
            label: t('importExport.export', 'Export'),
            icon: Download,
          },
        ].map(({ id, label, icon: Icon }) => {
          const isActive = activeSubTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveSubTab(id)}
              className={`${
                isActive
                  ? 'bg-foreground text-background shadow-lg'
                  : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
              }
                px-5 py-3 rounded-xl font-bold text-[11px] uppercase tracking-[0.12em] transition-all flex items-center gap-2 active:scale-95`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div>
        {activeSubTab === 'import' && (
          <ImportTab restaurantId={activeRestaurant.id} />
        )}
        {activeSubTab === 'export' && (
          <ExportTab restaurantId={activeRestaurant.id} />
        )}
      </div>
    </div>
  );
}
