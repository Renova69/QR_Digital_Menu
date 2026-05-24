import { useState } from 'react';
import { Check } from 'lucide-react';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
type Billing = 'monthly' | 'yearly';

const YEARLY_DISCOUNT = 0.85;

interface Plan {
  key: Tier;
  label: string;
  monthly: number;
  highlight: boolean;
  bullets: string[];
}

const PLANS: Plan[] = [
  {
    key: 'FREE',
    label: 'Free',
    monthly: 0,
    highlight: false,
    bullets: ['Digital menu (view & edit)', 'QR code management', 'OCR menu import', '1 staff member'],
  },
  {
    key: 'STARTER',
    label: 'Starter',
    monthly: 15,
    highlight: false,
    bullets: ['Everything in Free', 'Online ordering', 'Basic analytics', '1 staff member'],
  },
  {
    key: 'PROFESSIONAL',
    label: 'Professional',
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
    label: 'Enterprise',
    monthly: 45,
    highlight: false,
    bullets: [
      'Everything in Professional',
      'POS & Kitchen Display',
      'Unlimited staff',
      'Priority support',
    ],
  },
];

function planPrice(monthly: number, billing: Billing): string {
  if (monthly === 0) return '€0/mo';
  if (billing === 'monthly') return `€${monthly}/mo`;
  return `€${(monthly * YEARLY_DISCOUNT).toFixed(0)}/mo`;
}

interface Props {
  selected: Tier;
  onSelect: (tier: Tier) => void;
  onNext: () => void;
}

export default function PlanPickerStep({ selected, onSelect, onNext }: Props) {
  const [billing, setBilling] = useState<Billing>('monthly');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Choose your plan</h2>
        <p className="text-sm text-muted-foreground mt-1">You can change or upgrade at any time.</p>
      </div>

      <div className="flex items-center gap-2 self-start">
        <button
          onClick={() => setBilling('monthly')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${billing === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBilling('yearly')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${billing === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Yearly <span className="text-emerald-500 ml-1">−15%</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isSelected = selected === plan.key;
          return (
            <button
              key={plan.key}
              onClick={() => onSelect(plan.key)}
              className={`relative text-left rounded-2xl border-2 p-5 transition-all flex flex-col gap-3
                ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 bg-card'}
                ${plan.highlight ? 'ring-1 ring-primary/30' : ''}`}
            >
              {plan.highlight && (
                <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                  Most Popular
                </span>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{plan.label}</p>
                  <p className="text-lg font-display font-bold text-primary mt-0.5">
                    {planPrice(plan.monthly, billing)}
                  </p>
                </div>
                {isSelected && (
                  <span className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {plan.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Check className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                    {b}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={onNext}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
        >
          Continue with {PLANS.find((p) => p.key === selected)?.label}
        </button>
      </div>
    </div>
  );
}
