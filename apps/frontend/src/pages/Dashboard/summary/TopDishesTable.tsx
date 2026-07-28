import { TrendingUp, TrendingDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";
import type { TopItem } from "../../../hooks/useAnalytics";

interface TopDishesTableProps {
  items: TopItem[];
}

const TopDishesTable = ({ items }: TopDishesTableProps) => {
  const { t } = useTranslation();

  return (
    <div className="glass-panel rounded-[1.5rem] p-4 sm:p-5">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">
        {t("dashboard.topDishes")}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">
          {t("dashboard.noDataYet")}
        </p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 5).map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-secondary/50 transition-colors"
            >
              <span className="text-[10px] font-black text-muted-foreground w-4">
                #{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">
                  {item.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.quantity} {t("dashboard.sold")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-foreground">
                  {formatEuro(item.revenue)}
                </p>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-end">
                  {item.quantity > 0 ? (
                    <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-2.5 h-2.5 text-red-400" />
                  )}
                  {t("dashboard.revenueLabel")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TopDishesTable;
