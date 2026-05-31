import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ChevronDown, Search, X, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BRANDING_FONTS } from '../../lib/brandingFonts';

// Single source of truth shared with the public menu's load allowlist (#12).
const FONTS = BRANDING_FONTS;

// Inject a Google Fonts stylesheet once per family, keyed by data-font so
// repeated calls (value change, dropdown open) dedupe instead of thrashing
// the document head with anonymous links that get added/removed each render.
function ensureFontLoaded(name: string) {
  if (!name || document.querySelector(`link[data-font="${name}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.setAttribute('data-font', name);
  link.href = `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, '+')}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

interface FontPickerProps {
  label: string;
  value: string;
  onChange: (font: string) => void;
  pairedFont?: string;
  isHeading?: boolean;
}

export const FontPicker: React.FC<FontPickerProps> = ({
  label,
  value,
  onChange,
  pairedFont,
  isHeading = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    ensureFontLoaded(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    FONTS.forEach((font) => ensureFontLoaded(font.name));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const currentFont = FONTS.find((f) => f.name === value);
  const suggestedPairs = isHeading && currentFont ? currentFont.pairsWith : [];
  const pairingIsGood = pairedFont ? suggestedPairs.includes(pairedFont) : false;
  const topSuggestions = suggestedPairs.slice(0, 2);

  const filtered = useMemo(() => {
    if (!search) return FONTS;
    return FONTS.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

  const categories = useMemo(
    () => Array.from(new Set(filtered.map((f) => f.category))),
    [filtered],
  );

  return (
    <div className="relative" ref={rootRef}>
      <label className="block text-sm font-medium text-foreground/80 mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="w-full text-left px-3 py-2 border border-border rounded-lg bg-background text-foreground flex justify-between items-center focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all hover:border-primary/30"
        style={{ fontFamily: value }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="text-sm truncate">{value}</span>
        <ChevronDown
          size={13}
          className={`flex-shrink-0 opacity-50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isHeading && pairedFont && (
        <p className={`text-[10px] mt-1 flex items-center gap-1 ${pairingIsGood ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          {pairingIsGood ? (
            <>
              <CheckCircle2 size={10} className="flex-shrink-0" />
              {t('branding.fontPairingGood', 'Pairs well with')} {pairedFont}
            </>
          ) : topSuggestions.length > 0 ? (
            <>{t('branding.fontPairingSuggest', 'Try pairing with:')} {topSuggestions.join(', ')}</>
          ) : null}
        </p>
      )}

      {isOpen && (
        <div
          className="absolute z-50 w-full mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
          role="listbox"
          style={{ maxHeight: '320px', display: 'flex', flexDirection: 'column' }}
        >
          <div className="p-2 border-b border-border bg-card flex-shrink-0">
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder={t('branding.fontSearch', 'Search fonts...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full pl-7 pr-7 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/50"
                autoFocus
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1">
            {categories.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">{t('branding.noFontsFound', 'No fonts found')}</p>
            )}
            {categories.map((category) => (
              <div key={category}>
                <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 px-3 py-1.5 bg-muted/40 sticky top-0 backdrop-blur-sm">
                  {category}
                </div>
                {filtered
                  .filter((f) => f.category === category)
                  .map((font) => {
                    const isPair = suggestedPairs.includes(font.name);
                    return (
                      <button
                        key={font.name}
                        type="button"
                        role="option"
                        aria-selected={value === font.name}
                        onClick={() => {
                          onChange(font.name);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                          value === font.name
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <div className="min-w-0">
                          <span style={{ fontFamily: font.name }} className="text-sm font-bold block truncate">
                            {font.name}
                          </span>
                          <span style={{ fontFamily: font.name }} className="text-xs opacity-50 block">
                            Aa Bb 123
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          {isPair && isHeading && (
                            <span className="text-[9px] font-semibold text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                              {t('branding.fontPairsBadge', 'pairs')}
                            </span>
                          )}
                          {value === font.name && (
                            <span className="text-[10px] font-semibold text-primary">✓</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
