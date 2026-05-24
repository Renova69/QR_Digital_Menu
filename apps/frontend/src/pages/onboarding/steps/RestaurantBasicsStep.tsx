import { useState } from 'react';
import { createRestaurant } from '../../../services/restaurantService';

const DASHBOARD_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'el', label: 'Greek' },
];

interface Props {
  onCreated: (restaurantId: string, name: string) => void;
}

export default function RestaurantBasicsStep({ onCreated }: Props) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [dashboardLanguage, setDashboardLanguage] = useState('en');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      onCreated(restaurant.id, restaurant.name);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create restaurant. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Your restaurant</h2>
        <p className="text-sm text-muted-foreground mt-1">You can update all of this later in Settings.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Restaurant name *</label>
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
          <label className="text-sm font-semibold text-foreground">City</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Sofia"
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground">Dashboard language</label>
          <select
            value={dashboardLanguage}
            onChange={(e) => setDashboardLanguage(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {DASHBOARD_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">Language used for your owner dashboard.</p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
