import { useState } from 'react';
import { Button } from './button';
import { Input } from './input';
import api from '../../lib/api';
import { useTranslation } from 'react-i18next';
import { FontPicker } from '../branding/FontPicker';
import { ColorSchemeEditor } from '../branding/ColorSchemeEditor';
import { BrandingPreview } from '../branding/BrandingPreview';

export const BrandingEditor = ({ restaurant, onUpdate }: { restaurant: any, onUpdate: () => void }) => {
  const [accentColor, setAccentColor] = useState(restaurant.accentColor || '#4F46E5');
  const [fontHeading, setFontHeading] = useState(restaurant.fontHeading || 'Playfair Display');
  const [fontBody, setFontBody] = useState(restaurant.fontBody || 'Outfit');
  const [themeBgColor, setThemeBgColor] = useState(restaurant.themeBgColor || '#ffffff');
  const [themeTextColor, setThemeTextColor] = useState(restaurant.themeTextColor || '#000000');
  const [themeCardColor, setThemeCardColor] = useState(restaurant.themeCardColor || '#f9f9f9');
  const [defaultTheme, setDefaultTheme] = useState<'light' | 'dark'>(restaurant.defaultTheme || 'light');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [googleReviewUrl, setGoogleReviewUrl] = useState(restaurant.googleReviewUrl || '');
  const [timezone, setTimezone] = useState(restaurant.timezone || 'UTC');
  const [isUpdating, setIsUpdating] = useState(false);
  const { t } = useTranslation();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    let finalLogoUrl = restaurant.logoUrl;

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
        timezone,
      });
      
      onUpdate();
    } catch (err) {
      console.error('Failed to update brand elements:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="glass-panel p-8 rounded-[2rem] border-white/5 mt-10">
      <h3 className="text-xl font-serif font-black mb-8 text-foreground tracking-tight">{t('branding.title')}</h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <form onSubmit={handleUpdate} className="space-y-8">
          {/* Logo & Accent Color (Existing) */}
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{t('branding.logo')}</label>
              {restaurant.logoUrl && (
                <div className="mb-4 p-4 glass-panel border-white/5 rounded-2xl flex justify-center bg-black/5">
                  <img 
                    src={restaurant.logoUrl.startsWith('http') ? restaurant.logoUrl : `${(import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api'}`.replace('/api', '') + `/${restaurant.logoUrl}`} 
                    alt="Current Logo" 
                    className="h-16 object-contain"
                  />
                </div>
              )}
            <Input 
              type="file" 
              accept="image/*" 
              onChange={(e) => setLogoFile(e.target.files ? e.target.files[0] : null)} 
            />
          </div>
        </div>

          <div className="border-t border-border/40 pt-6">
            <h4 className="text-sm font-bold mb-4">{t('branding.typography')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FontPicker
                label={t('branding.headingFont')}
                value={fontHeading}
                onChange={setFontHeading}
              />
              <FontPicker
                label={t('branding.bodyFont')}
                value={fontBody}
                onChange={setFontBody}
              />
            </div>
          </div>

          <div className="border-t border-border/40 pt-6">
            <h4 className="text-sm font-bold mb-4">{t('branding.colorScheme')}</h4>
            <ColorSchemeEditor 
              themeBgColor={themeBgColor}
              themeTextColor={themeTextColor}
              themeCardColor={themeCardColor}
              accentColor={accentColor}
              onChange={(field, val) => {
                if (field === 'themeBgColor') setThemeBgColor(val);
                if (field === 'themeTextColor') setThemeTextColor(val);
                if (field === 'themeCardColor') setThemeCardColor(val);
                if (field === 'accentColor') setAccentColor(val);
              }}
            />
          </div>

          <div className="border-t border-border/40 pt-6">
            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              {t('branding.defaultTheme')}
            </label>
            <p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
              {t('branding.defaultThemeDesc')}
            </p>
            <div className="flex gap-3">
              {(['light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDefaultTheme(mode)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-all ${
                    defaultTheme === mode
                      ? 'bg-foreground text-background border-foreground shadow-lg'
                      : 'bg-transparent border-border/40 text-muted-foreground hover:border-border'
                  }`}
                >
                  {mode === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border/40 pt-6">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            {t('branding.googleReview')}
          </label>
          <p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
            {t('branding.googleReviewDesc')}
          </p>
          <Input
            type="url"
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
            placeholder="https://g.page/r/YOUR_REVIEW_LINK"
          />
          {googleReviewUrl && (
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              {t('branding.redirectActive')}
            </p>
          )}
        </div>
        <div className="border-t border-border/40 pt-6">
          <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            {t('branding.restaurantTimezone')}
          </label>
          <p className="text-[10px] font-medium text-muted-foreground/60 italic mb-4">
            {t('branding.restaurantTimezoneDesc')}
          </p>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full h-11 px-3 border border-border rounded-xl bg-background text-sm focus:ring-accent focus:border-accent"
          >
            <option value="UTC">UTC (GMT+0)</option>
            <option value="Europe/Sofia">Europe/Sofia (GMT+2/3)</option>
            <option value="Europe/Bucharest">Europe/Bucharest (GMT+2/3)</option>
            <option value="Europe/London">Europe/London (GMT+0/1)</option>
            <option value="Europe/Paris">Europe/Paris (GMT+1/2)</option>
            <option value="Europe/Istanbul">Europe/Istanbul (GMT+3)</option>
            <option value="America/New_York">America/New_York (GMT-5/4)</option>
          </select>
        </div>

          <Button type="submit" disabled={isUpdating} className="w-full">
            {isUpdating ? t('branding.saving') : t('branding.save')}
          </Button>
        </form>

        {/* Live Preview */}
        <div className="lg:pl-8 lg:border-l border-border/40">
          <div className="sticky top-8">
            <h4 className="text-sm font-bold mb-4 text-muted-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
              {t('branding.livePreview')}
            </h4>
            <BrandingPreview 
              fontHeading={fontHeading}
              fontBody={fontBody}
              themeBgColor={themeBgColor}
              themeTextColor={themeTextColor}
              themeCardColor={themeCardColor}
              accentColor={accentColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
