import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getSessionBill, createPaymentIntent } from '../../lib/api';
import { Button } from '../ui/button';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X } from 'lucide-react';

const stripePromise = loadStripe(
  (import.meta as any).env.VITE_STRIPE_PUBLISHABLE_KEY || '',
);

interface PaymentModalProps {
  sessionToken: string;
  restaurantId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'tip' | 'pay' | 'done';

interface BillData {
  subtotal: number;
  tipsEnabled: boolean;
  tipOptions: number[];
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
          <span>€{(total - tipAmount).toFixed(2)}</span>
        </div>
        {tipAmount > 0 && (
          <div className="flex justify-between">
            <span>{t('payment.tip')}</span>
            <span>€{tipAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-foreground border-t pt-1">
          <span>{t('payment.total')}</span>
          <span>€{total.toFixed(2)}</span>
        </div>
      </div>

      <PaymentElement />

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={processing}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" disabled={processing || !stripe}>
          {processing ? t('payment.processing') : `${t('payment.pay')} €${total.toFixed(2)}`}
        </Button>
      </div>
    </form>
  );
}

export function PaymentModal({ sessionToken, restaurantId, onClose, onSuccess }: PaymentModalProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('tip');
  const [bill, setBill] = useState<BillData | null>(null);
  const [selectedTip, setSelectedTip] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentTotal, setPaymentTotal] = useState(0);
  const [paymentTip, setPaymentTip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // restaurantId is used for context/future use
  void restaurantId;

  useEffect(() => {
    getSessionBill(sessionToken)
      .then((data) => setBill(data))
      .catch(() => onClose());
  }, [sessionToken]);

  const activeTipPercent = customTip !== '' ? parseFloat(customTip) || 0 : selectedTip;

  const handleContinueToPayment = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createPaymentIntent(sessionToken, activeTipPercent);
      setClientSecret(result.clientSecret);
      setPaymentTotal(result.total);
      setPaymentTip(result.tipAmount);
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
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={20} />
          </button>
        </div>

        {step === 'tip' && bill && (
          <div className="space-y-4">
            <p className="text-2xl font-bold">€{bill.subtotal.toFixed(2)}</p>

            {bill.tipsEnabled && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('payment.addTip')}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setSelectedTip(0); setCustomTip(''); }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === 0 && customTip === '' ? 'bg-accent text-accent-foreground border-accent' : 'border-border'}`}
                  >
                    {t('payment.noTip')}
                  </button>
                  {bill.tipOptions.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => { setSelectedTip(pct); setCustomTip(''); }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === pct && customTip === '' ? 'bg-accent text-accent-foreground border-accent' : 'border-border'}`}
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
                    {t('payment.tipAmount')}: €{(bill.subtotal * activeTipPercent / 100).toFixed(2)}
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

        {step === 'pay' && clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: 'stripe' } }}
          >
            <PaymentForm
              clientSecret={clientSecret}
              total={paymentTotal}
              tipAmount={paymentTip}
              onSuccess={() => setStep('done')}
              onClose={onClose}
            />
          </Elements>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-lg font-medium">{t('payment.paymentReceived')}</p>
            <p className="text-2xl font-bold">€{paymentTotal.toFixed(2)}</p>
            <Button className="w-full" onClick={onSuccess}>
              {t('payment.backToMenu')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
