import React from 'react';
import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  Icon: LucideIcon;
  color?: string;
  subtitle?: string;
  delta?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  Icon,
  color = 'primary',
  subtitle,
  delta,
}) => {
  return (
    <div className="kpi-tile group hover:shadow-[0_20px_50px_-15px_hsl(265_95%_70%/0.3)] hover:-translate-y-1 transition-all duration-300">
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <div className={`p-2.5 rounded-xl bg-primary/10 border border-primary/15`}>
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <p className="text-3xl font-display font-bold text-foreground tracking-tight">
          {value}
        </p>
        {(subtitle || delta) && (
          <div className="flex items-center gap-2 mt-2">
            {delta && (
              <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                {delta}
              </span>
            )}
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
