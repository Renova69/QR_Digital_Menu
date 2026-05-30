/**
 * Weekday conventions across the codebase — single reference point (#16).
 *
 * Two features historically use DIFFERENT numbering and BOTH are load-bearing:
 *
 * - **Category dayparting** (`MenuCategory.daysOfWeek`) uses JS `Date.getDay()`
 *   semantics: 0=Sunday … 6=Saturday.
 * - **Happy hour** (`Restaurant.happyHourDays`) uses Luxon `weekday` semantics:
 *   1=Monday … 7=Sunday. The order-pricing path (`orders.service`) compares
 *   against `DateTime.weekday`, so this convention must NOT be migrated casually.
 *
 * Do not assume one convention when wiring a shared day-picker — convert
 * explicitly with the helpers below.
 */

// JS getDay(): 0=Sun … 6=Sat — used by MenuCategory.daysOfWeek
export const CATEGORY_WEEKDAY_MIN = 0;
export const CATEGORY_WEEKDAY_MAX = 6;

// Luxon weekday: 1=Mon … 7=Sun — used by Restaurant.happyHourDays
export const HAPPY_HOUR_WEEKDAY_MIN = 1;
export const HAPPY_HOUR_WEEKDAY_MAX = 7;

/** Convert a Luxon weekday (1=Mon…7=Sun) to a JS getDay() value (0=Sun…6=Sat). */
export function isoToJsWeekday(iso: number): number {
  return iso % 7;
}

/** Convert a JS getDay() value (0=Sun…6=Sat) to a Luxon weekday (1=Mon…7=Sun). */
export function jsToIsoWeekday(js: number): number {
  return js === 0 ? 7 : js;
}

/** Matches a 24-hour HH:mm time string (00:00–23:59). */
export const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
