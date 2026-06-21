import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";
import type {
  MenuProfitabilityItem,
  MenuProfitabilitySummary,
} from "../../../hooks/useAnalytics";
import { Panel } from "./Panel";

interface MenuProfitabilityPanelProps {
  data: {
    items: MenuProfitabilityItem[];
    summary: MenuProfitabilitySummary;
  };
}

/**
 * Menu-engineering matrix (Star/Plowhorse/Puzzle/Dog) + per-item margin bars.
 * When no item costs are set, every margin is 100% and the matrix is misleading,
 * so the panel gates on `summary.totalCost === 0` and shows a "set costs" hint
 * instead of fake quadrants.
 */
const MenuProfitabilityPanel = ({ data }: MenuProfitabilityPanelProps) => {
  const { t } = useTranslation();

  return (
    <section>
      <Panel
        title={t("analytics.menuProfitability", "Menu Profitability")}
        eyebrow={t("analytics.menuEngineering", "Menu engineering")}
      >
        {data.summary.totalCost === 0 ? (
          <div className="text-xs text-muted-foreground italic py-6 text-center">
            {t(
              "analytics.noCostData",
              "Add item costs in Menu settings to see profitability.",
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-[10px] font-mono mb-4">
              <span className="text-muted-foreground">
                {t("analytics.totalCost", "Cost")}:{" "}
                {formatEuro(data.summary.totalCost)}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {t("analytics.totalProfit", "Profit")}:{" "}
                {formatEuro(data.summary.totalProfit)}
              </span>
              <span className="font-black">{data.summary.overallMargin}%</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(["Star", "Plowhorse", "Puzzle", "Dog"] as const).map((q) => {
                const quadrantItems = data.items.filter(
                  (i) => i.quadrant === q,
                );
                return (
                  <div key={q} className="rounded-lg bg-muted/40 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                      {t(`analytics.${q.toLowerCase()}`, q)} (
                      {quadrantItems.length})
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      {t(`analytics.${q.toLowerCase()}Desc`, "")}
                    </div>
                    {quadrantItems.slice(0, 3).map((item) => (
                      <div
                        key={item.menuItemId}
                        className="text-[10px] truncate"
                      >
                        <span className="font-semibold">{item.name}</span>
                        <span className="text-muted-foreground ml-1">
                          {item.margin}%
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="space-y-1">
              {data.items.slice(0, 8).map((item) => (
                <div
                  key={item.menuItemId}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-28 truncate font-semibold">
                    {item.name}
                  </span>
                  <span className="w-8 text-right text-muted-foreground">
                    {item.quantity}×
                  </span>
                  <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-400/60 rounded-l-full"
                      style={{ width: `${Math.max(0, item.margin)}%` }}
                    />
                    <div
                      className="h-full bg-red-300/40 rounded-r-full"
                      style={{ width: `${Math.max(0, 100 - item.margin)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right font-mono tabular-nums font-bold">
                    {item.margin}%
                  </span>
                  <span className="w-16 text-right font-mono tabular-nums">
                    {formatEuro(item.profit)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>
    </section>
  );
};

export default MenuProfitabilityPanel;
