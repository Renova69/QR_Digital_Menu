import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createPortalSession } from '../../lib/api';
import { useTier } from '../../hooks/useFeature';

const FEATURE_LABELS: Record<string, string> = {
  'menu:view': 'Menu View',
  'menu:edit': 'Menu Management',
  'menu:import': 'Menu Import',
  'qr:manage': 'QR Codes',
  'orders:receive': 'Online Orders',
  'orders:call-waiter': 'Call Waiter',
  'analytics:basic': 'Basic Analytics',
  'analytics:full': 'Full Analytics',
  'payments:stripe': 'Stripe Payments',
  'languages:multi': 'Multi-language',
  'branding:custom': 'Custom Branding',
  'loyalty': 'Loyalty Program',
  'customers:auth': 'Customer Accounts',
  'upselling': 'Upselling',
  'dayparting': 'Day-Parting',
  'pos': 'Point of Sale',
  'kds': 'Kitchen Display',
  'rbac': 'Role-Based Access',
  'multilocation': 'Multi-location',
  'printers:thermal': 'Thermal Printers',
  'templates:menu': 'Menu Templates',
  'staff:unlimited': 'Unlimited Staff',
};

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-secondary text-secondary-foreground',
  STARTER: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  PROFESSIONAL: 'bg-primary/10 text-primary',
  ENTERPRISE: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const TIER_ORDER = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export default function BillingView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  const { tier, features, staffLimit, hasSubscription, subscription, isLoading: loading } = useTier();

  const handleManage = async () => {
    setActionLoading('portal');
    setError('');
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      setError(t('subscription.errorPortal', 'Could not open billing portal. Please try again.'));
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  const currentTierIndex = TIER_ORDER.indexOf(tier);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Current plan */}
      <div className="border border-border rounded-xl p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-muted-foreground font-medium uppercase tracking-widest mb-1">
              {t('subscription.currentPlan', 'Current Plan')}
            </p>
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-black text-foreground">{tier}</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${TIER_COLORS[tier]}`}>
                {tier}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subscription.staffLimit', 'Staff limit')}: {staffLimit === Infinity ? t('subscription.unlimited', 'Unlimited') : staffLimit}
            </p>
            {subscription && (
              <p className="text-sm text-muted-foreground mt-1">
                {t('subscription.billedInterval', 'Billed {{interval}}', { interval: subscription.interval ?? 'monthly' })}
                {' · '}
                {subscription.cancelAtPeriodEnd
                  ? t('subscription.cancelsOn', 'Cancels {{date}}', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString() })
                  : t('subscription.renewsOn', 'Renews {{date}}', { date: new Date(subscription.currentPeriodEnd).toLocaleDateString() })}
              </p>
            )}
          </div>
          {hasSubscription && (
            <button
              onClick={handleManage}
              disabled={actionLoading === 'portal'}
              className="px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-bold hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'portal' ? t('subscription.loading', 'Loading...') : t('subscription.manageBilling', 'Manage Billing')}
            </button>
          )}
        </div>

        {features.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('subscription.includedFeatures', 'Included features')}</p>
            <div className="flex flex-wrap gap-2">
              {features.map((f) => (
                <span key={f} className="px-2.5 py-1 bg-secondary rounded-lg text-xs font-medium text-foreground">
                  {FEATURE_LABELS[f] ?? f}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upgrade options */}
      {currentTierIndex < TIER_ORDER.length - 1 && (
        <div>
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            {t('subscription.upgradeTo', 'Upgrade to')}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TIER_ORDER.slice(currentTierIndex + 1).map((tierKey) => (
              <button
                key={tierKey}
                onClick={() => navigate('/pricing')}
                className="flex flex-col items-start p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${TIER_COLORS[tierKey]}`}>{tierKey}</span>
                <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                  {`${t('subscription.upgradeTo', 'Upgrade to')} ${tierKey} →`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
