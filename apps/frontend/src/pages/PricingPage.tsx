import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { createCheckoutSession, createPortalSession, getSubscriptionStatus } from '../lib/api';

type Billing = 'monthly' | 'yearly';

interface FeatureRowData {
  label: string;
  section?: string;
  free: boolean | string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
}

type TableItem =
  | { type: 'section'; label: string; key: string }
  | { type: 'row'; row: FeatureRowData; index: number };

const YEARLY_DISCOUNT = 0.85;

function tierPrice(monthly: number, billing: Billing): { main: string; meta: string | null } {
  if (monthly === 0) return { main: '€0', meta: null };
  if (billing === 'monthly') return { main: `€${monthly}`, meta: '/mo' };
  const moPrice = (monthly * YEARLY_DISCOUNT).toFixed(2);
  const yrTotal = Math.round(monthly * 12 * YEARLY_DISCOUNT);
  return { main: `€${moPrice}`, meta: `/mo · €${yrTotal}/yr` };
}

function FeatureCell({ val }: { val: boolean | string }) {
  if (typeof val === 'string') {
    return <span className="text-sm font-medium text-foreground">{val}</span>;
  }
  return val ? (
    <span className="text-accent font-bold text-base">✓</span>
  ) : (
    <span className="text-muted-foreground/40 text-base">—</span>
  );
}

const TIER_ORDER = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<Billing>('monthly');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { data: status } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: getSubscriptionStatus,
    retry: false,
    staleTime: 60_000,
  });

  const TIERS = [
    {
      key: 'FREE',
      monthly: 0,
      highlight: false,
      bullets: [
        t('pricing.tiers.free.b1', 'Digital menu (view & edit)'),
        t('pricing.tiers.free.b2', 'QR code management'),
        t('pricing.tiers.free.b3', 'OCR menu import'),
        t('pricing.tiers.free.b4', '1 staff member'),
      ],
    },
    {
      key: 'STARTER',
      monthly: 15,
      highlight: false,
      bullets: [
        t('pricing.tiers.starter.b1', 'Everything in Free'),
        t('pricing.tiers.starter.b2', 'Online ordering'),
        t('pricing.tiers.starter.b3', 'Basic analytics'),
        t('pricing.tiers.starter.b4', '1 staff member'),
      ],
    },
    {
      key: 'PROFESSIONAL',
      monthly: 25,
      highlight: true,
      bullets: [
        t('pricing.tiers.professional.b1', 'Everything in Starter'),
        t('pricing.tiers.professional.b2', 'Stripe pay-at-table'),
        t('pricing.tiers.professional.b3', 'Full analytics'),
        t('pricing.tiers.professional.b4', 'Call waiter button'),
        t('pricing.tiers.professional.b5', 'Multi-language menu'),
        t('pricing.tiers.professional.b6', 'Custom branding'),
        t('pricing.tiers.professional.b7', 'Loyalty program'),
        t('pricing.tiers.professional.b8', 'Customer accounts'),
        t('pricing.tiers.professional.b9', 'Upselling & dayparting'),
        t('pricing.tiers.professional.b10', 'Up to 5 staff + Manager role'),
      ],
    },
    {
      key: 'ENTERPRISE',
      monthly: 45,
      highlight: false,
      bullets: [
        t('pricing.tiers.enterprise.b1', 'Everything in Professional'),
        t('pricing.tiers.enterprise.b2', 'Point of Sale (POS)'),
        t('pricing.tiers.enterprise.b3', 'Kitchen Display (KDS)'),
        t('pricing.tiers.enterprise.b4', 'Multi-location'),
        t('pricing.tiers.enterprise.b5', 'Thermal printers'),
        t('pricing.tiers.enterprise.b6', 'Menu templates'),
        t('pricing.tiers.enterprise.b7', 'Advanced RBAC'),
        t('pricing.tiers.enterprise.b8', 'Unlimited staff'),
        t('pricing.tiers.enterprise.b9', 'Priority support'),
      ],
    },
  ];

  const FEATURE_ROWS: FeatureRowData[] = [
    { section: t('pricing.sections.menu', 'Menu'), label: t('pricing.features.digitalMenu', 'Digital menu'), free: true, starter: true, professional: true, enterprise: true },
    { label: t('pricing.features.ocrImport', 'OCR menu import'), free: true, starter: true, professional: true, enterprise: true },
    { label: t('pricing.features.multiLanguage', 'Multi-language menu'), free: false, starter: false, professional: true, enterprise: true },
    { label: t('pricing.features.menuTemplates', 'Menu templates'), free: false, starter: false, professional: false, enterprise: true },
    { section: t('pricing.sections.orders', 'Orders'), label: t('pricing.features.onlineOrdering', 'Online ordering'), free: false, starter: true, professional: true, enterprise: true },
    { label: t('pricing.features.callWaiter', 'Call waiter button'), free: false, starter: false, professional: true, enterprise: true },
    { label: t('pricing.features.pos', 'Point of Sale (POS)'), free: false, starter: false, professional: false, enterprise: true },
    { label: t('pricing.features.kds', 'Kitchen Display (KDS)'), free: false, starter: false, professional: false, enterprise: true },
    { section: t('pricing.sections.payments', 'Payments'), label: t('pricing.features.stripePayments', 'Stripe pay-at-table'), free: false, starter: false, professional: true, enterprise: true },
    { section: t('pricing.sections.analytics', 'Analytics'), label: t('pricing.features.basicAnalytics', 'Basic analytics'), free: false, starter: true, professional: true, enterprise: true },
    { label: t('pricing.features.fullAnalytics', 'Full analytics'), free: false, starter: false, professional: true, enterprise: true },
    { section: t('pricing.sections.customers', 'QR & Customers'), label: t('pricing.features.qrCodes', 'QR codes'), free: true, starter: true, professional: true, enterprise: true },
    { label: t('pricing.features.customerAccounts', 'Customer accounts'), free: false, starter: false, professional: true, enterprise: true },
    { label: t('pricing.features.loyalty', 'Loyalty program'), free: false, starter: false, professional: true, enterprise: true },
    { label: t('pricing.features.upselling', 'Upselling'), free: false, starter: false, professional: true, enterprise: true },
    { label: t('pricing.features.dayparting', 'Dayparting / happy hour'), free: false, starter: false, professional: true, enterprise: true },
    { section: t('pricing.sections.customization', 'Customization'), label: t('pricing.features.customBranding', 'Custom branding'), free: false, starter: false, professional: true, enterprise: true },
    { label: t('pricing.features.multiLocation', 'Multi-location'), free: false, starter: false, professional: false, enterprise: true },
    { label: t('pricing.features.thermalPrinters', 'Thermal printers'), free: false, starter: false, professional: false, enterprise: true },
    { section: t('pricing.sections.team', 'Team'), label: t('pricing.features.staffMembers', 'Staff members'), free: '1', starter: '1', professional: '5', enterprise: t('pricing.features.unlimited', 'Unlimited') },
    { label: t('pricing.features.rbac', 'Advanced RBAC'), free: false, starter: false, professional: false, enterprise: true },
    { section: t('pricing.sections.support', 'Support'), label: t('pricing.features.prioritySupport', 'Priority support'), free: false, starter: false, professional: false, enterprise: true },
  ];

  const FAQ_ITEMS = [
    {
      q: t('pricing.faq.q1', 'Are prices inclusive of VAT?'),
      a: t('pricing.faq.a1', 'Prices shown exclude VAT. Your local VAT rate applies at checkout via Stripe.'),
    },
    {
      q: t('pricing.faq.q2', 'Can I cancel anytime?'),
      a: t('pricing.faq.a2', 'Yes. Cancel via the Billing portal at any time. You keep access until the end of the current billing period.'),
    },
    {
      q: t('pricing.faq.q3', 'What happens when I downgrade?'),
      a: t('pricing.faq.a3', "You move to the new plan's features immediately. Stripe applies a prorated credit for unused time toward your next invoice."),
    },
    {
      q: t('pricing.faq.q4', 'Is there a free trial?'),
      a: t('pricing.faq.a4', 'The FREE plan is permanent with no time limit — it is your trial. Upgrade whenever you are ready.'),
    },
    {
      q: t('pricing.faq.q5', 'Are there transaction fees?'),
      a: t('pricing.faq.a5', 'Stripe charges 1.4% + €0.25 per EU card transaction. There is no additional platform fee from us.'),
    },
    {
      q: t('pricing.faq.q6', 'Can I switch between monthly and yearly billing?'),
      a: t('pricing.faq.a6', 'Yes, via the Billing portal. The change takes effect at your next billing date.'),
    },
  ];

  const tableItems = FEATURE_ROWS.reduce<TableItem[]>((acc, row, i) => {
    if (row.section) acc.push({ type: 'section', label: row.section, key: `section-${i}` });
    acc.push({ type: 'row', row, index: i });
    return acc;
  }, []);

  const currentTierIndex = TIER_ORDER.indexOf(status?.tier ?? 'FREE');

  const handlePortal = async () => {
    setLoading('portal');
    setError('');
    try {
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch {
      setError(t('subscription.errorPortal', 'Could not open billing portal. Please try again.'));
    } finally {
      setLoading('');
    }
  };

  const handleSelect = async (tier: string) => {
    if (tier === 'FREE') {
      navigate('/dashboard');
      return;
    }
    const tierIndex = TIER_ORDER.indexOf(tier);
    if (tierIndex <= currentTierIndex && status?.tier) {
      await handlePortal();
      return;
    }
    setLoading(tier);
    setError('');
    try {
      const { url } = await createCheckoutSession(tier, billing);
      window.location.href = url;
    } catch (e: any) {
      if (e?.response?.data?.code === 'ALREADY_SUBSCRIBED') {
        await handlePortal();
        return;
      }
      const backendMsg = e?.response?.data?.message;
      setError(
        import.meta.env.DEV && backendMsg
          ? backendMsg
          : t('subscription.errorCheckout', 'Could not start checkout. Please try again.'),
      );
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-background py-20 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Hero */}
        <div className="text-center mb-14">
          <h1 className="text-5xl md:text-7xl font-serif font-black text-foreground tracking-tighter mb-4">
            {t('pricing.title', 'Simple Pricing')}
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
            {t('pricing.subtitle', 'Choose the plan that fits your restaurant. Upgrade or downgrade anytime.')}
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 bg-secondary rounded-2xl p-1.5">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
                billing === 'monthly' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('pricing.billing.monthly', 'Monthly')}
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                billing === 'yearly' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('pricing.billing.yearly', 'Yearly')}
              <span className="bg-accent text-accent-foreground text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                {t('pricing.billing.saveAnnual', 'Save 15%')}
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {t('pricing.billing.recurringNote', 'All paid plans auto-renew via Stripe. Cancel anytime from the Billing Portal.')}
          </p>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive px-5 py-3 rounded-xl text-sm text-center mb-8">
            {error}
          </div>
        )}

        {/* Tier cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          {TIERS.map((tier) => {
            const price = tierPrice(tier.monthly, billing);
            return (
              <div
                key={tier.key}
                className={`relative flex flex-col rounded-3xl border p-8 transition-all ${
                  tier.highlight
                    ? 'border-accent shadow-2xl shadow-accent/10 bg-card scale-105'
                    : 'border-border bg-card hover:border-accent/40 hover:shadow-lg'
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-accent text-accent-foreground px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg whitespace-nowrap">
                      {t('pricing.popular', 'Most Popular')}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                    {tier.key}
                  </h2>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-black text-foreground">{price.main}</span>
                    {price.meta && (
                      <span className="text-muted-foreground text-xs pb-1 leading-snug">{price.meta}</span>
                    )}
                  </div>
                  {billing === 'yearly' && tier.monthly > 0 && (
                    <p className="text-xs text-accent mt-1 font-semibold">
                      {t('pricing.billing.saveAnnual', 'Save 15%')} vs monthly
                    </p>
                  )}
                </div>

                <ul className="flex-1 space-y-2.5 mb-8">
                  {tier.bullets.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-foreground">
                      <span className="text-accent font-bold mt-0.5 flex-shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {(() => {
                  const tierIndex = TIER_ORDER.indexOf(tier.key);
                  const isCurrentTier = status?.tier && tier.key === status.tier;
                  const isLowerTier = status?.tier && tierIndex < currentTierIndex;
                  const isLoading = loading === tier.key || loading === 'portal';
                  const label = isLoading
                    ? t('subscription.loading', 'Loading...')
                    : isCurrentTier
                    ? t('pricing.currentPlan', 'Current Plan')
                    : isLowerTier
                    ? t('pricing.manageBilling', 'Manage in Billing Portal')
                    : tier.key === 'FREE'
                    ? t('pricing.getStarted', 'Get Started')
                    : t('pricing.choosePlan', 'Choose {{tier}}', { tier: tier.key });
                  return (
                    <button
                      onClick={() => handleSelect(tier.key)}
                      disabled={!!loading || !!isCurrentTier}
                      className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 ${
                        isCurrentTier
                          ? 'bg-accent/20 text-accent cursor-default'
                          : tier.highlight
                          ? 'bg-foreground text-background hover:opacity-80'
                          : 'bg-secondary text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>

        {/* Feature comparison table */}
        <div className="mb-20">
          <h2 className="text-3xl font-serif font-black text-foreground tracking-tight text-center mb-8">
            {t('pricing.comparison.title', 'Compare all features')}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-5 text-xs font-black uppercase tracking-widest text-muted-foreground w-2/5">
                    Feature
                  </th>
                  {['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].map((col) => (
                    <th key={col} className="py-4 px-3 text-center text-[10px] font-black uppercase tracking-widest text-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableItems.map((item) => {
                  if (item.type === 'section') {
                    return (
                      <tr key={item.key} className="bg-secondary/30">
                        <td colSpan={5} className="py-2 px-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          {item.label}
                        </td>
                      </tr>
                    );
                  }
                  const { row, index } = item;
                  return (
                    <tr key={row.label} className={`border-t border-border/50 ${index % 2 === 0 ? '' : 'bg-secondary/10'}`}>
                      <td className="py-3 px-5 text-sm text-foreground">{row.label}</td>
                      <td className="py-3 px-3 text-center"><FeatureCell val={row.free} /></td>
                      <td className="py-3 px-3 text-center"><FeatureCell val={row.starter} /></td>
                      <td className="py-3 px-3 text-center"><FeatureCell val={row.professional} /></td>
                      <td className="py-3 px-3 text-center"><FeatureCell val={row.enterprise} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-20 max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-black text-foreground tracking-tight text-center mb-8">
            {t('pricing.faq.title', 'Frequently asked questions')}
          </h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="border border-border rounded-2xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left text-sm font-bold text-foreground hover:bg-secondary/30 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`flex-shrink-0 w-4 h-4 ml-3 text-muted-foreground transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          {t('pricing.terms', 'Prices exclude VAT. Cancel anytime.')}
        </p>
      </div>
    </div>
  );
}
