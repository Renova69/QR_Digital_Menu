import { useQuery } from "@tanstack/react-query";
import { getSuperAdminStats } from "../../lib/api";
import { Building2, Users, CreditCard, AlertTriangle, PieChart as PieIcon } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const TIER_COLORS: Record<string, string> = {
  FREE: "#64748b",
  STARTER: "#3b82f6",
  PROFESSIONAL: "#a855f7",
  ENTERPRISE: "#f59e0b",
};

const CARD_CONFIGS = [
  {
    key: "totalRestaurants",
    label: "Total Restaurants",
    icon: Building2,
    iconBg: "bg-blue-500/10",
    iconBorder: "border-blue-500/20",
    iconColor: "text-blue-400",
  },
  {
    key: "totalUsers",
    label: "Total Users",
    icon: Users,
    iconBg: "bg-violet-500/10",
    iconBorder: "border-violet-500/20",
    iconColor: "text-violet-400",
  },
  {
    key: "activeSubscriptions",
    label: "Active Subscriptions",
    icon: CreditCard,
    iconBg: "bg-emerald-500/10",
    iconBorder: "border-emerald-500/20",
    iconColor: "text-emerald-400",
  },
  {
    key: "suspendedCount",
    label: "Suspended",
    icon: AlertTriangle,
    iconBg: "bg-amber-500/10",
    iconBorder: "border-amber-500/20",
    iconColor: "text-amber-400",
  },
] as const;

export default function OverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "stats"],
    queryFn: getSuperAdminStats,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-7 w-32 rounded-lg bg-slate-800 animate-pulse mb-2" />
          <div className="h-4 w-64 rounded bg-slate-800/60 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertTriangle className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-slate-400 font-medium">Failed to load platform stats</p>
        <p className="text-slate-600 text-sm mt-1">Check your connection and try again</p>
      </div>
    );
  }

  const chartData = Object.entries(data.byTier)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => ({ name: tier, value: count }));

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Overview</h2>
        <p className="text-slate-500 text-sm mt-1">Platform-wide metrics and tenant distribution</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CARD_CONFIGS.map(({ key, label, icon: Icon, iconBg, iconBorder, iconColor }) => (
          <div
            key={key}
            className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start gap-4 hover:border-slate-700 transition-colors"
          >
            <div className={`w-10 h-10 rounded-xl ${iconBg} border ${iconBorder} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-1 truncate">{label}</p>
              <p className="text-3xl font-bold text-white tabular-nums leading-none">
                {(data as unknown as Record<string, number>)[key] ?? 0}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Tier chart */}
      {chartData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieIcon className="w-4 h-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-white">Restaurants by Tier</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={110}
                innerRadius={55}
                paddingAngle={3}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={TIER_COLORS[entry.name] ?? "#64748b"}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "8px",
                  color: "#f1f5f9",
                  fontSize: "13px",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                }}
              />
              <Legend
                formatter={(value) => (
                  <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 500 }}>{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
