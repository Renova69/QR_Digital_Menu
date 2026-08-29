import { DateTime } from 'luxon';
import { HHMM_PATTERN } from '../common/weekday';

type PinLoginHours = {
  timezone: string | null;
  startTime: string | null;
  endTime: string | null;
};

const minutesSinceMidnight = (value: string): number => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

/**
 * Evaluates an optional restaurant-local PIN-login window.
 *
 * Both NULL means unrestricted for backwards compatibility. A partial or
 * malformed persisted configuration fails closed; the management write path
 * prevents such values, but authentication must not silently widen policy if
 * a row is corrupted. The start boundary is inclusive and the end boundary is
 * exclusive. A start later than the end represents an overnight window.
 */
export function isPinLoginAllowed(
  hours: PinLoginHours,
  now: DateTime = DateTime.utc(),
): boolean {
  const { startTime, endTime } = hours;
  if (startTime === null && endTime === null) return true;
  if (startTime === null || endTime === null || startTime === endTime) {
    return false;
  }
  if (!HHMM_PATTERN.test(startTime) || !HHMM_PATTERN.test(endTime))
    return false;

  const localNow = now.setZone(hours.timezone ?? 'Europe/Sofia');
  if (!localNow.isValid) return false;

  const start = minutesSinceMidnight(startTime);
  const end = minutesSinceMidnight(endTime);
  const current = localNow.hour * 60 + localNow.minute;
  if (![start, end, current].every(Number.isFinite)) return false;

  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}
