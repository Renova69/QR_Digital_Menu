// Shared constants + pure formatters for the analytics dashboard.
// Extracted verbatim from AnalyticsView.tsx — no behavior change.

export const CHART_COLORS = [
  "hsl(var(--color-primary))",
  "#10b981",
  "#f59e0b",
  "#38bdf8",
  "#ef4444",
  "#a78bfa",
];

export const dayParts = [
  { id: "morning", label: "Morning", range: [6, 7, 8, 9, 10, 11] },
  { id: "lunch", label: "Lunch", range: [12, 13, 14, 15] },
  { id: "dinner", label: "Dinner", range: [16, 17, 18, 19, 20, 21] },
  { id: "late", label: "Late", range: [22, 23, 0, 1, 2, 3, 4, 5] },
];

export const dayPartKeyMap: Record<string, string> = {
  morning: "analytics.dayPartMorning",
  lunch: "analytics.dayPartLunch",
  dinner: "analytics.dayPartDinner",
  late: "analytics.dayPartLate",
};

export const orderStatusKeyMap: Record<string, string> = {
  PENDING: "analytics.statusPending",
  CONFIRMED: "analytics.statusConfirmed",
  PREPARING: "analytics.statusPreparing",
  READY: "analytics.statusReady",
  SERVED: "analytics.statusServed",
  COMPLETED: "analytics.statusCompleted",
  DELIVERED: "analytics.statusDelivered",
  CANCELED: "analytics.statusCanceled",
  REJECTED: "analytics.statusRejected",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  STRIPE: "Card · Stripe",
  MYPOS: "Card · myPOS",
  BORICA: "Card · BORICA",
  EPAY: "ePay.bg",
  CASH: "Cash",
};

export const numberFormat = new Intl.NumberFormat("en-GB");

const localeMap: Record<string, string> = {
  en: "en-GB",
  bg: "bg-BG",
  ro: "ro-RO",
};

export const formatDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const lang = (window as any).i18n?.language || "en";
  const locale = localeMap[lang] || localeMap.en;
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short" });
};

export const formatPercent = (value: number) =>
  `${Math.round(value * 10) / 10}%`;

export const safePercent = (value: number, total: number) =>
  total > 0 ? (value / total) * 100 : 0;

export const getChangeCopy = (change?: number) => {
  if (change === undefined) return null;
  const isUp = change >= 0;
  return {
    isUp,
    label: `${isUp ? "+" : "-"}${formatPercent(Math.abs(change))}`,
  };
};
