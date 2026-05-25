import React, { useState, useEffect } from 'react';
import { getContrastStatus } from '../../utils/colors';
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface ColorSwatchProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({ label, value, onChange }) => {
  const [draft, setDraft] = useState(value.toUpperCase());

  // Sync draft when prop changes externally (preset apply, reset, etc.)
  useEffect(() => {
    setDraft(value.toUpperCase());
  }, [value]);

  const commit = (raw: string) => {
    const v = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_RE.test(v)) onChange(v.toUpperCase());
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="block text-xs font-medium text-foreground/70">{label}</label>
      <div className="flex items-center gap-2">
        <div
          className="relative w-9 h-9 rounded-lg flex-shrink-0 cursor-pointer border border-border shadow-sm transition-transform hover:scale-105"
          style={{ backgroundColor: value }}
          title={`Pick ${label}`}
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg"
            aria-label={label}
          />
        </div>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.toUpperCase());
            commit(e.target.value);
          }}
          onBlur={() => {
            // Reset draft to last valid committed value on blur
            setDraft(value.toUpperCase());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(draft);
          }}
          className="w-[5.5rem] px-2 py-1.5 font-mono text-xs border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 uppercase"
          maxLength={7}
          spellCheck={false}
        />
      </div>
    </div>
  );
};

interface ContrastBadgeProps {
  label: string;
  bg: string;
  fg: string;
}

const ContrastBadge: React.FC<ContrastBadgeProps> = ({ label, bg, fg }) => {
  const contrast = getContrastStatus(bg, fg);
  const pass = contrast.status === 'pass';
  const warn = contrast.status === 'warning';

  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
        pass
          ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400'
          : warn
          ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-400'
          : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-400'
      }`}
    >
      {pass ? (
        <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
      ) : warn ? (
        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
      ) : (
        <AlertCircle className="w-3 h-3 flex-shrink-0" />
      )}
      <span className="font-medium truncate">{label}</span>
      <span className="opacity-60 ml-auto font-mono flex-shrink-0">{contrast.ratio.toFixed(1)}:1</span>
    </div>
  );
};

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

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch
          label={t('branding.menuBackground')}
          value={themeBgColor || '#ffffff'}
          onChange={(v) => onChange('themeBgColor', v)}
        />
        <ColorSwatch
          label={t('branding.cardBackground')}
          value={themeCardColor || '#f9f9f9'}
          onChange={(v) => onChange('themeCardColor', v)}
        />
        <ColorSwatch
          label={t('branding.textColor')}
          value={themeTextColor || '#000000'}
          onChange={(v) => onChange('themeTextColor', v)}
        />
        <ColorSwatch
          label={t('branding.buttonAccent')}
          value={accentColor || '#4F46E5'}
          onChange={(v) => onChange('accentColor', v)}
        />
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          {t('branding.wcagContrast', 'WCAG Contrast')}
        </p>
        <div className="space-y-1">
          <ContrastBadge
            label={`${t('branding.textColor')} / Background`}
            bg={themeBgColor}
            fg={themeTextColor}
          />
          <ContrastBadge
            label={`${t('branding.buttonAccent')} / Background`}
            bg={themeBgColor}
            fg={accentColor}
          />
          <ContrastBadge
            label={`${t('branding.buttonAccent')} / Card`}
            bg={themeCardColor}
            fg={accentColor}
          />
        </div>
      </div>
    </div>
  );
};
