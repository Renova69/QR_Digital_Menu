import { forwardRef, useEffect, useState } from "react";
import type {
  ButtonHTMLAttributes,
  FocusEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
} from "react";
import { Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DateRangePreset } from "../../../hooks/useSummaryDateRange";

interface DateRangeFilterProps {
  period: DateRangePreset;
  startDate?: string;
  endDate?: string;
  label: string;
  title?: string;
  subtitle?: string;
  onPeriodChange: (days: DateRangePreset) => void;
  onCustomRange: (start: string, end: string) => void;
}

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../../lib/dateLocales";

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

type DatePickerTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "type" | "value"
> & {
  autoComplete?: string;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
  onChange?: () => void;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  placeholder?: string;
  readOnly?: boolean;
  value?: string;
};

const DatePickerTrigger = forwardRef<
  HTMLButtonElement,
  DatePickerTriggerProps
>(
  (
    {
      autoComplete: _autoComplete,
      className,
      onChange: _onChange,
      placeholder,
      readOnly: _readOnly,
      value,
      ...buttonProps
    },
    ref,
  ) => (
    <button ref={ref} type="button" className={className} {...buttonProps}>
      <span
        className={`min-w-0 flex-1 truncate text-left ${
          value ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {value || placeholder}
      </span>
      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  ),
);
DatePickerTrigger.displayName = "DatePickerTrigger";

const CustomDateInput = ({
  value,
  min,
  max,
  onChange,
  isCustomActive,
  placement,
  ariaLabel,
}: {
  value: string;
  min?: string;
  max?: string;
  onChange: (val: string) => void;
  isCustomActive: boolean;
  placement: "bottom-start" | "bottom-end";
  ariaLabel: string;
}) => {
  const { t, i18n } = useTranslation();

  return (
    <div className="min-w-0 flex-1 sm:flex-none">
      <DatePicker
        ariaLabel={ariaLabel}
        selected={parseDateString(value)}
        onChange={(d: Date | null) => d && onChange(formatDateString(d))}
        minDate={parseDateString(min)}
        maxDate={parseDateString(max)}
        locale={i18n.language}
        dateFormat="P"
        placeholderText={t("auto.ddMmYy", "dd/mm/yy")}
        customInput={<DatePickerTrigger />}
        wrapperClassName="w-full sm:w-auto"
        portalId="dashboard-date-range-picker-root"
        popperClassName="dashboard-date-range-popper"
        popperPlacement={placement}
        showPopperArrow={false}
        className={`flex min-h-11 w-full items-center gap-2 rounded-lg border bg-secondary px-3 py-2 text-sm font-semibold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/25 sm:min-h-10 sm:w-[132px] sm:text-xs ${
          isCustomActive
            ? "border-primary"
            : "border-border focus:border-primary"
        }`}
      />
    </div>
  );
};

const PRESET_DAYS: DateRangePreset[] = [1, 7, 14, 30];

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
  const [draftStart, setDraftStart] = useState(startDate || "");
  const [draftEnd, setDraftEnd] = useState(endDate || "");

  useEffect(() => {
    setDraftStart(startDate || "");
    setDraftEnd(endDate || "");
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
        <h2 className="text-xl font-display font-bold text-foreground">
          {title ?? t("dashboard.tabs.summary")}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <Calendar className="w-3 h-3" />
          {subtitle ?? label}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto lg:flex-row lg:items-center">
        <div
          className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1"
          role="group"
          aria-label={t("analytics.datePresets", "Date presets")}
        >
          {PRESET_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onPeriodChange(days)}
              aria-pressed={period === days && !isCustomActive}
              className={`min-h-9 min-w-0 rounded-md px-2 text-[11px] font-bold uppercase transition-all cursor-pointer sm:px-3 ${
                period === days && !isCustomActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
              }`}
            >
              {days === 1
                ? t("analytics.today", "Today")
                : days === 7
                  ? t("analytics.days7")
                  : days === 14
                    ? t("analytics.days14")
                    : t("analytics.days30")}
            </button>
          ))}
        </div>
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:w-auto">
          <CustomDateInput
            value={draftStart}
            max={draftEnd || undefined}
            onChange={handleStartChange}
            isCustomActive={isCustomActive}
            placement="bottom-start"
            ariaLabel={t("analytics.startDate", "Start date")}
          />
          <span className="text-[10px] text-muted-foreground">-</span>
          <CustomDateInput
            value={draftEnd}
            min={draftStart || undefined}
            onChange={handleEndChange}
            isCustomActive={isCustomActive}
            placement="bottom-end"
            ariaLabel={t("analytics.endDate", "End date")}
          />
        </div>
      </div>
    </div>
  );
};

export default DateRangeFilter;
