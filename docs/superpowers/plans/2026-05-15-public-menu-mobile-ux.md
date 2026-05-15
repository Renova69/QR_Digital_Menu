# Public Menu Mobile UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public menu mobile UX — compact top bar, filter panel, horizontal item cards with dual-currency prices, category scroll pills, regrouped bottom nav, and full i18n support.

**Architecture:** Extract 3 new components from the 815-line `PublicMenuPage.tsx` monolith: `TopBar`, `FilterPanel`, `CategoryPills`. Redesign `ItemWithOptions` to horizontal layout. Replace all hardcoded `€{price}` patterns with a shared `src/lib/currency.ts` utility. Add ~15 i18n keys across EN/BG/RO. Bottom nav regrouped to B-style (user-profile left, cart-bill right).

**Tech Stack:** React 18 + TypeScript, Tailwind v4, Lucide React, react-i18next (EN/BG/RO), TanStack Query

---

### Task 1: Shared Currency Utility

**Files:**
- Create: `apps/frontend/src/lib/currency.ts`
- Modify: None yet (utility is pure, no callers in this task)

- [ ] **Step 1: Write the currency utility**

```ts
// apps/frontend/src/lib/currency.ts

/** Bulgarian National Bank fixed exchange rate: 1 EUR = 1.95583 BGN */
export const BGN_RATE = 1.95583;

export function formatEuro(value: number): string {
  return `${value.toFixed(2)} €`;
}

export function formatBgn(value: number): string {
  return `${(value * BGN_RATE).toFixed(2)} лв`;
}

/**
 * Returns primary + secondary price strings for dual-currency display.
 * Primary currency is determined by the item's currency field (EUR or BGN).
 */
export function formatDualCurrency(
  value: number,
  primaryCurrency: 'EUR' | 'BGN' = 'EUR',
): { primary: string; secondary: string } {
  if (primaryCurrency === 'EUR') {
    return { primary: formatEuro(value), secondary: formatBgn(value) };
  }
  // Primary is BGN, derive EUR as secondary
  return {
    primary: formatBgn(value),
    secondary: formatEuro(value / BGN_RATE),
  };
}

/** Single-line inline format: "12.50 € / 24.45 лв" */
export function formatInlineDual(value: number, primaryCurrency: 'EUR' | 'BGN' = 'EUR'): string {
  const { primary, secondary } = formatDualCurrency(value, primaryCurrency);
  return `${primary} / ${secondary}`;
}
```

- [ ] **Step 2: Verify the utility exports**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors (utility is self-contained, no imports from project).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/currency.ts
git commit -m "feat: add shared currency utility — dual EUR/BGN formatters at BNB fixed rate"
```

---

### Task 2: TopBar Component

**Files:**
- Create: `apps/frontend/src/components/menu/TopBar.tsx`
- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx` (replace lines 278-299 + language select lines 367-394)

- [ ] **Step 1: Write the TopBar component**

```tsx
// apps/frontend/src/components/menu/TopBar.tsx
import { Search, Filter, Globe } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useTranslation } from 'react-i18next';

const LANG_CODES: Record<string, string> = {
  en: 'EN', bg: 'BG', ro: 'RO',
};

interface TopBarProps {
  tableNumber: string | null;
  targetLanguages: string[];
  selectedLang: string;
  onLanguageChange: (code: string) => void;
  restaurantId?: string;
  defaultTheme?: 'light' | 'dark';
  onFilterClick: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function TopBar({
  tableNumber,
  targetLanguages,
  selectedLang,
  onLanguageChange,
  restaurantId,
  defaultTheme,
  onFilterClick,
  searchQuery,
  onSearchChange,
}: TopBarProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky top-0 z-40 px-3 pt-3 pb-2">
      {/* Glass bar — single row, icon-only */}
      <div className="flex items-center gap-2 p-2 rounded-[1.75rem] glass-panel border-white/10 shadow-lg">
        {/* Table chip */}
        {tableNumber && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 flex-shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-accent">
              ⌂{tableNumber}
            </span>
          </div>
        )}

        {/* Search bar */}
        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('publicMenu.search', 'Search')}
            className="w-full pl-9 pr-3 py-2 bg-secondary/50 rounded-xl text-sm font-medium text-foreground placeholder:text-muted-foreground/50 border border-transparent focus:border-accent/30 focus:outline-none transition-colors"
          />
        </div>

        {/* Filter button */}
        <button
          onClick={onFilterClick}
          aria-label={t('publicMenu.filters', 'Filters')}
          className="p-2 rounded-xl hover:bg-secondary/60 transition-colors flex-shrink-0"
        >
          <Filter className="h-5 w-5 text-foreground/70" />
        </button>

        {/* Theme toggle */}
        <ThemeToggle
          size="sm"
          storageKey={restaurantId ? `theme-${restaurantId}` : 'theme'}
          defaultTheme={defaultTheme ?? 'light'}
        />

        {/* Language selector — icon + code pills */}
        {targetLanguages.length > 1 && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Globe className="h-4 w-4 text-muted-foreground mr-0.5" />
            {targetLanguages.map((code) => (
              <button
                key={code}
                onClick={() => onLanguageChange(code)}
                className={`px-1.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  selectedLang === code
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {LANG_CODES[code] ?? code.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add search state and handlers to PublicMenuPage**

In `PublicMenuPage.tsx`, add after line 53 (`const [activeCategory, setActiveCategory]`):

```tsx
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
```

- [ ] **Step 3: Replace top section of PublicMenuPage JSX**

Replace lines 278–394 (the two theme toggle blocks + logo + language select) with:

```tsx
        {/* Top Bar — search, filter, theme, lang, table chip */}
        <TopBar
          tableNumber={tableNumber}
          targetLanguages={menuData?.restaurant?.targetLanguages ?? []}
          selectedLang={selectedLang}
          onLanguageChange={(code) => { setSelectedLang(code); i18n.changeLanguage(code); }}
          restaurantId={restaurantId}
          defaultTheme={(restaurantTheme?.defaultTheme as 'light' | 'dark') ?? 'light'}
          onFilterClick={() => setFilterDrawerOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
```

And remove the logo block (lines 335–394) entirely.

- [ ] **Step 4: Add import for TopBar**

Add after line 12 (`import { ThemeToggle }`):

```tsx
import { TopBar } from "../components/menu/TopBar";
```

- [ ] **Step 5: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/menu/TopBar.tsx apps/frontend/src/pages/PublicMenuPage.tsx
git commit -m "feat: add TopBar component — search, filter, theme, lang codes, table chip"
```

---

### Task 3: FilterPanel Component

**Files:**
- Create: `apps/frontend/src/components/menu/FilterPanel.tsx`
- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx` (wire in FilterPanel, replace old dietTags filter buttons)

- [ ] **Step 1: Write the FilterPanel component**

```tsx
// apps/frontend/src/components/menu/FilterPanel.tsx
import { X, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  dietTags: { tag: string; count: number }[];
  activeDietTags: string[];
  onDietTagToggle: (tag: string) => void;
  excludedAllergens: string[];
  onAllergenToggle: (allergen: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

/**
 * Slide-out filter panel for dietary toggles (INCLUDE) and allergen exclusion pills (EXCLUDE).
 *
 * Dietary toggles: multi-select checkboxes — selecting one filters TO that tag.
 * Allergen pills: tap to EXCLUDE — items containing that allergen are hidden.
 */
export function FilterPanel({
  isOpen,
  onClose,
  dietTags,
  activeDietTags,
  onDietTagToggle,
  excludedAllergens,
  onAllergenToggle,
  searchQuery,
  onSearchChange,
}: FilterPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  // Separate allergens (tags that start with numbers or common allergen names) from dietary tags
  const knownAllergens = new Set([
    'gluten', 'wheat', 'milk', 'dairy', 'eggs', 'fish', 'shellfish',
    'nuts', 'peanuts', 'soy', 'soya', 'celery', 'mustard', 'sesame',
    'sulphites', 'lupin', 'molluscs', 'crustaceans',
    'gluten', 'wheat', 'milk', 'dairy', 'eggs', 'fish', 'nuts',
    'лактоза', 'глутен', 'ядки', 'риба', 'яйца', 'соя',
    'lactoză', 'gluten', 'nuci', 'pește', 'ouă', 'soia',
  ]);
  const allergens = dietTags.filter(({ tag }) =>
    knownAllergens.has(tag.toLowerCase()),
  );
  const dietary = dietTags.filter(({ tag }) =>
    !knownAllergens.has(tag.toLowerCase()),
  );

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative ml-auto w-full max-w-sm h-full bg-card border-l border-border shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-label={t('publicMenu.filters', 'Filters')}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{t('publicMenu.filters', 'Filters')}</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search inside panel */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('publicMenu.search', 'Search')}
              className="w-full pl-9 pr-3 py-2.5 bg-secondary rounded-xl text-sm font-medium placeholder:text-muted-foreground/50 border border-transparent focus:border-accent/30 focus:outline-none"
            />
          </div>
        </div>

        {/* Dietary toggles (INCLUDE) */}
        {dietary.length > 0 && (
          <div className="p-4 border-b border-border">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              {t('filters.dietaryPreferences', 'Dietary Preferences')}
            </h3>
            <div className="space-y-1">
              {dietary.map(({ tag, count }) => (
                <label
                  key={tag}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-secondary/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={activeDietTags.includes(tag)}
                      onChange={() => onDietTagToggle(tag)}
                      className="w-4 h-4 rounded accent-accent"
                    />
                    <span className="text-sm font-medium">{tag}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Allergen exclusion pills (EXCLUDE) */}
        {allergens.length > 0 && (
          <div className="p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              {t('filters.excludeAllergens', 'Exclude Allergens')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {allergens.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => onAllergenToggle(tag)}
                  aria-pressed={excludedAllergens.includes(tag)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                    excludedAllergens.includes(tag)
                      ? 'bg-destructive/15 text-destructive border border-destructive/30 line-through'
                      : 'bg-secondary text-muted-foreground hover:text-foreground border border-transparent'
                  }`}
                >
                  {tag}
                  <span className="ml-1 opacity-50">{count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add filter state and wire FilterPanel into PublicMenuPage**

After the state additions from Task 2 (after line 53 in original), add:

```tsx
  const [activeDietTags, setActiveDietTags] = useState<string[]>([]);
  const [excludedAllergens, setExcludedAllergens] = useState<string[]>([]);

  const toggleDietTag = (tag: string) => {
    setActiveDietTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const toggleAllergen = (allergen: string) => {
    setExcludedAllergens((prev) =>
      prev.includes(allergen) ? prev.filter((a) => a !== allergen) : [...prev, allergen],
    );
  };
```

- [ ] **Step 3: Replace old filter buttons with FilterPanel + updated item filtering**

In PublicMenuPage JSX, replace the old dietTags filter block (lines 418–447) with:

```tsx
                {/* Filter Panel */}
                <FilterPanel
                  isOpen={filterDrawerOpen}
                  onClose={() => setFilterDrawerOpen(false)}
                  dietTags={dietTags}
                  activeDietTags={activeDietTags}
                  onDietTagToggle={toggleDietTag}
                  excludedAllergens={excludedAllergens}
                  onAllergenToggle={toggleAllergen}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />
```

Update the item filtering logic (lines 570–573) to use the new multi-select + allergen exclusion:

```tsx
                          const filteredItems = (() => {
                            let items = category.items;

                            // Search filter
                            if (searchQuery.trim()) {
                              const q = searchQuery.toLowerCase();
                              items = items.filter((item: any) =>
                                item.name.toLowerCase().includes(q) ||
                                (item.description ?? '').toLowerCase().includes(q),
                              );
                            }

                            // Dietary tag filter (INCLUDE — multi-select AND logic)
                            if (activeDietTags.length > 0) {
                              items = items.filter((item: any) =>
                                activeDietTags.every((tag) =>
                                  [...(item.allergens ?? []), ...(item.dietaryTags ?? [])].includes(tag),
                                ),
                              );
                            }

                            // Allergen exclusion (EXCLUDE — remove items containing these)
                            if (excludedAllergens.length > 0) {
                              items = items.filter((item: any) =>
                                !excludedAllergens.some((allergen) =>
                                  (item.allergens ?? []).some(
                                    (a: string) => a.toLowerCase() === allergen.toLowerCase(),
                                  ),
                                ),
                              );
                            }

                            return items;
                          })();
```

- [ ] **Step 4: Add import and remove unused state**

Add import:
```tsx
import { FilterPanel } from "../components/menu/FilterPanel";
```

Remove the old `activeFilter` state (line 50) — replaced by `activeDietTags` + `excludedAllergens`.

- [ ] **Step 5: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/menu/FilterPanel.tsx apps/frontend/src/pages/PublicMenuPage.tsx
git commit -m "feat: add FilterPanel — dietary toggles + allergen exclusion pills, multi-select search"
```

---

### Task 4: Horizontal Item Card Redesign (ItemWithOptions.tsx)

**Files:**
- Modify: `apps/frontend/src/components/menu/ItemWithOptions.tsx`

- [ ] **Step 1: Rewrite ItemWithOptions to horizontal layout + dual-currency + pill button**

```tsx
// apps/frontend/src/components/menu/ItemWithOptions.tsx
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Item, MenuOption, OptionChoice } from '../../types';
import { useCart } from '../../context/CartContext';
import { useTranslation } from 'react-i18next';
import { ImageLightbox } from './ImageLightbox';
import { formatInlineDual } from '../../lib/currency';

interface ItemWithOptionsProps {
  item: Item;
  perfectPairings?: Item[];
}

export const ItemWithOptions: React.FC<ItemWithOptionsProps> = ({ item, perfectPairings }) => {
    const { addItem } = useCart();
    const [selectedOptions, setSelectedOptions] = useState<Record<string, OptionChoice>>({});
    const [showIntercept, setShowIntercept] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [pendingMainItem, setPendingMainItem] = useState<{
        cartId: string;
        id: string;
        name: string;
        price: number;
        quantity: number;
        selectedOptions: Array<{
            optionId: string;
            optionName: string;
            choiceName: string;
            priceModifier: number;
        }>;
    } | null>(null);
    const { t, i18n } = useTranslation();

    const currentLang = i18n.language;
    const translations = item.translations as any;
    const itemName = (currentLang && translations && translations[currentLang]?.name) || item.name;
    const itemDesc = (currentLang && translations && translations[currentLang]?.description) || item.description;

    const showToast = (itemName: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(itemName);
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 2200);
    };

    useEffect(() => {
        return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
    }, []);

    useEffect(() => {
      if (!item.options?.length) return;
      setSelectedOptions((prev) => {
        const init: Record<string, any> = { ...prev };
        (item.options as any[]).forEach((opt: any) => {
          if (
            opt.type === 'VARIATION' &&
            opt.choices?.length > 0 &&
            !init[opt.id]
          ) {
            init[opt.id] = {
              optionId: opt.id,
              optionName: opt.name,
              choiceName: opt.choices[0].name,
              priceModifier: opt.choices[0].priceModifier ?? 0,
            };
          }
        });
        return init;
      });
    }, [item.id]);

    const preserveScrollPosition = () => {
        const y = window.scrollY;
        requestAnimationFrame(() => {
            window.scrollTo({ top: y });
        });
    };

    const getImageUrl = (url: string) => {
        if (url.startsWith('http')) return url;
        const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';
        const baseUrl = apiUrl.replace('/api', '');
        return `${baseUrl}/${url}`;
    };

    const handleOptionChange = (option: MenuOption, choice: OptionChoice) => {
        setSelectedOptions(prev => ({
            ...prev,
            [option.id]: choice,
        }));
    };

    const buildMainCartItem = () => {
        const optionsWithDetails = Object.entries(selectedOptions).map(([optionId, choice]) => {
            const option = item.options?.find(o => o.id === optionId);
            return {
                optionId: optionId,
                optionName: option?.name || 'Option',
                choiceName: choice.name,
                priceModifier: choice.priceModifier || 0,
            };
        });

        const cartId = optionsWithDetails.length > 0
           ? `${item.id}-${optionsWithDetails.map(o => `${o.optionId}:${o.choiceName}`).join('|')}`
           : item.id;

        return {
            cartId,
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            selectedOptions: optionsWithDetails,
        };
    };

    const handleAddToCart = () => {
        const mainCartItem = buildMainCartItem();
        if (perfectPairings && perfectPairings.length > 0) {
            setPendingMainItem(mainCartItem);
            setShowIntercept(true);
            preserveScrollPosition();
            return;
        }
        addItem(mainCartItem);
        showToast(item.name);
        preserveScrollPosition();
    };

    const handlePairingAction = (pairing?: Item) => {
        if (pendingMainItem) {
            addItem(pendingMainItem);
        }
        if (pairing) {
            addItem({
                id: pairing.id,
                name: pairing.name,
                price: pairing.price,
                quantity: 1,
                selectedOptions: [],
                cartId: `${pairing.id}-${Date.now()}`
            });
            showToast(`${pendingMainItem?.name || item.name} + ${pairing.name}`);
        } else {
            showToast(pendingMainItem?.name || item.name);
        }
        setPendingMainItem(null);
        setShowIntercept(false);
        preserveScrollPosition();
    };

    const priceLabel = formatInlineDual(item.price, item.currency);

    return (
        <>
            {/* Horizontal card: image 1/3 left, content right */}
            <div
                className="glass-panel p-3 rounded-[1.75rem] flex gap-3 shadow-lg relative overflow-hidden group border-white/5 animate-in slide-in-from-bottom-4 duration-500"
                style={{ backgroundColor: 'var(--theme-card, inherit)' }}
            >
                {/* Image — 1/3 width */}
                {item.imageUrl ? (
                    <div
                        className="w-[30%] flex-shrink-0 rounded-2xl overflow-hidden cursor-zoom-in relative group/img"
                        onClick={() => setLightboxOpen(true)}
                    >
                        <img
                            src={getImageUrl(item.imageUrl)}
                            alt={itemName}
                            loading="lazy"
                            className="w-full h-full object-cover aspect-square group-hover:scale-105 transition-transform duration-300"
                        />
                    </div>
                ) : (
                    <div className="w-[30%] flex-shrink-0 rounded-2xl bg-secondary/30 flex items-center justify-center aspect-square">
                        <span className="text-2xl font-serif font-black text-muted-foreground/30">
                            {itemName[0]}
                        </span>
                    </div>
                )}

                {/* Content — 2/3 width */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                        <h3
                            className="text-base font-serif font-black tracking-tight leading-tight truncate"
                            style={{ fontFamily: 'var(--font-heading, inherit)', color: 'var(--theme-text, inherit)' }}
                        >
                            {itemName}
                        </h3>
                        {itemDesc && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                {itemDesc}
                            </p>
                        )}
                    </div>

                    {/* Tags */}
                    {(item.dietaryTags?.length || item.allergens?.length) ? (() => {
                      const translatedAllergens = (currentLang && translations && translations[currentLang]?.allergens) || item.allergens || [];
                      const translatedTags = (currentLang && translations && translations[currentLang]?.dietaryTags) || item.dietaryTags || [];
                      return (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {translatedTags.map((tag: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] uppercase font-bold tracking-wide bg-emerald-500/5">
                            {tag}
                          </span>
                        ))}
                        {translatedAllergens.map((allergen: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 rounded-full border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[9px] uppercase font-bold tracking-wide bg-amber-500/5">
                            {allergen}
                          </span>
                        ))}
                      </div>
                      );
                    })() : null}

                    {/* Price + Add button row */}
                    <div className="flex items-center justify-between mt-2.5">
                        <span className="text-xs font-bold text-foreground/80">
                            {priceLabel}
                        </span>
                        <button
                            onClick={handleAddToCart}
                            className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-accent text-accent-foreground text-[11px] font-bold uppercase tracking-wide hover:shadow-[0_6px_16px_-4px_var(--color-accent)] active:scale-95 transition-all"
                            aria-label={`${t('publicMenu.addToCart')}: ${itemName}`}
                        >
                            {t('publicMenu.addShort', '+ Add')}
                        </button>
                    </div>
                </div>

                {/* Toast */}
                {toastMessage && (
                    <div
                        className="absolute bottom-3 left-3 right-3 z-30 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg border border-emerald-500/20"
                        style={{
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(5,150,105,0.95) 100%)',
                            animation: 'toastSlideUp 0.35s cubic-bezier(0.16,1,0.3,1), toastFadeOut 0.4s ease 1.8s forwards',
                        }}
                    >
                        <span className="text-white font-bold text-[10px] uppercase tracking-wider truncate">
                            {toastMessage}
                        </span>
                        <span className="text-white/70 text-[9px] font-semibold uppercase ml-auto flex-shrink-0">
                            {t('publicMenu.addedToCart', 'Added')}
                        </span>
                    </div>
                )}
            </div>

            {/* Perfect Pairing Modal Portal — unchanged from original */}
            {showIntercept && perfectPairings && perfectPairings.length > 0 && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
                        onClick={() => handlePairingAction(undefined)}
                    />
                    <div className="relative w-full max-w-3xl bg-zinc-900 border border-white/10 shadow-2xl rounded-[3rem] overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-accent/20 blur-[120px] pointer-events-none" />
                        <div className="relative z-10 p-8 sm:p-12 flex flex-col md:flex-row gap-10">
                            <div className="flex-1 flex flex-col justify-center text-center md:text-left">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/20 border border-accent/30 w-fit mx-auto md:mx-0 mb-6">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">{t('publicMenu.pairing.title')}</span>
                                </div>
                                <h3 className="text-4xl sm:text-5xl font-serif font-black text-white tracking-tighter leading-[0.95] mb-6">
                                    {t('publicMenu.pairing.completeYour', { name: item.name })}
                                </h3>
                                <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-8 max-w-[280px] mx-auto md:mx-0">
                                    {t('publicMenu.pairing.chefDescription')}
                                </p>
                                <button
                                    onClick={() => handlePairingAction(undefined)}
                                    className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 hover:text-white transition-colors text-center md:text-left"
                                >
                                    {t('publicMenu.pairing.noThanks')}
                                </button>
                            </div>
                            <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {perfectPairings.map((pairing) => {
                                    const pTrans = pairing.translations as any;
                                    const pairingName = (currentLang && pTrans && pTrans[currentLang]?.name) || pairing.name;
                                    const pairPrice = formatInlineDual(pairing.price, pairing.currency);
                                    return (
                                    <div
                                        key={`intercept-${pairing.id}`}
                                        className="group relative bg-white/5 hover:bg-white/10 rounded-[2rem] p-4 border border-white/5 transition-all duration-300"
                                    >
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-black shadow-xl border border-white/10 group-hover:scale-105 transition-transform duration-300">
                                                {pairing.imageUrl ? (
                                                    <img src={getImageUrl(pairing.imageUrl)} alt={pairingName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-accent/10">
                                                        <span className="text-xl font-serif font-black text-accent">{pairingName[0]}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-grow min-w-0">
                                                <h4 className="text-lg font-serif font-bold text-white leading-tight truncate">{pairingName}</h4>
                                                <p className="text-accent font-bold text-sm mt-1">{pairPrice}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handlePairingAction(pairing)}
                                            className="w-full py-3.5 rounded-[1.25rem] bg-white text-black font-black uppercase text-[9px] tracking-[0.2em] transition-all hover:bg-accent hover:text-white"
                                        >
                                            {t('publicMenu.pairing.addToOrder')}
                                        </button>
                                    </div>
                                )})}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Image Lightbox */}
            {lightboxOpen && item.imageUrl && (
                <ImageLightbox
                    src={getImageUrl(item.imageUrl)}
                    alt={item.name}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </>
    );
};
```

Key changes from original:
- Layout: vertical → horizontal (`flex gap-3`, image 30% left, content 70% right)
- Image: `aspect-square` with `w-[30%]`, no-URL fallback shows first letter
- Price: `formatInlineDual(item.price, item.currency)` → `"12.50 € / 24.45 лв"`
- Button: full-width solid blue → pill `rounded-full` with `"+ Add"` text
- Tags: compact `text-[9px]` with shorter padding
- Options section: removed from horizontal card (available via modal intercept — options UI stays same since it's portal-based)

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/menu/ItemWithOptions.tsx
git commit -m "feat: redesign item cards — horizontal layout, dual-currency prices, pill +Add buttons"
```

---

### Task 5: Category Horizontal Scroll Pills

**Files:**
- Create: `apps/frontend/src/components/menu/CategoryPills.tsx`
- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx` (replace category nav section)

- [ ] **Step 1: Write the CategoryPills component**

```tsx
// apps/frontend/src/components/menu/CategoryPills.tsx
import { Category } from '../../types';

interface CategoryPillsProps {
  categories: Category[];
  activeCategory: string | null;
  selectedLang: string;
  onSelect: (id: string) => void;
}

export function CategoryPills({
  categories,
  activeCategory,
  selectedLang,
  onSelect,
}: CategoryPillsProps) {
  return (
    <div className="sticky top-[4.5rem] z-30 px-3 py-2">
      <div className="flex gap-2 overflow-x-auto hide-scrollbar glass-panel p-1.5 rounded-[1.75rem] border-white/5 shadow-lg">
        {categories.map((cat) => {
          const catName =
            (selectedLang &&
              (cat.translations as any)?.[selectedLang]?.name) ||
            cat.name;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider transition-all duration-200 active:scale-95 flex-shrink-0 ${
                isActive
                  ? 'bg-foreground text-background shadow-md'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              {catName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace category nav in PublicMenuPage**

Replace the entire "Premium Sticky Navigation" block (lines 449–516 in original) with:

```tsx
                {/* Category Horizontal Scroll Pills */}
                <CategoryPills
                  categories={menuData.categories}
                  activeCategory={activeCategory}
                  selectedLang={selectedLang}
                  onSelect={scrollToCategory}
                />
```

- [ ] **Step 3: Add import**

```tsx
import { CategoryPills } from "../components/menu/CategoryPills";
```

- [ ] **Step 4: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/menu/CategoryPills.tsx apps/frontend/src/pages/PublicMenuPage.tsx
git commit -m "feat: add CategoryPills — horizontal scroll pill navigation replacing sticky nav"
```

---

### Task 6: Slim Trending Carousel

**Files:**
- Modify: `apps/frontend/src/components/menu/TrendingCarousel.tsx`

The TrendingCarousel is only 80 lines — it renders `ItemWithOptions` inside a horizontal scroll. Since ItemWithOptions now uses horizontal layout (Task 4), the carousel cards automatically get the new design. Changes needed:

1. Skeleton loader: reduce height from `h-[340px]` to `h-[200px]` (horizontal cards are shorter)
2. Card width: widen from `min-w-[280px] max-w-[300px]` to `min-w-[320px] max-w-[380px]` (horizontal layout needs more width)
3. Skeleton loader shape: remove image placeholder (now on left), adjust inner layout to match new horizontal shape

- [ ] **Step 1: Update skeleton loader and card widths**

```tsx
// Replace lines 33–51 (skeleton loader) with compact version:
if (loading) {
    return (
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="h-6 w-32 bg-secondary rounded-lg animate-pulse" />
        </div>
        <div className="flex overflow-hidden gap-4 px-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-w-[320px] max-w-[380px] shrink-0">
              <div className="glass-panel p-3 rounded-[1.75rem] border-white/5 h-[120px] flex gap-3 animate-pulse">
                <div className="w-[30%] rounded-2xl bg-secondary flex-shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-3/4 bg-secondary rounded-lg" />
                  <div className="h-3 w-1/2 bg-secondary rounded-lg" />
                  <div className="h-3 w-full bg-secondary rounded-lg mt-auto" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
}
```

Replace the carousel card wrapper (lines 64–77) with wider cards:

```tsx
      <div className="flex overflow-x-auto gap-4 pb-4 px-4 hide-scrollbar snap-x">
        {trendingItems.map(item => {
            const translatedItem = {
                ...item,
                name: (i18n.language && (item as any).translations && (item as any).translations[i18n.language]?.name) || item.name,
                description: (i18n.language && (item as any).translations && (item as any).translations[i18n.language]?.description) || item.description,
            };
            const pairings = allMenuItems.filter(i => item.relatedItemIds?.includes(i.id));
            return (
                <div key={item.id} className="min-w-[320px] max-w-[380px] snap-center shrink-0">
                    <ItemWithOptions item={translatedItem} perfectPairings={pairings} />
                </div>
            );
        })}
      </div>
```

And update the section margin: `mb-16` → `mb-10` (line 57).

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/components/menu/TrendingCarousel.tsx
git commit -m "feat: slim TrendingCarousel — wider horizontal cards, compact skeleton loader"

---

### Task 7: Bottom Navigation Regroup

**Files:**
- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx` (action bar section, lines 642–738)

- [ ] **Step 1: Regroup the bottom action bar**

Replace the action bar (lines 642–738) with regrouped B-style layout: user-profile left group, cart-bill right group.

```tsx
        {/* Action Bar — regrouped: profile/waiter left, cart/bill right */}
        <div
          className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-4 md:px-6"
          style={{ bottom: 'max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))' }}
        >
          <div className="flex items-center w-full max-w-[480px] justify-between p-1.5 md:p-2.5 glass-panel rounded-[2rem] md:rounded-[2.5rem] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.5)] border-white/20 dark:border-white/10 pointer-events-auto bg-white/90 dark:bg-black/90">
            {/* LEFT GROUP: Waiter + Profile/Sign-In */}
            <div className="flex items-center gap-0.5">
              {/* Call Waiter */}
              <button
                onClick={() => {
                  if (assistanceSent || assistanceLoading) return;
                  if (!tableNumber) { handleAssistanceRequest(); return; }
                  setIsAssistanceDialogOpen(true);
                }}
                disabled={assistanceSent || assistanceLoading}
                aria-label={tableNumber ? t("publicMenu.callWaiter") : t("publicMenu.scanQrForAssistance", "Scan QR to call waiter")}
                className="flex items-center justify-center p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-60 disabled:cursor-not-allowed transition-all min-h-[44px] min-w-[44px]"
              >
                <div className="relative">
                  <Bell className="h-5 w-5 text-accent" />
                  {tableNumber && !assistanceSent && (
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full border-2 border-white dark:border-black" />
                  )}
                </div>
              </button>

              {user ? (
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() =>
                      navigate(
                        `/profile?returnTo=${encodeURIComponent(
                          location.pathname + location.search,
                        )}`,
                      )
                    }
                    aria-label={t("publicMenu.myProfile")}
                    className="flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] hover:opacity-70 transition-opacity text-accent"
                  >
                    <UserCircle className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => logout()}
                    aria-label={t("publicMenu.logout")}
                    className="p-2.5 hover:opacity-70 transition-opacity"
                  >
                    <LogOut className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsLoginModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-secondary text-secondary-foreground text-[10px] font-black uppercase tracking-wider hover:bg-secondary/80 transition-colors"
                >
                  {t("publicMenu.signIn", "Sign In")}
                </button>
              )}
            </div>

            {/* RIGHT GROUP: Bill + Cart */}
            <div className="flex items-center gap-0.5">
              {sessionToken && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-accent text-accent-foreground text-[10px] px-3 py-2 rounded-xl font-bold"
                  onClick={async () => {
                    try {
                      await getSessionBill(sessionToken);
                      setIsPaymentModalOpen(true);
                    } catch {
                      setSessionToken(null);
                      if (tableNumber) localStorage.removeItem(`session-${tableNumber}`);
                    }
                  }}
                >
                  {t('payment.requestBill')}
                </Button>
              )}
              <div className="flex-shrink-0">
                <CartIcon
                  categories={menuData?.categories}
                  restaurantId={restaurantId}
                  selectedLang={selectedLang}
                />
              </div>
            </div>
          </div>
        </div>
```

Changes from original:
- Removed vertical dividers between groups
- Waiter + Profile/Sign-In grouped left (user-centric)
- Bill + Cart grouped right (purchase actions)
- Clear visual separation via spacing between groups
- Removed text labels from Waiter button (icon-only on all sizes)
- Removed "Staff Notified" text label — just the bell icon with state

- [ ] **Step 2: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/PublicMenuPage.tsx
git commit -m "feat: regroup bottom nav — profile/waiter left, bill/cart right"
```

---

### Task 8: i18n Keys — EN/BG/RO

**Files:**
- Modify: `apps/frontend/src/locales/en/translation.json`
- Modify: `apps/frontend/src/locales/bg/translation.json`
- Modify: `apps/frontend/src/locales/ro/translation.json`

- [ ] **Step 1: Add new keys to EN translation.json**

Append these keys to the `publicMenu` section:

```json
"publicMenu": {
  "search": "Search",
  "filters": "Filters",
  "addShort": "+ Add",
  "dietaryPreferences": "Dietary Preferences",
  "excludeAllergens": "Exclude Allergens"
}
```

- [ ] **Step 2: Add new keys to BG translation.json**

```json
"publicMenu": {
  "search": "Търсене",
  "filters": "Филтри",
  "addShort": "+ Добави",
  "dietaryPreferences": "Диетични предпочитания",
  "excludeAllergens": "Изключи алергени"
}
```

- [ ] **Step 3: Add new keys to RO translation.json**

```json
"publicMenu": {
  "search": "Căutare",
  "filters": "Filtre",
  "addShort": "+ Adaugă",
  "dietaryPreferences": "Preferințe dietetice",
  "excludeAllergens": "Exclude alergeni"
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/locales/en/translation.json apps/frontend/src/locales/bg/translation.json apps/frontend/src/locales/ro/translation.json
git commit -m "feat: add i18n keys — search, filters, addShort, dietary/allergen labels EN/BG/RO"
```

---

### Task 9: Dual-Currency in CartDrawer, CheckoutPage, PaymentModal

**Files:**
- Modify: `apps/frontend/src/components/cart/CartDrawer.tsx`
- Modify: `apps/frontend/src/pages/CheckoutPage.tsx`
- Modify: `apps/frontend/src/components/payment/PaymentModal.tsx`
- Modify: `apps/frontend/src/components/cart/CartIcon.tsx` (if it shows prices)

- [ ] **Step 1: Update CartDrawer.tsx dual-currency**

Replace all `€{...}` patterns with `formatInlineDual(...)`:

1. Add import: `import { formatInlineDual } from '../../lib/currency';`
2. Line 152: `€{(drink.price ?? 0).toFixed(2)}` → `{formatInlineDual(drink.price ?? 0, drink.currency ?? 'EUR')}`
3. Line 208: `(+€{(opt.priceModifier || 0).toFixed(2)})` → `(+{formatInlineDual(opt.priceModifier || 0, 'EUR')})`
   Note: option modifiers are always in item currency, keep `€` since option doesn't carry its own currency field. Just use `formatEuro` for option priceModifiers.
4. Line 217: `€{getLineItemTotal(item).toFixed(2)}` → `{formatInlineDual(getLineItemTotal(item), 'EUR')}`
   (Cart doesn't store currency per item — need to look up from categories)
5. Line 245: `€{getTotal().toFixed(2)}` → `{formatInlineDual(getTotal(), 'EUR')}`

- [ ] **Step 2: Update CheckoutPage.tsx dual-currency**

Search for all `€{` patterns and replace:
1. Add import: `import { formatInlineDual, formatEuro } from '../lib/currency';`
2. Replace all item price displays and total displays with `formatInlineDual`.

- [ ] **Step 3: Update PaymentModal.tsx dual-currency**

Add import: `import { formatEuro, formatBgn } from '../../lib/currency';`

Replace all `€{...}` patterns with `formatEuro(...)`. The payment flow doesn't have `item.currency` context (bill API returns just numbers), so we show dual-currency by adding BGN line:

Line 73: `€{(total - tipAmount).toFixed(2)}` → `{formatEuro(total - tipAmount)}`
Line 78: `€{tipAmount.toFixed(2)}` → `{formatEuro(tipAmount)}`
Line 83: `€{total.toFixed(2)}` → `{formatEuro(total)}`
Line 96: `€{total.toFixed(2)}` → `{formatEuro(total)}`
Line 156: `€{bill.subtotal.toFixed(2)}` → `{formatEuro(bill.subtotal)}`
Line 193: `€{(bill.subtotal * activeTipPercent / 100).toFixed(2)}` → `{formatEuro(bill.subtotal * activeTipPercent / 100)}`
Line 226: `€{(payment?.total ?? 0).toFixed(2)}` → `{formatEuro(payment?.total ?? 0)}`

For subtotal/total displays (lines 73, 83, 156, 226), also add BGN line underneath:
```tsx
// After each formatEuro display for totals, add:
<span className="text-xs text-muted-foreground">{formatBgn(total)}</span>
```

- [ ] **Step 4: Verify type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/cart/CartDrawer.tsx apps/frontend/src/pages/CheckoutPage.tsx apps/frontend/src/components/payment/PaymentModal.tsx
git commit -m "feat: dual-currency prices in CartDrawer, Checkout, PaymentModal — EUR + BGN at fixed BNB rate"
```

---

### Task 10: Final Integration — Remove Dead Code & Polish

**Files:**
- Modify: `apps/frontend/src/pages/PublicMenuPage.tsx`

- [ ] **Step 1: Remove dead/unused code from PublicMenuPage**

1. Remove `LANG_LABELS` constant (lines 18–22) — replaced by inline `LANG_CODES` in TopBar
2. Remove `handleLanguageChange` (lines 169–173) — replaced by inline handler in TopBar
3. Remove old `activeFilter` state (line 50) — already removed in Task 3
4. Remove `ChevronDown` import (line 10) — no longer needed for category select
5. Verify `Globe` is still imported (now used in TopBar) — if not used directly in PublicMenuPage anymore, remove from imports

- [ ] **Step 2: Build check**

Run: `npm run build` from `apps/frontend`
Expected: Successful build with no errors.

- [ ] **Step 3: Final type check**

Run: `npx tsc --noEmit` from `apps/frontend`
Expected: Zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/PublicMenuPage.tsx
git commit -m "refactor: remove dead code from PublicMenuPage — unused imports, constants, handlers"
```

---

## Verification

```bash
cd apps/frontend
npx tsc --noEmit   # Zero errors
npm run build      # Vite build succeeds
```

## Files Summary

| File | Change |
|------|--------|
| `apps/frontend/src/lib/currency.ts` | **Create** — dual-currency formatters |
| `apps/frontend/src/components/menu/TopBar.tsx` | **Create** — search, filter, theme, lang |
| `apps/frontend/src/components/menu/FilterPanel.tsx` | **Create** — dietary toggles + allergen pills |
| `apps/frontend/src/components/menu/CategoryPills.tsx` | **Create** — horizontal scroll pills |
| `apps/frontend/src/components/menu/ItemWithOptions.tsx` | **Modify** — horizontal layout, dual-currency, pill button |
| `apps/frontend/src/components/menu/TrendingCarousel.tsx` | **Modify** — dual-currency, compact cards |
| `apps/frontend/src/pages/PublicMenuPage.tsx` | **Modify** — wire components, regroup nav, remove logo/dead code |
| `apps/frontend/src/pages/CheckoutPage.tsx` | **Modify** — dual-currency prices |
| `apps/frontend/src/components/cart/CartDrawer.tsx` | **Modify** — dual-currency prices |
| `apps/frontend/src/components/payment/PaymentModal.tsx` | **Modify** — dual-currency prices |
| `apps/frontend/src/locales/en/translation.json` | **Modify** — 5 new keys |
| `apps/frontend/src/locales/bg/translation.json` | **Modify** — 5 new keys |
| `apps/frontend/src/locales/ro/translation.json` | **Modify** — 5 new keys |
