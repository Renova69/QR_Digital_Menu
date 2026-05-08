import React from 'react';
import { Users } from 'lucide-react';

interface TableCardProps {
  name: string;
  status: 'empty' | 'occupied' | 'paid' | 'waiting';
  orderCount: number;
  customerCount: number;
  onClick: () => void;
}

const statusStyles: Record<string, { border: string; bg: string }> = {
  occupied: { border: 'border-l-red-500', bg: 'bg-red-500/5' },
  waiting: { border: 'border-l-amber-500', bg: 'bg-amber-500/5' },
  paid: { border: 'border-l-emerald-500', bg: 'bg-emerald-500/5' },
  empty: { border: 'border-l-gray-400', bg: 'bg-gray-400/5' },
};

const TableCard: React.FC<TableCardProps> = ({ name, status, orderCount, customerCount, onClick }) => {
  const style = statusStyles[status];

  return (
    <button
      onClick={onClick}
      className={`relative w-full aspect-square rounded-2xl border-l-4 ${style.border} ${style.bg} glass-panel flex flex-col items-center justify-center gap-1.5 transition-all hover:-translate-y-1 hover:shadow-lg active:scale-95`}
    >
      {orderCount > 0 && (
        <span className="absolute top-2 right-2 bg-accent text-accent-foreground text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shadow-lg shadow-accent/20">
          {orderCount > 9 ? '9+' : orderCount}
        </span>
      )}
      <span className="text-3xl font-black tracking-tighter">{name}</span>
      {customerCount > 0 && (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
          <Users className="w-3 h-3" />
          {customerCount}
        </span>
      )}
    </button>
  );
};

export default TableCard;
