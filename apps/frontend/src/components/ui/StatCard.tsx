import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface StatCardProps {
  /** Label shown above the value, e.g. "Total Revenue" */
  label: string;
  /** The main value to display */
  value: React.ReactNode;
  /** Lucide icon component */
  Icon: LucideIcon;
  /** Accent color for the icon and decorative elements (Tailwind color, e.g. "accent", "blue-500") */
  color?: string;
  /** Optional subtitle shown below the value */
  subtitle?: string;
}

/**
 * Dashboard stat card with icon, label, value, animated accent bar, and hover glow.
 * Extracted from SummaryView's repeated 3-card pattern.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  Icon,
  color = 'accent',
  subtitle,
}) => {
  // Build dynamic color classes
  const iconBg = `bg-${color}/10`;
  const iconBorder = `border-${color}/10`;
  const iconText = `text-${color}`;
  const valueText = `text-${color}`;
  const barBg = `bg-${color}/20`;
  const hoverShadow = `hover:shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)]`;

  return (
    <GlassCard className={`p-8 group ${hoverShadow}`}>
      <div className="flex items-center justify-between mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        <div className={`p-3.5 rounded-2xl ${iconBg} border ${iconBorder}`}>
          <Icon className={`h-5 w-5 ${iconText}`} />
        </div>
      </div>
      <p className={`text-4xl font-serif font-black ${valueText} tracking-tighter`}>
        {value}
      </p>
      {subtitle && (
        <p className={`text-xs font-semibold ${iconText} mt-2`}>{subtitle}</p>
      )}
      <div className={`mt-4 h-1 w-12 ${barBg} rounded-full group-hover:w-full transition-all duration-700`} />
    </GlassCard>
  );
};
