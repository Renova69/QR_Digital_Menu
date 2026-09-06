import React from "react";
import { useTranslation } from "react-i18next";
import { Ban } from "lucide-react";
import type { MenuSearchResult } from "../../lib/menuSearch";
import { resolveTag } from "../../lib/menuTags";

interface MenuSearchResultsProps {
  results: MenuSearchResult[];
  isLoading: boolean;
  query: string;
  onSelect: (categoryId: string) => void;
}

export const MenuSearchResults: React.FC<MenuSearchResultsProps> = ({
  results,
  isLoading,
  query,
  onSelect,
}) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex justify-center p-4 sm:p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed p-4 text-center sm:p-12">
        <p className="text-muted-foreground">
          {t("menuAdmin.noSearchResults", {
            defaultValue: 'No items match "{{query}}".',
            query,
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border-white/5 p-4 sm:p-6">
      <h2 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-6">
        {t("menuAdmin.searchResultsCount", {
          defaultValue: '{{count}} results for "{{query}}"',
          count: results.length,
          query,
        })}
      </h2>
      <div className="space-y-3">
        {results.map(({ item, categoryId, categoryName }) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(categoryId)}
            className="w-full p-4 bg-card border border-border rounded-lg shadow-sm hover:border-primary/30 transition-all flex items-start gap-4 text-left"
          >
            {item.imageUrl && (
              <div className="h-14 w-14 min-w-[3.5rem] rounded-md overflow-hidden bg-secondary border border-border">
                <img
                  src={
                    item.imageUrl.startsWith("http")
                      ? item.imageUrl
                      : `${(import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace("/api", "")}/${item.imageUrl}`
                  }
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wide">
                  {categoryName}
                </span>
                <h4 className="font-bold text-foreground">{item.name}</h4>
                {item.isOutOfStock && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wide border border-red-100 inline-flex items-center gap-1">
                    <Ban className="h-2.5 w-2.5" />
                    {t("menuAdmin.outOfStock", "86'd")}
                  </span>
                )}
              </div>
              {item.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {item.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="font-bold text-primary">
                  €{item.price.toFixed(2)}
                </span>
                {[...(item.dietaryTags ?? []), ...(item.allergens ?? [])].map(
                  (tag) => {
                    const preset = resolveTag(tag);
                    const label = preset ? t(preset.labelKey, tag) : tag;
                    return (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-secondary text-[10px] font-medium text-muted-foreground"
                      >
                        {preset && <preset.Icon className="h-2.5 w-2.5" />}
                        {label}
                      </span>
                    );
                  },
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
