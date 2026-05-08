import { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';

const PaymentToast = () => {
  const { showToast, dismissToast } = useNotifications();

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(dismissToast, 8000);
    return () => clearTimeout(timer);
  }, [showToast, dismissToast]);

  if (!showToast) return null;

  const tableLabel = showToast.tableNumber ? `Table ${showToast.tableNumber}` : 'A table';
  const customerLabel = showToast.customerName ? ` — ${showToast.customerName}` : '';

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-right-8 fade-in duration-300"
      role="alert"
    >
      <div className="glass-panel border border-emerald-400/30 bg-emerald-400/10 p-4 rounded-2xl shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-400/20 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-xs uppercase tracking-widest text-emerald-400 mb-0.5">
              Payment Received
            </p>
            <p className="text-sm font-bold text-foreground">
              {tableLabel}{customerLabel}
            </p>
            <p className="text-lg font-black text-foreground mt-0.5">
              €{showToast.amount.toFixed(2)}
              {showToast.tipAmount > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  + €{showToast.tipAmount.toFixed(2)} tip
                </span>
              )}
            </p>
          </div>
          <button
            onClick={dismissToast}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentToast;
