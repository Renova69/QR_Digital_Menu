import { useTranslation } from "react-i18next";
import {
  UPSELL_CONTEXT_OPTIONS,
  UpsellContext,
} from "../../lib/upsellContexts";

type UpsellContextSelectorProps = {
  value: readonly UpsellContext[];
  onChange: (value: UpsellContext[]) => void;
};

export function UpsellContextSelector({
  value,
  onChange,
}: UpsellContextSelectorProps) {
  const { t } = useTranslation();

  const toggle = (context: UpsellContext, checked: boolean) => {
    onChange(
      checked
        ? [...new Set([...value, context])]
        : value.filter((candidate) => candidate !== context),
    );
  };

  return (
    <fieldset className="space-y-2 border-t border-border/50 pt-4">
      <legend className="text-sm font-medium">
        {t("forms.upsellContexts", "Best moments to recommend")}
      </legend>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
        {UPSELL_CONTEXT_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-foreground"
          >
            <input
              type="checkbox"
              checked={value.includes(option.value)}
              onChange={(event) =>
                toggle(option.value, event.currentTarget.checked)
              }
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              {t(`forms.upsellContext.${option.value}`, option.label)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
