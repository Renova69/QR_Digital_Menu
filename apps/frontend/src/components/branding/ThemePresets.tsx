import React from 'react';
import { Palette, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type BrandMode = 'light' | 'dark';

export interface BrandPalette {
  bg: string;
  text: string;
  card: string;
  accent: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  light: BrandPalette;
  dark: BrandPalette;
  fontHeading: string;
  fontBody: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic-light',
    name: 'Classic Light',
    light: { bg: '#FFFFFF', text: '#1A1A1A', card: '#F8F8F8', accent: '#2D6A4F' },
    dark: { bg: '#0C1210', text: '#F4F7F5', card: '#141D19', accent: '#52B788' },
    fontHeading: 'Playfair Display',
    fontBody: 'Outfit',
  },
  {
    id: 'modern-dark',
    name: 'Modern Dark',
    light: { bg: '#F7F8FF', text: '#111827', card: '#FFFFFF', accent: '#4F46E5' },
    dark: { bg: '#0F0F0F', text: '#F0F0F0', card: '#1E1E1E', accent: '#818CF8' },
    fontHeading: 'Inter',
    fontBody: 'Inter',
  },
  {
    id: 'warm-bistro',
    name: 'Warm Bistro',
    light: { bg: '#FDF6EC', text: '#2C1810', card: '#F5E6D0', accent: '#8F3F16' },
    dark: { bg: '#1B120D', text: '#FBE8D0', card: '#2A1B13', accent: '#E48645' },
    fontHeading: 'Lora',
    fontBody: 'Lato',
  },
  {
    id: 'minimal-neutral',
    name: 'Minimal',
    light: { bg: '#F5F5F4', text: '#292524', card: '#FAFAF9', accent: '#57534E' },
    dark: { bg: '#111111', text: '#F5F5F4', card: '#1C1917', accent: '#A8A29E' },
    fontHeading: 'Outfit',
    fontBody: 'Outfit',
  },
  {
    id: 'fine-dining',
    name: 'Fine Dining',
    light: { bg: '#FBF8F0', text: '#17130D', card: '#FFFFFF', accent: '#75510E' },
    dark: { bg: '#0D0D0D', text: '#F5E6C8', card: '#1A1510', accent: '#C9A84C' },
    fontHeading: 'Playfair Display',
    fontBody: 'Lato',
  },
  {
    id: 'fresh-cafe',
    name: 'Fresh Cafe',
    light: { bg: '#F0F9F4', text: '#1A3A2A', card: '#FFFFFF', accent: '#0F6B49' },
    dark: { bg: '#071A12', text: '#EAF8EF', card: '#0D2A1D', accent: '#45C486' },
    fontHeading: 'Poppins',
    fontBody: 'Open Sans',
  },
  {
    id: 'coastal',
    name: 'Coastal',
    light: { bg: '#F3FAFC', text: '#12313A', card: '#FFFFFF', accent: '#0E7490' },
    dark: { bg: '#071B24', text: '#E6F7FB', card: '#0D2B36', accent: '#22D3EE' },
    fontHeading: 'Merriweather',
    fontBody: 'Open Sans',
  },
  {
    id: 'street-food',
    name: 'Street Food',
    light: { bg: '#FFF8E7', text: '#24170A', card: '#FFFFFF', accent: '#9A4100' },
    dark: { bg: '#180E05', text: '#FFF2D6', card: '#2A1808', accent: '#F59E0B' },
    fontHeading: 'Oswald',
    fontBody: 'Karla',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    light: { bg: '#FFF5F7', text: '#35202B', card: '#FFFFFF', accent: '#BE185D' },
    dark: { bg: '#1E0D16', text: '#FCE7F3', card: '#311321', accent: '#F472B6' },
    fontHeading: 'Lora',
    fontBody: 'Inter',
  },
];

interface ThemePresetsProps {
  currentLight: BrandPalette;
  currentDark: BrandPalette;
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
  coastal: 'branding.presetCoastal',
  'street-food': 'branding.presetStreetFood',
  sakura: 'branding.presetSakura',
};

export const ThemePresets: React.FC<ThemePresetsProps> = ({
  currentLight, currentDark, currentFontHeading, currentFontBody, onApply,
}) => {
  const { t } = useTranslation();

  const isActive = (preset: ThemePreset) =>
    preset.light.accent === currentLight.accent &&
    preset.light.bg === currentLight.bg &&
    preset.light.text === currentLight.text &&
    preset.light.card === currentLight.card &&
    preset.dark.accent === currentDark.accent &&
    preset.dark.bg === currentDark.bg &&
    preset.dark.text === currentDark.text &&
    preset.dark.card === currentDark.card &&
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
              <div className="space-y-1.5 mb-2.5 w-full">
                {(['light', 'dark'] as const).map((mode) => (
                  <div key={mode} className="flex gap-1">
                    {[preset[mode].bg, preset[mode].card, preset[mode].accent, preset[mode].text].map((color, i) => (
                      <span
                        key={i}
                        className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
                        style={{ backgroundColor: color, border: '1px solid rgba(0,0,0,0.08)' }}
                      />
                    ))}
                  </div>
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
