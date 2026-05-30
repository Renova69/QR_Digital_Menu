import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, Clock, CreditCard, ReceiptText, UserRound, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';

interface OrderDetail {
  id: string;
  customerName?: string;
  createdAt?: string;
  specialRequests?: string | null;
  source?: 'CUSTOMER' | 'POS';
  staffName?: string | null;
  staffRole?: string | null;
  staff?: {
    id?: string;
    name?: string | null;
    email?: string;
    role?: string;
  } | null;
  items: {
    name: string;
    quantity: number;
    totalPrice?: number;
    options?: string[];
  }[];
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
    updatedAt?: string;
  } | null;
  orders: OrderDetail[];
  ordersLoading?: boolean;
  paymentInfo?: { amount: number; tipAmount?: number } | null;
}

const statusLabels: Record<string, string> = {
  NEW: 'orders.tabs.new',
  IN_PROGRESS: 'orders.tabs.inProgress',
  SERVED: 'orders.tabs.served',
  COMPLETED: 'orders.tabs.completed',
  CANCELED: 'orders.tabs.canceled',
};

const orderStatusStyles: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200',
  IN_PROGRESS: 'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200',
  SERVED: 'bg-slate-100 text-slate-700 dark:bg-slate-400/15 dark:text-slate-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
  CANCELED: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200',
};

const tableStatusStyles: Record<string, { dot: string; label: string }> = {
  empty: { dot: 'bg-emerald-500', label: 'tables.free' },
  occupied: { dot: 'bg-red-500', label: 'tables.occupied' },
  waiting: { dot: 'bg-amber-500', label: 'tables.waiting' },
  paid: { dot: 'bg-emerald-500', label: 'tables.paid' },
};

const sessionStates = [
  { value: 'empty', label: 'tables.free', dot: 'bg-emerald-500' },
  { value: 'occupied', label: 'tables.occupied', dot: 'bg-red-500' },
  { value: 'waiting', label: 'tables.waiting', dot: 'bg-amber-500' },
  { value: 'paid', label: 'tables.paid', dot: 'bg-emerald-500' },
];

function formatOrderCode(id: string) {
  return `#${id.slice(-6).toUpperCase()}`;
}

function formatTime(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDate(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function getElapsedLabel(value?: string) {
  if (!value) return null;
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const hours = Math.floor(diffMinutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

function getSpecialRequestRows(requests?: string | null) {
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

function SourceBadge({
  source,
  staff,
  staffName,
  staffRole,
}: {
  source?: 'CUSTOMER' | 'POS';
  staff?: any;
  staffName?: string | null;
  staffRole?: string | null;
}) {
  if (!source) return null;
  if (source === 'CUSTOMER') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
        QR
      </span>
    );
  }

  // Resolve from either the dashboard `staff` object or the live-table
  // flattened staffName/staffRole fields.
  const roleStr = staff?.role ? String(staff.role) : (staffRole ? String(staffRole) : '');
  const roleName = roleStr ? roleStr.charAt(0).toUpperCase() + roleStr.slice(1).toLowerCase() : 'Staff';
  const rawName = staff?.name ?? staff?.email ?? staffName ?? '';
  const name = rawName ? String(rawName).split(/[ @]/)[0] : 'Staff';

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
      {roleName}: {name}
    </span>
  );
}

const TableDetailModal: React.FC<TableDetailModalProps> = ({
  open,
  onOpenChange,
  table,
  orders,
  ordersLoading,
  paymentInfo,
}) => {
  const { t } = useTranslation();

  if (!table) return null;

  const tableStatus = tableStatusStyles[table.status] ?? tableStatusStyles.empty;
  const firstOrderDate = orders[0]?.createdAt;
  const openedAt = table.updatedAt ?? firstOrderDate;
  const guestCount = table.customerNames.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] flex max-h-[92vh] w-[94vw] max-w-[680px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-start justify-between gap-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                  {t('tables.tableDetailLabel', 'Table Detail')}
                </p>
                <Dialog.Title className="mt-1 truncate text-2xl font-black tracking-tight text-foreground">
                  {table.name}
                </Dialog.Title>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-black text-foreground">
                    <span className={cn('h-2.5 w-2.5 rounded-full', tableStatus.dot)} />
                    {t(tableStatus.label, table.status)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <ReceiptText className="h-3.5 w-3.5" />
                    {t('tables.ordersCount', { count: table.orderCount || orders.length })}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {guestCount || 0} {guestCount === 1 ? 'guest' : 'guests'}
                  </span>
                  {openedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {getElapsedLabel(openedAt)}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 text-xs font-bold text-muted-foreground sm:grid-cols-3">
              {table.customerNames.length > 0 && (
                <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <UserRound className="h-4 w-4 text-primary" />
                  <span className="truncate">{table.customerNames.join(', ')}</span>
                </div>
              )}
              {formatDate(firstOrderDate) && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <span>{formatDate(firstOrderDate)}</span>
                </div>
              )}
              {formatTime(firstOrderDate) && (
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span>{formatTime(firstOrderDate)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-5">
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                Session status
              </p>
              <div className="flex flex-wrap gap-2">
                {sessionStates.map((state) => {
                  const active = state.value === table.status;
                  return (
                    <span
                      key={state.value}
                      className={cn(
                        'inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-black',
                        active
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-card text-muted-foreground',
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full', state.dot)} />
                      {t(state.label, state.value)}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t('tables.activeOrders', 'Active Orders')} ({orders.length})
              </p>
              {table.sessionStatus && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                  {table.sessionStatus}
                </span>
              )}
            </div>

            {ordersLoading && (
              <div className="flex justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            )}

            {!ordersLoading && orders.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm font-medium text-muted-foreground">
                {t('orders.noOrders', { status: '' })}
              </div>
            )}

            <div className="space-y-3">
              {orders.map((order) => {
                const specialRequests = getSpecialRequestRows(order.specialRequests);
                return (
                  <section key={order.id} className="rounded-xl border border-border bg-muted/35 p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-sm text-foreground">{formatOrderCode(order.id)}</span>
                          <span className={cn('rounded-md px-2 py-1 text-[10px] font-black uppercase', orderStatusStyles[order.status])}>
                            {t(statusLabels[order.status] || 'orders.tabs.new')}
                          </span>
                          <SourceBadge
                            source={order.source}
                            staff={order.staff}
                            staffName={order.staffName}
                            staffRole={order.staffRole}
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                          {order.customerName && order.source === 'CUSTOMER' && <span>{order.customerName}</span>}
                          {formatTime(order.createdAt) && <span>{formatTime(order.createdAt)}</span>}
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-xs font-bold text-muted-foreground">
                        {getElapsedLabel(order.createdAt)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {order.items.map((item, index) => (
                        <div key={`${order.id}-item-${index}`} className="grid grid-cols-[30px_minmax(0,1fr)_auto] gap-2 text-sm">
                          <span className="font-black text-primary">{item.quantity}x</span>
                          <div className="min-w-0">
                            <span className="block font-medium text-foreground">{item.name}</span>
                            {item.options && item.options.length > 0 && (
                              <span className="text-xs font-medium text-muted-foreground">{item.options.join(', ')}</span>
                            )}
                          </div>
                          {typeof item.totalPrice === 'number' && (
                            <span className="font-bold text-muted-foreground">&euro;{item.totalPrice.toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                    </div>

                    {specialRequests.length > 0 && (
                      <div className="mt-3 rounded-lg border border-[#F59E0B] bg-[#FFE1B3] p-3 text-orange-950 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-100">
                        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-orange-900 dark:text-orange-100/70">
                          {t('orders.specialRequests', 'Special Requests')}
                        </p>
                        <div className="space-y-1.5">
                          {specialRequests.map((request, index) => (
                            <p key={`${order.id}-special-${index}`} className="text-xs font-bold leading-relaxed text-orange-950 dark:text-orange-100">
                              {request.seat && (
                                <span className="mr-2 rounded bg-[#F97316] px-1.5 py-0.5 text-[10px] font-black uppercase text-white dark:bg-orange-400/20 dark:text-orange-100">
                                  {request.seat}
                                </span>
                              )}
                              {request.text}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm font-medium text-muted-foreground">{t('orders.total')}</span>
                      <span className="text-lg font-black text-foreground">&euro;{order.totalPrice.toFixed(2)}</span>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border bg-card px-6 py-4">
            <div className="rounded-xl border border-primary/25 bg-primary/10 px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-muted-foreground">Session total</span>
                <span className="text-2xl font-black text-primary">&euro;{(table.totalAmount || orders.reduce((sum, order) => sum + order.totalPrice, 0)).toFixed(2)}</span>
              </div>
            </div>

            {paymentInfo && (
              <div className="mt-3 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <CreditCard className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                <div>
                  <p className="text-xs font-bold text-muted-foreground">{t('payments.paymentReceived')}</p>
                  <p className="text-sm font-black text-foreground">
                    &euro;{paymentInfo.amount.toFixed(2)}
                    {paymentInfo.tipAmount ? <span className="ml-1 text-xs font-medium text-muted-foreground">+ &euro;{paymentInfo.tipAmount.toFixed(2)} {t('payments.tip')}</span> : null}
                  </p>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default TableDetailModal;
