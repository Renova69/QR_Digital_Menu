import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useTranslation } from "react-i18next";
import type { RevenueTrendPoint } from "../../../hooks/useAnalytics";

interface OrdersOverviewChartProps {
  data: RevenueTrendPoint[];
}

const OrdersOverviewChart = ({ data }: OrdersOverviewChartProps) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="glass-panel rounded-[1.5rem] p-4 sm:p-5">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">
        {t("dashboard.ordersOverview")}
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 0, right: 0, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-chart-1, #6E56F8)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-chart-1, #6E56F8)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.4}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10 }}
              tickFormatter={(d: string) =>
                new Date(d).toLocaleDateString(i18n.language, {
                  month: "short",
                  day: "numeric",
                })
              }
              stroke="var(--muted-foreground)"
            />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `€${v}`}
              stroke="var(--muted-foreground)"
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                fontSize: 12,
              }}
              formatter={(value: any) => [
                `€${Number(value).toFixed(2)}`,
                t("dashboard.revenue"),
              ]}
              labelFormatter={(label: any) =>
                new Date(String(label)).toLocaleDateString(i18n.language, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              }
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-chart-1, #6E56F8)"
              strokeWidth={2}
              fill="url(#revenueGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OrdersOverviewChart;
