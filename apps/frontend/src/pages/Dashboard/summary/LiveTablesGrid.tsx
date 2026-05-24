import { useTranslation } from "react-i18next";

interface TableData {
  id: string;
  name: string;
  status: 'empty' | 'occupied' | 'paid' | 'waiting';
  orderCount: number;
  customerNames: string[];
}

interface LiveTablesGridProps {
  tables: TableData[];
}

const LiveTablesGrid = ({ tables }: LiveTablesGridProps) => {
  const { t } = useTranslation();

  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    empty: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', label: t('dashboard.available') },
    occupied: { bg: 'bg-primary/10', text: 'text-primary', label: t('tables.occupied') },
    paid: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: t('tables.paid') },
    waiting: { bg: 'bg-sky-500/10', text: 'text-sky-500', label: t('tables.waiting') },
  };

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">{t('dashboard.liveTables')}</h3>
      {tables.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noTablesConfigured')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {tables.map((table) => {
            const cfg = statusConfig[table.status] || statusConfig.empty;
            return (
              <div
                key={table.id}
                className={`rounded-xl p-3 border transition-all ${cfg.bg} border-transparent hover:border-border`}
              >
                <p className="text-xs font-bold text-foreground">{table.name}</p>
                <p className={`text-[10px] font-bold uppercase mt-0.5 ${cfg.text}`}>{cfg.label}</p>
                {table.status !== 'empty' && (
                  <div className="mt-1.5 flex flex-col gap-0.5">
                    {table.orderCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">{t('dashboard.ordersCount', { count: table.orderCount })}</span>
                    )}
                    {table.customerNames.length > 0 && (
                      <span className="text-[10px] text-muted-foreground truncate">{table.customerNames.join(', ')}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LiveTablesGrid;
