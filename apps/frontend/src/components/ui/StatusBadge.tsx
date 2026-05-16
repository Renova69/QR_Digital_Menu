import React from 'react';

/** Centralized status → color mapping. Prevents per-component color drift. */
export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  // Orders
  NEW:         { bg: 'bg-blue-500/10',   text: 'text-blue-500',   dot: 'bg-blue-500' },
  IN_PROGRESS: { bg: 'bg-amber-500/10',  text: 'text-amber-500',  dot: 'bg-amber-500' },
  SERVED:      { bg: 'bg-green-500/10',  text: 'text-green-500',  dot: 'bg-green-500' },
  COMPLETED:   { bg: 'bg-emerald-500/10',text: 'text-emerald-500',dot: 'bg-emerald-500' },
  CANCELED:    { bg: 'bg-red-500/10',    text: 'text-red-500',    dot: 'bg-red-500' },
  // Staff roles
  OWNER:       { bg: 'bg-amber-500/10',  text: 'text-amber-500',  dot: 'bg-amber-500' },
  MANAGER:     { bg: 'bg-blue-500/10',   text: 'text-blue-500',   dot: 'bg-blue-500' },
  WAITER:      { bg: 'bg-green-500/10',  text: 'text-green-500',  dot: 'bg-green-500' },
  KITCHEN:     { bg: 'bg-purple-500/10', text: 'text-purple-500', dot: 'bg-purple-500' },
  // Payments
  succeeded:   { bg: 'bg-green-500/10',  text: 'text-green-500',  dot: 'bg-green-500' },
  pending:     { bg: 'bg-amber-500/10',  text: 'text-amber-500',  dot: 'bg-amber-500' },
  failed:      { bg: 'bg-red-500/10',    text: 'text-red-500',    dot: 'bg-red-500' },
  refunded:    { bg: 'bg-slate-500/10',  text: 'text-slate-500',  dot: 'bg-slate-500' },
  // Tables
  occupied:    { bg: 'bg-blue-500/10',   text: 'text-blue-500',   dot: 'bg-blue-500' },
  waiting:     { bg: 'bg-amber-500/10',  text: 'text-amber-500',  dot: 'bg-amber-500' },
  paid:        { bg: 'bg-green-500/10',  text: 'text-green-500',  dot: 'bg-green-500' },
  empty:       { bg: 'bg-muted',         text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
  free:        { bg: 'bg-muted',         text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
};

const DEFAULT_COLORS = { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' };

interface StatusBadgeProps {
  status: string;
  /** Override default label (status string). Useful for translated text. */
  label?: string;
  /** Show a pulsing dot before the text */
  dot?: boolean;
  /** Badge size */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Standardized status badge with centralized color mapping.
 * Prevents color drift between Orders, Staff, Payments, and Tables.
 */
export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  dot = false,
  size = 'sm',
  className = '',
}) => {
  const colors = STATUS_COLORS[status] || DEFAULT_COLORS;
  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-xs'
    : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses} ${className}`}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} ${status === 'NEW' || status === 'IN_PROGRESS' ? 'animate-pulse' : ''}`} />
      )}
      {label || status}
    </span>
  );
};
