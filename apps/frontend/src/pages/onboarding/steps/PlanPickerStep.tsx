import { Check } from 'lucide-react';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
type Billing = 'monthly' | 'yearly';

const YEARLY_DISCOUNT = 0.85;

interface Plan {
  key: Tier;
  monthly: number;
  highlight: boolean;
  bullets: string[];
}

const PLANS: Plan[] = [
  {
    key: 'FREE',
    monthly: 0,
    highlight: false,
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
    highlight: false,
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
      'Up to 5 staff',
    ],
  },
  {
    key: 'ENTERPRISE',
    monthly: 45,
    highlight: false,
    bullets: [
      'Everything in Professional',
      'POS & Kitchen Display',
      'Multi-location',
      'Unlimited staff',
      'Priority support',
    ],
  },
];

function tierPrice(monthly: number, billing: Billing): { main: string; meta: string | null } {
  if (monthly === 0) return { main: '€0', meta: null };
  if (billing === 'monthly') return { main: `€${monthly}`, meta: '/mo' };
  const moPrice = (monthly * YEARLY_DISCOUNT).toFixed(2);
  const yrTotal = Math.round(monthly * 12 * YEARLY_DISCOUNT);
  return { main: `€${moPrice}`, meta: `/mo · €${yrTotal}/yr` };
}

interface Props {
  selected: Tier;
  billing: Billing;
  onSelect: (tier: Tier) => void;
  onBillingChange: (billing: Billing) => void;
  onNext: () => void;
}

export default function PlanPickerStep({ selected, billing, onSelect, onBillingChange, onNext }: Props) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-display font-black text-foreground tracking-tight">Choose your plan</h2>
        <p className="text-muted-foreground mt-2">Start free or unlock the full experience. Change anytime.</p>
      </div>

      {/* Billing toggle — matches pricing page */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 bg-secondary rounded-2xl p-1.5">
          <button
            onClick={() => onBillingChange('monthly')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              billing === 'monthly'
                ? 'bg-card shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => onBillingChange('yearly')}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              billing === 'yearly'
                ? 'bg-card shadow text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Yearly
            <span
              className="text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
              style={{ background: 'var(--gradient-brand, linear-gradient(135deg,#7c3aed,#a855f7))' }}
            >
              Save 15%
            </span>
          </button>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        {PLANS.map((plan) => {
          const price = tierPrice(plan.monthly, billing);
          const isSelected = selected === plan.key;
          return (
            <button
              key={plan.key}
              onClick={() => onSelect(plan.key)}
              className={`relative flex flex-col rounded-3xl border p-6 text-left transition-all
                ${plan.highlight
                  ? 'border-primary shadow-2xl shadow-primary/10 bg-card scale-105'
                  : isSelected
                  ? 'border-primary bg-card shadow-lg'
                  : 'border-border bg-card hover:border-primary/40 hover:shadow-md'
                }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <span
                    className="text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg whitespace-nowrap"
                    style={{ background: 'var(--gradient-brand, linear-gradient(135deg,#7c3aed,#a855f7))' }}
                  >
                    Most Popular
                  </span>
                </div>
              )}

              {isSelected && !plan.highlight && (
                <div className="absolute top-3 right-3">
                  <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-2">
                  {plan.key}
                </h3>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-black text-foreground">{price.main}</span>
                  {price.meta && (
                    <span className="text-muted-foreground text-xs pb-1 leading-snug">{price.meta}</span>
                  )}
                </div>
                {billing === 'yearly' && plan.monthly > 0 && (
                  <p className="text-xs text-primary mt-1 font-semibold">Save 15% vs monthly</p>
                )}
              </div>

              <ul className="flex-1 space-y-2 mb-5">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="text-primary font-bold mt-0.5 shrink-0">✓</span>
                    {b}
                  </li>
                ))}
              </ul>

              <div className={`w-full py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest text-center transition-all
                ${isSelected
                  ? plan.highlight
                    ? 'bg-foreground text-background'
                    : 'bg-primary text-primary-foreground'
                  : plan.highlight
                  ? 'bg-secondary text-foreground hover:bg-foreground hover:text-background'
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}>
                {isSelected ? 'Selected' : `Choose ${plan.key.charAt(0) + plan.key.slice(1).toLowerCase()}`}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className="px-8 py-3 rounded-2xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/20"
        >
          Continue with {PLANS.find((p) => p.key === selected)?.key.charAt(0)}{PLANS.find((p) => p.key === selected)?.key.slice(1).toLowerCase()}
        </button>
      </div>
    </div>
  );
}
