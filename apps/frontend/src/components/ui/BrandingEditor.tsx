import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Image,
  Palette,
  Type,
  MonitorSmartphone,
  Star,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ImageUploadInput } from './ImageUploadInput';
import { useToast } from './toast';
import api from '../../lib/api';
import { useTranslation } from 'react-i18next';
import { FontPicker } from '../branding/FontPicker';
import { ColorSchemeEditor } from '../branding/ColorSchemeEditor';
import { BrandingPreview } from '../branding/BrandingPreview';
import { ThemePresets } from '../branding/ThemePresets';
import type { ThemePreset } from '../branding/ThemePresets';
import type { Restaurant } from '../../context/RestaurantContext';
import { getContrastStatus } from '../../utils/colors';

const sectionHeading = 'text-sm font-semibold text-foreground uppercase tracking-wide';
const inputCls =
  'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all';

const DEFAULTS = {
  accentColor: '#4F46E5',
  fontHeading: 'Playfair Display',
  fontBody: 'Outfit',
  themeBgColor: '#ffffff',
  themeTextColor: '#000000',
  themeCardColor: '#f9f9f9',
  defaultTheme: 'light' as const,
  googleReviewUrl: '',
};

function savedVal<T>(restaurantVal: T | undefined, fallback: T): T {
  return restaurantVal ?? fallback;
}

export const BrandingEditor = ({
  restaurant,
  onUpdate,
}: {
  restaurant: Restaurant;
  onUpdate: () => void;
}) => {
  const [accentColor, setAccentColor] = useState(savedVal(restaurant.accentColor, DEFAULTS.accentColor));
  const [fontHeading, setFontHeading] = useState(savedVal(restaurant.fontHeading, DEFAULTS.fontHeading));
  const [fontBody, setFontBody] = useState(savedVal(restaurant.fontBody, DEFAULTS.fontBody));
  const [themeBgColor, setThemeBgColor] = useState(savedVal(restaurant.themeBgColor, DEFAULTS.themeBgColor));
  const [themeTextColor, setThemeTextColor] = useState(savedVal(restaurant.themeTextColor, DEFAULTS.themeTextColor));
  const [themeCardColor, setThemeCardColor] = useState(savedVal(restaurant.themeCardColor, DEFAULTS.themeCardColor));
  const [defaultTheme, setDefaultTheme] = useState<'light' | 'dark'>(
    savedVal(restaurant.defaultTheme as 'light' | 'dark' | undefined, DEFAULTS.defaultTheme),
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [logoResetKey, setLogoResetKey] = useState(0);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(savedVal(restaurant.googleReviewUrl, DEFAULTS.googleReviewUrl));
  const [isUpdating, setIsUpdating] = useState(false);
  const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(restaurant.logoUrl ?? null);

  const { t } = useTranslation();
  const { showToast, ToastComponent } = useToast();

  useEffect(() => {
    if (logoRemoved) {
      setPreviewLogoUrl(null);
      return;
    }
    if (logoFile) {
      const url = URL.createObjectURL(logoFile);
      setPreviewLogoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewLogoUrl(restaurant.logoUrl ?? null);
  }, [logoFile, logoRemoved, restaurant.logoUrl]);

  const isDirty = useMemo(() => {
    if (logoFile || logoRemoved) return true;
    return (
      accentColor !== savedVal(restaurant.accentColor, DEFAULTS.accentColor) ||
      fontHeading !== savedVal(restaurant.fontHeading, DEFAULTS.fontHeading) ||
      fontBody !== savedVal(restaurant.fontBody, DEFAULTS.fontBody) ||
      themeBgColor !== savedVal(restaurant.themeBgColor, DEFAULTS.themeBgColor) ||
      themeTextColor !== savedVal(restaurant.themeTextColor, DEFAULTS.themeTextColor) ||
      themeCardColor !== savedVal(restaurant.themeCardColor, DEFAULTS.themeCardColor) ||
      defaultTheme !== savedVal(restaurant.defaultTheme as 'light' | 'dark' | undefined, DEFAULTS.defaultTheme) ||
      googleReviewUrl !== savedVal(restaurant.googleReviewUrl, DEFAULTS.googleReviewUrl)
    );
  }, [
    accentColor, fontHeading, fontBody, themeBgColor, themeTextColor,
    themeCardColor, defaultTheme, googleReviewUrl, logoFile, logoRemoved, restaurant,
  ]);

  const handleReset = useCallback(() => {
    setAccentColor(savedVal(restaurant.accentColor, DEFAULTS.accentColor));
    setFontHeading(savedVal(restaurant.fontHeading, DEFAULTS.fontHeading));
    setFontBody(savedVal(restaurant.fontBody, DEFAULTS.fontBody));
    setThemeBgColor(savedVal(restaurant.themeBgColor, DEFAULTS.themeBgColor));
    setThemeTextColor(savedVal(restaurant.themeTextColor, DEFAULTS.themeTextColor));
    setThemeCardColor(savedVal(restaurant.themeCardColor, DEFAULTS.themeCardColor));
    setDefaultTheme(savedVal(restaurant.defaultTheme as 'light' | 'dark' | undefined, DEFAULTS.defaultTheme));
    setGoogleReviewUrl(savedVal(restaurant.googleReviewUrl, DEFAULTS.googleReviewUrl));
    setLogoFile(null);
    setLogoRemoved(false);
    setLogoResetKey((k) => k + 1);
  }, [restaurant]);

  const handleRestoreDefaults = useCallback(() => {
    setAccentColor(DEFAULTS.accentColor);
    setFontHeading(DEFAULTS.fontHeading);
    setFontBody(DEFAULTS.fontBody);
    setThemeBgColor(DEFAULTS.themeBgColor);
    setThemeTextColor(DEFAULTS.themeTextColor);
    setThemeCardColor(DEFAULTS.themeCardColor);
    setDefaultTheme(DEFAULTS.defaultTheme);
    setGoogleReviewUrl('');
    setLogoFile(null);
    setLogoRemoved(false);
    setLogoResetKey((k) => k + 1);
  }, []);

  const handleApplyPreset = useCallback((preset: ThemePreset) => {
    setThemeBgColor(preset.bg);
    setThemeTextColor(preset.text);
    setThemeCardColor(preset.card);
    setAccentColor(preset.accent);
    setFontHeading(preset.fontHeading);
    setFontBody(preset.fontBody);
  }, []);

  const handleColorChange = useCallback((field: string, value: string) => {
    if (field === 'themeBgColor') setThemeBgColor(value);
    else if (field === 'themeTextColor') setThemeTextColor(value);
    else if (field === 'themeCardColor') setThemeCardColor(value);
    else if (field === 'accentColor') setAccentColor(value);
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirty) return;
    setIsUpdating(true);
    let finalLogoUrl: string | null = logoRemoved ? null : (restaurant.logoUrl ?? null);

    try {
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        const uploadRes = await api.post(`/restaurants/${restaurant.id}/logo`, formData);
        finalLogoUrl = uploadRes.data.logoUrl;
      }

      await api.patch(`/restaurants/${restaurant.id}`, {
        accentColor,
        fontHeading,
        fontBody,
        themeBgColor,
        themeTextColor,
        themeCardColor,
        defaultTheme,
        logoUrl: finalLogoUrl,
        googleReviewUrl: googleReviewUrl.trim() || null,
      });

      setLogoFile(null);
      setLogoRemoved(false);
      setLogoResetKey((k) => k + 1);
      showToast(t('branding.saveSuccess', 'Branding settings saved'), 'success');
      onUpdate();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
        (err as { message?: string })?.message ||
        t('branding.saveError', 'Failed to save branding settings');
      showToast(msg, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const contrast = getContrastStatus(themeBgColor, themeTextColor);
  const hasLogo = !logoRemoved && (restaurant.logoUrl || logoFile);
  const hasCustomColors =
    themeBgColor !== DEFAULTS.themeBgColor || accentColor !== DEFAULTS.accentColor;

  const healthChips = [
    {
      ok: !!hasLogo,
      okLabel: t('branding.brandHealthLogo', 'Logo uploaded'),
      failLabel: t('branding.brandHealthNoLogo', 'No logo'),
    },
    {
      ok: hasCustomColors,
      okLabel: t('branding.brandHealthCustomColors', 'Custom colors'),
      failLabel: t('branding.brandHealthDefaultColors', 'Default colors'),
    },
    {
      ok: contrast.status === 'pass',
      warn: contrast.status === 'warning',
      okLabel: t('branding.brandHealthContrast', 'Contrast OK'),
      failLabel: t('branding.brandHealthContrastWarn', 'Contrast warning'),
    },
  ];

  return (
    <>
      {ToastComponent}
      <form onSubmit={handleUpdate} className="space-y-0">
        {/* ── Action bar ── sticky within the page scroll */}
        <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-card border-b border-border flex items-center justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {healthChips.map((chip, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  chip.ok
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                    : chip.warn
                    ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {chip.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                {chip.ok ? chip.okLabel : chip.failLabel}
              </span>
            ))}
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse inline-block" />
                {t('branding.unsavedChanges', 'Unsaved changes')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isDirty && (
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
              >
                {t('branding.reset', 'Reset')}
              </button>
            )}
            <button
              type="submit"
              disabled={isUpdating || !isDirty}
              className="brand-cta text-white px-4 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {isUpdating ? t('branding.saving') : t('branding.save')}
            </button>
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-8 pt-6">
          {/* Left: sections */}
          <div>
            {/* Brand Identity */}
            <div className="border-b border-border pb-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Image size={14} className="text-muted-foreground" />
                <h3 className={sectionHeading}>
                  {t('branding.identity', 'Brand Identity')}
                </h3>
              </div>
              <div className="max-w-[280px]">
                <ImageUploadInput
                  key={logoResetKey}
                  currentImageUrl={restaurant.logoUrl}
                  onFileSelect={(file) => {
                    setLogoFile(file);
                    if (file) setLogoRemoved(false);
                  }}
                  onRemove={() => {
                    setLogoRemoved(true);
                    setLogoFile(null);
                  }}
                  label={t('branding.logo')}
                  aspectRatio="wide"
                  hint="JPEG or PNG only. Max 5MB."
                  changeLabel={t('branding.changeImage', 'Change image')}
                  removeLabel={t('branding.removeImage', 'Remove image')}
                  uploadLabel={t('branding.clickToUpload', 'Click to upload')}
                />
              </div>
            </div>

            {/* Theme Presets */}
            <ThemePresets
              currentAccent={accentColor}
              currentBg={themeBgColor}
              currentText={themeTextColor}
              currentCard={themeCardColor}
              currentFontHeading={fontHeading}
              currentFontBody={fontBody}
              onApply={handleApplyPreset}
            />

            {/* Colors */}
            <div className="border-b border-border pb-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Palette size={14} className="text-muted-foreground" />
                <h3 className={sectionHeading}>{t('branding.colorScheme')}</h3>
              </div>
              <ColorSchemeEditor
                themeBgColor={themeBgColor}
                themeTextColor={themeTextColor}
                themeCardColor={themeCardColor}
                accentColor={accentColor}
                onChange={handleColorChange}
              />
            </div>

            {/* Typography */}
            <div className="border-b border-border pb-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <Type size={14} className="text-muted-foreground" />
                <h3 className={sectionHeading}>{t('branding.typography')}</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FontPicker
                  label={t('branding.headingFont')}
                  value={fontHeading}
                  onChange={setFontHeading}
                  pairedFont={fontBody}
                  isHeading
                />
                <FontPicker
                  label={t('branding.bodyFont')}
                  value={fontBody}
                  onChange={setFontBody}
                />
              </div>
            </div>

            {/* Appearance */}
            <div className="border-b border-border pb-6 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <MonitorSmartphone size={14} className="text-muted-foreground" />
                <h3 className={sectionHeading}>{t('branding.defaultTheme')}</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4 ml-[22px]">
                {t('branding.defaultThemeDesc')}
              </p>
              <div className="flex gap-3 max-w-xs ml-[22px]">
                {(['light', 'dark'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDefaultTheme(mode)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all ${
                      defaultTheme === mode
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-transparent border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    {mode === 'light' ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                      </svg>
                    )}
                    {mode === 'light' ? t('branding.light', 'Light') : t('branding.dark', 'Dark')}
                  </button>
                ))}
              </div>
            </div>

            {/* Public Menu CTA */}
            <div className="pb-6">
              <div className="flex items-center gap-2 mb-1">
                <Star size={14} className="text-muted-foreground" />
                <h3 className={sectionHeading}>
                  {t('branding.publicMenuCta', 'Public Menu CTA')}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4 ml-[22px]">
                {t('branding.googleReviewDesc')}
              </p>
              <div className="max-w-sm ml-[22px]">
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t('branding.googleReview')}
                </label>
                <input
                  type="url"
                  value={googleReviewUrl}
                  onChange={(e) => setGoogleReviewUrl(e.target.value)}
                  placeholder="https://g.page/r/YOUR_REVIEW_LINK"
                  className={inputCls}
                />
                {googleReviewUrl && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 size={12} className="flex-shrink-0" />
                    {t('branding.redirectActive')}
                  </p>
                )}
              </div>
            </div>

            {/* Restore defaults */}
            <div className="pt-4 border-t border-border">
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
              >
                {t('branding.restoreDefaults', 'Restore factory defaults')}
              </button>
            </div>
          </div>

          {/* Mobile preview — shown below controls on small screens */}
          <div className="block lg:hidden mt-2">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('branding.livePreview')}
                </h4>
              </div>
              <BrandingPreview
                fontHeading={fontHeading}
                fontBody={fontBody}
                themeBgColor={themeBgColor}
                themeTextColor={themeTextColor}
                themeCardColor={themeCardColor}
                accentColor={accentColor}
                restaurantName={restaurant.name}
                logoUrl={previewLogoUrl}
                defaultTheme={defaultTheme}
              />
            </div>
          </div>

          {/* Right: sticky live preview */}
          <div className="hidden lg:block">
            <div className="sticky top-14">
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t('branding.livePreview')}
                  </h4>
                </div>
                <BrandingPreview
                  fontHeading={fontHeading}
                  fontBody={fontBody}
                  themeBgColor={themeBgColor}
                  themeTextColor={themeTextColor}
                  themeCardColor={themeCardColor}
                  accentColor={accentColor}
                  restaurantName={restaurant.name}
                  logoUrl={previewLogoUrl}
                  defaultTheme={defaultTheme}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
};
