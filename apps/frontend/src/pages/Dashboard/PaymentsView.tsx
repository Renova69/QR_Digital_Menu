import { useContext, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Banknote,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  Receipt,
  RefreshCcw,
  Search,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import {
  getPaymentDetail,
  getPaymentHistory,
  getPaymentOverview,
  getPaymentPayouts,
  getPaymentSettings,
  refundPayment,
} from '../../lib/api';
import RestaurantContext from '../../context/RestaurantContext';
import { cn } from '../../lib/utils';

type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
type PaymentMethod = 'STRIPE' | 'MYPOS' | 'CASH';
type PaymentTab = 'transactions' | 'payouts' | 'refunds' | 'settings';

interface PaymentRecord {
  id: string;
  amount: number;
  tipAmount: number;
  platformFeeAmount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string | null;
  provider: PaymentMethod;
  createdAt: string;
  tableNumber?: string | null;
  customerName?: string | null;
  tableSessionId: string;
}

interface PaymentDetail extends PaymentRecord {
  table?: { id: string; name: string } | null;
  orders?: Array<{
    id: string;
    customerName: string;
    customerPhone?: string | null;
    totalPrice: number;
    status: string;
    specialRequests?: string | null;
    createdAt: string;
    items: Array<{ name: string; quantity: number; unitPrice: number; options: string[] }>;
  }>;
  breakdown?: {
    subtotal: number;
    tip: number;
    totalCharged: number;
    platformFee: number;
    net: number;
  };
  timeline?: Array<{ label: string; at: string }>;
}

const statusOptions: Array<{ value: '' | PaymentStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'SUCCEEDED', label: 'Succeeded' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const methodOptions: Array<{ value: '' | PaymentMethod; label: string }> = [
  { value: '', label: 'All methods' },
  { value: 'STRIPE', label: 'Stripe' },
  { value: 'MYPOS', label: 'Card' },
  { value: 'CASH', label: 'Cash' },
];

const tabs: Array<{ id: PaymentTab; label: string }> = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'settings', label: 'Settings' },
];

const statusStyles: Record<PaymentStatus, string> = {
  SUCCEEDED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200',
  REFUNDED: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
};

const methodStyles: Record<PaymentMethod, { label: string; Icon: typeof CreditCard; tone: string }> = {
  STRIPE: { label: 'Stripe', Icon: Smartphone, tone: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200' },
  MYPOS: { label: 'Card', Icon: CreditCard, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200' },
  CASH: { label: 'Cash', Icon: Banknote, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' },
};

function formatMoney(value = 0, currency = 'EUR') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function shortId(value?: string | null) {
  if (!value) return 'manual';
  return value.length > 12 ? `${value.slice(0, 7)}...${value.slice(-4)}` : value;
}

function exportPaymentsCsv(payments: PaymentRecord[]) {
  const header = ['id', 'date', 'customer', 'table', 'method', 'amount', 'tip', 'fee', 'net', 'status'];
  const rows = payments.map((payment) => [
    payment.id,
    new Date(payment.createdAt).toISOString(),
    payment.customerName ?? '',
    payment.tableNumber ?? '',
    payment.provider,
    payment.amount.toFixed(2),
    payment.tipAmount.toFixed(2),
    payment.platformFeeAmount.toFixed(2),
    (payment.amount - payment.platformFeeAmount).toFixed(2),
    payment.status,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function openStripeAccount(accountId?: string | null) {
  if (!accountId) return;
  window.open(`https://dashboard.stripe.com/connect/accounts/${accountId}`, '_blank', 'noopener,noreferrer');
}

function openStripePayment(paymentIntentId?: string | null) {
  if (!paymentIntentId) return;
  window.open(`https://dashboard.stripe.com/payments/${paymentIntentId}`, '_blank', 'noopener,noreferrer');
}

const PaymentsView = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PaymentTab>('transactions');
  const [statusFilter, setStatusFilter] = useState<'' | PaymentStatus>('');
  const [methodFilter, setMethodFilter] = useState<'' | PaymentMethod>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const limit = 20;

  const effectiveStatus = activeTab === 'refunds' ? 'REFUNDED' : statusFilter || undefined;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['paymentHistory', activeRestaurant?.id, effectiveStatus, page],
    queryFn: () =>
      getPaymentHistory(activeRestaurant.id, {
        status: effectiveStatus,
        page,
        limit,
      }),
    enabled: !!activeRestaurant?.id,
  });

  const { data: overview } = useQuery({
    queryKey: ['paymentOverview', activeRestaurant?.id],
    queryFn: () => getPaymentOverview(activeRestaurant.id),
    enabled: !!activeRestaurant?.id,
  });

  const { data: payouts } = useQuery({
    queryKey: ['paymentPayouts', activeRestaurant?.id],
    queryFn: () => getPaymentPayouts(activeRestaurant.id),
    enabled: !!activeRestaurant?.id && activeTab === 'payouts',
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ['paymentSettings', activeRestaurant?.id],
    queryFn: () => getPaymentSettings(activeRestaurant.id),
    enabled: !!activeRestaurant?.id && activeTab === 'settings',
  });

  const { data: selectedPaymentDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ['paymentDetail', selectedPayment?.id],
    queryFn: () => getPaymentDetail(selectedPayment!.id),
    enabled: !!selectedPayment?.id,
  });

  const refundMutation = useMutation({
    mutationFn: (paymentId: string) => refundPayment(paymentId, { reason: 'Dashboard refund' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentHistory', activeRestaurant?.id] });
      queryClient.invalidateQueries({ queryKey: ['paymentOverview', activeRestaurant?.id] });
      queryClient.invalidateQueries({ queryKey: ['paymentPayouts', activeRestaurant?.id] });
      if (selectedPayment?.id) {
        queryClient.invalidateQueries({ queryKey: ['paymentDetail', selectedPayment.id] });
      }
    },
  });

  const payments = (data?.data ?? []) as PaymentRecord[];
  const meta = data?.meta ?? { total: 0, page: 1, limit };

  const filteredPayments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((payment) => {
      const methodMatches = !methodFilter || payment.provider === methodFilter;
      const queryMatches =
        !query ||
        [
          payment.id,
          payment.stripePaymentIntentId,
          payment.customerName,
          payment.tableNumber,
          payment.tableSessionId,
          payment.provider,
          payment.status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return methodMatches && queryMatches;
    });
  }, [methodFilter, payments, search]);

  const metrics = useMemo(() => {
    const successful = payments.filter((payment) => payment.status === 'SUCCEEDED');
    const refunds = payments.filter((payment) => payment.status === 'REFUNDED');
    const totalCollected = overview?.metrics.totalCollected ?? successful.reduce((sum, payment) => sum + payment.amount, 0);
    const tipsCollected = overview?.metrics.tipsCollected ?? successful.reduce((sum, payment) => sum + payment.tipAmount, 0);
    const fees = overview?.metrics.platformFees ?? successful.reduce((sum, payment) => sum + payment.platformFeeAmount, 0);
    const average = successful.length ? totalCollected / successful.length : 0;
    const refundAmount = overview?.metrics.refundsIssued ?? refunds.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      totalCollected,
      tipsCollected,
      fees,
      average: overview?.metrics.averageTransaction ?? average,
      refundAmount,
      successfulCount: overview?.metrics.successfulTransactions ?? successful.length,
      refundCount: overview?.metrics.refundsCount ?? refunds.length,
      netCollected: overview?.metrics.netCollected ?? totalCollected - fees,
    };
  }, [overview, payments]);

  const methodTotals = useMemo(() => {
    const source = overview?.methodTotals?.length
      ? overview.methodTotals
      : Object.entries(
          payments
            .filter((payment) => payment.status === 'SUCCEEDED')
            .reduce<Record<string, number>>((acc, payment) => {
              acc[payment.provider] = (acc[payment.provider] ?? 0) + payment.amount;
              return acc;
            }, {}),
        ).map(([method, amount]) => ({ method, amount, fees: 0, count: 0 }));
    return source;
  }, [overview, payments]);

  const account = overview?.account ?? activeRestaurant;
  const stripeMissing = account?.paymentsEnabled && !account?.stripeOnboarded;
  const feePercent = Number(account?.platformFeePercent ?? 0);

  return (
    <section className="min-h-full bg-background text-foreground">
      <div className="mb-5 flex flex-col gap-3 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black leading-tight text-foreground">Payments</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Stripe Connect, table sessions, fees, refunds, and payouts.
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-4 rounded-lg border border-border bg-primary/5 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-[0_12px_24px_-14px_rgba(110,86,248,0.9)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-primary">stripe</p>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-black',
                  account?.stripeOnboarded
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
                )}
              >
                {account?.stripeOnboarded ? 'Connected' : 'Needs setup'}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-muted-foreground">
              Account <span className="font-bold text-foreground">{account?.stripeAccountId ?? 'not connected'}</span>
              <span className="mx-1">.</span>
              Platform fee <span className="font-bold text-foreground">{feePercent ? `${feePercent}%` : 'not set'}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openStripeAccount(account?.stripeAccountId)}
            disabled={!account?.stripeAccountId}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            View on Stripe
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payouts')}
            className="flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground shadow-sm transition hover:bg-muted"
          >
            Manage payouts
          </button>
        </div>
      </div>

      {stripeMissing && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-200" />
          <div>
            <p className="text-sm font-black text-amber-800 dark:text-amber-100">Stripe not connected</p>
            <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-200">
              Connect Stripe in Settings to start accepting phone payments.
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total collected" value={formatMoney(metrics.totalCollected)} detail={`${metrics.successfulCount} successful transactions`} trend="+ live" tone="text-emerald-600" />
        <MetricCard label="Avg. transaction" value={formatMoney(metrics.average)} detail="Current page average" trend="gross" tone="text-emerald-600" />
        <MetricCard label="Tips collected" value={formatMoney(metrics.tipsCollected)} detail="Included in total charged" trend="tips" tone="text-emerald-600" />
        <MetricCard label="Platform fees" value={formatMoney(metrics.fees)} detail={feePercent ? `${feePercent}% configured` : 'Fee not configured'} />
        <MetricCard label="Refunds issued" value={formatMoney(metrics.refundAmount)} detail={`${metrics.refundCount} refunds on page`} trend={metrics.refundAmount ? 'review' : 'clear'} tone={metrics.refundAmount ? 'text-red-600' : 'text-emerald-600'} />
      </div>

      <div className="mb-5 overflow-x-auto hide-scrollbar">
        <div className="inline-flex min-w-max items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
                setSelectedPayment(null);
              }}
              className={cn(
                'h-9 rounded-md px-5 text-sm font-black transition active:scale-[0.98]',
                activeTab === tab.id ? 'bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]' : 'text-foreground hover:bg-muted',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'transactions' || activeTab === 'refunds' ? (
        <>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by payment ID, table, customer, method..."
                className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            {activeTab === 'transactions' && (
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as '' | PaymentStatus);
                  setPage(1);
                }}
                className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/15"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            )}
            <select
              value={methodFilter}
              onChange={(event) => setMethodFilter(event.target.value as '' | PaymentMethod)}
              className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/15"
            >
              {methodOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => exportPaymentsCsv(filteredPayments)}
              disabled={filteredPayments.length === 0}
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-sm font-black text-foreground shadow-sm transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          <PaymentTable
            payments={filteredPayments}
            loading={isLoading}
            error={isError}
            emptyLabel={activeTab === 'refunds' ? 'No refunds issued yet' : 'No payments yet'}
            onSelect={setSelectedPayment}
          />

          {meta.total > limit && (
            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm font-bold text-muted-foreground">
                Page {page} of {Math.ceil(meta.total / limit)}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= Math.ceil(meta.total / limit)}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : activeTab === 'payouts' ? (
        <PayoutsPanel methodTotals={payouts?.methodTotals ?? methodTotals} total={payouts?.estimatedBalance ?? metrics.netCollected} note={payouts?.note} />
      ) : (
        <SettingsPanel restaurant={paymentSettings ?? account} feePercent={feePercent} />
      )}

      <PaymentDrawer
        payment={(selectedPaymentDetail as PaymentDetail | undefined) ?? selectedPayment}
        loading={isDetailLoading}
        refunding={refundMutation.isPending}
        onRefund={(payment) => {
          const confirmed = window.confirm(`Refund ${formatMoney(payment.amount, payment.currency)} for this payment?`);
          if (confirmed) refundMutation.mutate(payment.id);
        }}
        onClose={() => setSelectedPayment(null)}
      />
    </section>
  );
};

function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = 'text-muted-foreground',
}: {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-black tracking-tight text-foreground">{value}</p>
        {trend && <span className={cn('text-xs font-black', tone)}>{trend}</span>}
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{detail}</p>
    </div>
  );
}

function PaymentTable({
  payments,
  loading,
  error,
  emptyLabel,
  onSelect,
}: {
  payments: PaymentRecord[];
  loading: boolean;
  error: boolean;
  emptyLabel: string;
  onSelect: (payment: PaymentRecord) => void;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {[...Array(7)].map((_, index) => (
          <div key={index} className="h-[60px] animate-pulse border-b border-border last:border-b-0 bg-muted/40" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-border bg-card text-sm font-bold text-muted-foreground">
        Failed to load payment history.
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <CreditCard className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-black text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="bg-muted/45">
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Transaction</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Customer</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Method</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Tip</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Fee</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Net</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">Status</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((payment) => {
              const method = methodStyles[payment.provider] ?? methodStyles.STRIPE;
              const net = payment.amount - payment.platformFeeAmount;
              return (
                <tr
                  key={payment.id}
                  onClick={() => onSelect(payment)}
                  className="cursor-pointer transition hover:bg-muted/35"
                >
                  <td className="px-4 py-4">
                    <p className="font-mono text-sm font-black text-foreground">{shortId(payment.stripePaymentIntentId ?? payment.id)}</p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {payment.tableNumber ?? 'No table'} . {formatDateTime(payment.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-foreground">{payment.customerName ?? 'Walk-in'}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', method.tone)}>
                        <method.Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-black text-foreground">{method.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-black text-foreground">{formatMoney(payment.amount, payment.currency)}</td>
                  <td className="px-4 py-4 text-sm font-bold text-muted-foreground">
                    {payment.tipAmount > 0 ? formatMoney(payment.tipAmount, payment.currency) : '-'}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-muted-foreground">-{formatMoney(payment.platformFeeAmount, payment.currency)}</td>
                  <td className="px-4 py-4 text-sm font-black text-foreground">{formatMoney(net, payment.currency)}</td>
                  <td className="px-4 py-4">
                    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-black', statusStyles[payment.status])}>
                      {payment.status === 'SUCCEEDED' ? 'Succeeded' : payment.status[0] + payment.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayoutsPanel({
  methodTotals,
  total,
  note,
}: {
  methodTotals: Array<{ method: string; amount: number; fees?: number; count?: number }>;
  total: number;
  note?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">Payout balance</p>
        <p className="mt-3 text-4xl font-black tracking-tight text-foreground">{formatMoney(Math.max(total, 0))}</p>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          Estimated net from successful transactions after platform fees.
        </p>
        <div className="mt-5 space-y-3">
          {methodTotals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm font-bold text-muted-foreground">No settled method totals yet.</p>
          ) : (
            methodTotals.map((item) => (
              <div key={item.method} className="flex items-center justify-between rounded-lg border border-border bg-muted/25 p-3">
                <div>
                  <span className="text-sm font-black text-foreground">{methodStyles[item.method as PaymentMethod]?.label ?? item.method}</span>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {item.count ?? 0} tx{item.fees ? ` . ${formatMoney(item.fees)} fees` : ''}
                  </p>
                </div>
                <span className="text-sm font-black text-foreground">{formatMoney(item.amount)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">Schedule</p>
        <div className="mt-4 space-y-3 text-sm font-medium text-muted-foreground">
          <p>{note ?? 'Stripe payout timing is managed in Stripe Connect.'}</p>
          <p>Use the Stripe dashboard to update bank details, payout cadence, and account verification.</p>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ restaurant, feePercent }: { restaurant: any; feePercent: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SettingCard label="Payment collection" value={restaurant?.paymentsEnabled ? 'Enabled' : 'Disabled'} detail="Controlled from dashboard payment settings." active={restaurant?.paymentsEnabled} />
      <SettingCard label="Stripe Connect" value={restaurant?.stripeOnboarded ? 'Connected' : 'Incomplete'} detail={restaurant?.stripeAccountId ?? 'No Stripe account linked'} active={restaurant?.stripeOnboarded} />
      <SettingCard label="Platform fee" value={feePercent ? `${feePercent}%` : 'Not set'} detail="Used to calculate platform fees on Stripe payments." active={feePercent > 0} />
    </div>
  );
}

function SettingCard({ label, value, detail, active }: { label: string; value: string; detail: string; active: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className={cn('h-2.5 w-2.5 rounded-full', active ? 'bg-emerald-500' : 'bg-amber-500')} />
        <p className="text-xl font-black text-foreground">{value}</p>
      </div>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{detail}</p>
    </div>
  );
}

function PaymentDrawer({
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
  if (!payment) return null;
  const method = methodStyles[payment.provider] ?? methodStyles.STRIPE;
  const subtotal = payment.breakdown?.subtotal ?? Math.max(payment.amount - payment.tipAmount, 0);
  const net = payment.breakdown?.net ?? payment.amount - payment.platformFeeAmount;
  const timeline = payment.timeline ?? [
    { label: `Payment ${payment.status.toLowerCase()}`, at: payment.createdAt },
    { label: 'Session attached', at: payment.tableSessionId },
  ];

  return (
    <div className="fixed inset-0 z-[1000]">
      <button
        type="button"
        className="absolute inset-0 bg-background/65 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close transaction detail"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col border-l border-border bg-background shadow-2xl">
        <div className="border-b border-border p-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Transaction</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-foreground">{formatMoney(payment.amount, payment.currency)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-black', statusStyles[payment.status])}>
              {payment.status === 'SUCCEEDED' ? 'Succeeded' : payment.status[0] + payment.status.slice(1).toLowerCase()}
            </span>
            <span className="font-mono text-sm font-medium text-muted-foreground">{shortId(payment.stripePaymentIntentId ?? payment.id)}</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {loading && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-bold text-muted-foreground">
              Loading full payment details...
            </div>
          )}

          <section>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Order</p>
            <p className="text-sm font-medium text-foreground">
              <span className="font-mono font-black text-primary">{shortId(payment.tableSessionId)}</span>
              <span className="mx-1">.</span>
              {payment.tableNumber ?? 'No table'}
              <span className="mx-1">.</span>
              {payment.customerName ?? 'Walk-in'}
            </p>
          </section>

          {'orders' in payment && payment.orders && payment.orders.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Items</p>
              <div className="space-y-2">
                {payment.orders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-border bg-muted/25 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-xs font-black text-foreground">{order.customerName || 'Walk-in'}</p>
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
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Method</p>
            <div className="flex items-center gap-2">
              <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', method.tone)}>
                <method.Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-black text-foreground">{method.label}</span>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Breakdown</p>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <BreakdownRow label="Subtotal" value={formatMoney(subtotal, payment.currency)} />
              <BreakdownRow label="Tip" value={(payment.breakdown?.tip ?? payment.tipAmount) > 0 ? formatMoney(payment.breakdown?.tip ?? payment.tipAmount, payment.currency) : '-'} />
              <BreakdownRow label="Total charged" value={formatMoney(payment.breakdown?.totalCharged ?? payment.amount, payment.currency)} />
              <BreakdownRow label="Platform fee" value={`-${formatMoney(payment.breakdown?.platformFee ?? payment.platformFeeAmount, payment.currency)}`} />
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-black text-primary">Net to you</span>
                <span className="text-lg font-black text-primary">{formatMoney(net, payment.currency)}</span>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Timeline</p>
            <div className="space-y-4">
              {timeline.map((item, index) => (
                <TimelineItem
                  key={`${item.label}-${index}`}
                  active={index === 0}
                  icon={index === 0 ? <ShieldCheck className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
                  title={item.label}
                  time={Number.isNaN(new Date(item.at).getTime()) ? item.at : formatDateTime(item.at)}
                />
              ))}
              {payment.status === 'REFUNDED' && <TimelineItem icon={<RefreshCcw className="h-3.5 w-3.5" />} title="Refund recorded" time={formatDateTime(payment.createdAt)} />}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-5">
          <button
            type="button"
            onClick={() => openStripePayment(payment.stripePaymentIntentId)}
            disabled={!payment.stripePaymentIntentId}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ExternalLink className="h-4 w-4" />
            View on Stripe
          </button>
          <button type="button" onClick={() => exportPaymentsCsv([payment])} className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted">
            <Download className="h-4 w-4" />
            Receipt
          </button>
          {payment.status === 'SUCCEEDED' && (
            <button
              type="button"
              onClick={() => onRefund(payment)}
              disabled={refunding}
              className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="h-4 w-4" />
              {refunding ? 'Refunding...' : 'Refund'}
            </button>
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

export default PaymentsView;
