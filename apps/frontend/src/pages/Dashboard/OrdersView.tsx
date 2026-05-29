import { useMemo, useState } from 'react';
import {
  Bell,
  Check,
  ChefHat,
  ClipboardList,
  Clock,
  Flame,
  Menu,
  Play,
  Search,
  Utensils,
  Volume2,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrders, OrderStatus } from '../../context/OrderContext';
import { cn } from '../../lib/utils';
import TableDetailModal from '../../components/tables/TableDetailModal';

type OrdersContextValue = ReturnType<typeof useOrders>;
type DashboardOrder = OrdersContextValue['orders'][number];
type DashboardOrderItem = DashboardOrder['items'][number];

const ORDER_STATUSES: Array<{
  status: OrderStatus;
  labelKey: string;
  fallback: string;
  Icon: typeof Bell;
  tone: string;
}> = [
  { status: 'NEW', labelKey: 'orders.tabs.new', fallback: 'New', Icon: Bell, tone: 'text-primary' },
  { status: 'IN_PROGRESS', labelKey: 'orders.tabs.inProgress', fallback: 'In Progress', Icon: Flame, tone: 'text-orange-500' },
  { status: 'SERVED', labelKey: 'orders.tabs.served', fallback: 'Served', Icon: Utensils, tone: 'text-slate-600 dark:text-slate-300' },
  { status: 'COMPLETED', labelKey: 'orders.tabs.completed', fallback: 'Completed', Icon: Check, tone: 'text-emerald-600' },
  { status: 'CANCELED', labelKey: 'orders.tabs.canceled', fallback: 'Canceled', Icon: X, tone: 'text-rose-600' },
];

const statusAccent: Record<OrderStatus, string> = {
  NEW: 'before:bg-blue-500',
  IN_PROGRESS: 'before:bg-orange-500',
  SERVED: 'before:bg-slate-500',
  COMPLETED: 'before:bg-emerald-500',
  CANCELED: 'before:bg-rose-500',
};

function getOrderCode(id: string) {
  return `#${id.slice(-6).toUpperCase()}`;
}

function formatOrderTime(createdAt: string) {
  return new Date(createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function getElapsedLabel(createdAt: string) {
  const diffMinutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
  );

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const hours = Math.floor(diffMinutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function getItemTotal(item: DashboardOrderItem) {
  const optionTotal = Array.isArray(item.selectedOptions)
    ? item.selectedOptions.reduce(
        (sum, option) => sum + Number(option?.priceModifier ?? 0),
        0,
      )
    : 0;

  return (Number(item.menuItem?.price ?? 0) + optionTotal) * item.quantity;
}

function getSpecialRequestRows(requests?: string) {
  if (!requests?.trim()) return [];

  return requests
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^\[(.+?)\]\s*(.*)$/);
      if (!match) return { seat: null, text: part };
      return { seat: match[1], text: match[2] || part };
    });
}

function stripTrailingColon(value: string) {
  return value.replace(/:\s*$/, '');
}

function SourceBadge({ source, staffName }: { source?: 'CUSTOMER' | 'POS'; staffName?: string | null }) {
  if (!source) return null;
  if (source === 'CUSTOMER') {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
        Self
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
      {staffName?.split(' ')[0] ?? 'Staff'}
    </span>
  );
}

const OrdersView = () => {
  const { orders, updateOrderStatus } = useOrders();
  const [activeTab, setActiveTab] = useState<OrderStatus>('NEW');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(null);
  const { t } = useTranslation();

  const counts = useMemo(() => {
    return ORDER_STATUSES.reduce<Record<OrderStatus, number>>((acc, { status }) => {
      acc[status] = orders.filter((order) => order.status === status).length;
      return acc;
    }, {
      NEW: 0,
      IN_PROGRESS: 0,
      SERVED: 0,
      COMPLETED: 0,
      CANCELED: 0,
    });
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return orders
      .filter((order) => order.status === activeTab)
      .filter((order) => {
        if (!query) return true;

        const itemNames = order.items
          .map((item) => item.menuItem?.name ?? '')
          .join(' ')
          .toLowerCase();

        return [
          order.id.toLowerCase(),
          getOrderCode(order.id).toLowerCase(),
          String(order.tableId ?? '').toLowerCase(),
          `table ${order.tableId}`.toLowerCase(),
          itemNames,
        ].some((value) => value.includes(query));
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activeTab, orders, searchTerm]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
    } catch (error) {
      console.error('Failed to update order status:', error);
    }
  };

  const handleSoundPreview = () => {
    new Audio('/notification.mp3').play().catch(() => {});
  };

  const activeStatus = ORDER_STATUSES.find((status) => status.status === activeTab);
  const selectedTable = selectedOrder
    ? {
        name: t('orders.table', { id: selectedOrder.tableId }),
        status: selectedOrder.tableSession?.status === 'PAID' ? 'paid' : selectedOrder.status === 'CANCELED' ? 'waiting' : 'occupied',
        sessionId: selectedOrder.id,
        orderCount: 1,
        totalAmount: selectedOrder.totalPrice,
        customerNames: selectedOrder.customerName ? [selectedOrder.customerName] : [],
        sessionStatus: selectedOrder.tableSession?.status ?? selectedOrder.status,
        updatedAt: selectedOrder.createdAt,
      }
    : null;
  const selectedTableOrders = selectedOrder
    ? [
        {
          id: selectedOrder.id,
          customerName: selectedOrder.customerName,
          createdAt: selectedOrder.createdAt,
          specialRequests: selectedOrder.specialRequests ?? null,
          status: selectedOrder.status,
          totalPrice: selectedOrder.totalPrice,
          items: selectedOrder.items.map((item) => ({
            name: item.menuItem?.name ?? t('orders.unknownItem', 'Item'),
            quantity: item.quantity,
            totalPrice: getItemTotal(item),
            options: Array.isArray(item.selectedOptions)
              ? item.selectedOptions.map((option: any) => option.choiceName).filter(Boolean)
              : [],
          })),
        },
      ]
    : [];

  return (
    <section className="min-h-full bg-background text-foreground">
      <div className="mb-6 flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition hover:bg-muted"
            aria-label={t('common.menu', 'Menu')}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black leading-tight text-foreground">
              {t('dashboard.tabs.orders', 'Orders')}
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {t('orders.subtitle', 'Track and route every order in real-time.')}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:justify-end">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('orders.searchPlaceholder', 'Search by order # or table...')}
              className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button
            type="button"
            onClick={handleSoundPreview}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition hover:bg-primary/15"
            aria-label={t('orders.previewSound', 'Preview order sound')}
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-8">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 shadow-sm sm:flex sm:flex-wrap sm:items-center">
          {ORDER_STATUSES.map(({ status, labelKey, fallback, Icon, tone }) => {
            const isActive = activeTab === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setActiveTab(status)}
                className={cn(
                  'flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition active:scale-[0.98] sm:h-9 sm:px-4',
                  isActive
                    ? 'bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-white' : tone)} />
                <span>{t(labelKey, fallback)}</span>
                <span
                  className={cn(
                    'flex h-5 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-black',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {counts[status]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredOrders.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredOrders.map((order) => {
            const specialRequests = getSpecialRequestRows(order.specialRequests);

            return (
              <article
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedOrder(order)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedOrder(order);
                  }
                }}
                className={cn(
                  'relative flex aspect-[1/1.05] cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40',
                  'before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1',
                  statusAccent[order.status],
                )}
              >
                <div className="mb-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate font-black text-sm tracking-tight text-foreground">
                        {getOrderCode(order.id)}
                      </p>
                      <SourceBadge source={order.source} staffName={order.staffName} />
                      {specialRequests.length > 0 && (
                        <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-[#F97316] px-2 text-[10px] font-black uppercase text-white">
                          <ClipboardList className="h-3 w-3" />
                          Note
                        </span>
                      )}
                    </div>
                    <span className="whitespace-nowrap text-xs font-bold text-muted-foreground">
                      {getElapsedLabel(order.createdAt)}
                    </span>
                  </div>

                  <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
                      <span className="rounded-md bg-muted px-2.5 py-1 font-black text-foreground">
                        {t('orders.table', { id: order.tableId })}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <Clock className="h-3.5 w-3.5" />
                        {t('orders.pluckedAt', { time: formatOrderTime(order.createdAt) })}
                      </span>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    {stripTrailingColon(t('orders.items', 'Items'))}
                  </p>

                  <ul className="space-y-1.5">
                    {order.items.slice(0, 6).map((item, index) => (
                      <li
                        key={`${item.id}-${index}`}
                        className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-2 text-xs"
                      >
                        <span className="font-black text-primary">{item.quantity}x</span>
                        <div className="min-w-0">
                          <span className="block truncate font-semibold leading-snug text-foreground">
                            {item.menuItem?.name ?? t('orders.unknownItem', 'Item')}
                          </span>
                          {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.selectedOptions.map((option: any, optionIndex: number) => (
                                <span
                                  key={`${item.id}-option-${optionIndex}`}
                                  className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground"
                                >
                                  {option.choiceName}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="whitespace-nowrap font-bold text-muted-foreground">
                          €{getItemTotal(item).toFixed(2)}
                        </span>
                      </li>
                    ))}
                    {order.items.length > 6 && (
                      <li className="text-xs font-black text-muted-foreground">
                        +{order.items.length - 6} more
                      </li>
                    )}
                  </ul>

                  {specialRequests.length > 0 && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-[#F59E0B] bg-[#FFE1B3] px-2.5 py-2 text-orange-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_0_rgba(146,64,14,0.08)] dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-100 dark:shadow-none">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-orange-900 dark:text-orange-100/70">
                        <ClipboardList className="h-3.5 w-3.5" />
                        {stripTrailingColon(t('orders.specialRequests', 'Special Requests'))}
                      </div>
                      <p className="truncate text-[11px] font-bold leading-relaxed text-orange-950 dark:text-orange-100">
                        {specialRequests[0]?.seat && (
                          <span className="mr-1.5 rounded bg-[#F97316] px-1.5 py-0.5 text-[9px] font-black uppercase text-white dark:bg-orange-400/20 dark:text-orange-100">
                            {specialRequests[0].seat}
                          </span>
                        )}
                        {specialRequests[0]?.text}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-auto border-t border-border pt-3">
                  <div className="mb-2 flex items-end justify-between gap-4">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('orders.total', 'Total')}
                    </span>
                    <span className="text-xl font-black tracking-tight text-foreground">
                      €{order.totalPrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    {order.status === 'NEW' && (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(order.id, 'IN_PROGRESS');
                          }}
                          className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent active:scale-[0.98]"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          {t('orders.startPreparing')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(order.id, 'CANCELED');
                          }}
                          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-card px-3 text-xs font-black text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t('orders.cancel')}
                        </button>
                      </>
                    )}

                    {order.status === 'IN_PROGRESS' && (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(order.id, 'SERVED');
                          }}
                          className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent active:scale-[0.98]"
                        >
                          <ChefHat className="h-3.5 w-3.5" />
                          {t('orders.markServed')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(order.id, 'CANCELED');
                          }}
                          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-card px-3 text-xs font-black text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                        >
                          <X className="h-3.5 w-3.5" />
                          {t('orders.cancel')}
                        </button>
                      </>
                    )}

                    {order.status === 'SERVED' && (
                      <>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(order.id, 'COMPLETED');
                          }}
                          className="flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent active:scale-[0.98]"
                        >
                          <Check className="h-3.5 w-3.5" />
                          {t('orders.markCompleted')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStatusChange(order.id, 'NEW');
                          }}
                          className="flex h-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-black text-foreground transition hover:bg-muted"
                        >
                          {t('orders.reopen')}
                        </button>
                      </>
                    )}

                    {(order.status === 'COMPLETED' || order.status === 'CANCELED') && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStatusChange(order.id, 'NEW');
                        }}
                        className="col-span-2 flex h-10 items-center justify-center rounded-lg border border-border bg-muted px-3 text-xs font-black text-foreground transition hover:bg-secondary"
                      >
                        {t('orders.reopen')}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {activeStatus ? <activeStatus.Icon className="h-6 w-6" /> : <Bell className="h-6 w-6" />}
            </div>
            <p className="text-lg font-black text-foreground">
              {t('orders.noOrders', {
                status: activeStatus
                  ? t(activeStatus.labelKey, activeStatus.fallback).toLowerCase()
                  : 'matching',
              })}
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {searchTerm
                ? t('orders.noSearchResults', 'Try a different order number, table, or dish.')
                : t('orders.clearKitchen', 'The kitchen is clear for now.')}
            </p>
          </div>
        </div>
      )}

      <TableDetailModal
        open={!!selectedOrder}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
        table={selectedTable}
        orders={selectedTableOrders}
        paymentInfo={selectedOrder?.tableSession?.status === 'PAID' ? { amount: selectedOrder.totalPrice } : null}
      />
    </section>
  );
};

export default OrdersView;
