import { useState, useContext } from 'react';
import { useOrders } from '../../context/OrderContext';
import { OrderStatus } from '../../context/OrderContext';
import { Button } from '../../components/ui/button';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import RestaurantContext from '../../context/RestaurantContext';

const OrdersView = () => {
  const { orders, updateOrderStatus } = useOrders();
  const [activeTab, setActiveTab] = useState<OrderStatus>('NEW');
  const { t } = useTranslation();
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const paymentsEnabled = activeRestaurant?.paymentsEnabled ?? false;

  // Filter orders by active tab status
  const filteredOrders = orders.filter(order => order.status === activeTab);

  // Handle status change for an order
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (error) {
      // Error handling - could show a toast notification
      console.error('Failed to update order status:', error);
    }
  };

  const getStatusLabel = (status: OrderStatus) => {
      switch(status) {
          case 'NEW': return t('orders.tabs.new');
          case 'IN_PROGRESS': return t('orders.tabs.inProgress');
          case 'SERVED': return t('orders.tabs.served');
          case 'CANCELED': return t('orders.tabs.canceled');
          case 'COMPLETED': return t('orders.tabs.completed');
          default: return status;
      }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex items-center justify-between mb-10 overflow-x-auto hide-scrollbar pb-2">
        <nav className="flex space-x-2 min-w-max" aria-label="Tabs">
            {(['NEW', 'IN_PROGRESS', 'SERVED', 'COMPLETED', 'CANCELED'] as OrderStatus[]).map((status) => (
            <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={`px-6 py-4 font-black text-[11px] uppercase tracking-[0.15em] transition-all rounded-[1.2rem] flex items-center gap-3 active:scale-95 ${
                activeTab === status
                    ? 'bg-foreground text-background shadow-[0_15px_30px_-5px_var(--color-primary)] z-10 scale-105'
                    : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
                }`}
            >
                {getStatusLabel(status)}
                <span className={`py-1 px-2.5 rounded-full text-[10px] font-black ${activeTab === status ? 'bg-accent text-accent-foreground shadow-lg' : 'bg-secondary text-muted-foreground'}`}>
                    {orders.filter(o => o.status === status).length}
                </span>
            </button>
            ))}
        </nav>
      </div>

      <div className="space-y-8">
        {filteredOrders.map(order => (
          <div key={order.id} className="glass-panel p-10 rounded-[3rem] border-white/10 dark:border-white/5 hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.4)] transition-all duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-3">
                    <p className="font-serif font-black text-foreground text-4xl tracking-tighter leading-none">{t('orders.orderNo', { id: order.id.slice(-6).toUpperCase() })}</p>
                    <span className="bg-accent text-accent-foreground px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-accent/20">{t('orders.table', { id: order.tableId })}</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-accent/40 rounded-full"></div>
                    <span className="text-[11px] text-muted-foreground font-bold uppercase tracking-[0.1em] opacity-60">{t('orders.pluckedAt', { time: new Date(order.createdAt).toLocaleTimeString() })}</span>
                </div>
              </div>
              <div className="text-right w-full md:w-auto">
                <p className={`inline-block font-black px-5 py-2.5 rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-sm border ${order.status === 'NEW' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : order.status === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : order.status === 'SERVED' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : order.status === 'COMPLETED' ? 'bg-violet-500/10 text-violet-500 border-violet-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                    {getStatusLabel(order.status)}
                </p>
                {paymentsEnabled && order.tableSession?.status === 'PAID' && (
                  <span className="inline-block font-black px-4 py-2 rounded-2xl text-[10px] uppercase tracking-[0.2em] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 ml-2">
                    € Paid
                  </span>
                )}
              </div>
            </div>

            <div className="mt-10 pt-10 border-t border-border/40">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 mb-6">{t('orders.items')}</p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.items.map(item => (
                  <li key={item.id} className="bg-secondary/40 p-6 rounded-[1.8rem] border border-white/5 flex flex-col gap-3 group/item hover:bg-secondary/60 transition-all">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 bg-foreground/5 rounded-xl flex items-center justify-center font-black text-xs text-foreground/40">{item.quantity}×</span>
                            <span className="font-serif font-black text-xl text-foreground/90">{item.menuItem?.name}</span>
                        </div>
                        <span className="font-serif font-black text-lg text-accent">€{((item.menuItem?.price || 0) * item.quantity).toFixed(2)}</span>
                    </div>
                    {item.selectedOptions && Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-border/20">
                        {item.selectedOptions.map((opt: any) => (
                           <span key={`${item.id}-${opt.optionId}`} className="text-[9px] text-muted-foreground font-black uppercase tracking-widest bg-background/50 px-2.5 py-1 rounded-full border border-border/30">
                             {opt.choiceName}
                           </span>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {order.specialRequests && (
              <div className="mt-8 p-6 bg-destructive/5 rounded-2xl border border-destructive/10 text-destructive flex gap-4 items-start">
                <div className="mt-1 p-1 bg-destructive/10 rounded-lg">
                    <Bell className="w-4 h-4" />
                </div>
                <div>
                    <p className="font-black text-[10px] uppercase tracking-widest mb-1">{t('orders.specialRequests')}</p>
                    <p className="text-sm font-semibold">{order.specialRequests}</p>
                </div>
              </div>
            )}

            <div className="mt-10 pt-10 border-t border-border/40 flex flex-col lg:flex-row justify-between items-center gap-10">
              <div className="w-full lg:w-auto">
                <div className="flex items-baseline gap-4">
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">{t('orders.total')}</span>
                    <span className="text-5xl md:text-7xl font-serif font-black text-foreground tracking-tighter drop-shadow-xl">€{order.totalPrice.toFixed(2)}</span>
                </div>
                {order.customerPhone && (
                  <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                    <div className="w-4 h-px bg-muted-foreground/30"></div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em]">{t('orders.phone', { phone: order.customerPhone })}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-4 w-full lg:w-auto">
                {order.status === 'NEW' && (
                  <>
                    <button 
                        onClick={() => handleStatusChange(order.id, 'IN_PROGRESS')} 
                        className="flex-1 lg:flex-none px-10 py-5 bg-foreground text-background rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl hover:shadow-[0_20px_40px_-10px_var(--color-primary)] hover:-translate-y-1 transition-all active:scale-95"
                    >
                      {t('orders.startPreparing')}
                    </button>
                    <button 
                        onClick={() => handleStatusChange(order.id, 'CANCELED')} 
                        className="px-6 py-5 bg-background border border-border/50 text-destructive rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] hover:bg-destructive/10 hover:border-destructive/20 transition-all active:scale-95"
                    >
                      {t('orders.cancel')}
                    </button>
                  </>
                )}

                {order.status === 'IN_PROGRESS' && (
                  <>
                    <button 
                        onClick={() => handleStatusChange(order.id, 'SERVED')} 
                        className="flex-1 lg:flex-none px-10 py-5 bg-foreground text-background rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl hover:shadow-[0_20px_40px_-10px_var(--color-primary)] hover:-translate-y-1 transition-all active:scale-95"
                    >
                      {t('orders.markServed')}
                    </button>
                    <button 
                        onClick={() => handleStatusChange(order.id, 'CANCELED')} 
                        className="px-6 py-5 bg-background border border-border/50 text-destructive rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] hover:bg-destructive/10 hover:border-destructive/20 transition-all active:scale-95"
                    >
                      {t('orders.cancel')}
                    </button>
                  </>
                )}

                {order.status === 'SERVED' && (
                  <>
                    <button
                        onClick={() => handleStatusChange(order.id, 'COMPLETED')}
                        className="flex-1 lg:flex-none px-10 py-5 bg-foreground text-background rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl hover:shadow-[0_20px_40px_-10px_var(--color-primary)] hover:-translate-y-1 transition-all active:scale-95"
                    >
                      {t('orders.markCompleted')}
                    </button>
                    <button
                        onClick={() => handleStatusChange(order.id, 'NEW')}
                        className="px-6 py-5 bg-background border border-border/50 text-foreground rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] hover:bg-secondary/80 transition-all active:scale-95"
                    >
                      {t('orders.reopen')}
                    </button>
                  </>
                )}

                {order.status === 'COMPLETED' && (
                  <button
                    onClick={() => handleStatusChange(order.id, 'NEW')}
                    className="flex-1 lg:flex-none px-10 py-5 bg-secondary text-foreground rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] hover:bg-secondary/80 transition-all active:scale-95"
                  >
                    {t('orders.reopen')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className="text-center text-muted-foreground py-32 glass-panel rounded-[3rem] border-white/5 shadow-inner">
            <p className="font-serif font-black text-3xl mb-3 italic opacity-20">{t('orders.noOrders', { status: getStatusLabel(activeTab).toLowerCase() })}</p>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">The kitchen is clear for now</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrdersView;
