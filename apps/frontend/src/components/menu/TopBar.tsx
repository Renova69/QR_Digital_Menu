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
      <div className="flex items-center gap-2 p-2 rounded-[1.75rem] glass-panel border-white/10 shadow-lg">
        {tableNumber && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-accent/10 border border-accent/20 flex-shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-accent">
              ⌂{tableNumber}
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
          className="p-2 rounded-xl hover:bg-secondary/60 transition-colors flex-shrink-0"
        >
          <Filter className="h-5 w-5 text-foreground/70" />
        </button>

        <ThemeToggle
          size="sm"
          storageKey={restaurantId ? `theme-${restaurantId}` : 'theme'}
          defaultTheme={defaultTheme ?? 'light'}
        />

        {targetLanguages.length > 1 && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Globe className="h-4 w-4 text-muted-foreground mr-0.5" />
            {targetLanguages.map((code) => (
              <button
                key={code}
                onClick={() => onLanguageChange(code)}
                aria-current={selectedLang === code ? 'true' : undefined}
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
