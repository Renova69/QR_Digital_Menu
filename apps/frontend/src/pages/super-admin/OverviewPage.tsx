import { useQuery } from "@tanstack/react-query";
import { getSuperAdminStats } from "../../lib/api";
import { Building2, Users, CreditCard, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const TIER_COLORS: Record<string, string> = {
  FREE: "hsl(var(--color-muted-foreground))",
  STARTER: "hsl(var(--color-green-500))",
  PROFESSIONAL: "hsl(var(--color-accent))",
  ENTERPRISE: "hsl(var(--color-violet-500))",
};

export default function OverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "stats"],
    queryFn: getSuperAdminStats,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Overview</h2>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl glass-panel animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load platform stats.</p>
      </div>
    );
  }

  const cards = [
    { label: "Total Restaurants", value: data.totalRestaurants, icon: Building2 },
    { label: "Total Users", value: data.totalUsers, icon: Users },
    { label: "Active Subscriptions", value: data.activeSubscriptions, icon: CreditCard },
    { label: "Suspended", value: data.suspendedCount, icon: AlertTriangle },
  ];

  const chartData = Object.entries(data.byTier)
    .filter(([, count]) => count > 0)
    .map(([tier, count]) => ({ name: tier, value: count }));

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Overview</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="glass-panel rounded-xl p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Restaurants by Tier</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, value }) => `${name}: ${value}`}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={TIER_COLORS[entry.name] ?? "#888"} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
