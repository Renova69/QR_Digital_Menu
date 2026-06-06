import { useState, useEffect, useRef } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getSessionBill, createCheckout, type CheckoutProvider } from '../../lib/api';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X } from 'lucide-react';
import { formatEuro, formatBgn } from '../../lib/currency';

const stripePublishableKey = (import.meta as any).env
  .VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

if (!stripePublishableKey) {
  // Fix C-6 — do not silently fall back to an empty key; warn so the missing
  // configuration is visible in the console and the component can show an error.
  console.warn(
    '[PaymentModal] VITE_STRIPE_PUBLISHABLE_KEY is missing — Stripe will not initialize and payment is disabled.',
  );
}

// loadStripe(null) resolves to null, which the component handles with a visible
// error state instead of a no-op submit.
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.resolve(null);

interface PaymentModalProps {
  sessionToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'tip' | 'pay' | 'redirect' | 'done';

interface BillItem {
  name: string;
  quantity: number;
  unitPrice: number;
  selectedOptions: any[];
}

interface BillOrder {
  id: string;
  source: 'CUSTOMER' | 'POS';
  staffName: string | null;
  staffRole: string | null;
  totalPrice: number;
  items: BillItem[];
}

interface BillData {
  orders: BillOrder[];
  subtotal: number;
  tipsEnabled: boolean;
  tipOptions: number[];
  paymentProviders: CheckoutProvider[];
  restaurantId?: string;
}

type StripePaymentState = {
  provider: 'STRIPE';
  clientSecret: string;
  total: number;
  tipAmount: number;
};

type HostedFormPaymentState = {
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: 'POST';
  fields: Record<string, string>;
};

type EpayPaymentState = HostedFormPaymentState & { provider: 'EPAY' };

type BoricaPaymentState = HostedFormPaymentState & { provider: 'BORICA' };

type PaymentState = StripePaymentState | EpayPaymentState | BoricaPaymentState;

function getSourceLabel(order: BillOrder): string {
  if (order.source === 'CUSTOMER') return 'You';
  const rawName = order.staffName ?? '';
  const name = rawName.split(' ')[0] || rawName || 'Staff';
  const role = order.staffRole ? String(order.staffRole) : '';
  const roleName = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : 'Staff';
  return `${roleName}: ${name}`;
}

function showGroupHeaders(orders: BillOrder[]): boolean {
  return orders.some((o) => o.source === 'POS');
}

function PaymentForm({
  clientSecret,
  total,
  tipAmount,
  onSuccess,
  onClose,
}: {
  clientSecret: string;
  total: number;
  tipAmount: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Fix C-6 — if Stripe failed to initialize (missing key), surface a visible
    // error instead of silently doing nothing.
    if (!stripe || !elements) {
      setError(
        t(
          'payment.stripeUnavailable',
          'Payment is currently unavailable — please contact staff.',
        ),
      );
      return;
    }

    setProcessing(true);
    setError(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message || t('payment.paymentFailed'));
      setProcessing(false);
    } else if (result.paymentIntent?.status === 'succeeded') {
      onSuccess();
    } else {
      // Fix H-5 — any other status (processing, requires_action, etc.) must not
      // leave the form locked with no feedback.
      setError(
        t('payment.unexpectedStatus', 'Payment status unclear — please contact staff'),
      );
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-sm text-muted-foreground space-y-1">
        <div className="flex justify-between">
          <span>{t('payment.subtotal')}</span>
          <div className="text-right">
            <div>{formatEuro(total - tipAmount)}</div>
            <span className="text-xs text-muted-foreground">{formatBgn(total - tipAmount)}</span>
          </div>
        </div>
        {tipAmount > 0 && (
          <div className="flex justify-between">
            <span>{t('payment.tip')}</span>
            <div className="text-right">
              <div>{formatEuro(tipAmount)}</div>
              <span className="text-xs text-muted-foreground">{formatBgn(tipAmount)}</span>
            </div>
          </div>
        )}
        <div className="flex justify-between font-semibold text-foreground border-t pt-1">
          <span>{t('payment.total')}</span>
          <div className="text-right">
            <div>{formatEuro(total)}</div>
            <span className="text-xs text-muted-foreground">{formatBgn(total)}</span>
          </div>
        </div>
      </div>

      <PaymentElement />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={processing}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" disabled={processing || !stripe}>
          {processing ? t('payment.processing') : `${t('payment.pay')} ${formatEuro(total)}`}
        </Button>
      </div>
    </form>
  );
}

export function PaymentModal({ sessionToken, onClose, onSuccess }: PaymentModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('tip');
  const [bill, setBill] = useState<BillData | null>(null);
  const [selectedTip, setSelectedTip] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<CheckoutProvider>('STRIPE');
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fix H-8 — a failed bill load must show an error with retry, not silently close.
  const [billError, setBillError] = useState<string | null>(null);
  const [billReloadKey, setBillReloadKey] = useState(0);
  const epayFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBillError(null);
    getSessionBill(sessionToken)
      .then((data) => { if (!cancelled) setBill(data); })
      .catch(() => {
        if (!cancelled) {
          setBillError(
            t('payment.billLoadError', 'Could not load bill — please try again'),
          );
        }
      });
    return () => { cancelled = true; };
  }, [sessionToken, billReloadKey, t]);

  useEffect(() => {
    if (!bill) return;
    const providers = bill.paymentProviders ?? [];
    if (providers.length > 0 && !providers.includes(selectedProvider)) {
      setSelectedProvider(providers[0]);
    }
  }, [bill, selectedProvider]);

  useEffect(() => {
    if (step !== 'redirect' || (payment?.provider !== 'EPAY' && payment?.provider !== 'BORICA')) return;
    const timer = window.setTimeout(() => epayFormRef.current?.submit(), 150);
    return () => window.clearTimeout(timer);
  }, [payment, step]);

  const retryBillFetch = () => {
    setBill(null);
    setBillError(null);
    setBillReloadKey((k) => k + 1);
  };

  const rawTipPercent = customTip !== '' ? parseFloat(customTip) || 0 : selectedTip;
  // Fix M-3 — clamp tip to a sane 0–100 range before it reaches the API.
  const activeTipPercent = Math.max(0, Math.min(100, rawTipPercent));
  const availableProviders = bill?.paymentProviders ?? [];
  const hasPaymentProvider = availableProviders.length > 0;
  const effectiveProvider: CheckoutProvider =
    hasPaymentProvider && availableProviders.includes(selectedProvider)
      ? selectedProvider
      : availableProviders[0] ?? selectedProvider;

  const handleContinueToPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createCheckout(sessionToken, {
        provider: effectiveProvider,
        tipPercent: activeTipPercent,
      });
      setPayment(result);
      setStep(result.provider === 'EPAY' || result.provider === 'BORICA' ? 'redirect' : 'pay');
    } catch (e: any) {
      setError(e.response?.data?.message || t('payment.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-card text-card-foreground rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {step === 'tip' && t('payment.yourBill')}
            {step === 'pay' && t('payment.payment')}
            {step === 'redirect' && t('payment.redirecting', 'Redirecting')}
            {step === 'done' && t('payment.thankYou')}
          </h2>
          {/* When payment is done, X clears the session (same as "Back to Menu") */}
          <button onClick={step === 'done' ? onSuccess : onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {/* Fix H-8 — bill load failure: visible error + retry, modal stays open */}
        {step === 'tip' && billError && (
          <div className="space-y-4">
            <p className="text-red-500 text-sm">{billError}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" className="flex-1" onClick={retryBillFetch}>
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          </div>
        )}

        {step === 'tip' && !bill && !billError && (
          <p className="text-sm text-muted-foreground py-4">{t('payment.loading')}</p>
        )}

        {step === 'tip' && bill && (
          <div className="space-y-4">
            {/* Itemized order breakdown */}
            {bill.orders && showGroupHeaders(bill.orders) ? (
              <div className="mb-4 space-y-3">
                {bill.orders.map((order) => (
                  <div key={order.id}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                      {getSourceLabel(order) === 'You' ? '👤 You' : `👤 ${getSourceLabel(order)}`}
                    </p>
                    {order.items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-0.5">
                        <span className="text-gray-700">{item.name} ×{item.quantity}</span>
                        <span className="text-gray-700">
                          {formatEuro(item.unitPrice * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                <hr className="border-gray-200" />
              </div>
            ) : bill.orders && bill.orders.length > 0 ? (
              <div className="mb-4 space-y-1">
                {bill.orders.flatMap((order) =>
                  order.items.map((item, i) => (
                    <div key={`${order.id}-${i}`} className="flex justify-between text-sm py-0.5">
                      <span className="text-gray-700">{item.name} ×{item.quantity}</span>
                      <span className="text-gray-700">{formatEuro(item.unitPrice * item.quantity)}</span>
                    </div>
                  ))
                )}
                <hr className="border-gray-200" />
              </div>
            ) : null}
            <div>
              <p className="text-2xl font-bold">{formatEuro(bill.subtotal)}</p>
              <span className="text-xs text-muted-foreground">{formatBgn(bill.subtotal)}</span>
            </div>

            {bill.tipsEnabled && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('payment.addTip')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setSelectedTip(0); setCustomTip(''); }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === 0 && customTip === '' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                  >
                    {t('payment.noTip')}
                  </button>
                  {bill.tipOptions.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => { setSelectedTip(pct); setCustomTip(''); }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === pct && customTip === '' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{t('payment.custom')}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={customTip}
                    onChange={(e) => { setCustomTip(e.target.value); setSelectedTip(0); }}
                    placeholder="0"
                    className="w-16 px-2 py-1 border border-border rounded text-sm bg-background"
                  />
                  <span className="text-sm">%</span>
                </div>
                {activeTipPercent > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t('payment.tipAmount')}: {formatEuro(bill.subtotal * activeTipPercent / 100)}
                  </p>
                )}
              </div>
            )}

            {availableProviders.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('payment.paymentMethod', 'Payment method')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {availableProviders.map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => setSelectedProvider(provider)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        selectedProvider === provider
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:bg-muted'
                      }`}
                    >
                      {provider === 'EPAY' ? 'ePay.bg' : provider === 'BORICA' ? t('payment.cardBorica', 'Card (BORICA)') : t('payment.cardOnline', 'Card online')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!hasPaymentProvider && (
              <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded-lg">
                {t('payment.noProviders', 'Online payment is not configured for this restaurant.')}
              </p>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <Button className="w-full" onClick={handleContinueToPayment} disabled={loading || !hasPaymentProvider}>
              {loading
                ? t('payment.loading')
                : effectiveProvider === 'EPAY'
                  ? t('payment.continueToEpay', 'Continue to ePay.bg')
                  : effectiveProvider === 'BORICA'
                    ? t('payment.continueToBorica', 'Pay by card (BORICA)')
                    : t('payment.continue')}
            </Button>
          </div>
        )}

        {step === 'pay' && payment?.provider === 'STRIPE' && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: payment.clientSecret, appearance: { theme: 'stripe' } }}
          >
            <PaymentForm
              clientSecret={payment.clientSecret}
              total={payment.total}
              tipAmount={payment.tipAmount}
              onSuccess={() => setStep('done')}
              onClose={onClose}
            />
          </Elements>
        )}

        {step === 'redirect' && (payment?.provider === 'EPAY' || payment?.provider === 'BORICA') && (
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex justify-between font-semibold text-foreground">
                <span>{t('payment.total')}</span>
                <div className="text-right">
                  <div>{formatEuro(payment.total)}</div>
                  <span className="text-xs text-muted-foreground">{formatBgn(payment.total)}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {payment.provider === 'BORICA'
                ? t('payment.redirectingToBorica', 'Opening BORICA secure checkout...')
                : t('payment.redirectingToEpay', 'Opening ePay.bg secure checkout...')}
            </p>
            <form ref={epayFormRef} action={payment.action} method={payment.method}>
              {Object.entries(payment.fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <Button type="submit" className="w-full">
                {payment.provider === 'BORICA'
                  ? t('payment.openBorica', 'Open BORICA checkout')
                  : t('payment.openEpay', 'Open ePay.bg')}
              </Button>
            </form>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-lg font-medium">{t('payment.paymentReceived')}</p>
            <div>
              <p className="text-2xl font-bold">{formatEuro(payment?.total ?? 0)}</p>
              <span className="text-xs text-muted-foreground">{formatBgn(payment?.total ?? 0)}</span>
            </div>
            <Button className="w-full" onClick={onSuccess}>
              {t('payment.backToMenu')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
