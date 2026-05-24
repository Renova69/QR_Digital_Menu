import { formatEuro } from "../../../lib/currency";

interface OrderRow {
  id: string;
  tableId?: string | null;
  customerPhone?: string | null;
  totalPrice: number;
  status: string;
  createdAt: string;
  items?: { quantity: number }[];
}

interface RecentOrdersTableProps {
  orders: OrderRow[];
}

const statusClass = (status: string) => {
  switch (status) {
    case 'NEW': return 'bg-primary/15 text-primary';
    case 'SERVED': return 'bg-emerald-500/15 text-emerald-500';
    case 'CANCELED': return 'bg-destructive/15 text-destructive';
    default: return 'bg-amber-500/15 text-amber-500';
  }
};

const formatDateTime = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
  ' · ' +
  new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const RecentOrdersTable = ({ orders }: RecentOrdersTableProps) => (
  <div className="glass-panel rounded-[1.5rem] p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-sm font-display font-bold text-foreground">Recent Orders</h3>
      <span className="text-xs text-muted-foreground">{orders.length} total</span>
    </div>
    <div className="space-y-2">
      {orders.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">No orders in this period</p>
      ) : (
        orders.slice(0, 8).map((order) => (
          <div key={order.id} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-secondary/50 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">
                #{order.id.slice(-6)} — Table {order.tableId || '—'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {order.customerPhone || 'Walk-in'} · {formatDateTime(order.createdAt)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-foreground">{formatEuro(order.totalPrice)}</p>
              <p className="text-[10px] text-muted-foreground">{order.items?.length ?? 0} items</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${statusClass(order.status)}`}>
              {order.status}
            </span>
          </div>
        ))
      )}
    </div>
  </div>
);

export default RecentOrdersTable;
