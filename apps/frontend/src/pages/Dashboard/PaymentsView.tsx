import { useState, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPaymentHistory } from '../../lib/api';
import RestaurantContext from '../../context/RestaurantContext';
import { useTranslation } from 'react-i18next';
import { CreditCard, AlertCircle } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  SUCCEEDED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  FAILED: 'bg-red-500/10 text-red-500 border-red-500/20',
  REFUNDED: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
};

const PaymentsView = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['paymentHistory', activeRestaurant?.id, statusFilter, page],
    queryFn: () =>
      getPaymentHistory(activeRestaurant.id, {
        status: statusFilter || undefined,
        page,
        limit,
      }),
    enabled: !!activeRestaurant?.id,
  });

  const stripeMissing = activeRestaurant?.paymentsEnabled && !activeRestaurant?.stripeOnboarded;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex items-center justify-between mb-10 flex-wrap gap-4">
        <h2 className="text-2xl font-black text-foreground tracking-tight">
          Payment History
        </h2>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl bg-secondary border border-border text-foreground text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">All Statuses</option>
            <option value="SUCCEEDED">Succeeded</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
      </div>

      {stripeMissing && (
        <div className="mb-8 p-5 bg-amber-400/10 border border-amber-400/20 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-600 dark:text-amber-400 text-sm">
              Stripe not connected
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Connect Stripe in Settings to start accepting payments.
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" />
        </div>
      )}

      {isError && (
        <div className="text-center py-20 text-muted-foreground">
          <p className="font-bold">Failed to load payment history.</p>
        </div>
      )}

      {data && data.data.length === 0 && !isLoading && (
        <div className="text-center py-20 glass-panel rounded-[3rem]">
          <CreditCard className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-display font-black text-2xl text-muted-foreground/30 italic">
            No payments yet
          </p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="glass-panel rounded-[2rem] overflow-hidden border border-white/10">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Table</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Customer</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Amount</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tip</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {data.data.map((payment: any) => (
                    <tr key={payment.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-foreground whitespace-nowrap">
                        {new Date(payment.createdAt).toLocaleDateString()}
                        <span className="text-xs text-muted-foreground font-normal ml-2">
                          {new Date(payment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-foreground">
                        {payment.tableNumber ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-foreground">
                        {payment.customerName ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-foreground">
                        €{payment.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">
                        {payment.tipAmount > 0 ? `€${payment.tipAmount.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[payment.status] ?? 'bg-secondary text-muted-foreground border-border'}`}>
                          {payment.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.meta.total > limit && (
            <div className="flex items-center justify-between mt-6 px-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl bg-secondary text-foreground font-bold text-sm hover:bg-secondary/80 disabled:opacity-30 transition-all"
              >
                Previous
              </button>
              <span className="text-sm text-muted-foreground font-bold">
                Page {page} of {Math.ceil(data.meta.total / limit)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(data.meta.total / limit)}
                className="px-4 py-2 rounded-xl bg-secondary text-foreground font-bold text-sm hover:bg-secondary/80 disabled:opacity-30 transition-all"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PaymentsView;
