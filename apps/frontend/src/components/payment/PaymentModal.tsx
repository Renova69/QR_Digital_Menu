import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getSessionBill, createPaymentIntent } from '../../lib/api';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X } from 'lucide-react';
import { formatEuro, formatBgn } from '../../lib/currency';

const stripePromise = loadStripe(
  (import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY || '',
);

interface PaymentModalProps {
  sessionToken: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'tip' | 'pay' | 'done';

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
  totalPrice: number;
  items: BillItem[];
}

interface BillData {
  orders: BillOrder[];
  subtotal: number;
  tipsEnabled: boolean;
  tipOptions: number[];
  restaurantId?: string;
}

function getSourceLabel(order: BillOrder): string {
  if (order.source === 'CUSTOMER') return 'You';
  const name = order.staffName ?? '';
  return name.split(' ')[0] || name || 'Staff';
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
    if (!stripe || !elements) return;

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
  const [payment, setPayment] = useState<{ clientSecret: string; total: number; tipAmount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSessionBill(sessionToken)
      .then((data) => { if (!cancelled) setBill(data); })
      .catch(() => { if (!cancelled) onClose(); });
    return () => { cancelled = true; };
  }, [sessionToken]);

  const activeTipPercent = customTip !== '' ? parseFloat(customTip) || 0 : selectedTip;

  const handleContinueToPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createPaymentIntent(sessionToken, activeTipPercent);
      setPayment({ clientSecret: result.clientSecret, total: result.total, tipAmount: result.tipAmount });
      setStep('pay');
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
            {step === 'done' && t('payment.thankYou')}
          </h2>
          {/* When payment is done, X clears the session (same as "Back to Menu") */}
          <button onClick={step === 'done' ? onSuccess : onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

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
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === 0 && customTip === '' ? 'bg-primary text-white border-primary' : 'border-border'}`}
                  >
                    {t('payment.noTip')}
                  </button>
                  {bill.tipOptions.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => { setSelectedTip(pct); setCustomTip(''); }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === pct && customTip === '' ? 'bg-primary text-white border-primary' : 'border-border'}`}
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

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <Button className="w-full" onClick={handleContinueToPayment} disabled={loading}>
              {loading ? t('payment.loading') : t('payment.continue')}
            </Button>
          </div>
        )}

        {step === 'pay' && payment && (
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
