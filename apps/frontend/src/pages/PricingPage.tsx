import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createCheckoutSession } from '../lib/api';

const TIERS = [
  {
    key: 'FREE',
    price: '€0',
    period: '/mo',
    features: ['Menu view & edit', 'QR code management', '1 staff member'],
  },
  {
    key: 'STARTER',
    price: '€29',
    period: '/mo',
    features: ['Online ordering', 'Basic analytics', 'Menu import', '1 staff member'],
    highlight: false,
  },
  {
    key: 'PROFESSIONAL',
    price: '€79',
    period: '/mo',
    features: ['Stripe payments', 'Full analytics', 'Multi-language menu', 'Custom branding', 'Loyalty program', 'Call waiter', 'Upselling', 'Happy hour', 'Up to 5 staff'],
    highlight: true,
  },
  {
    key: 'ENTERPRISE',
    price: '€199',
    period: '/mo',
    features: ['Everything in Professional', 'Unlimited staff', 'POS & KDS', 'Multi-location', 'Thermal printers', 'Menu templates', 'Priority support'],
  },
];

export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const handleSelect = async (tier: string) => {
    if (tier === 'FREE') {
      navigate('/dashboard');
      return;
    }
    setLoading(tier);
    setError('');
    try {
      const { url } = await createCheckoutSession(tier);
      window.location.href = url;
    } catch {
      setError(t('subscription.errorCheckout', 'Could not start checkout. Please try again.'));
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-background py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h1 className="text-5xl md:text-7xl font-serif font-black text-foreground tracking-tighter mb-4">
            {t('pricing.title', 'Simple Pricing')}
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            {t('pricing.subtitle', 'Choose the plan that fits your restaurant. Upgrade or downgrade anytime.')}
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-5 py-3 rounded-xl text-sm text-center mb-8">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIERS.map((tier) => (
            <div
              key={tier.key}
              className={`relative flex flex-col rounded-3xl border p-8 transition-all ${
                tier.highlight
                  ? 'border-accent shadow-2xl shadow-accent/10 bg-card scale-105'
                  : 'border-border bg-card hover:border-accent/40 hover:shadow-lg'
              }`}
            >
              {tier.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
                    {t('pricing.popular', 'Most Popular')}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">{tier.key}</h2>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black text-foreground">{tier.price}</span>
                  <span className="text-muted-foreground text-sm pb-1">{tier.period}</span>
                </div>
              </div>

              <ul className="flex-1 space-y-2.5 mb-8">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="text-accent font-bold mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelect(tier.key)}
                disabled={!!loading}
                className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 ${
                  tier.highlight
                    ? 'bg-foreground text-background hover:opacity-80'
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                {loading === tier.key
                  ? t('subscription.loading', 'Loading...')
                  : tier.key === 'FREE'
                  ? t('pricing.getStarted', 'Get Started')
                  : t('pricing.choosePlan', 'Choose {{tier}}', { tier: tier.key })}
              </button>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-10">
          {t('pricing.terms', 'Prices exclude VAT. Cancel anytime.')}
        </p>
      </div>
    </div>
  );
}
