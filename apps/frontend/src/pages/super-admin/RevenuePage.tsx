import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { TrendingUp, DollarSign, Calendar } from "lucide-react";
import { superAdminGetMrr } from "../../lib/api";
import type { MrrData } from "../../types";

const TIER_COLORS: Record<string, string> = {
  FREE: "#64748b",
  STARTER: "#6366f1",
  PROFESSIONAL: "#8b5cf6",
  ENTERPRISE: "#d946ef",
};

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-600" />
      </div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function RevenuePage() {
  const { data, isLoading, error } = useQuery<MrrData>({
    queryKey: ["super-admin-mrr"],
    queryFn: superAdminGetMrr,
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  if (isLoading)
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        Loading revenue data…
      </div>
    );

  if (error || !data)
    return (
      <div className="py-20 text-center text-sm text-red-400">
        Failed to load revenue data.
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Revenue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Based on billing tiers (Stripe subscriptions), not effective tiers.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="MRR" value={fmt(data.mrr)} icon={DollarSign} />
        <MetricCard label="ARR" value={fmt(data.arr)} icon={TrendingUp} />
        <MetricCard
          label="New tenants (30d)"
          value={String(
            Object.values(data.newLast30d).reduce((a, b) => a + b, 0),
          )}
          icon={Calendar}
        />
      </div>

      {/* Revenue by tier */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Revenue contribution by tier
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 text-right font-medium">Price/mo</th>
                <th className="pb-2 text-right font-medium">Billing</th>
                <th className="pb-2 text-right font-medium">Active</th>
                <th className="pb-2 text-right font-medium">MRR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {data.byTier.map((row) => (
                <tr key={row.tier}>
                  <td className="py-2.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full mr-2"
                      style={{
                        background: TIER_COLORS[row.tier] ?? "#64748b",
                      }}
                    />
                    <span className="text-slate-300">{row.tier}</span>
                  </td>
                  <td className="py-2.5 text-right text-slate-400">
                    {row.price === 0 ? "Free" : fmt(row.price)}
                  </td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">
                    {row.billing}
                  </td>
                  <td className="py-2.5 text-right text-slate-400 tabular-nums">
                    {row.effective}
                  </td>
                  <td className="py-2.5 text-right font-semibold text-white tabular-nums">
                    {fmt(row.contribution)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700">
                <td
                  colSpan={4}
                  className="pt-2.5 text-xs font-medium text-slate-500"
                >
                  Total MRR
                </td>
                <td className="pt-2.5 text-right font-bold text-emerald-400 tabular-nums">
                  {fmt(data.mrr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Bar chart */}
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">
          Tenants by tier
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data.byTier} barGap={8}>
            <XAxis
              dataKey="tier"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#e2e8f0" }}
            />
            <Bar dataKey="billing" name="Subscription" radius={[4, 4, 0, 0]}>
              {data.byTier.map((row) => (
                <Cell
                  key={row.tier}
                  fill={TIER_COLORS[row.tier] ?? "#64748b"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* New tenants last 30d */}
      {Object.keys(data.newLast30d).length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">
            New tenants last 30 days
          </h3>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.newLast30d).map(([tier, count]) => (
              <div
                key={tier}
                className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-2"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: TIER_COLORS[tier] ?? "#64748b" }}
                />
                <span className="text-xs text-slate-400">{tier}</span>
                <span className="text-sm font-bold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent tier changes */}
      {data.recentTierChanges.length > 0 && (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">
            Recent tier changes (30d)
          </h3>
          <div className="space-y-2">
            {data.recentTierChanges.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md bg-slate-800/50 px-3 py-2 text-xs"
              >
                <span className="font-medium text-slate-300">{c.action}</span>
                <span className="text-slate-500">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
