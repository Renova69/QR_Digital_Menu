import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, Lock, Sparkles, Check } from 'lucide-react';
import { createCheckoutSession } from '../../lib/api';
import type { FeatureFlag, SubscriptionTier } from '../../hooks/useFeature';

const FEATURE_MIN_TIER: Partial<Record<FeatureFlag, SubscriptionTier>> = {
  'orders:receive':    'STARTER',
  'analytics:basic':   'STARTER',
  'analytics:full':    'PROFESSIONAL',
  'orders:call-waiter':'PROFESSIONAL',
  'payments:stripe':   'PROFESSIONAL',
  'languages:multi':   'PROFESSIONAL',
  'branding:custom':   'PROFESSIONAL',
  'loyalty':           'PROFESSIONAL',
  'customers:auth':    'PROFESSIONAL',
  'upselling':         'PROFESSIONAL',
  'dayparting':        'PROFESSIONAL',
  'pos':               'ENTERPRISE',
  'kds':               'ENTERPRISE',
  'rbac':              'ENTERPRISE',
  'multilocation':     'ENTERPRISE',
  'printers:thermal':  'ENTERPRISE',
  'templates:menu':    'ENTERPRISE',
  'staff:unlimited':   'ENTERPRISE',
};

const FEATURE_DISPLAY: Partial<Record<FeatureFlag, string>> = {
  'orders:receive':    'Online Ordering',
  'analytics:basic':   'Basic Analytics',
  'analytics:full':    'Full Analytics',
  'orders:call-waiter':'Call Waiter',
  'payments:stripe':   'Stripe Payments',
  'languages:multi':   'Multi-language Menu',
  'branding:custom':   'Custom Branding',
  'loyalty':           'Loyalty Program',
  'customers:auth':    'Customer Accounts',
  'upselling':         'Upselling',
  'dayparting':        'Dayparting / Happy Hour',
  'pos':               'Point of Sale',
  'kds':               'Kitchen Display System',
  'rbac':              'Advanced RBAC',
  'multilocation':     'Multi-location',
  'printers:thermal':  'Thermal Printers',
  'templates:menu':    'Menu Templates',
  'staff:unlimited':   'Unlimited Staff',
};

const TIER_ORDER: SubscriptionTier[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const TIERS: Array<{ key: SubscriptionTier; price: number; bullets: string[] }> = [
  {
    key: 'STARTER',
    price: 15,
    bullets: ['Online ordering', 'Basic analytics', '1 staff member'],
  },
  {
    key: 'PROFESSIONAL',
    price: 25,
    bullets: [
      'Stripe pay-at-table',
      'Full analytics',
      'Multi-language menu',
      'Loyalty program',
      'Up to 5 staff',
    ],
  },
  {
    key: 'ENTERPRISE',
    price: 45,
    bullets: [
      'Point of Sale (POS)',
      'Kitchen Display (KDS)',
      'Multi-location',
      'Unlimited staff',
      'Advanced RBAC',
    ],
  },
];

interface Props {
  feature: FeatureFlag | null;
  onClose: () => void;
}

export default function UpgradeModal({ feature, onClose }: Props) {
  const { t } = useTranslation();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState('');

  const minTier: SubscriptionTier = feature ? (FEATURE_MIN_TIER[feature] ?? 'ENTERPRISE') : 'ENTERPRISE';
  const minTierIndex = TIER_ORDER.indexOf(minTier);
  const featureLabel = feature ? (FEATURE_DISPLAY[feature] ?? feature) : '';

  const { mutate: checkout, isPending } = useMutation({
    mutationFn: (tier: string) => createCheckoutSession(tier, 'monthly'),
    onSuccess: ({ url }) => { window.location.href = url; },
    onError: () => {
      setLoadingTier(null);
      setError(t('subscription.errorCheckout', 'Could not start checkout. Please try again.'));
    },
  });

  if (!feature || minTier === 'FREE') return null;

  const handleUpgrade = (tier: string) => {
    setError('');
    setLoadingTier(tier);
    checkout(tier);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="relative px-8 pt-8 pb-6 border-b border-border">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-accent" />
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {t('upgrade.premiumFeature', 'Premium Feature')}
              </p>
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-serif font-black text-foreground tracking-tight mb-1">
            {t('upgrade.unlockTitle', 'Unlock {{feature}}', { feature: featureLabel })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('upgrade.subtitle', 'Available from the {{tier}} plan. Upgrade to unlock this and more.', { tier: minTier })}
          </p>
        </div>

        {/* Tier cards */}
        <div className="px-8 py-6 grid grid-cols-3 gap-3">
          {TIERS.map(({ key, price, bullets }) => {
            const tierIndex = TIER_ORDER.indexOf(key);
            const isBelow = tierIndex < minTierIndex;
            const isRecommended = key === minTier;
            const isAbove = tierIndex > minTierIndex;
            const isThisLoading = isPending && loadingTier === key;

            return (
              <div
                key={key}
                className={`relative flex flex-col rounded-2xl border p-4 transition-all ${
                  isRecommended
                    ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10'
                    : isBelow
                    ? 'border-border/40 bg-secondary/20 opacity-50'
                    : 'border-border bg-card hover:border-accent/30'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-accent text-accent-foreground px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow whitespace-nowrap">
                      {t('upgrade.recommended', 'Recommended')}
                    </span>
                  </div>
                )}
                {isBelow && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-secondary text-muted-foreground px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest whitespace-nowrap">
                      {t('upgrade.notIncluded', 'Not included')}
                    </span>
                  </div>
                )}

                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{key}</p>
                <div className="flex items-end gap-1 mb-3">
                  <span className="text-2xl font-black text-foreground">€{price.toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground pb-1">/mo</span>
                </div>

                <ul className="flex-1 space-y-1.5 mb-4">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className={`w-3 h-3 mt-0.5 shrink-0 ${isRecommended ? 'text-accent' : 'text-muted-foreground/60'}`} />
                      {b}
                    </li>
                  ))}
                </ul>

                {!isBelow && (
                  <button
                    onClick={() => handleUpgrade(key)}
                    disabled={isPending}
                    className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
                      isRecommended
                        ? 'bg-foreground text-background hover:opacity-80'
                        : isAbove
                        ? 'bg-secondary text-foreground hover:bg-secondary/80'
                        : ''
                    }`}
                  >
                    {isThisLoading
                      ? t('subscription.loading', 'Loading...')
                      : t('upgrade.cta', 'Upgrade to {{tier}}', { tier: key })}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <p className="px-8 pb-2 text-sm text-destructive text-center">{error}</p>
        )}

        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-muted-foreground">
            {t('pricing.terms', 'Prices exclude VAT. Cancel anytime.')}
            {' · '}
            <button onClick={onClose} className="underline underline-offset-2 hover:text-foreground transition-colors">
              {t('upgrade.maybeLater', 'Maybe later')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
