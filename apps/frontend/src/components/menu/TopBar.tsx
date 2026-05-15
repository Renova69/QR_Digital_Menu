// apps/frontend/src/components/menu/TopBar.tsx
import { Search, Filter, Globe, Utensils } from 'lucide-react';
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
      <div className="flex items-center gap-2 p-2 rounded-[1.75rem] glass-panel border-white/10 shadow-lg">
        {tableNumber && (
          <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-accent/10 border border-accent/20 flex-shrink-0">
            <Utensils className="h-4 w-4 text-accent" />
            <span className="text-sm font-black text-accent">
              {tableNumber}
            </span>
          </div>
        )}

        <div className="flex-1 relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('publicMenu.search', 'Search')}
            aria-label={t('publicMenu.search', 'Search')}
            className="w-full pl-9 pr-3 py-2 bg-secondary/50 rounded-xl text-sm font-medium text-foreground placeholder:text-muted-foreground/50 border border-transparent focus:border-accent/30 focus:outline-none transition-colors"
          />
        </div>

        <button
          onClick={onFilterClick}
          aria-label={t('publicMenu.filters', 'Filters')}
          className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-secondary/60 transition-colors flex-shrink-0"
        >
          <Filter className="h-5 w-5 text-foreground/70" />
        </button>

        <ThemeToggle
          size="sm"
          storageKey={restaurantId ? `theme-${restaurantId}` : 'theme'}
          defaultTheme={defaultTheme ?? 'light'}
        />

        {targetLanguages.length > 1 && (
          <div className="relative flex-shrink-0">
            <Globe className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <select
              value={selectedLang}
              onChange={(e) => onLanguageChange(e.target.value)}
              aria-label={t('publicMenu.selectLanguage', 'Select language')}
              className="appearance-none h-9 pl-7 pr-3 bg-secondary/50 rounded-xl text-xs font-black uppercase tracking-wider text-foreground border border-transparent focus:border-accent/30 focus:outline-none cursor-pointer"
            >
              {targetLanguages.map((code) => (
                <option key={code} value={code}>
                  {LANG_CODES[code] ?? code.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
