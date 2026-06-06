import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  CreditCard,
  DoorOpen,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { getSuperAdminStats } from "../../lib/api";
import { useTranslation } from "react-i18next";

const TIER_ORDER = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

const TIER_STYLES: Record<string, string> = {
  FREE: "bg-slate-700/30 text-slate-300 border-slate-700/50",
  STARTER: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  PROFESSIONAL: "bg-blue-500/10 text-blue-300 border-blue-500/25",
  ENTERPRISE: "bg-violet-500/10 text-violet-300 border-violet-500/25",
};

type TierCounts = Record<string, number>;

function countFor(counts: TierCounts | undefined, tier: string) {
  return counts?.[tier] ?? 0;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function maxTierCount(...groups: Array<TierCounts | undefined>) {
  return Math.max(1, ...groups.flatMap((group) => TIER_ORDER.map((tier) => countFor(group, tier))));
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  helper,
}: {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  helper?: string;
}) {
    const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none text-white tabular-nums">{value}</p>
          {helper && <p className="mt-2 text-xs text-slate-500">{helper}</p>}
        </div>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
    const { t } = useTranslation();
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-bold ${TIER_STYLES[tier] ?? TIER_STYLES.FREE}`}>
      {tier}
    </span>
  );
}

function TierComparison({ billing, effective }: { billing: TierCounts; effective: TierCounts }) {
    const { t } = useTranslation();
  const max = maxTierCount(billing, effective);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{t('auto.billingVsEffectiveTier', 'Billing vs Effective Tier')}</h3>
          <p className="mt-1 text-xs text-slate-500">{t('auto.billingIsStripeBaseTierEffectiveI', 'Billing is Stripe/base tier. Effective is force tier applied.')}</p>
        </div>
        <CreditCard className="h-4 w-4 shrink-0 text-slate-500" />
      </div>

      <div className="space-y-4">
        {TIER_ORDER.map((tier) => {
          const billingCount = countFor(billing, tier);
          const effectiveCount = countFor(effective, tier);
          return (
            <div key={tier} className="grid gap-2 md:grid-cols-[120px_1fr_64px_1fr_64px] md:items-center">
              <TierBadge tier={tier} />
              <div className="h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-slate-500"
                  style={{ width: `${Math.max(4, (billingCount / max) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 tabular-nums md:text-right">{t('auto.billing', 'Billing')}{billingCount}</span>
              <div className="h-2 rounded-full bg-slate-800">
                <div
                  className="h-2 rounded-full bg-emerald-400"
                  style={{ width: `${Math.max(4, (effectiveCount / max) * 100)}%` }}
                />
              </div>
              <span className="text-xs text-slate-400 tabular-nums md:text-right">{t('auto.live', 'Live')}{effectiveCount}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverrideSummary({
  total,
  upgrades,
  downgrades,
}: {
  total: number;
  upgrades: number;
  downgrades: number;
}) {
    const { t } = useTranslation();
  const neutral = Math.max(0, total - upgrades - downgrades);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{t('auto.forceTierOverrides', 'Force Tier Overrides')}</h3>
          <p className="mt-1 text-xs text-slate-500">{t('auto.manualAccessChangesThatBypassBillin', 'Manual access changes that bypass billing tier.')}</p>
        </div>
        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
          <p className="text-xs text-slate-500">{t('auto.total', 'Total')}</p>
          <p className="mt-1 text-2xl font-bold text-white tabular-nums">{total}</p>
        </div>
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-1 text-xs text-emerald-300">
            <ArrowUpRight className="h-3.5 w-3.5" />
            {t('auto.upgrades', 'Upgrades')}</div>
          <p className="mt-1 text-2xl font-bold text-white tabular-nums">{upgrades}</p>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <div className="flex items-center gap-1 text-xs text-red-300">
            <ArrowDownRight className="h-3.5 w-3.5" />
            {t('auto.downgrades', 'Downgrades')}</div>
          <p className="mt-1 text-2xl font-bold text-white tabular-nums">{downgrades}</p>
        </div>
      </div>
      {neutral > 0 && <p className="mt-3 text-xs text-slate-500">{neutral} {t('auto.overrideKeepsTheSameEffectiveTier', 'override keeps the same effective tier.')}</p>}
    </div>
  );
}

function AttentionPanel({ stats }: { stats: NonNullable<Awaited<ReturnType<typeof getSuperAdminStats>>["attentionNeeded"]> }) {
    const { t } = useTranslation();
  const rows = [
    { key: "forcedOverrides", label: "Forced tier overrides", tone: "text-amber-300" },
    { key: "paymentsNotOnboarded", label: "Payments enabled, Stripe missing", tone: "text-red-300" },
    { key: "emptyMenus", label: "No menu categories", tone: "text-slate-300" },
    { key: "noTables", label: "No tables", tone: "text-slate-300" },
    { key: "inactiveTenants", label: "Suspended tenants", tone: "text-red-300" },
  ] as const;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{t('auto.attentionNeeded', 'Attention Needed')}</h3>
          <p className="mt-1 text-xs text-slate-500">{t('auto.tenantsWorthCheckingBeforeTheyBecom', 'Tenants worth checking before they become support work.')}</p>
        </div>
        <ListChecks className="h-4 w-4 shrink-0 text-slate-500" />
      </div>
      <div className="divide-y divide-slate-800">
        {rows.map(({ key, label, tone }) => {
          const group = stats[key];
          const items = group?.items ?? [];
          return (
            <div key={key} className="py-4 first:pt-0 last:pb-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-200">{label}</span>
                <span className={`text-sm font-bold tabular-nums ${tone}`}>{group?.count ?? 0}</span>
              </div>
              {items.length > 0 ? (
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <Link
                      key={`${key}-${item.id}`}
                      to={`/super-admin/tenants/${item.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    >
                      <span className="min-w-0 truncate">{item.name}</span>
                      {item.billingTier && item.effectiveTier ? (
                        <span className="shrink-0 text-slate-500">
                          {`${item.billingTier} -> ${item.effectiveTier}`}
                        </span>
                      ) : (
                        <span className="shrink-0 text-slate-600">{item.ownerEmail}</span>
                      )}
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">{t('auto.allClear', 'All clear')}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OverviewPage() {
    const { t } = useTranslation();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["super-admin", "stats"],
    queryFn: getSuperAdminStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="mb-2 h-7 w-32 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-4 w-64 animate-pulse rounded bg-slate-800/60" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-slate-800 bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="mb-3 h-10 w-10 text-slate-700" />
        <p className="font-medium text-slate-400">{t('auto.failedToLoadPlatformStats', 'Failed to load platform stats')}</p>
        <p className="mt-1 text-sm text-slate-600">{t('auto.checkYourConnectionAndTryAgain', 'Check your connection and try again')}</p>
      </div>
    );
  }

  const ownerCount = data.userRoles?.OWNER ?? 0;
  const staffCount =
    (data.userRoles?.MANAGER ?? 0) +
    (data.userRoles?.WAITER ?? 0) +
    (data.userRoles?.KITCHEN ?? 0) +
    (data.userRoles?.STAFF ?? 0);
  const customerCount = data.userRoles?.CUSTOMER ?? 0;
  const billingTier = data.byBillingTier;
  const effectiveTier = data.byEffectiveTier;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{t('auto.overview', 'Overview')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('auto.platformHealthTierAccessAndTenant', 'Platform health, tier access, and tenant risks')}</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('auto.restaurants', 'Restaurants')}
          value={data.totalRestaurants}
          icon={Building2}
          tone="border-blue-500/20 bg-blue-500/10 text-blue-300"
          helper={`${data.activeRestaurants} active, ${data.deletedRestaurants} deleted`}
        />
        <StatCard
          label={t('auto.users', 'Users')}
          value={data.totalUsers}
          icon={Users}
          tone="border-violet-500/20 bg-violet-500/10 text-violet-300"
          helper={`${ownerCount} owners, ${staffCount} staff, ${customerCount} customers`}
        />
        <StatCard
          label={t('auto.paidPlanTenants', 'Paid Plan Tenants')}
          value={data.paidPlanTenants}
          icon={CreditCard}
          tone="border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
          helper={`${data.stripeLinkedSubscriptions} Stripe subscriptions linked`}
        />
        <StatCard
          label={t('auto.suspended', 'Suspended')}
          value={data.suspendedCount}
          icon={AlertTriangle}
          tone="border-amber-500/20 bg-amber-500/10 text-amber-300"
          helper={`${data.forcedOverrideCount} force tier overrides`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <TierComparison billing={billingTier} effective={effectiveTier} />
        <OverrideSummary
          total={data.forcedOverrideCount}
          upgrades={data.forcedUpgrades}
          downgrades={data.forcedDowngrades}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={t('auto.newRestaurants', 'New Restaurants')}
          value={data.recent.restaurants7d}
          icon={DoorOpen}
          tone="border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
          helper="Last 7 days"
        />
        <StatCard
          label={t('auto.newUsers', 'New Users')}
          value={data.recent.users7d}
          icon={Users}
          tone="border-indigo-500/20 bg-indigo-500/10 text-indigo-300"
          helper="Last 7 days"
        />
        <StatCard
          label={t('auto.orders', 'Orders')}
          value={data.recent.orders7d}
          icon={CheckCircle2}
          tone="border-lime-500/20 bg-lime-500/10 text-lime-300"
          helper={`${data.recent.orders24h} in the last 24h`}
        />
        <StatCard
          label={t('auto.paymentVolume', 'Payment Volume')}
          value={formatMoney(data.recent.payments7d.amount)}
          icon={CreditCard}
          tone="border-pink-500/20 bg-pink-500/10 text-pink-300"
          helper={`${data.recent.payments7d.count} successful payments, 7 days`}
        />
      </div>

      <AttentionPanel stats={data.attentionNeeded} />
    </div>
  );
}
