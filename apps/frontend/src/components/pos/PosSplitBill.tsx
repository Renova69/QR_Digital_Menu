import { useState } from "react";
import { useTranslation } from "react-i18next";

interface PosSplitBillProps {
  total: number;
}

export default function PosSplitBill({ total }: PosSplitBillProps) {
    const { t } = useTranslation();
  const [splitCount, setSplitCount] = useState(1);

  const perPerson =
    splitCount > 0 ? total / splitCount : total;

  return (
    <div className="p-4 border-t border-border">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">{t('auto.split', 'Split:')}</span>
        <button
          type="button"
          onClick={() => setSplitCount(Math.max(1, splitCount - 1))}
          className="h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-sm min-h-[44px] min-w-[44px]"
        >
          −
        </button>
        <span className="text-lg font-bold text-foreground w-8 text-center">
          {splitCount}
        </span>
        <button
          type="button"
          onClick={() => setSplitCount(Math.min(20, splitCount + 1))}
          className="h-10 w-10 rounded-full bg-card border border-border flex items-center justify-center text-sm min-h-[44px] min-w-[44px]"
        >
          +
        </button>
        <span className="ml-auto text-lg font-bold text-primary">
          €{perPerson.toFixed(2)} {t('auto.Person', '/ person')}</span>
      </div>
    </div>
  );
}
