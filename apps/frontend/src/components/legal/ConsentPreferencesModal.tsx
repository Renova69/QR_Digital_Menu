import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../ui/modal";
import ToggleSwitch from "../ui/ToggleSwitch";
import {
  useConsent,
  type ConsentCategoryKey,
} from "../../context/ConsentContext";

const CATEGORY_COPY: Record<
  ConsentCategoryKey,
  { label: string; desc: string }
> = {
  analytics: {
    label: "gdpr.categoryAnalytics",
    desc: "gdpr.categoryAnalyticsDesc",
  },
  marketing: {
    label: "gdpr.categoryMarketing",
    desc: "gdpr.categoryMarketingDesc",
  },
};

export default function ConsentPreferencesModal() {
  const { t } = useTranslation();
  const {
    categories,
    currentState,
    isPreferencesOpen,
    closePreferences,
    save,
  } = useConsent();
  const [draft, setDraft] =
    useState<Partial<Record<ConsentCategoryKey, boolean>>>(currentState);

  // Reset the draft to the last-saved state each time the modal opens.
  useEffect(() => {
    if (isPreferencesOpen) setDraft(currentState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreferencesOpen]);

  return (
    <Modal
      open={isPreferencesOpen}
      onOpenChange={(open) => {
        if (!open) closePreferences();
      }}
      title={t("gdpr.cookiePreferencesTitle")}
      description={t(
        "gdpr.cookiePreferencesDesc",
        "Choose which optional cookies you allow. Necessary cookies keep you signed in and can't be turned off.",
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between py-2 border-b border-white/10">
          <div>
            <p className="text-sm font-medium">{t("gdpr.categoryNecessary")}</p>
            <p className="text-xs text-muted-foreground">
              {t("gdpr.categoryNecessaryDesc")}
            </p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 ml-4">
            {t("gdpr.categoryAlwaysOn")}
          </span>
        </div>

        {categories.map((category) => (
          <div
            key={category}
            className="flex items-center justify-between py-2 border-b border-white/10 last:border-0"
          >
            <div>
              <p className="text-sm font-medium">
                {t(CATEGORY_COPY[category].label)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(CATEGORY_COPY[category].desc)}
              </p>
            </div>
            <ToggleSwitch
              checked={!!draft[category]}
              onChange={(checked) =>
                setDraft((d) => ({ ...d, [category]: checked }))
              }
              aria-label={t(CATEGORY_COPY[category].label)}
            />
          </div>
        ))}

        <button
          onClick={() => save(draft)}
          className="brand-cta w-full text-white text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition-colors"
        >
          {t("gdpr.savePreferences")}
        </button>
      </div>
    </Modal>
  );
}
