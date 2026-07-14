import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

const STEPS = [
  {
    key: "cart",
    labelKey: "checkout.steps.cart",
    fallback: "Cart",
  },
  {
    key: "table",
    labelKey: "checkout.steps.table",
    fallback: "Table & Requests",
  },
  {
    key: "payment",
    labelKey: "checkout.steps.payment",
    fallback: "Payment",
  },
  {
    key: "ready",
    labelKey: "checkout.steps.ready",
    fallback: "Ready",
  },
] as const;

export function CheckoutProgressSteps({
  currentStep,
}: {
  currentStep: number;
}) {
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t("checkout.progressLabel", "Checkout progress")}
      className="glass-panel rounded-2xl border border-white/20 p-3 shadow-sm"
    >
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((step, index) => {
          const stepNumber = index + 1;
          const complete = stepNumber < currentStep;
          const active = stepNumber === currentStep;

          return (
            <li
              key={step.key}
              className={cn(
                "min-w-0 rounded-xl border px-2 py-2 transition-colors",
                active
                  ? "border-primary/40 bg-primary/10"
                  : complete
                    ? "border-emerald-500/25 bg-emerald-500/10"
                    : "border-border/60 bg-background/30",
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
                    active
                      ? "bg-primary text-white"
                      : complete
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : stepNumber}
                </span>
                <span className="min-w-0">
                  <span className="block text-[9px] font-black uppercase leading-tight tracking-wider text-muted-foreground">
                    {t("checkout.steps.stepLabel", "Step {{number}}", {
                      number: stepNumber,
                    })}
                  </span>
                  <span className="block truncate text-[11px] font-black leading-tight text-foreground sm:text-xs">
                    {t(step.labelKey, step.fallback)}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
