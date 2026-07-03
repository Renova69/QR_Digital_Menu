import { BadRequestException, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailabilitySlot {
  startsAt: string; // UTC ISO instant
  label: string; // restaurant-local HH:mm
}

// Reservation statuses that still hold covers for the soft per-slot cap.
const ACTIVE_HOLD_STATUSES = ['PENDING', 'CONFIRMED'] as const;

@Injectable()
export class ReservationAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Timezone-safe slot generation for a single restaurant-local date. No table
   * logic: slots come from the weekly service hours, bounded by lead time and
   * horizon, and (optionally) filtered by a soft per-slot cover cap.
   */
  async getSlots(
    restaurantId: string,
    localDate: string, // YYYY-MM-DD in the restaurant's timezone
    partySize: number,
  ): Promise<AvailabilitySlot[]> {
    const [settings, restaurant] = await Promise.all([
      this.prisma.reservationSettings.findUnique({ where: { restaurantId } }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { timezone: true },
      }),
    ]);

    if (!settings || !settings.enabled) return [];
    if (partySize < 1 || partySize > settings.maxTotalGuests) return [];

    const zone = restaurant?.timezone || 'Europe/Sofia';
    const day = DateTime.fromISO(localDate, { zone });
    if (!day.isValid) {
      throw new BadRequestException('Invalid date');
    }

    const now = DateTime.now().setZone(zone);
    const earliest = now.plus({ minutes: settings.minLeadMinutes });
    const latest = now.plus({ days: settings.bookingHorizonDays });

    const hours = await this.prisma.reservationServiceHours.findUnique({
      where: {
        restaurantId_weekday: { restaurantId, weekday: day.weekday },
      },
    });
    if (!hours) return [];

    const candidates: DateTime[] = [];
    for (
      let minute = hours.openMinute;
      minute <= hours.lastSlotMinute;
      minute += settings.slotIntervalMinutes
    ) {
      // Build the local wall-clock time, then resolve to a real instant. A
      // nonexistent spring-forward local time is invalid and skipped.
      const slot = day.startOf('day').plus({ minutes: minute });
      if (!slot.isValid) continue;
      if (slot < earliest || slot > latest) continue;
      candidates.push(slot);
    }
    if (candidates.length === 0) return [];

    const capacity = settings.maxCoversPerSlot ?? null;
    const bookedBySlot =
      capacity === null
        ? new Map<number, number>()
        : await this.coversByStartInstant(
            restaurantId,
            candidates.map((c) => c.toUTC().toMillis()),
          );

    const slots: AvailabilitySlot[] = [];
    for (const candidate of candidates) {
      if (capacity !== null) {
        const booked = bookedBySlot.get(candidate.toUTC().toMillis()) ?? 0;
        if (booked + partySize > capacity) continue;
      }
      slots.push({
        startsAt: candidate.toUTC().toISO()!,
        label: candidate.toFormat('HH:mm'),
      });
    }
    return slots;
  }

  private async coversByStartInstant(
    restaurantId: string,
    startMillis: number[],
  ): Promise<Map<number, number>> {
    const starts = startMillis.map((ms) => new Date(ms));
    const rows = await this.prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: [...ACTIVE_HOLD_STATUSES] },
        startsAt: { in: starts },
      },
      select: { startsAt: true, adultsCount: true, childrenCount: true },
    });
    // Key by epoch millis so lookups match regardless of ISO formatting.
    const map = new Map<number, number>();
    for (const r of rows) {
      const key = r.startsAt.getTime();
      map.set(key, (map.get(key) ?? 0) + r.adultsCount + r.childrenCount);
    }
    return map;
  }
}
