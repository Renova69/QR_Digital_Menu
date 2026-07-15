import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";
import { Panel } from "./Panel";
import { EmptyState } from "./primitives";

// PRO-tier advanced analytics sections, extracted verbatim from AnalyticsView's
// render. Visibility guards (canFullAnalytics + data presence) stay in the
// parent; each component renders its own <section>/<Panel>.

export const StaffPerformancePanel = ({ rows }: { rows: any[] }) => {
  const { t } = useTranslation();
  return (
    <section>
      <Panel
        title={t("analytics.staffPerformance", "Staff Performance")}
        eyebrow={t("analytics.teamMetrics", "Team metrics")}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="text-left py-2 pr-3 font-bold uppercase tracking-widest">
                  {t("analytics.staffName", "Staff")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.orders", "Orders")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.revenue", "Revenue")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.avgOrder", "Avg Order")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.posOrders", "POS")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.qrOrders", "QR")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s: any) => (
                <tr
                  key={s.staffUserId}
                  className="border-b border-border/30 hover:bg-muted/40"
                >
                  <td className="py-2 pr-3 font-semibold text-foreground">
                    {s.staffName ||
                      t("analytics.unknownStaff", "Unknown staff")}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {s.totalOrders}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums font-mono">
                    {formatEuro(s.totalRevenue)}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums font-mono">
                    {formatEuro(s.avgOrderValue)}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {s.posOrders}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {s.qrOrders}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
};

export const CustomerKitchenPanels = ({
  customerMetrics,
  kitchenEfficiency,
}: {
  customerMetrics: any;
  kitchenEfficiency: any;
}) => {
  const { t } = useTranslation();
  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <Panel
        title={t("analytics.topCustomers", "Top Customers")}
        eyebrow={t("analytics.customerInsights", "Customer insights")}
      >
        {customerMetrics.topCustomers.length > 0 ? (
          <div className="space-y-2">
            {customerMetrics.topCustomers
              .slice(0, 10)
              .map((c: any, i: number) => (
                <div
                  key={c.customerPhone}
                  className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                      {i + 1}
                    </span>
                    <span className="truncate font-semibold">
                      {c.customerName || c.customerPhone}
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="font-mono font-bold tabular-nums">
                      {formatEuro(c.totalSpend)}
                    </span>
                    <span className="text-muted-foreground ml-1.5">
                      {c.visitCount}×
                    </span>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <EmptyState
            message={t(
              "analytics.noCustomerData",
              "No customer data in this period",
            )}
          />
        )}
        {customerMetrics.churnRiskCount > 0 && (
          <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
            <span className="font-bold text-amber-800 dark:text-amber-200">
              {t("analytics.churnRisk", "Churn risk")}:{" "}
              {customerMetrics.churnRiskCount}
            </span>
            <span className="text-amber-700 dark:text-amber-300 ml-2">
              ({customerMetrics.churnRiskBreakdown["30d"]}{" "}
              {t("analytics.last30d", "30d")},{" "}
              {customerMetrics.churnRiskBreakdown["60d"]}{" "}
              {t("analytics.last60d", "60d")},{" "}
              {customerMetrics.churnRiskBreakdown["90d+"]}{" "}
              {t("analytics.last90d", "90d+")})
            </span>
          </div>
        )}
        <div className="mt-2 text-xs text-muted-foreground">
          {t("analytics.averageClv", "Avg CLV")}:{" "}
          <span className="font-mono font-bold text-foreground">
            {formatEuro(customerMetrics.averageClv)}
          </span>
        </div>
      </Panel>

      <Panel
        title={t("analytics.kitchenEfficiency", "Kitchen Efficiency")}
        eyebrow={t("analytics.prepTime", "Preparation time")}
      >
        {kitchenEfficiency ? (
          <>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-display font-black text-foreground tabular-nums">
                {kitchenEfficiency.overallAvgPrepMinutes}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("analytics.minutes", "min avg prep")}
              </span>
              <span className="text-[10px] text-muted-foreground ml-2">
                ({kitchenEfficiency.totalCompletedOrders}{" "}
                {t("analytics.ordersCompleted", "completed")})
              </span>
            </div>
            <div className="space-y-1">
              {kitchenEfficiency.hourlyAverages
                .filter((h: any) => h.avgPrepMinutes > 0)
                .map((h: any) => (
                  <div
                    key={h.hour}
                    className="flex items-center gap-2 text-[10px]"
                  >
                    <span className="w-10 text-right text-muted-foreground font-mono">
                      {h.label}
                    </span>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500/60 rounded-full"
                        style={{
                          width: `${Math.min(100, (h.avgPrepMinutes / (kitchenEfficiency?.overallAvgPrepMinutes || 1)) * 50)}%`,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono font-bold tabular-nums">
                      {h.avgPrepMinutes}m
                    </span>
                  </div>
                ))}
            </div>
          </>
        ) : (
          <EmptyState
            message={t(
              "analytics.noKitchenData",
              "No completed orders in this period",
            )}
          />
        )}
      </Panel>
    </section>
  );
};

export const CancelAnalysisPanel = ({
  cancelAnalytics,
}: {
  cancelAnalytics: any;
}) => {
  const { t } = useTranslation();
  return (
    <section>
      <Panel
        title={t("analytics.cancelAnalysis", "Cancel Analysis")}
        eyebrow={t("analytics.orderIntegrity", "Order integrity")}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg bg-red-50 dark:bg-red-950/25 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-300 mb-1">
              {t("analytics.canceledOrders", "Canceled")}
            </div>
            <div className="text-2xl font-display font-black text-red-800 dark:text-red-200 tabular-nums">
              {cancelAnalytics.totalCanceledOrders}
            </div>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-950/25 p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-300 mb-1">
              {t("analytics.revenueLost", "Revenue lost")}
            </div>
            <div className="text-2xl font-display font-black text-red-800 dark:text-red-200 tabular-nums font-mono">
              {formatEuro(cancelAnalytics.revenueLost)}
            </div>
          </div>
        </div>
        {cancelAnalytics.cancelRateByItem.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
              {t("analytics.cancelRateByItem", "Cancel rate by item")}
            </div>
            {cancelAnalytics.cancelRateByItem.slice(0, 10).map((item: any) => (
              <div
                key={item.menuItemId}
                className="flex items-center gap-2 text-xs"
              >
                <span className="w-28 truncate font-semibold">
                  {item.itemName}
                </span>
                <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-400/60 rounded-full"
                    style={{
                      width: `${Math.min(100, item.cancelRate)}%`,
                    }}
                  />
                </div>
                <span className="w-12 text-right font-mono tabular-nums">
                  {item.cancelRate}%
                </span>
                <span className="text-muted-foreground">
                  ({item.canceledQty}/{item.totalQty})
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
};

export const TableTurnoverPanel = ({ tables }: { tables: any[] }) => {
  const { t } = useTranslation();
  return (
    <section>
      <Panel
        title={t("analytics.tableTurnover", "Table Turnover")}
        eyebrow={t("analytics.floorEfficiency", "Floor efficiency")}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="text-left py-2 pr-3 font-bold uppercase tracking-widest">
                  {t("analytics.table", "Table")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.sessions", "Sessions")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.avgDuration", "Avg Duration")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.turnsPer24Hours", "Est. max turns / 24h")}
                </th>
                <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                  {t("analytics.tableRevenue", "Revenue")}
                </th>
                <th className="text-right py-2 pl-2 font-bold uppercase tracking-widest">
                  {t(
                    "analytics.revenuePerOccupiedHour",
                    "Revenue / occupied hour",
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {tables.map((tbl: any) => (
                <tr
                  key={tbl.tableId}
                  className="border-b border-border/30 hover:bg-muted/40"
                >
                  <td className="py-2 pr-3 font-semibold text-foreground">
                    {tbl.tableName ||
                      t("dashboard.unknownTable", "Unknown table")}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {tbl.sessionCount}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {tbl.avgDurationMinutes}m
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums">
                    {tbl.estimatedTurnsPer24Hours}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums font-mono">
                    {formatEuro(tbl.totalRevenue)}
                  </td>
                  <td className="text-right py-2 pl-2 tabular-nums font-mono font-bold">
                    {formatEuro(tbl.revenuePerOccupiedHour)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
};
