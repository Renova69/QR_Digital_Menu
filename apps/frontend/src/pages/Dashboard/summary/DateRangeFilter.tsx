import { useEffect, useState, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DateRangePreset } from '../../../hooks/useSummaryDateRange';

interface DateRangeFilterProps {
  period: number;
  startDate?: string;
  endDate?: string;
  label: string;
  title?: string;
  subtitle?: string;
  onPeriodChange: (days: DateRangePreset) => void;
  onCustomRange: (start: string, end: string) => void;
}

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../../../lib/dateLocales';

function parseDateString(dateStr?: string): Date | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function formatDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CustomDateInput = ({
  value,
  min,
  max,
  onChange,
  isCustomActive,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (val: string) => void;
  isCustomActive: boolean;
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="relative inline-flex items-center">
      <DatePicker
        selected={parseDateString(value)}
        onChange={(d: Date | null) => d && onChange(formatDateString(d))}
        minDate={parseDateString(min)}
        maxDate={parseDateString(max)}
        locale={i18n.language}
        dateFormat="P"
        placeholderText={t('auto.ddMmYy', 'dd/mm/yy')}
        className={`w-[110px] bg-secondary border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none transition-colors cursor-pointer pr-8 ${
          isCustomActive ? 'border-primary' : 'border-border focus:border-primary'
        }`}
      />
      <Calendar className="absolute right-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
    </div>
  );
};

const PRESET_DAYS: DateRangePreset[] = [7, 14, 30];

const DateRangeFilter = ({
  period,
  startDate,
  endDate,
  label,
  title,
  subtitle,
  onPeriodChange,
  onCustomRange,
}: DateRangeFilterProps) => {
  const { t } = useTranslation();
  const [draftStart, setDraftStart] = useState(startDate || '');
  const [draftEnd, setDraftEnd] = useState(endDate || '');

  useEffect(() => {
    setDraftStart(startDate || '');
    setDraftEnd(endDate || '');
  }, [startDate, endDate]);

  const handleStartChange = (value: string) => {
    setDraftStart(value);
    if (value && draftEnd && value <= draftEnd) {
      onCustomRange(value, draftEnd);
    }
  };

  const handleEndChange = (value: string) => {
    setDraftEnd(value);
    if (draftStart && value && draftStart <= value) {
      onCustomRange(draftStart, value);
    }
  };

  const isCustomActive = !!(startDate && endDate);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h2 className="text-xl font-display font-bold text-foreground">{title ?? t('dashboard.tabs.summary')}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {subtitle ?? label}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {PRESET_DAYS.map((days) => (
          <button
            key={days}
            onClick={() => onPeriodChange(days)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              period === days && !isCustomActive
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
          >
            {days === 7 ? t('analytics.days7') : days === 14 ? t('analytics.days14') : t('analytics.days30')}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <CustomDateInput
          value={draftStart}
          max={draftEnd || undefined}
          onChange={handleStartChange}
          isCustomActive={isCustomActive}
        />
        <span className="text-[10px] text-muted-foreground">-</span>
        <CustomDateInput
          value={draftEnd}
          min={draftStart || undefined}
          onChange={handleEndChange}
          isCustomActive={isCustomActive}
        />
      </div>
    </div>
  );
};

export default DateRangeFilter;
