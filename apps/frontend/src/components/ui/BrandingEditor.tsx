import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Image,
  Palette,
  Type,
  MonitorSmartphone,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ImageUploadInput } from './ImageUploadInput';
import { useToast } from './toast';
import api from '../../lib/api';
import { FontPicker } from '../branding/FontPicker';
import { ColorSchemeEditor } from '../branding/ColorSchemeEditor';
import { BrandingPreview } from '../branding/BrandingPreview';
import { ThemePresets } from '../branding/ThemePresets';
import type { BrandMode, BrandPalette, ThemePreset } from '../branding/ThemePresets';
import type { Restaurant } from '../../context/RestaurantContext';
import { getContrastStatus, getReadableTextColor } from '../../utils/colors';

const sectionHeading = 'text-sm font-semibold text-foreground uppercase tracking-wide';
const inputCls =
  'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all';

const DEFAULT_LIGHT: BrandPalette = {
  bg: '#FFFFFF',
  text: '#0E0B1A',
  card: '#FFFFFF',
  accent: '#4F46E5',
};

const DEFAULT_DARK: BrandPalette = {
  bg: '#0B0A14',
  text: '#F5F4FA',
  card: '#15131F',
  accent: '#8B6FFF',
};

const DEFAULTS = {
  light: DEFAULT_LIGHT,
  dark: DEFAULT_DARK,
  fontHeading: 'Playfair Display',
  fontBody: 'Outfit',
  defaultTheme: 'light' as BrandMode,
};

interface BrandSnapshot {
  light: BrandPalette;
  dark: BrandPalette;
  fontHeading: string;
  fontBody: string;
  defaultTheme: BrandMode;
}

function savedVal<T>(restaurantVal: T | undefined | null, fallback: T): T {
  return restaurantVal ?? fallback;
}

function getRestaurantBrand(restaurant: Restaurant): BrandSnapshot {
  return {
    light: {
      bg: savedVal(restaurant.themeLightBgColor, savedVal(restaurant.themeBgColor, DEFAULT_LIGHT.bg)),
      text: savedVal(restaurant.themeLightTextColor, savedVal(restaurant.themeTextColor, DEFAULT_LIGHT.text)),
      card: savedVal(restaurant.themeLightCardColor, savedVal(restaurant.themeCardColor, DEFAULT_LIGHT.card)),
      accent: savedVal(restaurant.themeLightAccentColor, savedVal(restaurant.accentColor, DEFAULT_LIGHT.accent)),
    },
    dark: {
      bg: savedVal(restaurant.themeDarkBgColor, DEFAULT_DARK.bg),
      text: savedVal(restaurant.themeDarkTextColor, DEFAULT_DARK.text),
      card: savedVal(restaurant.themeDarkCardColor, DEFAULT_DARK.card),
      accent: savedVal(restaurant.themeDarkAccentColor, savedVal(restaurant.accentColor, DEFAULT_DARK.accent)),
    },
    fontHeading: savedVal(restaurant.fontHeading, DEFAULTS.fontHeading),
    fontBody: savedVal(restaurant.fontBody, DEFAULTS.fontBody),
    defaultTheme: savedVal(restaurant.defaultTheme as BrandMode | undefined, DEFAULTS.defaultTheme),
  };
}

function paletteEqual(a: BrandPalette, b: BrandPalette) {
  return a.bg === b.bg && a.text === b.text && a.card === b.card && a.accent === b.accent;
}

function brandEqual(a: BrandSnapshot, b: BrandSnapshot) {
  return (
    paletteEqual(a.light, b.light) &&
    paletteEqual(a.dark, b.dark) &&
    a.fontHeading === b.fontHeading &&
    a.fontBody === b.fontBody &&
    a.defaultTheme === b.defaultTheme
  );
}

function paletteContrastOk(palette: BrandPalette) {
  const textContrast = getContrastStatus(palette.bg, palette.text);
  const accentContrast = getContrastStatus(palette.bg, palette.accent);
  const buttonContrast = getContrastStatus(palette.accent, getReadableTextColor(palette.accent));
  return {
    pass: textContrast.status === 'pass' && accentContrast.status === 'pass' && buttonContrast.status === 'pass',
    warn: textContrast.status === 'warning' || accentContrast.status === 'warning' || buttonContrast.status === 'warning',
  };
}

export const BrandingEditor = ({
  restaurant,
  onUpdate,
}: {
  restaurant: Restaurant;
  onUpdate: () => void | Promise<void>;
}) => {
  const initialBrand = useMemo(() => getRestaurantBrand(restaurant), [restaurant]);
  const [savedBrand, setSavedBrand] = useState<BrandSnapshot>(initialBrand);
  const [lightPalette, setLightPalette] = useState<BrandPalette>(initialBrand.light);
  const [darkPalette, setDarkPalette] = useState<BrandPalette>(initialBrand.dark);
  const [activePaletteMode, setActivePaletteMode] = useState<BrandMode>(initialBrand.defaultTheme);
  const [fontHeading, setFontHeading] = useState(initialBrand.fontHeading);
  const [fontBody, setFontBody] = useState(initialBrand.fontBody);
  const [defaultTheme, setDefaultTheme] = useState<BrandMode>(initialBrand.defaultTheme);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [logoResetKey, setLogoResetKey] = useState(0);
  const [savedLogoUrl, setSavedLogoUrl] = useState<string | null>(restaurant.logoUrl ?? null);
  const [savedLogoThumbnailUrl, setSavedLogoThumbnailUrl] = useState<string | null>(restaurant.logoThumbnailUrl ?? null);
  const [previewLogoUrl, setPreviewLogoUrl] = useState<string | null>(restaurant.logoUrl ?? null);
  const [isUpdating, setIsUpdating] = useState(false);

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
    setPreviewLogoUrl(savedLogoUrl);
  }, [logoFile, logoRemoved, savedLogoUrl]);

  const currentBrand: BrandSnapshot = useMemo(
    () => ({
      light: lightPalette,
      dark: darkPalette,
      fontHeading,
      fontBody,
      defaultTheme,
    }),
    [lightPalette, darkPalette, fontHeading, fontBody, defaultTheme],
  );

  const isDirty = useMemo(
    () => logoFile !== null || logoRemoved || !brandEqual(currentBrand, savedBrand),
    [currentBrand, savedBrand, logoFile, logoRemoved],
  );

  const handleReset = useCallback(() => {
    setLightPalette(savedBrand.light);
    setDarkPalette(savedBrand.dark);
    setActivePaletteMode(savedBrand.defaultTheme);
    setFontHeading(savedBrand.fontHeading);
    setFontBody(savedBrand.fontBody);
    setDefaultTheme(savedBrand.defaultTheme);
    setLogoFile(null);
    setLogoRemoved(false);
    setLogoResetKey((k) => k + 1);
  }, [savedBrand]);

  const handleRestoreDefaults = useCallback(() => {
    setLightPalette(DEFAULT_LIGHT);
    setDarkPalette(DEFAULT_DARK);
    setActivePaletteMode(DEFAULTS.defaultTheme);
    setFontHeading(DEFAULTS.fontHeading);
    setFontBody(DEFAULTS.fontBody);
    setDefaultTheme(DEFAULTS.defaultTheme);
    setLogoFile(null);
    setLogoRemoved(false);
    setLogoResetKey((k) => k + 1);
  }, []);

  const handleApplyPreset = useCallback((preset: ThemePreset) => {
    setLightPalette(preset.light);
    setDarkPalette(preset.dark);
    setFontHeading(preset.fontHeading);
    setFontBody(preset.fontBody);
  }, []);

  const handleColorChange = useCallback((field: keyof BrandPalette, value: string) => {
    const setter = activePaletteMode === 'light' ? setLightPalette : setDarkPalette;
    setter((current) => ({ ...current, [field]: value }));
  }, [activePaletteMode]);

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!isDirty) return;
    setIsUpdating(true);
    let finalLogoUrl: string | null = logoRemoved ? null : savedLogoUrl;
    let finalLogoThumbnailUrl: string | null = logoRemoved ? null : savedLogoThumbnailUrl;
    const defaultPalette = defaultTheme === 'dark' ? darkPalette : lightPalette;

    try {
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        // Upload processes the image in R2 but does NOT write to the DB.
        // Both logo URLs are persisted atomically in the PATCH below.
        const uploadRes = await api.post(`/restaurants/${restaurant.id}/logo`, formData);
        finalLogoUrl = uploadRes.data.logoUrl;
        finalLogoThumbnailUrl = uploadRes.data.logoThumbnailUrl;
      }

      await api.patch(`/restaurants/${restaurant.id}`, {
        accentColor: defaultPalette.accent,
        fontHeading,
        fontBody,
        themeBgColor: defaultPalette.bg,
        themeTextColor: defaultPalette.text,
        themeCardColor: defaultPalette.card,
        themeLightBgColor: lightPalette.bg,
        themeLightTextColor: lightPalette.text,
        themeLightCardColor: lightPalette.card,
        themeLightAccentColor: lightPalette.accent,
        themeDarkBgColor: darkPalette.bg,
        themeDarkTextColor: darkPalette.text,
        themeDarkCardColor: darkPalette.card,
        themeDarkAccentColor: darkPalette.accent,
        defaultTheme,
        logoUrl: finalLogoUrl,
        logoThumbnailUrl: finalLogoThumbnailUrl,
      });

      const nextSaved = {
        light: lightPalette,
        dark: darkPalette,
        fontHeading,
        fontBody,
        defaultTheme,
      };
      setSavedBrand(nextSaved);
      setSavedLogoUrl(finalLogoUrl);
      setSavedLogoThumbnailUrl(finalLogoThumbnailUrl);
      setPreviewLogoUrl(finalLogoUrl);
      setLogoFile(null);
      setLogoRemoved(false);
      setLogoResetKey((k) => k + 1);
      showToast(t('branding.saveSuccess', 'Branding settings saved'), 'success');
      await onUpdate();
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

  const activePalette = activePaletteMode === 'light' ? lightPalette : darkPalette;
  const lightContrast = paletteContrastOk(lightPalette);
  const darkContrast = paletteContrastOk(darkPalette);
  const hasLogo = !logoRemoved && (savedLogoUrl || logoFile);
  const hasCustomColors =
    !paletteEqual(lightPalette, DEFAULT_LIGHT) || !paletteEqual(darkPalette, DEFAULT_DARK);

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
      ok: lightContrast.pass && darkContrast.pass,
      warn: lightContrast.warn || darkContrast.warn,
      okLabel: t('branding.brandHealthContrast', 'Contrast OK'),
      failLabel: t('branding.brandHealthContrastWarn', 'Contrast warning'),
    },
  ];

  return (
    <>
      {ToastComponent}
      <form onSubmit={handleUpdate} className="space-y-0">
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] xl:grid-cols-[1fr_360px] gap-8 pt-6">
          <div>
            <div className="block lg:hidden mb-6">
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
                  lightPalette={lightPalette}
                  darkPalette={darkPalette}
                  restaurantName={restaurant.name}
                  logoUrl={previewLogoUrl}
                  defaultTheme={defaultTheme}
                />
              </div>
            </div>

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
                  currentImageUrl={savedLogoUrl}
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
                  hint={t('branding.imageHint', 'JPEG or PNG only. Max 5MB.')}
                  changeLabel={t('branding.changeImage', 'Change image')}
                  removeLabel={t('branding.removeImage', 'Remove image')}
                  uploadLabel={t('branding.clickToUpload', 'Click to upload')}
                  invalidTypeMessage={t('branding.invalidImageType', 'Please upload a JPEG or PNG image.')}
                  maxSizeMessage={t('branding.imageTooLarge', 'Image must be 5MB or smaller.')}
                />
              </div>
            </div>

            <ThemePresets
              currentLight={lightPalette}
              currentDark={darkPalette}
              currentFontHeading={fontHeading}
              currentFontBody={fontBody}
              onApply={handleApplyPreset}
            />

            <div className="border-b border-border pb-6 mb-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Palette size={14} className="text-muted-foreground" />
                  <h3 className={sectionHeading}>{t('branding.colorScheme')}</h3>
                </div>
                <div className="flex gap-0.5 bg-muted rounded-lg p-1">
                  {(['light', 'dark'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setActivePaletteMode(mode)}
                      aria-pressed={activePaletteMode === mode}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                        activePaletteMode === mode
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {mode === 'light' ? <Sun size={12} /> : <Moon size={12} />}
                      {mode === 'light' ? t('branding.light', 'Light') : t('branding.dark', 'Dark')}
                    </button>
                  ))}
                </div>
              </div>
              <ColorSchemeEditor
                palette={activePalette}
                onChange={handleColorChange}
              />
            </div>

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
                    onClick={() => {
                      setDefaultTheme(mode);
                      setActivePaletteMode(mode);
                    }}
                    aria-pressed={defaultTheme === mode}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-semibold uppercase tracking-wide transition-all ${
                      defaultTheme === mode
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-transparent border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    {mode === 'light' ? <Sun size={13} /> : <Moon size={13} />}
                    {mode === 'light' ? t('branding.light', 'Light') : t('branding.dark', 'Dark')}
                  </button>
                ))}
              </div>
            </div>

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
                  lightPalette={lightPalette}
                  darkPalette={darkPalette}
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
