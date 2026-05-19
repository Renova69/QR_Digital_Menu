import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { createCheckoutSession } from '../lib/api';

type Billing = 'monthly' | 'yearly';

interface TierDef {
  key: string;
  monthly: number;
  highlight?: boolean;
  bullets: string[];
}

const TIERS: TierDef[] = [
  {
    key: 'FREE',
    monthly: 0,
    bullets: [
      'Digital menu (view & edit)',
      'QR code management',
      'OCR menu import',
      '1 staff member',
    ],
  },
  {
    key: 'STARTER',
    monthly: 15,
    bullets: [
      'Everything in Free',
      'Online ordering',
      'Basic analytics',
      '1 staff member',
    ],
  },
  {
    key: 'PROFESSIONAL',
    monthly: 25,
    highlight: true,
    bullets: [
      'Everything in Starter',
      'Stripe pay-at-table',
      'Full analytics',
      'Call waiter button',
      'Multi-language menu',
      'Custom branding',
      'Loyalty program',
      'Customer accounts',
      'Upselling & dayparting',
      'Up to 5 staff + Manager role',
    ],
  },
  {
    key: 'ENTERPRISE',
    monthly: 45,
    bullets: [
      'Everything in Professional',
      'Point of Sale (POS)',
      'Kitchen Display (KDS)',
      'Multi-location',
      'Thermal printers',
      'Menu templates',
      'Advanced RBAC',
      'Unlimited staff',
      'Priority support',
    ],
  },
];

interface FeatureRow {
  label: string;
  section?: string;
  free: boolean | string;
  starter: boolean | string;
  professional: boolean | string;
  enterprise: boolean | string;
}

const FEATURE_ROWS: FeatureRow[] = [
  { section: 'Menu', label: 'Digital menu', free: true, starter: true, professional: true, enterprise: true },
  { label: 'OCR menu import', free: true, starter: true, professional: true, enterprise: true },
  { label: 'Multi-language menu', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Menu templates', free: false, starter: false, professional: false, enterprise: true },
  { section: 'Orders', label: 'Online ordering', free: false, starter: true, professional: true, enterprise: true },
  { label: 'Call waiter button', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Point of Sale (POS)', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Kitchen Display (KDS)', free: false, starter: false, professional: false, enterprise: true },
  { section: 'Payments', label: 'Stripe pay-at-table', free: false, starter: false, professional: true, enterprise: true },
  { section: 'Analytics', label: 'Basic analytics', free: false, starter: true, professional: true, enterprise: true },
  { label: 'Full analytics', free: false, starter: false, professional: true, enterprise: true },
  { section: 'QR & Customers', label: 'QR codes', free: true, starter: true, professional: true, enterprise: true },
  { label: 'Customer accounts', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Loyalty program', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Upselling', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Dayparting / happy hour', free: false, starter: false, professional: true, enterprise: true },
  { section: 'Customization', label: 'Custom branding', free: false, starter: false, professional: true, enterprise: true },
  { label: 'Multi-location', free: false, starter: false, professional: false, enterprise: true },
  { label: 'Thermal printers', free: false, starter: false, professional: false, enterprise: true },
  { section: 'Team', label: 'Staff members', free: '1', starter: '1', professional: '5', enterprise: 'Unlimited' },
  { label: 'Advanced RBAC', free: false, starter: false, professional: false, enterprise: true },
  { section: 'Support', label: 'Priority support', free: false, starter: false, professional: false, enterprise: true },
];

const FAQ_ITEMS = [
  {
    q: 'Are prices inclusive of VAT?',
    a: 'Prices shown exclude VAT. Your local VAT rate applies at checkout via Stripe.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel via the Billing portal at any time. You keep access until the end of the current billing period.',
  },
  {
    q: 'What happens when I downgrade?',
    a: "You move to the new plan's features immediately. Stripe applies a prorated credit for unused time toward your next invoice.",
  },
  {
    q: 'Is there a free trial?',
    a: 'The FREE plan is permanent with no time limit — it is your trial. Upgrade whenever you are ready.',
  },
  {
    q: 'Are there transaction fees?',
    a: 'Stripe charges 1.4% + €0.25 per EU card transaction. There is no additional platform fee from us.',
  },
  {
    q: 'Can I switch between monthly and yearly billing?',
    a: 'Yes, via the Billing portal. The change takes effect at your next billing date.',
  },
];

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

export default function PricingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<Billing>('monthly');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSelect = async (tier: string) => {
    if (tier === 'FREE') {
      navigate('/dashboard');
      return;
    }
    setLoading(tier);
    setError('');
    try {
      const { url } = await createCheckoutSession(tier, billing);
      window.location.href = url;
    } catch (e: any) {
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

  type DisplayItem =
    | { type: 'section'; label: string; key: string }
    | { type: 'row'; row: FeatureRow; index: number };

  const tableItems: DisplayItem[] = FEATURE_ROWS.reduce<DisplayItem[]>((acc, row, i) => {
    if (row.section) acc.push({ type: 'section', label: row.section, key: `section-${row.section}` });
    acc.push({ type: 'row', row, index: i });
    return acc;
  }, []);

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
              <span className="bg-accent text-accent-foreground text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide">
                {t('pricing.billing.saveAnnual', 'Save 15%')}
              </span>
            </button>
          </div>
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
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg">
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
                  {tier.bullets.map((f) => (
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
