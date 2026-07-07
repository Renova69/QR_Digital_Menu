import { useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { createCheckoutSession, createPortalSession } from '../lib/api';
import { useTier } from '../hooks/useFeature';
import { useAuth } from '../context/AuthContext';
import RestaurantContext from '../context/RestaurantContext';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
type Billing = 'monthly' | 'yearly';
type TFunction = ReturnType<typeof useTranslation>['t'];

interface FeatureRowData {
  labelKey: string;
  sectionKey?: string;
  free: boolean | string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
}

type TableItem =
  | { type: 'section'; labelKey: string; key: string }
  | { type: 'row'; row: FeatureRowData; index: number };

interface PlanConfig {
  key: Tier;
  monthly: number;
  highlight: boolean;
  fitKey: string;
  bulletKeys: string[];
}

const YEARLY_DISCOUNT = 0.85;
const TIER_ORDER: Tier[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

const PLAN_CONFIGS: PlanConfig[] = [
  {
    key: 'FREE',
    monthly: 0,
    highlight: false,
    fitKey: 'pricing.tiers.free.fit',
    bulletKeys: [
      'pricing.tiers.free.b1',
      'pricing.tiers.free.b2',
      'pricing.tiers.free.b3',
      'pricing.tiers.free.b4',
      'pricing.tiers.free.b5',
    ],
  },
  {
    key: 'STARTER',
    monthly: 15,
    highlight: false,
    fitKey: 'pricing.tiers.starter.fit',
    bulletKeys: [
      'pricing.tiers.starter.b1',
      'pricing.tiers.starter.b2',
      'pricing.tiers.starter.b3',
      'pricing.tiers.starter.b4',
      'pricing.tiers.starter.b5',
      'pricing.tiers.starter.b6',
    ],
  },
  {
    key: 'PROFESSIONAL',
    monthly: 25,
    highlight: true,
    fitKey: 'pricing.tiers.professional.fit',
    bulletKeys: [
      'pricing.tiers.professional.b1',
      'pricing.tiers.professional.b2',
      'pricing.tiers.professional.b3',
      'pricing.tiers.professional.b5',
      'pricing.tiers.professional.b6',
      'pricing.tiers.professional.b7',
      'pricing.tiers.professional.b8',
      'pricing.tiers.professional.b9',
      'pricing.tiers.professional.b10',
      'pricing.tiers.professional.b11',
    ],
  },
  {
    key: 'ENTERPRISE',
    monthly: 45,
    highlight: false,
    fitKey: 'pricing.tiers.enterprise.fit',
    bulletKeys: [
      'pricing.tiers.enterprise.b1',
      'pricing.tiers.enterprise.b2',
      'pricing.tiers.enterprise.b3',
      'pricing.tiers.enterprise.b4',
      'pricing.tiers.enterprise.b5',
      'pricing.tiers.enterprise.b6',
      'pricing.tiers.enterprise.b7',
      'pricing.tiers.enterprise.b8',
      'pricing.tiers.enterprise.b9',
      'pricing.tiers.enterprise.b10',
    ],
  },
];

const FEATURE_ROWS: FeatureRowData[] = [
  { sectionKey: 'pricing.sections.menu', labelKey: 'pricing.features.digitalMenu', free: true, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.menuImport', free: true, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.qrCodes', free: true, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.menuExport', free: true, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.multiLanguage', free: false, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.menuTemplates', free: false, starter: false, professional: false, enterprise: true },
  { sectionKey: 'pricing.sections.orders', labelKey: 'pricing.features.onlineOrdering', free: false, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.callWaiter', free: false, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.dayparting', free: false, starter: false, professional: true, enterprise: true },
  { labelKey: 'pricing.features.upselling', free: false, starter: false, professional: true, enterprise: true },
  { sectionKey: 'pricing.sections.payments', labelKey: 'pricing.features.paymentProviders', free: false, starter: false, professional: true, enterprise: true },
  { sectionKey: 'pricing.sections.analytics', labelKey: 'pricing.features.basicAnalytics', free: true, starter: true, professional: true, enterprise: true },
  { labelKey: 'pricing.features.fullAnalytics', free: false, starter: false, professional: true, enterprise: true },
  { sectionKey: 'pricing.sections.customers', labelKey: 'pricing.features.customerAccounts', free: false, starter: false, professional: true, enterprise: true },
  { labelKey: 'pricing.features.loyalty', free: false, starter: false, professional: true, enterprise: true },
  { labelKey: 'pricing.features.reservations', free: false, starter: false, professional: true, enterprise: true },
  { sectionKey: 'pricing.sections.customization', labelKey: 'pricing.features.customBranding', free: false, starter: false, professional: true, enterprise: true },
  { sectionKey: 'pricing.sections.operations', labelKey: 'pricing.features.pos', free: false, starter: false, professional: false, enterprise: true },
  { labelKey: 'pricing.features.kds', free: false, starter: false, professional: false, enterprise: true },
  { labelKey: 'pricing.features.rbac', free: false, starter: false, professional: false, enterprise: true },
  { labelKey: 'pricing.features.multiLocation', free: false, starter: false, professional: false, enterprise: true },
  { labelKey: 'pricing.features.thermalPrinters', free: false, starter: false, professional: false, enterprise: true },
  { sectionKey: 'pricing.sections.team', labelKey: 'pricing.features.staffMembers', free: '0', starter: '1', professional: '5', enterprise: '∞' },
  { sectionKey: 'pricing.sections.support', labelKey: 'pricing.features.prioritySupport', free: false, starter: false, professional: false, enterprise: true },
];

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];

function tierName(t: TFunction, tier: Tier) {
  return t(`pricing.tierNames.${tier.toLowerCase()}`);
}

function tierPrice(monthly: number, billing: Billing, t: TFunction): { main: string; meta: string | null } {
  if (monthly === 0) return { main: '€0', meta: null };
  if (billing === 'monthly') return { main: `€${monthly}`, meta: t('pricing.billing.perMonthShort') };
  const moPrice = (monthly * YEARLY_DISCOUNT).toFixed(2);
  const yrTotal = Math.round(monthly * 12 * YEARLY_DISCOUNT);
  return { main: `€${moPrice}`, meta: t('pricing.billing.yearlyMeta', { total: yrTotal }) };
}

function FeatureCell({ val }: { val: boolean | string }) {
  if (typeof val === 'string') {
    return <span className="text-sm font-semibold text-foreground">{val}</span>;
  }
  return val ? (
    <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="text-muted-foreground/40">-</span>
  );
}

export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<Billing>('monthly');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { tier: currentTier, hasSubscription } = useTier();
  const { user } = useAuth();
  const activeRestaurantId = useContext(RestaurantContext)?.activeRestaurant?.id;

  const tableItems = useMemo(
    () =>
      FEATURE_ROWS.reduce<TableItem[]>((acc, row, i) => {
        if (row.sectionKey) acc.push({ type: 'section', labelKey: row.sectionKey, key: `section-${i}` });
        acc.push({ type: 'row', row, index: i });
        return acc;
      }, []),
    [],
  );

  const currentTierIndex = TIER_ORDER.indexOf(currentTier);

  const handlePortal = async () => {
    setLoading('portal');
    setError('');
    try {
      const { url } = await createPortalSession(activeRestaurantId);
      window.location.href = url;
    } catch {
      setError(t('subscription.errorPortal'));
    } finally {
      setLoading('');
    }
  };

  const handleSelect = async (tier: Tier) => {
    if (!user) {
      sessionStorage.setItem('selectedPlan', tier);
      navigate('/register');
      return;
    }
    if (tier === 'FREE') {
      navigate('/dashboard');
      return;
    }
    const tierIndex = TIER_ORDER.indexOf(tier);
    if (tierIndex <= currentTierIndex && hasSubscription) {
      await handlePortal();
      return;
    }
    setLoading(tier);
    setError('');
    try {
      const { url } = await createCheckoutSession(tier, billing, false, activeRestaurantId);
      window.location.href = url;
    } catch (e: any) {
      if (e?.response?.data?.code === 'ALREADY_SUBSCRIBED') {
        await handlePortal();
        return;
      }
      const backendMsg = e?.response?.data?.message;
      setError(import.meta.env.DEV && backendMsg ? backendMsg : t('subscription.errorCheckout'));
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-20">
      <div className="mx-auto max-w-7xl">
        <section className="mb-14 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t('pricing.badge')}
            </p>
            <h1 className="mt-4 text-5xl font-black tracking-tight text-foreground md:text-7xl">
              {t('pricing.title')}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              {t('pricing.subtitle')}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="inline-flex items-center gap-1 rounded-xl bg-secondary p-1.5">
              <button
                onClick={() => setBilling('monthly')}
                className={`rounded-lg px-5 py-2 text-sm font-bold transition-all ${
                  billing === 'monthly' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('pricing.billing.monthly')}
              </button>
              <button
                onClick={() => setBilling('yearly')}
                className={`flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-bold transition-all ${
                  billing === 'yearly' ? 'bg-card text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('pricing.billing.yearly')}
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                  {t('pricing.billing.saveAnnual')}
                </span>
              </button>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-5 text-muted-foreground">
              {t('pricing.billing.recurringNote')}
            </p>
          </div>
        </section>

        {error && (
          <div className="mb-8 rounded-xl bg-destructive/10 px-5 py-3 text-center text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="mb-20 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_CONFIGS.map((plan) => {
            const price = tierPrice(plan.monthly, billing, t);
            const tierIndex = TIER_ORDER.indexOf(plan.key);
            const isCurrentTier = plan.key === currentTier;
            const isLowerTier = hasSubscription && tierIndex < currentTierIndex;
            const isLoading = loading === plan.key || loading === 'portal';
            const label = isLoading
              ? t('subscription.loading')
              : isCurrentTier
                ? t('pricing.currentPlan')
                : isLowerTier
                  ? t('pricing.manageBilling')
                  : plan.key === 'FREE'
                    ? t('pricing.getStarted')
                    : t('pricing.choosePlan', { tier: tierName(t, plan.key) });

            return (
              <article
                key={plan.key}
                className={`relative flex min-h-[510px] flex-col rounded-3xl border bg-card p-7 transition-all ${
                  plan.highlight
                    ? 'scale-[1.02] border-primary shadow-2xl shadow-primary/10'
                    : 'border-border hover:border-primary/40 hover:shadow-lg'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-4 left-1/2 z-10 -translate-x-1/2">
                    <span className="rounded-full bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-lg">
                      {t('pricing.popular')}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{plan.key}</p>
                  <p className="mt-3 rounded-xl border border-border bg-secondary/70 px-3 py-2 text-xs font-bold leading-5 text-foreground">
                    {t(plan.fitKey)}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-foreground">{tierName(t, plan.key)}</h2>
                  <div className="mt-4 flex items-end gap-1">
                    <span className="text-4xl font-black text-foreground">{price.main}</span>
                    {price.meta && <span className="pb-1 text-xs leading-snug text-muted-foreground">{price.meta}</span>}
                  </div>
                  {billing === 'yearly' && plan.monthly > 0 && (
                    <p className="mt-1 text-xs font-semibold text-primary">
                      {t('pricing.billing.saveVsMonthly')}
                    </p>
                  )}
                </div>

                <ul className="mb-8 flex-1 space-y-2.5">
                  {plan.bulletKeys.map((key) => (
                    <li key={key} className="flex items-start gap-2.5 text-sm leading-6 text-foreground">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      {t(key)}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelect(plan.key)}
                  disabled={!!loading || isCurrentTier}
                  className={`w-full rounded-2xl py-3.5 text-sm font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
                    isCurrentTier
                      ? 'cursor-default bg-primary/20 text-primary'
                      : plan.highlight
                        ? 'bg-foreground text-background hover:opacity-80'
                        : 'bg-secondary text-foreground hover:bg-secondary/80'
                  }`}
                >
                  {label}
                </button>
              </article>
            );
          })}
        </section>

        <section className="mb-20">
          <div className="mx-auto mb-8 max-w-3xl text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t('pricing.comparison.badge')}
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-5xl">
              {t('pricing.comparison.title')}
            </h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="w-2/5 px-5 py-4 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">
                    {t('pricing.comparison.featureHeader')}
                  </th>
                  {TIER_ORDER.map((col) => (
                    <th key={col} className="px-3 py-4 text-center text-[10px] font-black uppercase tracking-widest text-foreground">
                      {tierName(t, col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item) => {
                  if (item.type === 'section') {
                    return (
                      <tr key={item.key} className="bg-secondary/30">
                        <td colSpan={5} className="px-5 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          {t(item.labelKey)}
                        </td>
                      </tr>
                    );
                  }
                  const { row, index } = item;
                  return (
                    <tr key={row.labelKey} className={`border-t border-border/50 ${index % 2 === 0 ? '' : 'bg-secondary/10'}`}>
                      <td className="px-5 py-3 text-sm font-medium text-foreground">{t(row.labelKey)}</td>
                      <td className="px-3 py-3 text-center"><FeatureCell val={row.free} /></td>
                      <td className="px-3 py-3 text-center"><FeatureCell val={row.starter} /></td>
                      <td className="px-3 py-3 text-center"><FeatureCell val={row.professional} /></td>
                      <td className="px-3 py-3 text-center"><FeatureCell val={row.enterprise} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mx-auto mb-20 grid max-w-6xl gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {t('pricing.faq.badge')}
            </p>
            <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-5xl">
              {t('pricing.faq.title')}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted-foreground">
              {t('pricing.faq.subtitle')}
            </p>
          </div>
          <div className="space-y-2">
            {FAQ_KEYS.map((key, i) => (
              <div key={key} className="overflow-hidden rounded-2xl border border-border bg-card">
                <button
                  className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left text-sm font-bold text-foreground transition-colors hover:bg-secondary/30"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{t(`pricing.faq.${key}.question`)}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm leading-7 text-muted-foreground">
                    {t(`pricing.faq.${key}.answer`)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-xs text-muted-foreground">
          {t('pricing.terms')}
        </p>
      </div>
    </div>
  );
}
