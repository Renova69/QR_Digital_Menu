import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { updateOnboardingStep, createCheckoutSession } from '../../lib/api';
import PlanPickerStep from './steps/PlanPickerStep';
import RestaurantBasicsStep from './steps/RestaurantBasicsStep';
import TableSetupStep from './steps/TableSetupStep';
import PaymentSetupStep from './steps/PaymentSetupStep';
import FinishStep from './steps/FinishStep';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
const PAID_TIERS: Tier[] = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const PAYMENT_TIERS: Tier[] = ['PROFESSIONAL', 'ENTERPRISE'];

type Step = 'plan' | 'basics' | 'stripe-pending' | 'tables' | 'payment' | 'done';

const STEP_LABELS: Record<Step, string> = {
  plan: 'Choose plan',
  basics: 'Restaurant info',
  'stripe-pending': 'Subscription',
  tables: 'Tables',
  payment: 'Payments',
  done: 'Done',
};

function getSteps(tier: Tier, needsPlanPicker: boolean): Step[] {
  const steps: Step[] = [];
  if (needsPlanPicker) steps.push('plan');
  steps.push('basics');
  if (PAID_TIERS.includes(tier)) steps.push('stripe-pending');
  steps.push('tables');
  if (PAYMENT_TIERS.includes(tier)) steps.push('payment');
  steps.push('done');
  return steps;
}

export default function OnboardingPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const stripeResult = searchParams.get('stripe'); // 'success' | 'cancel'

  const [selectedTier, setSelectedTier] = useState<Tier>(() => {
    const stored = sessionStorage.getItem('selectedPlan') as Tier | null;
    return stored && ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(stored)
      ? stored
      : 'FREE';
  });

  const needsPlanPicker = !sessionStorage.getItem('selectedPlan');
  const [step, setStep] = useState<Step>(() => {
    if (stripeResult) return 'tables';
    return needsPlanPicker ? 'plan' : 'basics';
  });

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.onboardingComplete) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (stripeResult === 'cancel') {
      setSelectedTier('FREE');
      sessionStorage.removeItem('selectedPlan');
    }
  }, [stripeResult]);

  const steps = getSteps(selectedTier, needsPlanPicker);
  const currentIndex = steps.indexOf(step);
  const visibleSteps = steps.filter((s) => s !== 'stripe-pending');
  const visibleIndex = visibleSteps.indexOf(step === 'stripe-pending' ? 'basics' : step);

  const persistStep = async (s: Step) => {
    try {
      await updateOnboardingStep(s);
    } catch (_) {}
  };

  const handlePlanSelected = (tier: Tier) => {
    setSelectedTier(tier);
    sessionStorage.setItem('selectedPlan', tier);
  };

  const handlePlanNext = () => {
    setStep('basics');
  };

  const handleRestaurantCreated = async (id: string, name: string) => {
    setRestaurantId(id);
    setRestaurantName(name);
    sessionStorage.setItem('onboardingRestaurantId', id);

    const tier = selectedTier;
    if (PAID_TIERS.includes(tier)) {
      await persistStep('stripe-pending');
      setLoading(true);
      try {
        const { url } = await createCheckoutSession(tier, 'monthly', true);
        window.location.href = url;
      } catch (_) {
        setLoading(false);
        setStep('tables');
      }
    } else {
      await persistStep('tables');
      setStep('tables');
    }
  };

  const handleTablesNext = async () => {
    const next: Step = PAYMENT_TIERS.includes(selectedTier) ? 'payment' : 'done';
    await persistStep(next);
    setStep(next);
  };

  const handlePaymentNext = async () => {
    await persistStep('done');
    setStep('done');
  };

  const handleDone = async () => {
    await updateOnboardingStep('done');
    if (user) updateUser({ ...user, onboardingComplete: true });
    sessionStorage.removeItem('selectedPlan');
    sessionStorage.removeItem('onboardingRestaurantId');
    navigate('/dashboard', { replace: true });
  };

  const activeRestaurantId =
    restaurantId || sessionStorage.getItem('onboardingRestaurantId') || '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-display font-bold text-foreground">QR Menu</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-sm text-muted-foreground">Setup</span>
        </div>
        <a href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Back to home
        </a>
      </header>

      {/* Progress bar */}
      {step !== 'stripe-pending' && (
        <div className="border-b border-border px-6 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-2">
            {visibleSteps.map((s, i) => {
              const active = s === step;
              const done = i < visibleIndex;
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className={`h-px flex-1 w-8 ${done ? 'bg-primary' : 'bg-border'}`} />
                  )}
                  <div className={`flex items-center gap-1.5 text-xs font-semibold transition-all
                    ${active ? 'text-primary' : done ? 'text-muted-foreground' : 'text-muted-foreground/50'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black
                      ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground/50'}`}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">

          {step === 'stripe-pending' || loading ? (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Redirecting to Stripe…</p>
            </div>
          ) : step === 'plan' ? (
            <PlanPickerStep
              selected={selectedTier}
              onSelect={handlePlanSelected}
              onNext={handlePlanNext}
            />
          ) : step === 'basics' ? (
            <RestaurantBasicsStep
              onCreated={(id, name) => handleRestaurantCreated(id, name)}
            />
          ) : step === 'tables' ? (
            <TableSetupStep
              restaurantId={activeRestaurantId}
              onNext={handleTablesNext}
              onSkip={handleTablesNext}
            />
          ) : step === 'payment' ? (
            <PaymentSetupStep
              restaurantId={activeRestaurantId}
              onNext={handlePaymentNext}
              onSkip={handlePaymentNext}
            />
          ) : step === 'done' ? (
            <FinishStep
              restaurantName={restaurantName || 'your restaurant'}
              onDone={handleDone}
            />
          ) : null}

        </div>
      </main>
    </div>
  );
}
