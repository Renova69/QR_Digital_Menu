import React, { useState, useContext, FormEvent } from 'react';
import RestaurantContext from '../context/RestaurantContext';
import { useTranslation } from 'react-i18next';

const CreateRestaurantForm: React.FC = () => {
  const [name, setName] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [dashboardLanguage, setDashboardLanguage] = useState<string>('en');
  const [error, setError] = useState<string>('');
  const { createRestaurant }: any = useContext(RestaurantContext);
  const { i18n } = useTranslation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await createRestaurant({ name, country, dashboardLanguage });
      // Clear form on success
      setName('');
      setCountry('');
      i18n.changeLanguage(dashboardLanguage);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create restaurant.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="glass-panel bg-card/80 p-8 sm:p-12 rounded-[2rem] w-full max-w-lg shadow-xl backdrop-blur-xl border border-border">
        <div className="text-center mb-8">
          <h3 className="text-3xl font-extrabold text-foreground tracking-tight mb-2">Launch Workspace</h3>
          <p className="text-muted-foreground font-medium">Create your first restaurant profile to access the dashboard and menu builder.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Restaurant Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-input bg-background/50 backdrop-blur-sm px-4 py-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all shadow-inner"
              placeholder="e.g. The Golden Spatula"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Country / Region</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-input bg-background/50 backdrop-blur-sm px-4 py-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all shadow-inner"
              placeholder="e.g. United States"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">Main Dashboard Language</label>
            <div className="relative">
                <select
                    value={dashboardLanguage}
                    onChange={(e) => setDashboardLanguage(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background/50 backdrop-blur-sm px-4 py-3 text-sm text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all shadow-inner cursor-pointer"
                >
                    <option value="en">English</option>
                    <option value="bg">Български (Bulgarian)</option>
                    <option value="ro">Română (Romanian)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
            </div>
            <p className="text-[10px] text-muted-foreground font-medium px-1">This sets the interface language for your admin panel.</p>
          </div>
          
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-semibold border border-red-100 flex items-center justify-center">
              {error}
            </div>
          )}
          
          <button 
            type="submit"
            className="w-full bg-accent hover:bg-yellow-600 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:scale-95"
          >
            Create Restaurant
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateRestaurantForm;
