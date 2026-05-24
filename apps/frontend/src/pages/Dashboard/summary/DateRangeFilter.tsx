import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import type { DateRangePreset } from "../../../hooks/useSummaryDateRange";

interface DateRangeFilterProps {
  period: number;
  startDate?: string;
  endDate?: string;
  label: string;
  onPeriodChange: (days: DateRangePreset) => void;
  onCustomRange: (start: string, end: string) => void;
}

const PRESETS: { days: DateRangePreset; label: string }[] = [
  { days: 7, label: '7D' },
  { days: 14, label: '14D' },
  { days: 30, label: '30D' },
];

const DateRangeFilter = ({ period, startDate, endDate, label, onPeriodChange, onCustomRange }: DateRangeFilterProps) => {
  const [draftStart, setDraftStart] = useState(startDate || '');
  const [draftEnd, setDraftEnd] = useState(endDate || '');

  // Sync drafts when preset resets the range
  useEffect(() => {
    if (!startDate && !endDate) {
      setDraftStart('');
      setDraftEnd('');
    }
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
        <h2 className="text-xl font-display font-bold text-foreground">Dashboard</h2>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {label}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {PRESETS.map(({ days, label: lbl }) => (
          <button
            key={days}
            onClick={() => onPeriodChange(days)}
            className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
              period === days && !isCustomActive
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            }`}
          >
            {lbl}
          </button>
        ))}
        <div className="w-px h-5 bg-border mx-1" />
        <input
          type="date"
          value={draftStart}
          max={draftEnd || undefined}
          onChange={(e) => handleStartChange(e.target.value)}
          className={`bg-secondary border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none cursor-pointer transition-colors ${
            isCustomActive ? 'border-primary' : 'border-border focus:border-primary'
          }`}
        />
        <span className="text-[10px] text-muted-foreground">—</span>
        <input
          type="date"
          value={draftEnd}
          min={draftStart || undefined}
          onChange={(e) => handleEndChange(e.target.value)}
          className={`bg-secondary border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none cursor-pointer transition-colors ${
            isCustomActive ? 'border-primary' : 'border-border focus:border-primary'
          }`}
        />
      </div>
    </div>
  );
};

export default DateRangeFilter;
