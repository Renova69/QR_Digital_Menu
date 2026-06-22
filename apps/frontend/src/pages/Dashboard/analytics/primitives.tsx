import { ArrowDownRight, ArrowUpRight, BarChart3, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";
import { getChangeCopy, numberFormat } from "./shared";

// Small shared presentational pieces used by the main AnalyticsView render and
// by the panel components. Extracted verbatim from AnalyticsView.tsx.

export const CustomTooltip = ({
  active,
  payload,
  label,
  currency = false,
}: any) => {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-display font-black text-foreground">
        {currency ? formatEuro(value) : numberFormat.format(value)}
      </p>
    </div>
  );
};

export const EmptyState = ({ message }: { message: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground/45 mb-4" />
      <p className="text-sm font-bold text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("analytics.dataAppearsHere")}
      </p>
    </div>
  );
};

export const MetricCard = ({
  label,
  value,
  change,
  comparisonLabel,
  detail,
  Icon,
}: {
  label: string;
  value: string;
  change?: number;
  comparisonLabel?: string;
  detail?: string;
  Icon: typeof Wallet;
}) => {
  const changeCopy = getChangeCopy(change);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <p className="mt-4 text-2xl font-display font-black text-foreground">
        {value}
      </p>
      {changeCopy ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] font-bold">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${changeCopy.isUp ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
          >
            {changeCopy.isUp ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {changeCopy.label}
          </span>
          <span className="text-muted-foreground truncate">
            {comparisonLabel}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-[11px] font-bold text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
};

export const InsightCard = ({
  label,
  value,
  detail,
  Icon,
}: {
  label: string;
  value: string;
  detail: string;
  Icon: typeof Wallet;
}) => (
  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center gap-2 text-primary">
      <Icon className="w-4 h-4" />
      <p className="text-[10px] font-black uppercase tracking-widest">
        {label}
      </p>
    </div>
    <p className="mt-3 text-xl font-display font-black text-foreground">
      {value}
    </p>
    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
      {detail}
    </p>
  </div>
);

export const SignalRow = ({
  Icon,
  label,
  value,
}: {
  Icon: typeof Wallet;
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-border bg-secondary/20 p-3">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <p className="text-xs font-black uppercase tracking-widest text-foreground">
        {label}
      </p>
    </div>
    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
      {value}
    </p>
  </div>
);
