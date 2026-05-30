import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useFeature, useTier } from "../../hooks/useFeature";
import BillingView from "../../components/subscription/BillingView";
import { BrandingEditor } from "../../components/ui/BrandingEditor";
import { useRestaurantContext } from "../../context/RestaurantContext";
import {
  GeneralSettingsTab,
  LoyaltySettingsTab,
  PaymentSettingsTab,
  StaffSettingsTab,
} from "./settings";

type SettingsTab = "general" | "loyalty" | "payments" | "staff" | "branding" | "subscription";

const SettingsView = () => {
  const { activeRestaurant, fetchRestaurants } = useRestaurantContext();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const canLoyalty = useFeature("loyalty");
  const canPayments = useFeature("payments:stripe");
  const canBranding = useFeature("branding:custom");
  const { tier, allowedStaffRoles } = useTier();
  const isFree = tier === "FREE";

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const tab = searchParams.get("settingsTab") as SettingsTab | null;
    return tab && ["general", "loyalty", "payments", "staff", "branding", "subscription"].includes(tab)
      ? tab
      : "general";
  });

  const tabs: { id: SettingsTab; label: string; visible: boolean }[] = [
    { id: "general", label: t("settings.tabs.general"), visible: true },
    // Visible to all non-free tiers as an upsell; content shows a locked state
    // (with "settings preserved") when canLoyalty is false (#5).
    { id: "loyalty", label: t("settings.tabs.loyalty"), visible: !isFree },
    { id: "payments", label: t("settings.tabs.payments"), visible: canPayments },
    { id: "staff", label: t("settings.tabs.staff"), visible: allowedStaffRoles.length > 0 },
    // Visible to all non-free tiers as an upsell; content shows locked state when canBranding is false
    { id: "branding", label: t("settings.tabs.branding", "Branding"), visible: !isFree },
    { id: "subscription", label: t("settings.tabs.subscription"), visible: true },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);

  useEffect(() => {
    const tab = searchParams.get("settingsTab") as SettingsTab | null;
    if (tab && tabs.some((item) => item.id === tab && item.visible)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("settings.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.desc")}</p>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-clip text-left">
        {/* Tab nav */}
        <div className="grid grid-cols-2 gap-1 px-3 pt-4 sm:flex sm:flex-wrap sm:border-b sm:border-border sm:px-6">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-4 py-2.5 text-center text-sm font-medium whitespace-nowrap transition-colors sm:rounded-none sm:py-2 sm:border-b-2 sm:-mb-px ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary sm:bg-transparent sm:border-primary"
                  : "text-muted-foreground hover:text-foreground sm:border-transparent"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === "general" && <GeneralSettingsTab />}
          {activeTab === "loyalty" && canLoyalty && <LoyaltySettingsTab />}
          {activeTab === "loyalty" && !canLoyalty && (
            <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
              <h3 className="text-lg font-semibold text-foreground">
                {t("settings.loyaltyLocked", "Loyalty is part of the Professional plan")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  "settings.loyaltyLockedDesc",
                  "Upgrade to re-enable your loyalty program. Your existing settings and customer point balances are preserved and resume automatically.",
                )}
              </p>
            </div>
          )}
          {activeTab === "payments" && <PaymentSettingsTab />}
          {activeTab === "staff" && activeRestaurant && (
            <StaffSettingsTab activeRestaurant={activeRestaurant} />
          )}
          {activeTab === "branding" && activeRestaurant && canBranding && (
            <BrandingEditor
              key={activeRestaurant.id}
              restaurant={activeRestaurant}
              onUpdate={fetchRestaurants}
            />
          )}
          {activeTab === "branding" && activeRestaurant && !canBranding && (
            <div className="rounded-xl border border-border bg-muted/30 p-8 text-center">
              <h3 className="text-lg font-semibold text-foreground">
                {t("settings.brandingLocked")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("settings.brandingLockedDesc")}
              </p>
            </div>
          )}
          {activeTab === "subscription" && <BillingView />}
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
