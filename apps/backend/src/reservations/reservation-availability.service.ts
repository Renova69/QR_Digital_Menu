import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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
    // Feature 2: when re-checking a slot for a modification, the reservation
    // being changed must not count against its own capacity (else moving within
    // the same slot or growing the party double-counts the existing hold).
    excludeReservationId?: string,
  ): Promise<AvailabilitySlot[]> {
    const [settings, restaurant, blackout] = await Promise.all([
      this.prisma.reservationSettings.findUnique({ where: { restaurantId } }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { timezone: true },
      }),
      this.prisma.reservationBlackout.findUnique({
        where: { restaurantId_date: { restaurantId, date: localDate } },
        select: { id: true },
      }),
    ]);

    if (!settings || !settings.enabled) return [];
    if (partySize < 1 || partySize > settings.maxTotalGuests) return [];

    const zone = restaurant?.timezone || 'Europe/Sofia';
    const day = DateTime.fromISO(localDate, { zone });
    if (!day.isValid) {
      throw new BadRequestException('Invalid date');
    }

    // Feature 5: owner-declared closed day → no slots (also blocks the submit
    // guard, since assertSlotBookable re-derives this same set).
    if (blackout) return [];

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
            excludeReservationId,
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

  /**
   * Server-side guard for a booking submit (Fixes 1 + 2): the chosen instant
   * must be one the availability engine would actually offer for that party.
   * This re-derives the slot set — so it rejects times outside service hours,
   * outside lead/horizon, and (soft) full slots — instead of trusting the
   * client. A determined direct request can no longer book 03:00 or a full slot.
   */
  async assertSlotBookable(
    restaurantId: string,
    startsAt: Date,
    partySize: number,
    excludeReservationId?: string,
  ): Promise<void> {
    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid reservation time');
    }
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const zone = restaurant?.timezone || 'Europe/Sofia';
    const localDate = DateTime.fromJSDate(startsAt).setZone(zone).toISODate();
    if (!localDate) throw new BadRequestException('Invalid reservation time');

    const slots = await this.getSlots(
      restaurantId,
      localDate,
      partySize,
      excludeReservationId,
    );
    const bookable = slots.some(
      (s) => new Date(s.startsAt).getTime() === startsAt.getTime(),
    );
    if (!bookable) {
      throw new ConflictException(
        'This time is no longer available. Please choose another slot.',
      );
    }
  }

  private async coversByStartInstant(
    restaurantId: string,
    startMillis: number[],
    excludeReservationId?: string,
  ): Promise<Map<number, number>> {
    const starts = startMillis.map((ms) => new Date(ms));
    const rows = await this.prisma.reservation.findMany({
      where: {
        restaurantId,
        status: { in: [...ACTIVE_HOLD_STATUSES] },
        startsAt: { in: starts },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
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
