import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createRestaurant } from '../../../services/restaurantService';

const DASHBOARD_LANGUAGES = [
  { value: 'bg', label: 'Български' },
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română' },
];

interface Props {
  onCreated: (restaurantId: string, restaurantName: string, ownerName: string) => void;
  existingRestaurantId?: string;
  existingRestaurantName?: string;
}

export default function RestaurantBasicsStep({ onCreated, existingRestaurantId, existingRestaurantName }: Props) {
  const { t } = useTranslation();
  const [ownerName, setOwnerName] = useState('');
  const [name, setName] = useState(existingRestaurantName || '');
  const [city, setCity] = useState('');
  const [dashboardLanguage, setDashboardLanguage] = useState('bg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Restaurant was already created in a prior onboarding attempt — skip creation
  if (existingRestaurantId) {
    return (
      <div className="space-y-6 max-w-md">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">{t('onboarding.basics.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {existingRestaurantName
              ? t('onboarding.basics.alreadyCreated', { name: existingRestaurantName, defaultValue: `"${existingRestaurantName}" was already created.` })
              : t('onboarding.basics.alreadyCreatedGeneric', { defaultValue: 'Your restaurant was already created.' })}
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <button
            onClick={() => onCreated(existingRestaurantId, existingRestaurantName || '', '')}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
          >
            {t('onboarding.basics.continue')}
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const restaurant = await createRestaurant({
        name: name.trim(),
        city: city.trim() || undefined,
        dashboardLanguage,
      });
      onCreated(restaurant.id, restaurant.name, ownerName.trim());
    } catch (err: any) {
      setError(err.response?.data?.message || t('onboarding.basics.createError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">{t('onboarding.basics.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('onboarding.basics.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('onboarding.basics.ownerName')}</label>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            placeholder="e.g. Kiril Petrov"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('onboarding.basics.restaurantName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. La Piazza"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('onboarding.basics.city')}</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Sofia"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">{t('onboarding.basics.dashboardLanguage')}</label>
          <select
            value={dashboardLanguage}
            onChange={(e) => setDashboardLanguage(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {DASHBOARD_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{t('onboarding.basics.dashboardLanguageHint')}</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? t('onboarding.basics.creating') : t('onboarding.basics.continue')}
          </button>
        </div>
      </form>
    </div>
  );
}
