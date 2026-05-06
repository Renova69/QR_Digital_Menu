import React from 'react';
import { getContrastStatus } from '../../utils/colors';
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ColorSchemeEditorProps {
  themeBgColor: string;
  themeTextColor: string;
  themeCardColor: string;
  accentColor: string;
  onChange: (field: string, value: string) => void;
}

export const ColorSchemeEditor: React.FC<ColorSchemeEditorProps> = ({
  themeBgColor,
  themeTextColor,
  themeCardColor,
  accentColor,
  onChange,
}) => {
  const { t } = useTranslation();
  const contrast = getContrastStatus(themeBgColor, themeTextColor);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="flex flex-col justify-between">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            {t('branding.menuBackground')}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={themeBgColor || '#ffffff'}
              onChange={(e) => onChange('themeBgColor', e.target.value)}
              className="w-12 h-12 p-1 border border-border rounded-lg cursor-pointer bg-background"
            />
            <span className="font-mono text-xs font-bold text-foreground opacity-60">
              {themeBgColor?.toUpperCase() || ''}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            {t('branding.textColor')}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={themeTextColor || '#000000'}
              onChange={(e) => onChange('themeTextColor', e.target.value)}
              className="w-12 h-12 p-1 border border-border rounded-lg cursor-pointer bg-background"
            />
            <span className="font-mono text-xs font-bold text-foreground opacity-60">
              {themeTextColor?.toUpperCase() || ''}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            {t('branding.cardBackground')}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={themeCardColor || '#ffffff'}
              onChange={(e) => onChange('themeCardColor', e.target.value)}
              className="w-12 h-12 p-1 border border-border rounded-lg cursor-pointer bg-background"
            />
            <span className="font-mono text-xs font-bold text-foreground opacity-60">
              {themeCardColor?.toUpperCase() || ''}
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            {t('branding.buttonAccent')}
          </label>
          <div className="flex items-center gap-4">
            <input
              type="color"
              value={accentColor || '#4F46E5'}
              onChange={(e) => onChange('accentColor', e.target.value)}
              className="w-12 h-12 p-1 border border-border rounded-lg cursor-pointer bg-background"
            />
            <span className="font-mono text-xs font-bold text-foreground opacity-60">
              {accentColor?.toUpperCase() || ''}
            </span>
          </div>
        </div>
      </div>

      <div className={`p-4 rounded-xl border ${
        contrast.status === 'pass' ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400' :
        contrast.status === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400' :
        'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'
      }`}>
        <div className="flex items-center gap-3">
          {contrast.status === 'pass' ? <CheckCircle2 className="w-5 h-5" /> :
           contrast.status === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
           <AlertCircle className="w-5 h-5" />}
          <div>
            <p className="text-sm font-bold">{contrast.message}</p>
            <p className="text-xs opacity-80 mt-0.5">Contrast ratio: {contrast.ratio.toFixed(2)}:1 (WCAG requires &ge; 4.5:1 for normal text)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
