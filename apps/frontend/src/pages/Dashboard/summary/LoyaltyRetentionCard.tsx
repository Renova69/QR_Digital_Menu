import { Users, Star, Gift, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LoyaltyData {
  totalMembers: number;
  totalPointsOutstanding: number;
  totalPointsRedeemed: number;
  repeatRate: number;
  topMember: { name: string; points: number } | null;
}

interface LoyaltyRetentionCardProps {
  data: LoyaltyData;
}

const LoyaltyRetentionCard = ({ data }: LoyaltyRetentionCardProps) => {
  const { t } = useTranslation();

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">
        {t("dashboard.loyaltyRetention")}
      </h3>
      <p className="-mt-3 mb-3 text-[10px] text-muted-foreground">
        {t("dashboard.loyaltyLifetime", "Current lifetime totals")}
      </p>
      <div className="space-y-2">
        {[
          {
            label: t("dashboard.members"),
            value: String(data.totalMembers),
            Icon: Users,
            color: "text-violet-500",
            bg: "bg-violet-500/10",
          },
          {
            label: t("dashboard.repeatRate"),
            value: `${data.repeatRate}%`,
            Icon: Repeat,
            color: "text-sky-500",
            bg: "bg-sky-500/10",
          },
          {
            label: t("dashboard.pointsOutstanding"),
            value: String(data.totalPointsOutstanding),
            Icon: Star,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
          },
          {
            label: t("dashboard.redeemed"),
            value: String(data.totalPointsRedeemed),
            Icon: Gift,
            color: "text-emerald-500",
            bg: "bg-emerald-500/10",
          },
        ].map(({ label, value, Icon, color, bg }) => (
          <div
            key={label}
            className="flex items-center justify-between py-1.5 border-b border-border/20 last:border-0"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg} shrink-0`}
              >
                <Icon className={`w-3 h-3 ${color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className={`text-xs font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>
      {data.topMember && (
        <div className="mt-3 pt-3 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-0.5">
            {t("dashboard.topMember")}
          </p>
          <p className="text-xs font-bold text-foreground">
            {data.topMember.name ||
              t("dashboard.unknownCustomer", "Unknown customer")}{" "}
            · {t("dashboard.pointsCount", { count: data.topMember.points })}
          </p>
        </div>
      )}
    </div>
  );
};

export default LoyaltyRetentionCard;
