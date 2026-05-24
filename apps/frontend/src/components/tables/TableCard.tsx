import React, { useEffect, useState } from 'react';
import { Clock, ShoppingBag, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface TableCardProps {
  name: string;
  status: 'empty' | 'occupied' | 'paid' | 'waiting';
  orderCount: number;
  customerCount: number;
  customerNames: string[];
  totalAmount?: number;
  updatedAt?: string;
  onClick: () => void;
}

const statusConfig: Record<
  string,
  { dot: string; labelKey: string; fallback: string }
> = {
  occupied: {
    dot: 'bg-red-500',
    labelKey: 'tables.occupied',
    fallback: 'Occupied',
  },
  waiting: {
    dot: 'bg-amber-500',
    labelKey: 'tables.waiting',
    fallback: 'Waiting',
  },
  paid: {
    dot: 'bg-emerald-500',
    labelKey: 'tables.paid',
    fallback: 'Paid',
  },
  empty: {
    dot: 'bg-emerald-500',
    labelKey: 'tables.available',
    fallback: 'Available',
  },
};

function formatElapsed(seconds: number): string {
  if (seconds < 60) return '<1m';
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

function calcElapsedSince(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

const TableCard: React.FC<TableCardProps> = ({
  name,
  status,
  orderCount,
  customerCount,
  customerNames,
  totalAmount = 0,
  updatedAt,
  onClick,
}) => {
  const { t } = useTranslation();
  const cfg = statusConfig[status] ?? statusConfig.empty;
  const hasSession = status !== 'empty';
  const hasCustomers = customerCount > 0;

  const [elapsed, setElapsed] = useState(() => calcElapsedSince(updatedAt));

  useEffect(() => {
    if (!hasSession) return;
    setElapsed(calcElapsedSince(updatedAt));
    const timer = setInterval(() => setElapsed(calcElapsedSince(updatedAt)), 30000);
    return () => clearInterval(timer);
  }, [hasSession, updatedAt]);

  const customerLabel = customerNames.length > 0
    ? customerNames.join(', ')
    : hasCustomers
      ? `${customerCount} ${customerCount === 1 ? 'guest' : 'guests'}`
      : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-[0.99]"
    >
      {/* Row 1: Table name + person count */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-lg font-black tracking-tight text-foreground">
          {name}
        </h3>
        {hasCustomers && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {customerCount}
          </span>
        )}
      </div>

      {/* Row 2: Status dot + label */}
      <div className="flex items-center gap-1.5">
        <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
        <span className="text-xs font-bold text-muted-foreground">
          {t(cfg.labelKey, cfg.fallback)}
        </span>
      </div>

      {/* Row 3: Timer + guests/names */}
      {hasSession && (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatElapsed(elapsed)}
          </span>
          {customerLabel && (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {customerLabel}
            </span>
          )}
        </div>
      )}

      {/* Row 4: Orders + total */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ShoppingBag className="h-3.5 w-3.5" />
          {orderCount} {orderCount === 1 ? 'order' : 'orders'}
        </span>
        <span className="text-base font-black tracking-tight text-foreground">
          &euro;{totalAmount.toFixed(2)}
        </span>
      </div>
    </button>
  );
};

export default TableCard;
