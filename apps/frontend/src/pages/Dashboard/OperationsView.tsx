import { useState } from "react";
import { type LucideIcon, ShoppingBag, Bell, Table2 } from "lucide-react";
import { useOrders } from "../../context/OrderContext";
import { useAssistance } from "../../context/AssistanceContext";
import OrdersView from "./OrdersView";
import AssistanceView from "./AssistanceView";
import TableView from "../../components/tables/TableView";
import { useTranslation } from "react-i18next";

type SubTabId = "orders" | "assistance" | "tables";

const SUB_TABS: { id: SubTabId; Icon: LucideIcon; labelKey: string }[] = [
  { id: "orders", Icon: ShoppingBag, labelKey: "dashboard.tabs.orders" },
  { id: "assistance", Icon: Bell, labelKey: "dashboard.tabs.assistance" },
  { id: "tables", Icon: Table2, labelKey: "dashboard.tabs.tables" },
];

interface OperationsViewProps {
  activeRestaurant: any;
}

const OperationsView = ({ activeRestaurant }: OperationsViewProps) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTabId>("orders");
  const { orders } = useOrders();
  const { requests } = useAssistance();
  const { t } = useTranslation();

  const newOrdersCount = orders.filter(
    (o) => o.status === "NEW" || o.status === "PENDING_PAYMENT",
  ).length;
  const unresolvedRequestsCount = requests.filter((r) => !r.isResolved).length;

  const getBadge = (id: SubTabId) => {
    if (id === "orders") return newOrdersCount;
    if (id === "assistance") return unresolvedRequestsCount;
    return 0;
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-border/40 pb-1">
        {SUB_TABS.map(({ id, Icon, labelKey }) => {
          const badge = getBadge(id);
          const isActive = activeSubTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveSubTab(id)}
              className={`${
                isActive
                  ? "bg-foreground text-background shadow-lg"
                  : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }
                px-5 py-3 rounded-xl font-bold text-[11px] uppercase tracking-[0.12em] transition-all flex items-center gap-2 active:scale-95`}
              role="tab"
              aria-selected={isActive}
            >
              <Icon className="w-4 h-4" />
              {t(labelKey)}
              {badge > 0 && (
                <span
                  className="text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      <div>
        {activeSubTab === "orders" && <OrdersView />}
        {activeSubTab === "assistance" && <AssistanceView />}
        {activeSubTab === "tables" && activeRestaurant && <TableView />}
      </div>
    </div>
  );
};

export default OperationsView;
