import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CreditCard, Banknote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";

interface PaymentsSummaryData {
  totalCollected: number;
  refundAmount: number;
  byMethod: { method: string; amount: number }[];
}

interface PaymentsSummaryCardProps {
  data: PaymentsSummaryData;
}

const COLORS: Record<string, string> = {
  STRIPE: '#6E56F8',
  EPAY: '#06B6D4',
  BORICA: '#F43F5E',
  MYPOS: '#38BDF8',
  CASH: '#34D399',
};

const PaymentsSummaryCard = ({ data }: PaymentsSummaryCardProps) => {
  const { t } = useTranslation();

  const METHOD_LABELS: Record<string, string> = {
    STRIPE: t('dashboard.card'),
    EPAY: 'ePay.bg',
    BORICA: 'BORICA',
    MYPOS: 'myPOS',
    CASH: t('dashboard.cash'),
  };

  const chartData = data.byMethod
    .filter((m) => m.amount > 0)
    .map((m) => ({ name: METHOD_LABELS[m.method] || m.method, value: m.amount, color: COLORS[m.method] || '#9CA3AF' }));

  return (
    <div className="glass-panel rounded-[1.5rem] p-5">
      <h3 className="text-sm font-display font-bold text-foreground mb-4">{t('dashboard.payments')}</h3>
      <div className="flex items-center gap-4">
        <div className="w-24 h-24 shrink-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={28} outerRadius={40} paddingAngle={2}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatEuro(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">{t('dashboard.noData')}</div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{t('dashboard.collected')}</p>
            <p className="text-lg font-display font-bold text-foreground">{formatEuro(data.totalCollected)}</p>
          </div>
          {data.refundAmount > 0 && (
            <div>
              <p className="text-[10px] text-red-400 uppercase tracking-widest">{t('dashboard.refunded')}</p>
              <p className="text-sm font-bold text-red-400">{formatEuro(data.refundAmount)}</p>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            {chartData.map((m) => (
              <div key={m.name} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                <span className="text-[10px] text-muted-foreground">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentsSummaryCard;
