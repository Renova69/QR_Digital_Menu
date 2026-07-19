import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";
import { orderStatusKeyMap } from "../analytics/shared";

interface OrderRow {
  id: string;
  tableId?: string | null;
  tableName?: string | null;
  customerPhone?: string | null;
  totalPrice: number;
  status: string;
  createdAt: string;
  items?: { quantity: number }[];
}

interface RecentOrdersTableProps {
  orders: OrderRow[];
}

const statusClass = (status: string) => {
  switch (status) {
    case "NEW":
      return "bg-primary/15 text-primary";
    case "SERVED":
    case "COMPLETED":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "CANCELED":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  }
};

const formatDateTime = (dateStr: string, locale: string) =>
  `${new Date(dateStr).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  })} - ${new Date(dateStr).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;

const RecentOrdersTable = ({ orders }: RecentOrdersTableProps) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="mb-4 text-sm font-display font-bold text-foreground">
        {t("auto.last50Orders", "Last 50 orders")}
      </h3>
      <div className="max-h-[520px] overflow-y-auto pr-1">
        {orders.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t("dashboard.noOrdersPeriod")}
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {orders.map((order) => {
              const itemCount = (order.items ?? []).reduce(
                (sum, item) => sum + (item.quantity ?? 0),
                0,
              );
              const table = order.tableName || order.tableId;

              return (
                <article
                  key={order.id}
                  className="grid min-w-0 gap-3 px-2 py-3 transition-colors hover:bg-secondary/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-xs font-bold text-foreground">
                        {t("dashboard.orderNumber", {
                          id: order.id.slice(-6).toUpperCase(),
                        })}
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {table
                          ? t("dashboard.orderTable", { table })
                          : t("dashboard.walkIn")}
                      </span>
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>
                        {formatDateTime(order.createdAt, i18n.language)}
                      </span>
                      {order.customerPhone && (
                        <span className="min-w-0 truncate">
                          {order.customerPhone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-3 sm:block sm:text-right">
                    <p className="text-sm font-bold tabular-nums text-foreground">
                      {formatEuro(order.totalPrice)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("dashboard.itemsCount", { count: itemCount })}
                    </p>
                  </div>
                  <span
                    className={`w-fit max-w-full rounded-full px-2.5 py-1 text-[10px] font-bold leading-tight sm:justify-self-end ${statusClass(order.status)}`}
                  >
                    {t(
                      orderStatusKeyMap[order.status] ??
                        `orders.tabs.${order.status.toLowerCase()}`,
                      order.status,
                    )}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentOrdersTable;
