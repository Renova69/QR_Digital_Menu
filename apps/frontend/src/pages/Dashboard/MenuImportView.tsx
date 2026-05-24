import { useState, useRef, useCallback, useContext } from 'react';
import { Upload, Key, RefreshCw, Eye, EyeOff, Copy, Check, AlertTriangle, FileJson, FileText, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import RestaurantContext from '../../context/RestaurantContext';
import {
  getImportApiKey,
  revealImportApiKey,
  regenerateImportApiKey,
  confirmMenuImport,
} from '../../lib/api';

const KNOWN_ALLERGENS = ['nuts', 'dairy', 'soy', 'gluten', 'peanuts', 'shellfish', 'egg'];

function splitTags(tags: string[]) {
  const allergens = tags.filter((t) => KNOWN_ALLERGENS.some((a) => t.toLowerCase().includes(a)));
  const dietaryTags = tags.filter((t) => !KNOWN_ALLERGENS.some((a) => t.toLowerCase().includes(a)));
  return { allergens, dietaryTags };
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      fields.push(field); field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function parseVariants(str: string) {
  if (!str) return [];
  return str.split(';').map((v) => v.trim()).filter(Boolean).map((v) => {
    const parts = v.split(':');
    return { name: parts[0]?.trim() || '', price: parseFloat(parts[1]) || 0, weight: parts[2]?.trim() || null };
  });
}

function csvToPayload(text: string): any[] {
  const lines = text.replace(/^﻿/, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new Error('CSV has no data rows');
  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/"/g, ''));
  const catMap = new Map<string, any[]>();
  for (const line of lines.slice(1)) {
    const fields = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (fields[i] || '').trim(); });
    const catName = row['category'];
    if (!catName) continue;
    if (!catMap.has(catName)) catMap.set(catName, []);
    const rawTags = row['tags'] ? row['tags'].split(',').map((t) => t.trim()).filter(Boolean) : [];
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
      options: variants.length ? [{ name: 'Size / Variant', type: 'VARIATION', choices: variants }] : [],
    });
  }
  return Array.from(catMap.entries()).map(([name, items], i) => ({ name, order: i + 1, items }));
}

function jsonToPayload(text: string): any[] {
  const obj = JSON.parse(text);
  const cats = obj.categories || obj.menu || obj.sections || [];
  return cats.map((cat: any, i: number) => {
    const items = (cat.items || cat.dishes || cat.products || []).map((item: any) => {
      // Canonical format has tags[], variants[] — transform to SaaS format
      let allergens = item.allergens || [];
      let dietaryTags = item.dietaryTags || [];
      if (item.tags && !item.allergens) {
        const split = splitTags(item.tags);
        allergens = split.allergens;
        dietaryTags = split.dietaryTags;
      }
      const options = item.options || (item.variants?.length
        ? [{ name: 'Size / Variant', type: 'VARIATION', choices: item.variants.map((v: any) => ({ name: v.name, price: v.price, weight: v.weight || null })) }]
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
    });
    return {
      name: cat.name,
      order: cat.sort_order || cat.order || i + 1,
      items,
      ...(cat.translations ? { translations: cat.translations } : {}),
    };
  });
}

// ── API Key Panel ──────────────────────────────────────────────────────────────

function ApiKeyPanel({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRegen, setShowRegen] = useState(false);

  const { data } = useQuery({
    queryKey: ['import-api-key', restaurantId],
    queryFn: () => getImportApiKey(restaurantId),
    enabled: !!restaurantId,
  });

  const revealMutation = useMutation({
    mutationFn: () => revealImportApiKey(restaurantId),
    onSuccess: (d) => { setFullKey(d.apiKey); setRevealed(true); },
  });

  const regenMutation = useMutation({
    mutationFn: () => regenerateImportApiKey(restaurantId),
    onSuccess: (d) => {
      setFullKey(d.apiKey);
      setRevealed(true);
      setShowRegen(false);
      queryClient.invalidateQueries({ queryKey: ['import-api-key', restaurantId] });
    },
  });

  const copyKey = async () => {
    const key = fullKey || data?.apiKey || '';
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayKey = revealed && fullKey ? fullKey : (data?.apiKey || '••••••••••••••••');
  const apiUrl = `${(import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api'}/restaurants/${restaurantId}/menu/import`;

  return (
    <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
          <Key className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="font-black text-sm uppercase tracking-widest text-foreground">OCR API Key</h3>
          <p className="text-xs text-muted-foreground">Used by the offline OCR tool to push menus directly</p>
        </div>
      </div>

      {/* Key display */}
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-secondary/60 rounded-xl px-4 py-3 text-sm font-mono text-foreground truncate border border-border/40">
          {displayKey}
        </code>
        <button
          onClick={() => {
            if (revealed) { setRevealed(false); setFullKey(null); }
            else revealMutation.mutate();
          }}
          className="p-3 rounded-xl bg-secondary/60 border border-border/40 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title={revealed ? 'Hide key' : 'Reveal full key'}
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
        <button
          onClick={copyKey}
          className="p-3 rounded-xl bg-secondary/60 border border-border/40 hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          title="Copy"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Curl example */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold uppercase tracking-wider">
          curl example
        </summary>
        <pre className="mt-2 bg-secondary/40 rounded-xl p-4 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
{`POST ${apiUrl}
Authorization: Bearer <API_KEY>
Content-Type: application/json

{ "restaurantId": "${restaurantId}", "categories": [...] }`}
        </pre>
      </details>

      {/* Regenerate */}
      {showRegen ? (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive flex-1">This will invalidate the current key. The OCR tool will need the new key.</p>
          <button
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            className="text-xs font-black uppercase tracking-wider px-3 py-2 rounded-lg bg-destructive text-white hover:bg-destructive/80 transition-colors"
          >
            {regenMutation.isPending ? '...' : 'Confirm'}
          </button>
          <button onClick={() => setShowRegen(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        </div>
      ) : (
        <button
          onClick={() => setShowRegen(true)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold"
        >
          <RefreshCw className="w-3 h-3" />
          Regenerate key
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

function FileImporter({ onParsed }: { onParsed: (m: ParsedMenu | null) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'json' && ext !== 'csv') {
      onParsed({ categories: [], filename: file.name, format: 'json', totalItems: 0, error: 'Only .json and .csv files are supported' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const categories = ext === 'csv' ? csvToPayload(text) : jsonToPayload(text);
        const totalItems = categories.reduce((s: number, c: any) => s + (c.items?.length || 0), 0);
        onParsed({ categories, filename: file.name, format: ext as 'json' | 'csv', totalItems });
      } catch (err: any) {
        onParsed({ categories: [], filename: file.name, format: ext as 'json' | 'csv', totalItems: 0, error: err.message });
      }
    };
    reader.readAsText(file, 'utf-8');
  }, [onParsed]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer p-10 text-center ${
        dragging ? 'border-primary bg-primary/5' : 'border-border/40 hover:border-primary/50 hover:bg-secondary/30'
      }`}
    >
      <input ref={inputRef} type="file" accept=".json,.csv" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
      <div className="flex flex-col items-center gap-3">
        <Upload className={`w-8 h-8 transition-colors ${dragging ? 'text-primary' : 'text-muted-foreground'}`} />
        <div>
          <p className="font-bold text-sm text-foreground">Drop file here or click to browse</p>
          <p className="text-xs text-muted-foreground mt-1">Accepts <code className="bg-secondary px-1 rounded">.json</code> and <code className="bg-secondary px-1 rounded">.csv</code> exports from the OCR tool</p>
        </div>
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileJson className="w-3.5 h-3.5" />
            <span>Full JSON / SaaS push format</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="w-3.5 h-3.5" />
            <span>CSV flat export</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Preview Table ──────────────────────────────────────────────────────────────

function PreviewTable({ parsed, onClear }: { parsed: ParsedMenu; onClear: () => void }) {
  const totalCats = parsed.categories.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-black text-sm uppercase tracking-widest text-foreground">{parsed.filename}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCats} {totalCats === 1 ? 'category' : 'categories'} · {parsed.totalItems} items
          </p>
        </div>
        <button onClick={onClear} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>

      <div className="rounded-2xl border border-border/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-secondary/60 border-b border-border/40">
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Category</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Item</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Price</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden md:table-cell">Weight</th>
              <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hidden lg:table-cell">Tags</th>
            </tr>
          </thead>
          <tbody>
            {parsed.categories.flatMap((cat) =>
              (cat.items || []).map((item: any, i: number) => (
                <tr key={`${cat.name}-${i}`} className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground font-medium">{i === 0 ? cat.name : ''}</td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{item.name}</td>
                  <td className={`px-4 py-2.5 font-mono text-sm ${!item.price ? 'text-amber-500' : 'text-foreground'}`}>
                    {item.price ? `${item.price} ${item.currency || 'BGN'}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground hidden md:table-cell">{item.weight || '—'}</td>
                  <td className="px-4 py-2.5 hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {[...(item.allergens || []), ...(item.dietaryTags || [])].map((tag: string) => (
                        <span key={tag} className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {parsed.categories.flatMap((c: any) => c.items || []).some((i: any) => !i.price) && (
        <p className="flex items-center gap-2 text-xs text-amber-500">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Items with no price are highlighted in amber. They will import with price 0.
        </p>
      )}
    </div>
  );
}

// ── Main View ──────────────────────────────────────────────────────────────────

export default function MenuImportView() {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<ParsedMenu | null>(null);
  const [result, setResult] = useState<{ success: boolean; created: number; updated: number; categories: number } | null>(null);

  const importMutation = useMutation({
    mutationFn: (payload: any) => confirmMenuImport(activeRestaurant.id, payload),
    onSuccess: (data) => {
      setResult(data);
      setParsed(null);
      queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
  });

  const handleConfirm = () => {
    if (!parsed || !activeRestaurant) return;
    importMutation.mutate({ categories: parsed.categories });
  };

  if (!activeRestaurant) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-display font-black text-foreground">Menu Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Import menus digitized by the offline OCR tool via API push or file upload.
        </p>
      </div>

      {/* Success result */}
      {result && (
        <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 flex items-start gap-4">
          <Check className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm text-foreground">Import complete</p>
            <p className="text-xs text-muted-foreground mt-1">
              {result.created} items created · {result.updated} items updated · {result.categories} new categories
            </p>
          </div>
          <button onClick={() => setResult(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">Dismiss</button>
        </div>
      )}

      <ApiKeyPanel restaurantId={activeRestaurant.id} />

      <div className="glass-panel rounded-2xl p-6 border border-white/10 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Upload className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest text-foreground">File Import</h3>
            <p className="text-xs text-muted-foreground">Upload a JSON or CSV export from the OCR tool</p>
          </div>
        </div>

        {parsed?.error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive">{parsed.error}</p>
            <button onClick={() => setParsed(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors">Dismiss</button>
          </div>
        ) : parsed ? (
          <>
            <PreviewTable parsed={parsed} onClear={() => setParsed(null)} />
            <div className="flex items-center justify-end gap-3 pt-2">
              <button onClick={() => setParsed(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={importMutation.isPending}
                className="px-6 py-2.5 rounded-xl brand-cta text-white text-sm font-black uppercase tracking-widest transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importMutation.isPending ? 'Importing…' : `Confirm Import (${parsed.totalItems} items)`}
              </button>
            </div>
            {importMutation.isError && (
              <p className="text-xs text-destructive">{(importMutation.error as any)?.response?.data?.message || 'Import failed'}</p>
            )}
          </>
        ) : (
          <FileImporter onParsed={setParsed} />
        )}
      </div>
    </div>
  );
}
