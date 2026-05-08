import React from 'react';
import { Modal } from '../ui/modal';
import { useTranslation } from 'react-i18next';
import { CreditCard } from 'lucide-react';

interface OrderDetail {
  id: string;
  customerName: string;
  items: { name: string; quantity: number }[];
  totalPrice: number;
  status: string;
}

interface TableDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: {
    name: string;
    status: string;
    sessionId: string | null;
    orderCount: number;
    totalAmount: number;
    customerNames: string[];
    sessionStatus: string | null;
  } | null;
  orders: OrderDetail[];
  paymentInfo?: { amount: number; tipAmount?: number } | null;
}

const statusLabels: Record<string, string> = {
  NEW: 'orders.tabs.new',
  IN_PROGRESS: 'orders.tabs.inProgress',
  SERVED: 'orders.tabs.served',
  CANCELED: 'orders.tabs.canceled',
};

const statusColors: Record<string, string> = {
  NEW: 'bg-blue-500/10 text-blue-400',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-400',
  SERVED: 'bg-emerald-500/10 text-emerald-400',
  CANCELED: 'bg-red-500/10 text-red-400',
};

const TableDetailModal: React.FC<TableDetailModalProps> = ({
  open,
  onOpenChange,
  table,
  orders,
  paymentInfo,
}) => {
  const { t } = useTranslation();

  if (!table) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('tables.tableDetail', { name: table.name })}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
            table.status === 'occupied' ? 'bg-red-500/10 text-red-400' :
            table.status === 'waiting' ? 'bg-amber-500/10 text-amber-400' :
            table.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400' :
            'bg-gray-500/10 text-gray-400'
          }`}>
            {t(`tables.${table.status}`)}
          </span>
          {table.customerNames.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {table.customerNames.join(', ')}
            </span>
          )}
        </div>

        {orders.length === 0 && (
          <p className="text-muted-foreground text-sm py-4">{t('orders.noOrders', { status: '' })}</p>
        )}

        {orders.map((order) => (
          <div key={order.id} className="glass-panel p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">{order.customerName || t('checkout.notSpecified')}</span>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${statusColors[order.status] || ''}`}>
                {t(statusLabels[order.status] || 'orders.tabs.new')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>{item.name} &times; {item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-border/40">
              <span className="text-xs text-muted-foreground">{t('orders.total')}</span>
              <span className="text-sm font-bold">&euro; {order.totalPrice.toFixed(2)}</span>
            </div>
          </div>
        ))}

        {paymentInfo && (
          <div className="glass-panel p-4 rounded-xl flex items-center gap-3 border-l-4 border-l-emerald-500">
            <CreditCard className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">{t('payments.paymentReceived')}</p>
              <p className="font-bold text-sm">&euro; {paymentInfo.amount.toFixed(2)}
                {paymentInfo.tipAmount ? <span className="text-xs text-muted-foreground ml-1">+ &euro;{paymentInfo.tipAmount.toFixed(2)} {t('payments.tip')}</span> : null}
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TableDetailModal;
