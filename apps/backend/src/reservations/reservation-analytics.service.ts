import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationAccessService } from './reservation-access.service';

/**
 * Feature 6 analytics aggregation, exported as a plain function so
 * `ReservationsService` can reuse it without a new constructor dependency —
 * see `reservation-access.service.ts` for why.
 */
export async function fetchReservationAnalytics(
  prisma: PrismaService,
  restaurantId: string,
) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { timezone: true },
  });
  const zone = restaurant?.timezone || 'Europe/Sofia';
  const windowDays = 30;
  const now = DateTime.now().setZone(zone);
  const since = now.minus({ days: windowDays }).startOf('day').toJSDate();
  const weekStart = now.minus({ days: 7 }).toJSDate();
  const until = now.toJSDate();

  const rows = await prisma.reservation.findMany({
    where: { restaurantId, startsAt: { gte: since, lte: until } },
    select: {
      startsAt: true,
      status: true,
      adultsCount: true,
      childrenCount: true,
    },
    take: 5000,
  });

  const statusCounts: Record<string, number> = {};
  const hourCounts = new Map<number, number>();
  let partySum = 0;
  let partyRows = 0;
  let thisWeek = 0;

  for (const r of rows) {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.startsAt >= weekStart && r.startsAt <= until) thisWeek += 1;
    // Party-size average over bookings that represent real demand (exclude
    // declined/cancelled requests that never became a real party).
    if (r.status !== 'DECLINED' && r.status !== 'CANCELLED') {
      partySum += r.adultsCount + r.childrenCount;
      partyRows += 1;
      const hour = DateTime.fromJSDate(r.startsAt).setZone(zone).hour;
      hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
    }
  }

  const popularHours = [...hourCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour, count]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      count,
    }));

  return {
    windowDays,
    total: rows.length,
    thisWeek,
    noShows: statusCounts['NO_SHOW'] ?? 0,
    avgPartySize:
      partyRows > 0 ? Math.round((partySum / partyRows) * 10) / 10 : 0,
    statusCounts,
    popularHours,
  };
}

@Injectable()
export class ReservationAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ReservationAccessService,
  ) {}

  async getAnalytics(restaurantId: string, userId: string) {
    const role = await this.access.resolveActor(restaurantId, userId);
    this.access.assertRole(role, ['MANAGER']);
    return fetchReservationAnalytics(this.prisma, restaurantId);
  }
}
