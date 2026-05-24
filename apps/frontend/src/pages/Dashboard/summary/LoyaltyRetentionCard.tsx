import { Users, Star, Gift, Repeat } from "lucide-react";

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

const LoyaltyRetentionCard = ({ data }: LoyaltyRetentionCardProps) => (
  <div className="glass-panel rounded-[1.5rem] p-5">
    <h3 className="text-sm font-display font-bold text-foreground mb-4">Loyalty & Retention</h3>
    <div className="grid grid-cols-2 gap-3">
      {[
        { label: 'Members', value: String(data.totalMembers), Icon: Users, color: 'text-violet-500', bg: 'bg-violet-500/10' },
        { label: 'Repeat Rate', value: `${data.repeatRate}%`, Icon: Repeat, color: 'text-sky-500', bg: 'bg-sky-500/10' },
        { label: 'Points Outstanding', value: String(data.totalPointsOutstanding), Icon: Star, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'Redeemed', value: String(data.totalPointsRedeemed), Icon: Gift, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
      ].map(({ label, value, Icon, color, bg }) => (
        <div key={label} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg} shrink-0`}>
            <Icon className={`w-3.5 h-3.5 ${color}`} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{label}</p>
            <p className={`text-sm font-display font-bold ${color}`}>{value}</p>
          </div>
        </div>
      ))}
    </div>
    {data.topMember && (
      <div className="mt-4 pt-4 border-t border-border/30">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Top Member</p>
        <p className="text-xs font-bold text-foreground">{data.topMember.name}</p>
        <p className="text-[10px] text-muted-foreground">{data.topMember.points} points</p>
      </div>
    )}
  </div>
);

export default LoyaltyRetentionCard;
