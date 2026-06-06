import { TrendingUp, TrendingDown, Minus, LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface KpiCardProps {
  label: string;
  value: string;
  Icon: LucideIcon;
  change?: number | null;
  comparisonLabel?: string;
  detail?: string;
  locked?: boolean;
}

const KpiCard = ({ label, value, Icon, change, comparisonLabel, detail, locked }: KpiCardProps) => {
  const { t } = useTranslation();
  return (
  <div className="kpi-tile group hover:shadow-[0_12px_40px_-8px_hsl(265_95%_70%/0.3)] hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden">
    {locked && (
      <div className="absolute inset-0 z-20 bg-background/60 backdrop-blur-[2px] flex items-center justify-center rounded-[1.2rem]">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t('auto.upgrade', 'Upgrade')}</span>
      </div>
    )}
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/15">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>
      <p className="text-[1.65rem] font-display font-bold text-foreground leading-none mb-2">{value}</p>
      {change != null ? (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1">
            {change > 0 ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            ) : change < 0 ? (
              <TrendingDown className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <Minus className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className={`text-xs font-bold ${change > 0 ? 'text-emerald-500' : change < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
              {change > 0 ? '↑' : change < 0 ? '↓' : ''} {Math.abs(change)}%
            </span>
          </div>
          {comparisonLabel && (
            <p className="text-[10px] text-muted-foreground pl-[18px]">{t('auto.vs', 'vs')} {comparisonLabel}</p>
          )}
        </div>
      ) : comparisonLabel ? (
        <p className="text-[10px] text-muted-foreground">{t('auto.vs', 'vs')} {comparisonLabel}</p>
      ) : detail ? (
        <p className="text-[10px] text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  </div>
);
};

export default KpiCard;
