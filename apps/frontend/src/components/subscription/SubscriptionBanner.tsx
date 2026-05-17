import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getSubscriptionStatus } from '../../lib/api';

const TIER_STYLES: Record<string, { bg: string; text: string; badge: string }> = {
  FREE:         { bg: 'bg-secondary/50',       text: 'text-muted-foreground',  badge: 'bg-secondary text-secondary-foreground' },
  STARTER:      { bg: 'bg-blue-500/5',          text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  PROFESSIONAL: { bg: 'bg-accent/5',            text: 'text-accent',            badge: 'bg-accent/10 text-accent' },
  ENTERPRISE:   { bg: 'bg-purple-500/5',        text: 'text-purple-700 dark:text-purple-300', badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
};

export default function SubscriptionBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: getSubscriptionStatus,
    staleTime: 60_000,
  });

  const tier = data?.tier ?? null;
  const hasSubscription = data?.hasSubscription ?? false;

  if (!tier) return null;

  const styles = TIER_STYLES[tier] ?? TIER_STYLES.FREE;
  const showUpgrade = tier !== 'ENTERPRISE';

  return (
    <div className={`flex items-center justify-between gap-4 px-5 py-3 rounded-2xl mb-6 ${styles.bg} border border-border/40`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shrink-0 ${styles.badge}`}>
          {tier}
        </span>
        <span className={`text-xs font-semibold truncate ${styles.text}`}>
          {hasSubscription
            ? t('subscription.banner.active', 'Your {{tier}} subscription is active', { tier })
            : tier === 'FREE'
            ? t('subscription.banner.freePlan', 'You are on the Free plan')
            : t('subscription.banner.noSubscription', 'No active subscription')}
        </span>
      </div>
      {showUpgrade && (
        <button
          onClick={() => navigate('/pricing')}
          className="shrink-0 px-4 py-1.5 rounded-xl bg-foreground text-background text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity"
        >
          {t('subscription.banner.upgrade', 'Upgrade')}
        </button>
      )}
    </div>
  );
}
