// Pure happy-hour helpers, extracted from CheckoutPage so they can be unit
// tested without rendering the page (#F8). Mirrors the backend's Luxon-based
// logic in orders.service.ts: overnight windows belong to the START day.

export const DEFAULT_HAPPY_HOUR_DAYS = [1, 2, 3, 4, 5, 6, 7];

const ISO_WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

export const parseTimeToMinutes = (value?: string): number | null => {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

export const getZonedClockParts = (
  date: Date,
  timeZone: string,
): { weekday: number; minutes: number } => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);

    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value;
    const weekday =
      ISO_WEEKDAY_BY_SHORT_NAME[(part("weekday") || "").toLowerCase()];
    const hour = Number(part("hour"));
    const minute = Number(part("minute"));

    if (!weekday || !Number.isFinite(hour) || !Number.isFinite(minute)) {
      throw new Error("Invalid zoned clock parts");
    }

    return { weekday, minutes: (hour % 24) * 60 + minute };
  } catch {
    const localWeekday = date.getDay() === 0 ? 7 : date.getDay();
    return {
      weekday: localWeekday,
      minutes: date.getHours() * 60 + date.getMinutes(),
    };
  }
};

export interface HappyHourConfig {
  happyHourEnable?: boolean;
  happyHourStartTime?: string;
  happyHourEndTime?: string;
  happyHourDays?: number[];
  timezone?: string;
}

export const isHappyHourActive = (
  config: HappyHourConfig | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (
    !config?.happyHourEnable ||
    !config.happyHourStartTime ||
    !config.happyHourEndTime
  )
    return false;

  const activeDays = Array.isArray(config.happyHourDays)
    ? config.happyHourDays
    : DEFAULT_HAPPY_HOUR_DAYS;
  if (activeDays.length === 0) return false;

  const startMinutes = parseTimeToMinutes(config.happyHourStartTime);
  const endMinutes = parseTimeToMinutes(config.happyHourEndTime);
  if (startMinutes === null || endMinutes === null) return false;

  const timeZone = config.timezone || "Europe/Sofia";
  const current = getZonedClockParts(now, timeZone);
  const previous = getZonedClockParts(
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
    timeZone,
  );

  const inHappyHour =
    startMinutes <= endMinutes
      ? current.minutes >= startMinutes && current.minutes <= endMinutes
      : current.minutes >= startMinutes || current.minutes <= endMinutes;

  // Overnight windows (start > end) before the start time belong to the
  // previous day's happy hour.
  const effectiveWeekday =
    startMinutes <= endMinutes || current.minutes >= startMinutes
      ? current.weekday
      : previous.weekday;

  return inHappyHour && activeDays.includes(effectiveWeekday);
};
