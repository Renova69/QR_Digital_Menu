import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  updateOnboardingStep,
  createCheckoutSession,
  confirmCheckoutSession,
  getStripeStatus,
  updateProfile,
} from "../../lib/api";
import PlanPickerStep from "./steps/PlanPickerStep";
import RestaurantBasicsStep from "./steps/RestaurantBasicsStep";
import PaymentSetupStep from "./steps/PaymentSetupStep";
import FinishStep from "./steps/FinishStep";

type Tier = "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
type Billing = "monthly" | "yearly";
type Step =
  | "plan"
  | "basics"
  | "stripe-pending"
  | "stripe-confirming"
  | "payment"
  | "done";

const PAID_TIERS: Tier[] = ["STARTER", "PROFESSIONAL", "ENTERPRISE"];
const PAYMENT_TIERS: Tier[] = ["PROFESSIONAL", "ENTERPRISE"];
const VALID_TIERS: Tier[] = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"];

function getVisibleSteps(
  tier: Tier,
  hasPlanPicker: boolean,
): Array<"plan" | "basics" | "payment" | "done"> {
  const steps: Array<"plan" | "basics" | "payment" | "done"> = [];
  if (hasPlanPicker) steps.push("plan");
  steps.push("basics");
  if (PAYMENT_TIERS.includes(tier)) steps.push("payment");
  steps.push("done");
  return steps;
}

export default function OnboardingPage() {
  const { t } = useTranslation();
  const { user, isLoading, updateUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const stripeResult = searchParams.get("stripe"); // 'success' | 'cancel'
  const connectResult = searchParams.get("connect"); // 'success' | 'refresh'

  // Stable — captured once at mount, never recomputed
  const [hasPlanPicker] = useState(
    () => !sessionStorage.getItem("selectedPlan"),
  );

  const [selectedTier, setSelectedTier] = useState<Tier>(() => {
    const stored = sessionStorage.getItem("selectedPlan") as Tier | null;
    return stored && VALID_TIERS.includes(stored) ? stored : "FREE";
  });

  const [billing, setBilling] = useState<Billing>(() => {
    return (
      (sessionStorage.getItem("onboardingBilling") as Billing) || "monthly"
    );
  });

  const [step, setStep] = useState<Step>(() => {
    if (connectResult === "success") return "done";
    if (connectResult === "refresh") return "payment";
    if (stripeResult === "success") return "stripe-confirming";
    if (stripeResult === "cancel") return "done";
    return hasPlanPicker ? "plan" : "basics";
  });

  const [restaurantId] = useState<string>(
    () => sessionStorage.getItem("onboardingRestaurantId") || "",
  );
  const [restaurantName] = useState<string>(
    () => sessionStorage.getItem("onboardingRestaurantName") || "",
  );

  const [activeRestaurantId, setActiveRestaurantId] = useState(restaurantId);
  const [activeRestaurantName, setActiveRestaurantName] =
    useState(restaurantName);

  const [loading, setLoading] = useState(false);
  const [checkoutConfirmationError, setCheckoutConfirmationError] = useState<
    string | null
  >(null);
  const [confirmationAttempt, setConfirmationAttempt] = useState(0);
  const missingConfirmationMessage = t(
    "onboarding.confirmation.missingSession",
    "The checkout return is missing its confirmation reference. Retry or choose a plan again.",
  );
  const failedConfirmationMessage = t(
    "onboarding.confirmation.failed",
    "We could not confirm your payment yet. Your checkout is not lost. Retry the confirmation before continuing.",
  );

  // Auth guard
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (user.onboardingComplete) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, isLoading, navigate]);

  // On Stripe cancel: downgrade to FREE
  useEffect(() => {
    if (stripeResult === "cancel") {
      setSelectedTier("FREE");
      sessionStorage.setItem("selectedPlan", "FREE");
    }
  }, [stripeResult]);

  // On Stripe Connect success: call getStripeStatus so backend sets paymentsEnabled=true
  useEffect(() => {
    if (connectResult !== "success" || !activeRestaurantId) return;
    getStripeStatus(activeRestaurantId).catch(() => {});
  }, [connectResult, activeRestaurantId]);

  // Confirm Stripe session synchronously — don't wait for webhook
  useEffect(() => {
    if (step !== "stripe-confirming") return;

    const sessionId = searchParams.get("session_id");
    let cancelled = false;

    const confirm = async () => {
      setCheckoutConfirmationError(null);
      if (!sessionId) {
        setCheckoutConfirmationError(missingConfirmationMessage);
        return;
      }

      let confirmedTier: Tier = selectedTier;
      try {
        const { tier } = await confirmCheckoutSession(sessionId);
        if (cancelled) return;
        if (tier && tier !== "FREE") {
          confirmedTier = tier as Tier;
          setSelectedTier(confirmedTier);
          sessionStorage.setItem("selectedPlan", tier);
        }
      } catch {
        if (cancelled) return;
        setCheckoutConfirmationError(failedConfirmationMessage);
        return;
      }
      setStep(PAYMENT_TIERS.includes(confirmedTier) ? "payment" : "done");
    };

    void confirm();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    searchParams,
    selectedTier,
    confirmationAttempt,
    missingConfirmationMessage,
    failedConfirmationMessage,
  ]);

  const retryCheckoutConfirmation = () => {
    setConfirmationAttempt((attempt) => attempt + 1);
  };

  const restartPlanSelection = () => {
    setCheckoutConfirmationError(null);
    setStep("plan");
    navigate("/onboarding", { replace: true });
  };

  const persistStep = async (s: Step) => {
    try {
      await updateOnboardingStep(s);
    } catch (_) {}
  };

  const handlePlanSelected = (tier: Tier) => {
    setSelectedTier(tier);
    sessionStorage.setItem("selectedPlan", tier);
  };

  const handleBillingChange = (b: Billing) => {
    setBilling(b);
    sessionStorage.setItem("onboardingBilling", b);
  };

  const handlePlanNext = () => setStep("basics");

  const handleRestaurantCreated = async (
    id: string,
    name: string,
    ownerName: string,
  ) => {
    setActiveRestaurantId(id);
    setActiveRestaurantName(name);
    sessionStorage.setItem("onboardingRestaurantId", id);
    sessionStorage.setItem("onboardingRestaurantName", name);

    if (ownerName && user) {
      try {
        await updateProfile(ownerName);
        updateUser({ ...user, name: ownerName });
      } catch (_) {}
    }

    if (PAID_TIERS.includes(selectedTier)) {
      await persistStep("stripe-pending");
      setLoading(true);
      try {
        const { url } = await createCheckoutSession(
          selectedTier,
          billing,
          true,
        );
        window.location.href = url;
      } catch (_) {
        setLoading(false);
        alert(
          t("onboarding.checkoutError") ||
            "Failed to initialize checkout. Please check Stripe configuration or select the FREE plan for now.",
        );
        setStep("plan");
      }
    } else {
      const next: Step = PAYMENT_TIERS.includes(selectedTier)
        ? "payment"
        : "done";
      await persistStep(next);
      setStep(next);
    }
  };

  const handlePaymentNext = async () => {
    await persistStep("done");
    setStep("done");
  };

  const handleDone = async () => {
    await updateOnboardingStep("done");
    if (user) updateUser({ ...user, onboardingComplete: true });
    sessionStorage.removeItem("selectedPlan");
    sessionStorage.removeItem("onboardingBilling");
    sessionStorage.removeItem("onboardingRestaurantId");
    sessionStorage.removeItem("onboardingRestaurantName");
    navigate("/dashboard", { replace: true });
  };

  const visibleSteps = getVisibleSteps(selectedTier, hasPlanPicker);
  const displayStep =
    step === "stripe-pending" || step === "stripe-confirming" ? "basics" : step;
  const visibleIndex = visibleSteps.indexOf(
    displayStep as "plan" | "basics" | "payment" | "done",
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isRedirecting =
    step === "stripe-pending" || step === "stripe-confirming" || loading;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg font-display font-bold text-foreground">
            {t("onboarding.brand")}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="text-sm text-muted-foreground">
            {t("onboarding.setup")}
          </span>
        </div>
        <a
          href="/"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t("onboarding.backToHome")}
        </a>
      </header>

      {/* Progress bar */}
      {!isRedirecting && (
        <div className="border-b border-border px-6 py-3 shrink-0">
          <div className="max-w-2xl mx-auto flex items-center">
            {visibleSteps.map((s, i) => {
              const isActive = s === step;
              const isDone = i < visibleIndex;
              return (
                <div key={s} className="flex items-center flex-1 min-w-0">
                  {i > 0 && (
                    <div
                      className={`h-px flex-1 mx-2 ${isDone ? "bg-primary/50" : "bg-border"}`}
                    />
                  )}
                  <div
                    className={`flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap
                    ${isActive ? "text-primary" : isDone ? "text-muted-foreground" : "text-muted-foreground/40"}`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0
                      ${isActive ? "bg-primary text-primary-foreground" : isDone ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground/40"}`}
                    >
                      {isDone ? "✓" : i + 1}
                    </span>
                    <span className="hidden sm:inline">
                      {t(`onboarding.steps.${s}`)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div
          className={`w-full ${
            !isRedirecting && step === "plan"
              ? "max-w-2xl xl:max-w-6xl"
              : "max-w-2xl"
          }`}
        >
          {isRedirecting ? (
            step === "stripe-confirming" && checkoutConfirmationError ? (
              <div className="flex flex-col items-center gap-5 py-16 text-center">
                <p
                  className="max-w-lg text-sm font-medium text-red-600"
                  role="alert"
                >
                  {checkoutConfirmationError}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
                    onClick={retryCheckoutConfirmation}
                  >
                    {t("onboarding.confirmation.retry", "Retry confirmation")}
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-md border border-border px-4 text-sm font-semibold text-foreground"
                    onClick={restartPlanSelection}
                  >
                    {t("onboarding.confirmation.choosePlan", "Choose plan")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-16 text-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  {step === "stripe-confirming"
                    ? t("onboarding.redirecting.confirming")
                    : t("onboarding.redirecting.stripe")}
                </p>
              </div>
            )
          ) : step === "plan" ? (
            <PlanPickerStep
              selected={selectedTier}
              billing={billing}
              onSelect={handlePlanSelected}
              onBillingChange={handleBillingChange}
              onNext={handlePlanNext}
            />
          ) : step === "basics" ? (
            <RestaurantBasicsStep
              onCreated={handleRestaurantCreated}
              existingRestaurantId={activeRestaurantId || undefined}
              existingRestaurantName={activeRestaurantName || undefined}
            />
          ) : step === "payment" ? (
            <PaymentSetupStep
              restaurantId={activeRestaurantId}
              returnUrl={`${window.location.origin}/onboarding?connect=success`}
              refreshUrl={`${window.location.origin}/onboarding?connect=refresh`}
              onNext={handlePaymentNext}
              onSkip={handlePaymentNext}
            />
          ) : step === "done" ? (
            <FinishStep
              restaurantName={
                activeRestaurantName || t("onboarding.finish.title")
              }
              onDone={handleDone}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
