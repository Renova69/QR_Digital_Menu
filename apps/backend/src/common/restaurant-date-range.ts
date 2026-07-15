import { DateTime } from 'luxon';

export interface RestaurantDateRange {
  gte?: Date;
  lte?: Date;
}

/** Convert calendar-day filters into UTC instants using the restaurant zone. */
export function buildRestaurantDateRange(
  startDate?: string,
  endDate?: string,
  timezone = 'UTC',
): RestaurantDateRange {
  const range: RestaurantDateRange = {};

  if (startDate) {
    const start = DateTime.fromISO(startDate, { zone: timezone });
    if (start.isValid) range.gte = start.startOf('day').toUTC().toJSDate();
  }
  if (endDate) {
    const end = DateTime.fromISO(endDate, { zone: timezone });
    if (end.isValid) range.lte = end.endOf('day').toUTC().toJSDate();
  }

  return range;
}
