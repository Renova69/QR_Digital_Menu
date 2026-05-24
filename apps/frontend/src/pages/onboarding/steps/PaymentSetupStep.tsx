import { useState } from 'react';
import { CreditCard, ExternalLink, CheckCircle } from 'lucide-react';
import { generateStripeConnectLink } from '../../../lib/api';

interface Props {
  restaurantId: string;
  onNext: () => void;
  onSkip: () => void;
}

export default function PaymentSetupStep({ restaurantId, onNext, onSkip }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await generateStripeConnectLink(restaurantId);
      window.location.href = data.url;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to connect Stripe. You can set it up later in Payments settings.');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Set up payments</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect Stripe to accept card payments at the table. Takes about 2 minutes.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Stripe Connect</p>
            <p className="text-xs text-muted-foreground">Secure card payments via Stripe. No monthly fee.</p>
          </div>
        </div>

        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Accept Visa, Mastercard, and other cards
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Split bills and tip support
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Payouts directly to your bank account
          </li>
        </ul>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleConnect}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {loading ? 'Redirecting…' : (
            <>
              Connect with Stripe
              <ExternalLink className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now — set up later in Payments
        </button>
      </div>
    </div>
  );
}
