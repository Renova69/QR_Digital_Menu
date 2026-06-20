import { Banknote, CreditCard, Smartphone } from 'lucide-react';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'STRIPE' | 'EPAY' | 'BORICA' | 'MYPOS' | 'CASH';

export interface PaymentRecord {
  id: string;
  amount: number;
  tipAmount: number;
  platformFeeAmount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId?: string | null;
  providerReference?: string | null;
  providerStatus?: string | null;
  provider: PaymentMethod;
  createdAt: string;
  tableNumber?: string | null;
  customerName?: string | null;
  tableSessionId: string;
  breakdown?: {
    subtotal: number;
    tip: number;
    totalCharged: number;
    platformFee: number;
    net: number;
  };
  timeline?: Array<{ label: string; at: string }>;
}

export interface PaymentDetail extends PaymentRecord {
  table?: { id: string; name: string } | null;
  orders?: Array<{
    id: string;
    customerName: string;
    customerPhone?: string | null;
    totalPrice: number;
    status: string;
    specialRequests?: string | null;
    createdAt: string;
    source?: 'CUSTOMER' | 'POS';
    staffName?: string | null;
    items: Array<{ name: string; quantity: number; unitPrice: number; options: string[] }>;
  }>;
}

export const statusStyles: Record<PaymentStatus, string> = {
  SUCCEEDED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200',
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200',
  REFUNDED: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200',
};

export const methodStyles: Record<PaymentMethod, { label: string; Icon: typeof CreditCard; tone: string }> = {
  STRIPE: { label: 'Stripe', Icon: Smartphone, tone: 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200' },
  EPAY: { label: 'ePay.bg', Icon: CreditCard, tone: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-200' },
  BORICA: { label: 'BORICA', Icon: CreditCard, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200' },
  MYPOS: { label: 'myPOS', Icon: CreditCard, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200' },
  CASH: { label: 'Cash', Icon: Banknote, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' },
};

export function formatMoney(value = 0, currency = 'EUR') {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency || 'EUR',
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDateTime(value?: string | null, locale: string = 'en-US') {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function shortId(value?: string | null) {
  if (!value) return 'manual';
  return value.length > 12 ? `${value.slice(0, 7)}...${value.slice(-4)}` : value;
}

/** Neutralise CSV formula injection: cells starting with = + - @ tab or CR
 *  would be evaluated by spreadsheet apps as formulas. Prefix with a single
 *  quote so the value is treated as a literal string.
 *  See OWASP: CSV Injection. */
function csvSafeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function exportPaymentsCsv(payments: PaymentRecord[]) {
  const header = ['id', 'date', 'customer', 'table', 'method', 'amount', 'tip', 'fee', 'net', 'status'];
  const rows = payments.map((payment) => [
    payment.id,
    (() => {
      const date = new Date(payment.createdAt);
      return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    })(),
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
    .map((row) =>
      row
        .map((cell) => `"${csvSafeCell(String(cell)).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function openStripePayment(paymentIntentId?: string | null) {
  if (!paymentIntentId) return;
  window.open(`https://dashboard.stripe.com/payments/${paymentIntentId}`, '_blank', 'noopener,noreferrer');
}
