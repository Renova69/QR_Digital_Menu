import { X, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useRef } from "react";
import { resolveTag } from "../../lib/menuTags";

interface TagCount {
  tag: string;
  count: number;
}

interface FilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Allergens and dietary tags arrive pre-separated from the source item fields
  // (item.allergens vs item.dietaryTags), so no language-specific keyword list is
  // needed to classify them — allergens in any language render under the right
  // heading.
  dietaryTags: TagCount[];
  allergenTags: TagCount[];
  activeDietTags: string[];
  onDietTagToggle: (tag: string) => void;
  excludedAllergens: string[];
  onAllergenToggle: (allergen: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filtersActive?: boolean;
  onClearFilters?: () => void;
}

export function FilterPanel({
  isOpen,
  onClose,
  dietaryTags,
  allergenTags,
  activeDietTags,
  onDietTagToggle,
  excludedAllergens,
  onAllergenToggle,
  searchQuery,
  onSearchChange,
  filtersActive = false,
  onClearFilters,
}: FilterPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  const allergens = allergenTags;
  const dietary = dietaryTags;

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    // z-[70]: above the public menu's floating Action Bar (call waiter /
    // profile / cart, z-50) and the assistance dialog (z-[60]) — at equal
    // z-index the Action Bar rendered later in the DOM would win the
    // stacking order and swallow taps on the bottom of this panel (#41).
    <div className="fixed inset-0 z-[70] flex">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="relative ml-auto w-full max-w-sm h-full bg-card border-l border-border shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-label={t("publicMenu.filters", "Filters")}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">
            {t("publicMenu.filters", "Filters")}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-secondary transition-colors"
            aria-label={t("common.close", "Close")}
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
              placeholder={t("publicMenu.search", "Search")}
              aria-label={t("publicMenu.search", "Search")}
              className="w-full pl-9 pr-3 py-2.5 bg-secondary rounded-xl text-sm font-medium placeholder:text-muted-foreground/50 border border-transparent focus:border-primary/30 focus:outline-none"
            />
          </div>
        </div>

        {dietary.length > 0 && (
          <div className="p-3.5 border-b border-border">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
              {t("publicMenu.dietaryPreferences", "Dietary Preferences")}
            </h3>
            <div>
              {dietary.map(({ tag, count }) => {
                const preset = resolveTag(tag);
                const label = preset ? t(preset.labelKey, tag) : tag;
                return (
                  <label
                    key={tag}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={activeDietTags.includes(tag)}
                        onChange={() => onDietTagToggle(tag)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      {preset && (
                        <preset.Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                      )}
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {allergens.length > 0 && (
          <div className="p-3.5 pb-24">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
              {t("publicMenu.excludeAllergens", "Exclude Allergens")}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {allergens.map(({ tag, count }) => {
                const preset = resolveTag(tag);
                const label = preset ? t(preset.labelKey, tag) : tag;
                return (
                  <button
                    key={tag}
                    onClick={() => onAllergenToggle(tag)}
                    aria-pressed={excludedAllergens.includes(tag)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                      excludedAllergens.includes(tag)
                        ? "bg-destructive/15 text-destructive border border-destructive/30 line-through"
                        : "bg-secondary text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    {preset && <preset.Icon className="h-3.5 w-3.5" />}
                    {label}
                    <span className="opacity-50">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filtersActive && onClearFilters && (
          <div className="p-4 border-t border-border sticky bottom-0 bg-card">
            <button
              onClick={() => {
                onClearFilters();
                onClose();
              }}
              className="w-full py-3 rounded-xl bg-destructive/10 text-destructive text-sm font-bold hover:bg-destructive/20 transition-colors active:scale-[0.98]"
            >
              {t("publicMenu.clearFilters", "Clear filters")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
