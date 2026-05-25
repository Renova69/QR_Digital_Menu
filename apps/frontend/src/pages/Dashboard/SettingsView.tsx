import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const canLoyalty = useFeature("loyalty");
  const canPayments = useFeature("payments:stripe");
  const canBranding = useFeature("branding:custom");
  const { tier } = useTier();
  const isFree = tier === "FREE";

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const tabs: { id: SettingsTab; label: string; visible: boolean }[] = [
    { id: "general", label: t("settings.tabs.general"), visible: true },
    { id: "loyalty", label: t("settings.tabs.loyalty"), visible: canLoyalty },
    { id: "payments", label: t("settings.tabs.payments"), visible: canPayments },
    { id: "staff", label: t("settings.tabs.staff"), visible: !isFree },
    // Visible to all non-free tiers as an upsell; content shows locked state when canBranding is false
    { id: "branding", label: t("settings.tabs.branding", "Branding"), visible: !isFree },
    { id: "subscription", label: t("settings.tabs.subscription"), visible: true },
  ];

  const visibleTabs = tabs.filter((t) => t.visible);

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("settings.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.desc")}</p>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden text-left">
        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border px-6 pt-4 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === "general" && <GeneralSettingsTab />}
          {activeTab === "loyalty" && <LoyaltySettingsTab />}
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
