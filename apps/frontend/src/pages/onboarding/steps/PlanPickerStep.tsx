import { useMemo } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

type Tier = "FREE" | "STARTER" | "PROFESSIONAL" | "ENTERPRISE";
type Billing = "monthly" | "yearly";

const YEARLY_DISCOUNT = 0.85;

interface PlanConfig {
  key: Tier;
  monthly: number;
  highlight: boolean;
}

const PLAN_CONFIGS: PlanConfig[] = [
  { key: "FREE", monthly: 0, highlight: false },
  { key: "STARTER", monthly: 15, highlight: false },
  { key: "PROFESSIONAL", monthly: 25, highlight: true },
  { key: "ENTERPRISE", monthly: 45, highlight: false },
];

function tierPrice(
  monthly: number,
  billing: Billing,
): { main: string; annualTotal: number | null } {
  if (monthly === 0) return { main: "€0", annualTotal: null };
  if (billing === "monthly") {
    return { main: `€${monthly}`, annualTotal: null };
  }
  const moPrice = (monthly * YEARLY_DISCOUNT).toFixed(2);
  const yrTotal = Math.round(monthly * 12 * YEARLY_DISCOUNT);
  return { main: `€${moPrice}`, annualTotal: yrTotal };
}

interface Props {
  selected: Tier;
  billing: Billing;
  onSelect: (tier: Tier) => void;
  onBillingChange: (billing: Billing) => void;
  onNext: () => void;
}

export default function PlanPickerStep({
  selected,
  billing,
  onSelect,
  onBillingChange,
  onNext,
}: Props) {
  const { t } = useTranslation();

  const plans = useMemo(
    () =>
      PLAN_CONFIGS.map((config) => {
        const tierKey = config.key.toLowerCase();
        return {
          ...config,
          name: t(`onboarding.plans.${tierKey}.name`),
          audience: t(`onboarding.plans.${tierKey}.audience`),
          bullets: t(`onboarding.plans.${tierKey}.features`, {
            returnObjects: true,
          }) as string[],
        };
      }),
    [t],
  );

  const selectedPlan = plans.find((p) => p.key === selected);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-3xl font-display font-black text-foreground tracking-tight">
          {t("onboarding.plans.title")}
        </h2>
        <p className="text-muted-foreground mt-2">
          {t("onboarding.plans.subtitle")}
        </p>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 bg-secondary rounded-2xl p-1.5">
          <button
            onClick={() => onBillingChange("monthly")}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              billing === "monthly"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("onboarding.plans.monthly")}
          </button>
          <button
            onClick={() => onBillingChange("yearly")}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
              billing === "yearly"
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("onboarding.plans.yearly")}
            <span
              className="text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
              style={{
                background:
                  "var(--gradient-brand, linear-gradient(135deg,#7c3aed,#a855f7))",
              }}
            >
              {t("onboarding.plans.savePercent")}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 xl:gap-5">
        {plans.map((plan) => {
          const price = tierPrice(plan.monthly, billing);
          const isSelected = selected === plan.key;
          return (
            <button
              key={plan.key}
              data-testid={`onboarding-plan-${plan.key.toLowerCase()}`}
              onClick={() => onSelect(plan.key)}
              className={`relative flex flex-col rounded-3xl border p-6 text-left transition-all
                ${
                  plan.highlight
                    ? "border-primary shadow-2xl shadow-primary/10 bg-card scale-105 xl:scale-[1.02]"
                    : isSelected
                      ? "border-primary bg-card shadow-lg"
                      : "border-border bg-card hover:border-primary/40 hover:shadow-md"
                }`}
            >
              {plan.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                  <span
                    className="text-white px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg whitespace-nowrap"
                    style={{
                      background:
                        "var(--gradient-brand, linear-gradient(135deg,#7c3aed,#a855f7))",
                    }}
                  >
                    {t("onboarding.plans.mostPopular")}
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
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-foreground">
                    {price.main}
                  </span>
                  {plan.monthly > 0 && (
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {t("onboarding.plans.perMonth")}
                    </span>
                  )}
                </div>
                {price.annualTotal !== null && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("onboarding.plans.annualTotal", {
                      amount: price.annualTotal,
                    })}
                  </p>
                )}
                {billing === "yearly" && plan.monthly > 0 && (
                  <p className="text-xs text-primary mt-1 font-semibold">
                    {t("onboarding.plans.saveVsMonthly")}
                  </p>
                )}
              </div>

              <div className="mb-5 rounded-2xl bg-secondary/60 px-3 py-3 text-xs leading-relaxed text-muted-foreground xl:min-h-[5.25rem]">
                <span className="block font-bold text-foreground mb-1">
                  {t("onboarding.plans.bestFor")}
                </span>
                {plan.audience}
              </div>

              <ul className="flex-1 space-y-2 mb-5">
                {plan.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-2 text-xs text-foreground"
                  >
                    <span className="text-primary font-bold mt-0.5 shrink-0">
                      ✓
                    </span>
                    {b}
                  </li>
                ))}
              </ul>

              <div
                className={`w-full py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest text-center transition-all
                ${
                  isSelected
                    ? plan.highlight
                      ? "bg-foreground text-background"
                      : "bg-primary text-primary-foreground"
                    : plan.highlight
                      ? "bg-secondary text-foreground hover:bg-foreground hover:text-background"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                }`}
              >
                {isSelected
                  ? t("onboarding.plans.selected")
                  : t("onboarding.plans.choose", { tier: plan.name })}
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
          {t("onboarding.plans.continue", {
            tier: selectedPlan?.name ?? "",
          })}
        </button>
      </div>
    </div>
  );
}
