import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Receipt, RefreshCcw, ShieldCheck, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  type PaymentDetail,
  type PaymentRecord,
  statusStyles,
  methodStyles,
  formatMoney,
  formatDateTime,
  shortId,
  exportPaymentsCsv,
  openStripePayment,
} from './paymentsShared';

function getMethodLabel(method: string, t: (key: string, options?: any) => string) {
  if (method === 'STRIPE') return t('payments.stripeMethod');
  if (method === 'EPAY') return 'ePay.bg';
  if (method === 'MYPOS') return t('payments.cardMethod');
  if (method === 'CASH') return t('payments.cashMethod');
  return method;
}

function translateTimelineLabel(label: string, t: any) {
  if (label === 'Payment record created' || label === 'Записът за плащане е създаден') return t('payments.recordCreated', 'Payment record created');
  if (label === 'Payment failed') return t('payments.failedEvent', 'Payment failed');
  if (label === 'Payment succeeded') return t('payments.succeededEvent', 'Payment succeeded');
  if (label === 'Table session opened' || label === 'Сесията на масата е отворена') return t('payments.sessionOpened', 'Table session opened');
  if (label === 'Table session closed') return t('payments.sessionClosed', 'Table session closed');
  return label;
}

export function PaymentDrawer({
  payment,
  loading,
  refunding,
  onRefund,
  onClose,
}: {
  payment: PaymentDetail | PaymentRecord | null;
  loading: boolean;
  refunding: boolean;
  onRefund: (payment: PaymentRecord) => void;
  onClose: () => void;
}) {
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    setConfirmingRefund(false);
  }, [payment?.id]);

  if (!payment) return null;
  const method = methodStyles[payment.provider] ?? methodStyles.STRIPE;
  const methodLabel = getMethodLabel(payment.provider, t);
  const subtotal = payment.breakdown?.subtotal ?? Math.max(payment.amount - payment.tipAmount, 0);
  const net = payment.breakdown?.net ?? payment.amount - payment.platformFeeAmount;
  const statusKey = `payments.${payment.status.toLowerCase()}` as const;
  const timeline = payment.timeline ?? [
    { label: t('payments.paymentStatus', { status: t(statusKey as any) }), at: payment.createdAt },
    { label: t('payments.sessionAttached'), at: payment.tableSessionId },
  ];

  return (
    <div className="fixed inset-0 z-[1000]">
      <button
        type="button"
        className="absolute inset-0 bg-background/65 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t('payments.closeDetail')}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl">
        <div className="border-b border-border p-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:text-foreground"
            aria-label={t('payments.close')}
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">{t('payments.transaction')}</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-foreground">{formatMoney(payment.amount, payment.currency)}</p>
          <p className="text-sm font-black tracking-tight text-foreground">{formatDateTime(payment.createdAt, i18n.language)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-black', statusStyles[payment.status])}>
              {t(`payments.${payment.status.toLowerCase()}` as any)}
            </span>
            <span className="font-mono text-sm font-medium text-muted-foreground">{shortId(payment.stripePaymentIntentId ?? payment.providerReference ?? payment.id)}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {loading && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-bold text-muted-foreground">
              {t('payments.loadingDetail')}
            </div>
          )}

          <section>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{t('payments.order')}</p>
            <p className="text-sm font-medium text-foreground">
              <span className="font-mono font-black text-primary">{shortId(payment.tableSessionId)}</span>
              <span className="mx-1">.</span>
              {payment.tableNumber ?? t('payments.noTable')}
              <span className="mx-1">.</span>
              {payment.customerName ?? t('dashboard.walkIn')}
            </p>
          </section>

          {'orders' in payment && payment.orders && payment.orders.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{t('payments.items')}</p>
              <div className="space-y-2">
                {payment.orders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-border bg-muted/25 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-black text-foreground">
                          {order.source === 'POS'
                            ? order.staffName ?? t('dashboard.staff', 'Staff')
                            : order.customerName || t('dashboard.walkIn')}
                        </p>
                        {order.source === 'POS' ? (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200">
                            {t('dashboard.staff', 'Staff')}
                          </span>
                        ) : (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200">
                            {t('orders.selfOrder', 'Self')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-black text-muted-foreground">{formatMoney(order.totalPrice, payment.currency)}</p>
                    </div>
                    {order.items.map((item, index) => (
                      <div key={`${order.id}-${item.name}-${index}`} className="flex items-start justify-between gap-3 py-1 text-sm">
                        <span className="min-w-0 font-medium text-foreground">
                          {item.quantity}x {item.name}
                          {item.options.length > 0 && (
                            <span className="block truncate text-xs text-muted-foreground">{item.options.join(', ')}</span>
                          )}
                        </span>
                        <span className="shrink-0 font-bold text-muted-foreground">{formatMoney(item.unitPrice * item.quantity, payment.currency)}</span>
                      </div>
                    ))}
                    {order.specialRequests && (
                      <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs font-medium text-amber-800 dark:bg-amber-400/10 dark:text-amber-100">
                        {order.specialRequests}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{t('payments.method')}</p>
            <div className="flex items-center gap-2">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', method.tone)}>
                <method.Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-black text-foreground">{methodLabel}</span>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{t('payments.breakdown')}</p>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <BreakdownRow label={t('payments.subtotal')} value={formatMoney(subtotal, payment.currency)} />
              <BreakdownRow label={t('payments.tip')} value={(payment.breakdown?.tip ?? payment.tipAmount) > 0 ? formatMoney(payment.breakdown?.tip ?? payment.tipAmount, payment.currency) : '-'} />
              <BreakdownRow label={t('payments.totalCharged')} value={formatMoney(payment.breakdown?.totalCharged ?? payment.amount, payment.currency)} />
              <BreakdownRow label={t('payments.platformFee')} value={`-${formatMoney(payment.breakdown?.platformFee ?? payment.platformFeeAmount, payment.currency)}`} />
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-black text-primary">{t('payments.netToYou')}</span>
                <span className="text-lg font-black text-primary">{formatMoney(net, payment.currency)}</span>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{t('payments.timeline')}</p>
            <div className="space-y-4">
              {timeline.map((item, index) => (
                <TimelineItem
                  key={`${item.label}-${index}`}
                  active={index === 0}
                  icon={index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
                  title={translateTimelineLabel(item.label, t)}
                  time={formatDateTime(item.at, i18n.language)}
                />
              ))}
              {payment.status === 'REFUNDED' && <TimelineItem icon={<RefreshCcw className="h-3.5 w-3.5" />} title={t('payments.refundRecorded')} time={formatDateTime(payment.createdAt, i18n.language)} />}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-5">
          {confirmingRefund ? (
            <>
              <span className="flex h-10 items-center text-sm font-medium text-foreground">
                {t('payments.refundConfirm', { amount: formatMoney(payment.amount, payment.currency) })}
              </span>
              <button
                type="button"
                onClick={() => setConfirmingRefund(false)}
                disabled={refunding}
                className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                {t('payments.cancel')}
              </button>
              <button
                type="button"
                onClick={() => { onRefund(payment); setConfirmingRefund(false); }}
                disabled={refunding}
                className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCcw className="h-4 w-4" />
                {refunding ? t('payments.refunding') : t('payments.confirmRefund')}
              </button>
            </>
          ) : (
            <>
              {payment.provider === 'STRIPE' && (
                <button
                  type="button"
                  onClick={() => openStripePayment(payment.stripePaymentIntentId)}
                  disabled={!payment.stripePaymentIntentId}
                  className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('payments.viewOnStripe')}
                </button>
              )}
              <button type="button" onClick={() => exportPaymentsCsv([payment])} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted">
                <Download className="h-4 w-4" />
                {t('payments.receipt')}
              </button>
              {payment.status === 'SUCCEEDED' && (
                <button
                  type="button"
                  onClick={() => setConfirmingRefund(true)}
                  className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {t('payments.refund')}
                </button>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="font-black text-foreground">{value}</span>
    </div>
  );
}

function TimelineItem({ active, icon, title, time }: { active?: boolean; icon: React.ReactNode; title: string; time: string }) {
  return (
    <div className="flex gap-3">
      <span className={cn('mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border', active ? 'border-primary bg-primary text-white' : 'border-border bg-background text-muted-foreground')}>
        {icon}
      </span>
      <div>
        <p className="text-sm font-black text-foreground">{title}</p>
        <p className="text-xs font-medium text-muted-foreground">{time}</p>
      </div>
    </div>
  );
}
