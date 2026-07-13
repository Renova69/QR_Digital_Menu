import { useTranslation } from "react-i18next";
import { useRestaurantContext } from "../../context/RestaurantContext";
import type { RewardPointsMode } from "../../types";
import { calculateAutomaticRewardPoints } from "../../lib/rewardPricing";
import { Input } from "../ui/input";
import ToggleSwitch from "../ui/ToggleSwitch";

interface RewardPricingFieldsProps {
  fieldId: string;
  mode: RewardPointsMode;
  onModeChange: (mode: RewardPointsMode) => void;
  customPoints: string;
  onCustomPointsChange: (value: string) => void;
  itemPrice: string;
}

export function RewardPricingFields({
  fieldId,
  mode,
  onModeChange,
  customPoints,
  onCustomPointsChange,
  itemPrice,
}: RewardPricingFieldsProps) {
  const { t } = useTranslation();
  const { activeRestaurant } = useRestaurantContext();
  const redeemRate = activeRestaurant?.loyaltyRedeemRate ?? 150;
  const automaticPoints = calculateAutomaticRewardPoints(
    itemPrice,
    redeemRate,
  );
  const enabled = mode !== "OFF";

  return (
    <section className="space-y-3 border-y border-border/50 py-4">
      <div className="flex items-start gap-3">
        <ToggleSwitch
          checked={enabled}
          onChange={(checked) => onModeChange(checked ? "AUTO" : "OFF")}
          aria-label={t(
            "forms.loyaltyReward",
            "Available as a loyalty reward",
          )}
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            {t("forms.loyaltyReward", "Available as a loyalty reward")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "forms.loyaltyRewardHint",
              "Customers can exchange loyalty points for this item's base price.",
            )}
          </p>
        </div>
      </div>

      {enabled && (
        <div className="space-y-3 pl-7">
          <div
            className="inline-grid grid-cols-2 rounded-md border border-border bg-secondary/30 p-1"
            role="group"
            aria-label={t("forms.rewardPricingMode", "Reward pricing mode")}
          >
            {(["AUTO", "CUSTOM"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => onModeChange(option)}
                className={`min-h-8 px-3 text-xs font-semibold transition-colors rounded ${
                  mode === option
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option === "AUTO"
                  ? t("forms.rewardAutomatic", "Automatic")
                  : t("forms.rewardCustom", "Custom")}
              </button>
            ))}
          </div>

          {mode === "AUTO" ? (
            <div className="border-l-2 border-primary pl-3">
              <p className="text-sm font-bold text-foreground">
                {t("forms.rewardAutomaticPreview", {
                  points: automaticPoints ?? "-",
                  defaultValue: "{{points}} points",
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("forms.rewardAutomaticFormula", {
                  rate: redeemRate,
                  defaultValue:
                    "Calculated from the menu price at {{rate}} points per EUR 1.",
                })}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor={`reward-points-${fieldId}`}
                className="text-sm font-medium"
              >
                {t("forms.rewardCustomPoints", "Custom points cost")}
              </label>
              <Input
                id={`reward-points-${fieldId}`}
                type="number"
                min="1"
                step="1"
                required
                value={customPoints}
                onChange={(event) =>
                  onCustomPointsChange(event.target.value)
                }
                placeholder="1000"
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "forms.rewardCustomHint",
                  "Use this only when the reward should cost more or fewer points than the automatic value.",
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
