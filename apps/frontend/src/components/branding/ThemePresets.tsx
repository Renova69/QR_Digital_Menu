import React from 'react';
import { Palette, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ThemePreset {
  id: string;
  name: string;
  bg: string;
  text: string;
  card: string;
  accent: string;
  fontHeading: string;
  fontBody: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic-light',
    name: 'Classic Light',
    bg: '#FFFFFF',
    text: '#1A1A1A',
    card: '#F8F8F8',
    accent: '#2D6A4F',
    fontHeading: 'Playfair Display',
    fontBody: 'Outfit',
  },
  {
    id: 'modern-dark',
    name: 'Modern Dark',
    bg: '#0F0F0F',
    text: '#F0F0F0',
    card: '#1E1E1E',
    accent: '#6366F1',
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'warm-bistro',
    name: 'Warm Bistro',
    bg: '#FDF6EC',
    text: '#2C1810',
    card: '#F5E6D0',
    accent: '#C0622A',
    fontHeading: 'Lora',
    fontBody: 'Lato',
  },
  {
    id: 'minimal-neutral',
    name: 'Minimal',
    bg: '#F5F5F4',
    text: '#292524',
    card: '#FAFAF9',
    accent: '#78716C',
    fontHeading: 'Outfit',
    fontBody: 'Outfit',
  },
  {
    id: 'fine-dining',
    name: 'Fine Dining',
    bg: '#0D0D0D',
    text: '#F5E6C8',
    card: '#1A1510',
    accent: '#C9A84C',
    fontHeading: 'Playfair Display',
    fontBody: 'Lato',
  },
  {
    id: 'fresh-cafe',
    name: 'Fresh Cafe',
    bg: '#F0F9F4',
    text: '#1A3A2A',
    card: '#FFFFFF',
    accent: '#2D9E6B',
    fontHeading: 'Poppins',
    fontBody: 'Open Sans',
  },
];

interface ThemePresetsProps {
  currentAccent: string;
  currentBg: string;
  currentText: string;
  currentCard: string;
  currentFontHeading: string;
  currentFontBody: string;
  onApply: (preset: ThemePreset) => void;
}

const PRESET_NAME_KEYS: Record<string, string> = {
  'classic-light': 'branding.presetClassicLight',
  'modern-dark': 'branding.presetModernDark',
  'warm-bistro': 'branding.presetWarmBistro',
  'minimal-neutral': 'branding.presetMinimal',
  'fine-dining': 'branding.presetFineDining',
  'fresh-cafe': 'branding.presetFreshCafe',
};

export const ThemePresets: React.FC<ThemePresetsProps> = ({
  currentAccent, currentBg, currentText, currentCard, currentFontHeading, currentFontBody, onApply,
}) => {
  const { t } = useTranslation();

  const isActive = (preset: ThemePreset) =>
    preset.accent === currentAccent &&
    preset.bg === currentBg &&
    preset.text === currentText &&
    preset.card === currentCard &&
    preset.fontHeading === currentFontHeading &&
    preset.fontBody === currentFontBody;

  return (
    <div className="border-b border-border pb-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Palette size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          {t('branding.themePresets', 'Theme Presets')}
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4 ml-[22px]">
        {t('branding.themePresetsDesc', 'Start with a curated palette. Fine-tune after applying.')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {THEME_PRESETS.map((preset) => {
          const active = isActive(preset);
          const localizedName = t(PRESET_NAME_KEYS[preset.id] ?? '', preset.name);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onApply(preset)}
              className={`group relative flex flex-col items-start p-3.5 rounded-lg border transition-all text-left ${
                active
                  ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                  : 'border-border bg-background hover:border-primary/30 hover:shadow-sm'
              }`}
              title={t('branding.applyPreset', 'Apply {{name}}', { name: localizedName })}
            >
              <div className="flex gap-1 mb-2.5">
                {[preset.bg, preset.card, preset.accent, preset.text].map((color, i) => (
                  <span
                    key={i}
                    className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
                    style={{ backgroundColor: color, border: '1px solid rgba(0,0,0,0.08)' }}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold text-foreground leading-tight">{localizedName}</span>
              <span
                className="text-[10px] text-muted-foreground mt-0.5 truncate w-full"
                style={{ fontFamily: preset.fontHeading }}
              >
                {preset.fontHeading}
              </span>
              {active && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                  <Check size={9} className="text-primary-foreground" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
