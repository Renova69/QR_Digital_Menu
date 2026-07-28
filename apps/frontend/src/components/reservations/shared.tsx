import { useEffect, useState } from "react";
import { DashboardButton } from "../dashboard/DashboardButton";

// Status badge background/text classes, keyed by ReservationStatus.
export const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-orange-500 text-white font-bold",
  CONFIRMED: "bg-green-600 text-white font-bold",
  DECLINED: "bg-red-600 text-white font-bold",
  CANCELLED: "bg-red-600 text-white font-bold",
  NO_SHOW: "bg-red-600 text-white font-bold",
  ARRIVED: "bg-indigo-600 text-white font-bold",
};

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// 24-hour time options every 15 minutes (00:00 … 23:45). Native <input
// type="time"> renders 12h/24h per OS locale, so use an explicit select.
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return out;
})();

export function todayISO(timezone?: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function toHHMM(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fromHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Always render in 24-hour format regardless of browser locale.
export function format24h(iso: string, tz?: string, locale?: string): string {
  return new Date(iso).toLocaleString(locale || undefined, {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function dayKey(iso: string, tz?: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale || undefined, {
    timeZone: tz,
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function dayInputValue(iso: string, tz?: string): string {
  // en-CA formats as YYYY-MM-DD; timeZone pins it to the restaurant's calendar
  // day so the "jump to day" value matches the grouping header.
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function time24(iso: string, tz?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function statusDotClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-600";
    case "ARRIVED":
      return "bg-indigo-600";
    case "PENDING":
      return "bg-orange-500";
    default: // DECLINED / CANCELLED / NO_SHOW
      return "bg-red-600";
  }
}

export interface StatCardProps {
  label: string;
  value: string;
  tone?: "default" | "red";
}

export function StatCard({ label, value, tone = "default" }: StatCardProps) {
  return (
    <div className="rounded-xl bg-white border shadow-sm px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`text-xl font-bold ${
          tone === "red" ? "text-red-600" : "text-gray-900"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export interface BadgeProps {
  tone: string;
  label: string;
}

export function Badge({ tone, label }: BadgeProps) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    indigo: "bg-indigo-100 text-indigo-800",
    green: "bg-green-100 text-green-700",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${tones[tone] ?? ""}`}>
      {label}
    </span>
  );
}

export interface ActionBtnProps {
  onClick: () => void;
  disabled: boolean;
  label: string;
  tone?: "primary";
}

export function ActionBtn({ onClick, disabled, label, tone }: ActionBtnProps) {
  return (
    <DashboardButton
      density="compact"
      onClick={onClick}
      disabled={disabled}
      className={`border ${
        tone === "primary"
          ? "border-indigo-600 bg-indigo-600 text-white"
          : "bg-white border text-gray-700"
      }`}
    >
      {label}
    </DashboardButton>
  );
}

export interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

export function ToggleRow({ label, checked, onChange }: ToggleRowProps) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

export interface NumInputProps {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}

export function NumInput({ label, value, onCommit }: NumInputProps) {
  const [local, setLocal] = useState(String(value));
  // Resync when the prop changes from outside this input (settings refetch,
  // another manager's concurrent edit) so a stale local value can't clobber
  // the newer server value on the next blur.
  useEffect(() => {
    setLocal(String(value));
  }, [value]);
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (Number.isFinite(n) && n !== value) onCommit(n);
        }}
        className="w-full border rounded-lg px-3 py-1.5 text-sm"
      />
    </div>
  );
}

export interface TimeSelectProps {
  value: string;
  onChange: (v: string) => void;
}

export function TimeSelect({ value, onChange }: TimeSelectProps) {
  // Include a non-standard stored value so it doesn't silently blank out.
  const options =
    value && !TIME_OPTIONS.includes(value)
      ? [value, ...TIME_OPTIONS]
      : TIME_OPTIONS;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
