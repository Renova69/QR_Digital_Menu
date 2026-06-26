import { useMemo, useState } from 'react';
import type React from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CreditCard,
  Gauge,
  Lock,
  ReceiptText,
  Users,
} from 'lucide-react';
import { createCheckoutSession, createPortalSession, listStaff } from '../../lib/api';
import { useTier, type FeatureFlag, type SubscriptionTier } from '../../hooks/useFeature';
import { useRestaurantContext } from '../../context/RestaurantContext';
import { cn } from '../../lib/utils';

const TIER_ORDER: SubscriptionTier[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const TIER_COLORS: Record<SubscriptionTier, string> = {
  FREE: 'bg-secondary text-secondary-foreground border-border',
  STARTER: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  PROFESSIONAL: 'bg-primary/10 text-primary border-primary/20',
  ENTERPRISE: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
};

const PLAN_CONFIG: Record<SubscriptionTier, { monthly: number; highlight: FeatureFlag[] }> = {
  FREE: {
    monthly: 0,
    highlight: ['menu:view', 'menu:edit', 'menu:import', 'qr:manage'],
  },
  STARTER: {
    monthly: 15,
    highlight: ['orders:receive', 'analytics:basic', 'languages:multi'],
  },
  PROFESSIONAL: {
    monthly: 25,
    highlight: ['payments:stripe', 'branding:custom', 'loyalty', 'analytics:full'],
  },
  ENTERPRISE: {
    monthly: 45,
    highlight: ['kds', 'staff:unlimited', 'multilocation', 'printers:thermal'],
  },
};

const FEATURE_GROUPS: Array<{ key: string; features: FeatureFlag[] }> = [
  {
    key: 'menu',
    features: ['menu:view', 'menu:edit', 'menu:import', 'qr:manage', 'languages:multi', 'templates:menu'],
  },
  {
    key: 'orders',
    features: ['orders:receive', 'orders:call-waiter', 'dayparting', 'upselling'],
  },
  {
    key: 'payments',
    features: ['payments:stripe', 'payments:epay', 'payments:borica', 'payments:mypos'],
  },
  {
    key: 'growth',
    features: ['analytics:basic', 'analytics:full', 'branding:custom', 'loyalty', 'customers:auth'],
  },
  {
    key: 'operations',
    features: ['pos', 'kds', 'rbac', 'multilocation', 'printers:thermal', 'staff:unlimited'],
  },
];

const FEATURE_LABELS: Record<FeatureFlag, { key: string; fallback: string }> = {
  'menu:view': { key: 'subscription.features.menuView', fallback: 'Menu view' },
  'menu:edit': { key: 'subscription.features.menuEdit', fallback: 'Menu management' },
  'menu:import': { key: 'subscription.features.menuImport', fallback: 'Menu import' },
  'qr:manage': { key: 'subscription.features.qrManage', fallback: 'QR codes' },
  'orders:receive': { key: 'subscription.features.ordersReceive', fallback: 'Online orders' },
  'orders:call-waiter': { key: 'subscription.features.callWaiter', fallback: 'Call waiter' },
  'analytics:basic': { key: 'subscription.features.analyticsBasic', fallback: 'Basic analytics' },
  'analytics:full': { key: 'subscription.features.analyticsFull', fallback: 'Full analytics' },
  'payments:stripe': { key: 'subscription.features.stripePayments', fallback: 'Stripe payments' },
  'payments:epay': { key: 'subscription.features.epayPayments', fallback: 'ePay.bg payments' },
  'payments:borica': { key: 'subscription.features.boricaPayments', fallback: 'BORICA payments' },
  'payments:mypos': { key: 'subscription.features.myposPayments', fallback: 'myPOS payments' },
  'languages:multi': { key: 'subscription.features.multiLanguage', fallback: 'Multi-language menu' },
  'branding:custom': { key: 'subscription.features.customBranding', fallback: 'Custom branding' },
  loyalty: { key: 'subscription.features.loyalty', fallback: 'Loyalty program' },
  'customers:auth': { key: 'subscription.features.customerAccounts', fallback: 'Customer accounts' },
  upselling: { key: 'subscription.features.upselling', fallback: 'Upselling' },
  dayparting: { key: 'subscription.features.dayparting', fallback: 'Dayparting and happy hour' },
  pos: { key: 'subscription.features.pos', fallback: 'Point of Sale' },
  kds: { key: 'subscription.features.kds', fallback: 'Kitchen Display' },
  rbac: { key: 'subscription.features.rbac', fallback: 'Role-based access' },
  multilocation: { key: 'subscription.features.multilocation', fallback: 'Multi-location' },
  'printers:thermal': { key: 'subscription.features.thermalPrinters', fallback: 'Thermal printers' },
  'templates:menu': { key: 'subscription.features.menuTemplates', fallback: 'Menu templates' },
  'staff:unlimited': { key: 'subscription.features.unlimitedStaff', fallback: 'Unlimited staff' },
};

function formatTier(tier: string) {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function featureLabel(t: ReturnType<typeof useTranslation>['t'], feature: FeatureFlag) {
  const meta = FEATURE_LABELS[feature];
  return t(meta.key, meta.fallback);
}

function priceLabel(t: ReturnType<typeof useTranslation>['t'], tier: SubscriptionTier) {
  const price = PLAN_CONFIG[tier].monthly;
  return price === 0 ? t('subscription.freePrice', 'Free') : `€${price}/mo`;
}

export default function BillingView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeRestaurant } = useRestaurantContext();
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  const { tier, features, staffLimit, hasSubscription, subscription, isLoading: loading } = useTier();
  const currentTierIndex = Math.max(0, TIER_ORDER.indexOf(tier));
  const nextTier = TIER_ORDER[currentTierIndex + 1] ?? null;

  const { data: staffMembers = [], isError: staffError } = useQuery({
    queryKey: ['subscription-staff-usage', activeRestaurant?.id],
    queryFn: () => listStaff(activeRestaurant!.id),
    enabled: !!activeRestaurant?.id,
    staleTime: 60_000,
  });

  const activeStaffCount = useMemo(
    () => staffMembers.filter((member) => member.role !== 'OWNER' && member.isActive !== false).length,
    [staffMembers],
  );

  const checkoutMutation = useMutation({
    mutationFn: (targetTier: SubscriptionTier) => createCheckoutSession(targetTier, 'monthly', false, activeRestaurant?.id),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: () => {
      setActionLoading('');
      setError(t('subscription.errorCheckout', 'Could not start checkout. Please try again.'));
    },
  });

  const handleManage = async () => {
    setActionLoading('portal');
    setError('');
    try {
      const { url } = await createPortalSession(activeRestaurant?.id);
      window.location.href = url;
    } catch {
      setError(t('subscription.errorPortal', 'Could not open billing portal. Please try again.'));
    } finally {
      setActionLoading('');
    }
  };

  const handleCheckout = (targetTier: SubscriptionTier) => {
    setError('');
    setActionLoading(targetTier);
    checkoutMutation.mutate(targetTier);
  };

  const periodDate = subscription?.cancelAtPeriodEnd
    ? formatDate(subscription.currentPeriodEnd)
    : formatDate(subscription?.currentPeriodEnd);

  const statusTone = subscription?.status === 'past_due'
    ? 'bg-destructive/10 text-destructive border-destructive/20'
    : subscription?.cancelAtPeriodEnd
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
      : hasSubscription
        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
        : tier === 'FREE'
          ? 'bg-secondary text-secondary-foreground border-border'
          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20';

  const statusLabel = subscription?.cancelAtPeriodEnd
    ? t('subscription.status.canceling', 'Canceling')
    : hasSubscription
      ? t(`subscription.status.${subscription?.status ?? 'active'}`, { defaultValue: t('subscription.status.active', 'Active') })
      : tier === 'FREE'
        ? t('subscription.status.free', 'Free')
        : t('subscription.status.manual', 'Manual access');

  const usagePercent =
    staffLimit === Infinity || staffLimit <= 0
      ? 100
      : Math.min(100, Math.round((activeStaffCount / staffLimit) * 100));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<CreditCard className="h-4 w-4" />}
          label={t('subscription.currentPlan', 'Current Plan')}
          value={formatTier(tier)}
          meta={priceLabel(t, tier)}
          badge={tier}
          badgeClassName={TIER_COLORS[tier]}
        />
        <SummaryCard
          icon={<ReceiptText className="h-4 w-4" />}
          label={t('subscription.billingStatus', 'Billing status')}
          value={statusLabel}
          meta={
            subscription?.cancelAtPeriodEnd
              ? t('subscription.cancelsOn', 'Cancels {{date}}', { date: periodDate ?? '-' })
              : periodDate
                ? t('subscription.renewsOn', 'Renews {{date}}', { date: periodDate })
                : t('subscription.noRenewalDate', 'No renewal date')
          }
          badge={subscription?.interval ?? undefined}
          badgeClassName={statusTone}
        />
        <SummaryCard
          icon={<Users className="h-4 w-4" />}
          label={t('subscription.staffSeats', 'Staff seats')}
          value={
            staffLimit === Infinity
              ? t('subscription.unlimited', 'Unlimited')
              : `${activeStaffCount}/${staffLimit}`
          }
          meta={
            staffError
              ? t('subscription.staffUsageUnavailable', 'Could not load current usage')
              : t('subscription.activeStaff', '{{count}} active staff', { count: activeStaffCount })
          }
        />
        <SummaryCard
          icon={<Gauge className="h-4 w-4" />}
          label={t('subscription.planAccess', 'Plan access')}
          value={t('subscription.featuresCount', '{{count}} features', { count: features.length })}
          meta={
            nextTier
              ? t('subscription.nextPlan', 'Next: {{tier}}', { tier: formatTier(nextTier) })
              : t('subscription.highestPlan', 'Highest plan')
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {t('subscription.usageTitle', 'Plan usage')}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('subscription.usageDesc', 'Track limits that affect access inside this restaurant.')}
                </p>
              </div>
              {tier !== 'FREE' && (
                <button
                  type="button"
                  onClick={() => navigate('/dashboard?tab=settings&settingsTab=staff')}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  {t('subscription.manageStaff', 'Manage staff')}
                </button>
              )}
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {t('subscription.staffSeats', 'Staff seats')}
                </span>
                <span className="text-sm font-bold text-foreground">
                  {staffLimit === Infinity
                    ? t('subscription.unlimited', 'Unlimited')
                    : `${activeStaffCount}/${staffLimit}`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {staffLimit === Infinity
                  ? t('subscription.unlimitedStaffDesc', 'This plan does not limit staff seats.')
                  : t('subscription.staffUsageDesc', '{{remaining}} seats remaining', {
                      remaining: Math.max(0, staffLimit - activeStaffCount),
                    })}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-foreground">
                {t('subscription.includedFeatures', 'Included features')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('subscription.includedFeaturesDesc', 'Grouped by the parts of the product they unlock.')}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {FEATURE_GROUPS.map((group) => {
                const included = group.features.filter((feature) => features.includes(feature));
                return (
                  <div key={group.key} className="rounded-lg border border-border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        {t(`subscription.featureGroups.${group.key}`, group.key)}
                      </h4>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        {included.length}/{group.features.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.features.map((feature) => {
                        const isIncluded = features.includes(feature);
                        return (
                          <div
                            key={feature}
                            className={cn(
                              'flex items-center gap-2 text-sm',
                              isIncluded ? 'text-foreground' : 'text-muted-foreground/60',
                            )}
                          >
                            {isIncluded ? (
                              <Check className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Lock className="h-3.5 w-3.5" />
                            )}
                            <span>{featureLabel(t, feature)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-base font-semibold text-foreground">
              {t('subscription.billingActions', 'Billing actions')}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('subscription.billingActionsDesc', 'Manage your SaaS plan and invoices separately from restaurant payments.')}
            </p>

            <div className="mt-4 space-y-2">
              {hasSubscription ? (
                <button
                  type="button"
                  onClick={handleManage}
                  disabled={actionLoading === 'portal'}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === 'portal'
                    ? t('subscription.loading', 'Loading...')
                    : t('subscription.manageBilling', 'Manage Billing')}
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              ) : (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                  <div className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {tier === 'FREE'
                        ? t('subscription.freePlanHelp', 'Upgrade when you are ready to unlock paid features.')
                        : t('subscription.manualPlanHelp', 'This restaurant has plan access without an active Stripe subscription.')}
                    </span>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                {t('subscription.comparePlans', 'Compare plans')}
              </button>
            </div>
          </section>

          {nextTier && (
            <section className="rounded-xl border border-primary/20 bg-primary/5 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                {t('subscription.recommendedNext', 'Recommended next')}
              </p>
              <h3 className="mt-2 text-xl font-bold text-foreground">
                {t('subscription.upgradeToTier', 'Upgrade to {{tier}}', { tier: formatTier(nextTier) })}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('subscription.unlocks', 'Unlocks {{count}} more capabilities for this restaurant.', {
                  count: Math.max(0, PLAN_CONFIG[nextTier].highlight.length),
                })}
              </p>

              <div className="mt-4 space-y-2">
                {PLAN_CONFIG[nextTier].highlight.map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    <span>{featureLabel(t, feature)}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleCheckout(nextTier)}
                disabled={checkoutMutation.isPending}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading === nextTier
                  ? t('subscription.loading', 'Loading...')
                  : t('subscription.startUpgrade', 'Start upgrade')}
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  meta,
  badge,
  badgeClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta: string;
  badge?: string;
  badgeClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        {badge && (
          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', badgeClassName)}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
    </div>
  );
}
