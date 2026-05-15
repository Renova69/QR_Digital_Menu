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

  const knownAllergens = new Set([
    'gluten', 'wheat', 'milk', 'dairy', 'eggs', 'fish', 'shellfish',
    'nuts', 'peanuts', 'soy', 'soya', 'celery', 'mustard', 'sesame',
    'sulphites', 'lupin', 'molluscs', 'crustaceans',
    'лактоза', 'глутен', 'ядки', 'риба', 'яйца', 'соя',
    'lactoză', 'gluten', 'nuci', 'pește', 'ouă', 'soia',
  ]);
  const allergens = dietTags.filter(({ tag }) =>
    knownAllergens.has(tag.toLowerCase()),
  );
  const dietary = dietTags.filter(({ tag }) =>
    !knownAllergens.has(tag.toLowerCase()),
  );

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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={panelRef}
        className="relative ml-auto w-full max-w-sm h-full bg-card border-l border-border shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-label={t('publicMenu.filters', 'Filters')}
      >
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

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('publicMenu.search', 'Search')}
              aria-label={t('publicMenu.search', 'Search')}
              className="w-full pl-9 pr-3 py-2.5 bg-secondary rounded-xl text-sm font-medium placeholder:text-muted-foreground/50 border border-transparent focus:border-accent/30 focus:outline-none"
            />
          </div>
        </div>

        {dietary.length > 0 && (
          <div className="p-4 border-b border-border">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              {t('publicMenu.dietaryPreferences', 'Dietary Preferences')}
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

        {allergens.length > 0 && (
          <div className="p-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">
              {t('publicMenu.excludeAllergens', 'Exclude Allergens')}
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
