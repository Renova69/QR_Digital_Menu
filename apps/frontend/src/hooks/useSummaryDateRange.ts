import { useState, useCallback } from 'react';

export type DateRangePreset = 0 | 7 | 14 | 30;

export interface SummaryDateRange {
  period: DateRangePreset;
  startDate?: string;
  endDate?: string;
  setPeriod: (days: DateRangePreset) => void;
  setCustomRange: (start: string, end: string) => void;
  label: string;
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function useSummaryDateRange(): SummaryDateRange {
  const [period, setPeriodState] = useState<DateRangePreset>(30);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const setPeriod = useCallback((days: DateRangePreset) => {
    setPeriodState(days);
    setStartDate('');
    setEndDate('');
  }, []);

  const setCustomRange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    setPeriodState(0);
  }, []);

  const label = startDate && endDate
    ? `${formatDate(startDate)} — ${formatDate(endDate)}`
    : `Last ${period} days`;

  return { period, startDate: startDate || undefined, endDate: endDate || undefined, setPeriod, setCustomRange, label };
}
