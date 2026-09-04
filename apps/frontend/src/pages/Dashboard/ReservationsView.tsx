import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { ReservationNotificationPanel } from "../../components/reservations/ReservationNotificationPanel";
import { ReservationList } from "../../components/reservations/ReservationList";
import { ReservationSettingsForm } from "../../components/reservations/ReservationSettingsForm";
import { DashboardButton } from "../../components/dashboard/DashboardButton";

const ReservationsView = ({
  canConfigure = true,
}: {
  canConfigure?: boolean;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const restaurantId = activeRestaurant?.id ?? "";
  const canManageNotifications = ["OWNER", "MANAGER"].includes(
    user?.role?.toUpperCase() ?? "",
  );
  const [subTab, setSubTab] = useState<"list" | "notifications" | "settings">(
    "list",
  );

  useEffect(() => {
    if (
      (!canConfigure && subTab === "settings") ||
      (!canManageNotifications && subTab === "notifications")
    ) {
      setSubTab("list");
    }
  }, [canConfigure, canManageNotifications, subTab]);

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
        className="grid grid-cols-2 gap-2 sm:flex"
        role="tablist"
        aria-label={t("reservations.title", "Reservations")}
      >
        <TabButton
          active={subTab === "list"}
          onClick={() => setSubTab("list")}
          label={t("reservations.tabList", "Reservations")}
        />
        {canManageNotifications && (
          <TabButton
            active={subTab === "notifications"}
            onClick={() => setSubTab("notifications")}
            label={t("reservations.notifications.tab", "Notification delivery")}
          />
        )}
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
      ) : subTab === "notifications" ? (
        <ReservationNotificationPanel
          restaurantId={restaurantId}
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
