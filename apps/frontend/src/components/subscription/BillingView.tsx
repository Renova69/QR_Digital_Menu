import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSubscriptionStatus, createPortalSession } from '../../lib/api';

const TIER_COLORS: Record<string, string> = {
  FREE: 'bg-secondary text-secondary-foreground',
  STARTER: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  PROFESSIONAL: 'bg-accent/10 text-accent',
  ENTERPRISE: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

const TIER_ORDER = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export default function BillingView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  const { data: status, isLoading: loading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: getSubscriptionStatus,
    staleTime: 60_000,
  });

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
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent" />
      </div>
    );
  }

  const currentTierIndex = TIER_ORDER.indexOf(status?.tier ?? 'FREE');

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
              <h3 className="text-2xl font-black text-foreground">{status?.tier ?? 'FREE'}</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${TIER_COLORS[status?.tier ?? 'FREE']}`}>
                {status?.tier ?? 'FREE'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t('subscription.staffLimit', 'Staff limit')}: {status?.staffLimit === Infinity ? t('subscription.unlimited', 'Unlimited') : status?.staffLimit}
            </p>
            {status?.subscription && (
              <p className="text-sm text-muted-foreground mt-1">
                {t('subscription.billedInterval', 'Billed {{interval}}', { interval: status.subscription.interval ?? 'monthly' })}
                {' · '}
                {status.subscription.cancelAtPeriodEnd
                  ? t('subscription.cancelsOn', 'Cancels {{date}}', { date: new Date(status.subscription.currentPeriodEnd).toLocaleDateString() })
                  : t('subscription.renewsOn', 'Renews {{date}}', { date: new Date(status.subscription.currentPeriodEnd).toLocaleDateString() })}
              </p>
            )}
          </div>
          {status?.hasSubscription && (
            <button
              onClick={handleManage}
              disabled={actionLoading === 'portal'}
              className="px-5 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-bold hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'portal' ? t('subscription.loading', 'Loading...') : t('subscription.manageBilling', 'Manage Billing')}
            </button>
          )}
        </div>

        {status && status.features.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{t('subscription.includedFeatures', 'Included features')}</p>
            <div className="flex flex-wrap gap-2">
              {status.features.map((f) => (
                <span key={f} className="px-2.5 py-1 bg-secondary rounded-lg text-xs font-medium text-foreground">{f}</span>
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
            {TIER_ORDER.slice(currentTierIndex + 1).map((tier) => (
              <button
                key={tier}
                onClick={() => navigate('/pricing')}
                className="flex flex-col items-start p-4 rounded-xl border border-border hover:border-accent hover:bg-accent/5 transition-all text-left group"
              >
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 ${TIER_COLORS[tier]}`}>{tier}</span>
                <span className="text-sm font-bold text-foreground group-hover:text-accent transition-colors">
                  {`${t('subscription.upgradeTo', 'Upgrade to')} ${tier} →`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
