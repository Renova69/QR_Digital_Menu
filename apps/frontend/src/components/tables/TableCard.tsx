import React from 'react';
import { Clock, ReceiptText, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TableCardProps {
  name: string;
  status: 'empty' | 'occupied' | 'paid' | 'waiting';
  orderCount: number;
  customerCount: number;
  totalAmount?: number;
  updatedAt?: string;
  onClick: () => void;
}

const statusStyles: Record<
  string,
  { accent: string; badge: string; label: string; dot: string }
> = {
  occupied: {
    accent: 'before:bg-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200',
    label: 'Occupied',
    dot: 'bg-red-500',
  },
  waiting: {
    accent: 'before:bg-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
    label: 'Waiting',
    dot: 'bg-amber-500',
  },
  paid: {
    accent: 'before:bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
    label: 'Paid',
    dot: 'bg-emerald-500',
  },
  empty: {
    accent: 'before:bg-slate-300 dark:before:bg-slate-600',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300',
    label: 'Available',
    dot: 'bg-emerald-500',
  },
};

function formatUpdatedAt(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

const TableCard: React.FC<TableCardProps> = ({
  name,
  status,
  orderCount,
  customerCount,
  totalAmount = 0,
  updatedAt,
  onClick,
}) => {
  const style = statusStyles[status] ?? statusStyles.empty;
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex aspect-[1.08/1] w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-[0.99]',
        'before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1',
        style.accent,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[10px] font-black uppercase', style.badge)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
            {style.label}
          </span>
          <h3 className="mt-3 truncate text-3xl font-black tracking-tight text-foreground">
            {name}
          </h3>
        </div>

        {orderCount > 0 && (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 text-[11px] font-black text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]">
            {orderCount > 99 ? '99+' : orderCount}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            <ReceiptText className="h-3.5 w-3.5" />
            Orders
          </p>
          <p className="mt-1 text-lg font-black text-foreground">{orderCount}</p>
        </div>
        <div className="rounded-lg bg-muted/60 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Guests
          </p>
          <p className="mt-1 text-lg font-black text-foreground">{customerCount}</p>
        </div>
      </div>

      <div className="mt-auto border-t border-border pt-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Session total
            </p>
            <p className="mt-0.5 text-xl font-black tracking-tight text-foreground">
              &euro;{totalAmount.toFixed(2)}
            </p>
          </div>
          {updatedLabel && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {updatedLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

export default TableCard;
