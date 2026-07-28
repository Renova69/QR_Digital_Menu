import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { ReservationList } from "../../components/reservations/ReservationList";
import { ReservationSettingsForm } from "../../components/reservations/ReservationSettingsForm";
import { DashboardButton } from "../../components/dashboard/DashboardButton";

const ReservationsView = ({
  canConfigure = true,
}: {
  canConfigure?: boolean;
}) => {
  const { t } = useTranslation();
  const { activeRestaurant } = useRestaurantContext();
  const restaurantId = activeRestaurant?.id ?? "";
  const [subTab, setSubTab] = useState<"list" | "settings">("list");

  useEffect(() => {
    if (!canConfigure && subTab === "settings") setSubTab("list");
  }, [canConfigure, subTab]);

  return (
    <div className="space-y-4">
      {!canConfigure && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t(
            "reservations.windDownNotice",
            "Existing reservations remain available to service. Upgrade to accept or configure new bookings.",
          )}
        </div>
      )}
      <div
        className="flex gap-2"
        role="tablist"
        aria-label={t("reservations.title", "Reservations")}
      >
        <TabButton
          active={subTab === "list"}
          onClick={() => setSubTab("list")}
          label={t("reservations.tabList", "Reservations")}
        />
        {canConfigure && (
          <TabButton
            active={subTab === "settings"}
            onClick={() => setSubTab("settings")}
            label={t("reservations.tabSettings", "Settings")}
          />
        )}
      </div>
      {!restaurantId ? null : subTab === "list" ? (
        <ReservationList
          restaurantId={restaurantId}
          canCreate={canConfigure}
          timezone={activeRestaurant?.timezone}
        />
      ) : (
        <ReservationSettingsForm restaurantId={restaurantId} />
      )}
    </div>
  );
};

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <DashboardButton
      density="tab"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`flex-1 sm:flex-none ${
        active ? "bg-indigo-600 text-white" : "bg-white border text-gray-700"
      }`}
    >
      {label}
    </DashboardButton>
  );
}

export default ReservationsView;
