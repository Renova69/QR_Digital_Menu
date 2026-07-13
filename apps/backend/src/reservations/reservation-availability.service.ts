import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';

export interface AvailabilitySlot {
  startsAt: string; // UTC ISO instant
  label: string; // restaurant-local HH:mm
}

// Reservation statuses that still hold covers for the soft per-slot cap.
const ACTIVE_HOLD_STATUSES = ['PENDING', 'CONFIRMED', 'ARRIVED'] as const;
type AvailabilityDb = PrismaService | Prisma.TransactionClient;

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
    db: AvailabilityDb = this.prisma,
  ): Promise<AvailabilitySlot[]> {
    const [settings, restaurant, blackout] = await Promise.all([
      db.reservationSettings.findUnique({ where: { restaurantId } }),
      db.restaurant.findUnique({
        where: { id: restaurantId },
        select: { timezone: true },
      }),
      db.reservationBlackout.findUnique({
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

    const hours = await db.reservationServiceHours.findUnique({
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
      // Build the local wall-clock time directly with .set(), not
      // "midnight + elapsed minutes" via .plus({minutes}) — Luxon's .plus()
      // on sub-day units adds an exact real-time duration, so any DST
      // transition earlier that day silently shifts every later slot by the
      // offset change (#DST-BUG: this drifted every slot by a full hour on
      // both transition days, and made the "invalid" check below dead code
      // since exact-duration addition from a valid instant is never invalid).
      // A nonexistent spring-forward local time (e.g. 03:30 when clocks jump
      // 03:00->04:00) gets normalized forward by Luxon's .set() instead of
      // becoming invalid — detect and skip it by checking the resulting
      // local hour/minute actually match what was requested. An ambiguous
      // fall-back local time (the 03:00-04:00 hour occurring twice) resolves
      // deterministically to one instant, so it's offered once, not twice.
      const targetHour = Math.floor(minute / 60);
      const targetMinute = minute % 60;
      const slot = day.set({
        hour: targetHour,
        minute: targetMinute,
        second: 0,
        millisecond: 0,
      });
      if (
        !slot.isValid ||
        slot.hour !== targetHour ||
        slot.minute !== targetMinute
      ) {
        continue;
      }
      if (slot < earliest || slot > latest) continue;
      candidates.push(slot);
    }
    if (candidates.length === 0) return [];

    const capacity = settings.maxCoversPerSlot ?? null;
    const bookedBySlot =
      capacity === null
        ? new Map<number, number>()
        : await this.coversByWindow(
            restaurantId,
            candidates.map((c) => c.toUTC().toMillis()),
            settings.slotIntervalMinutes,
            excludeReservationId,
            db,
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
    db: AvailabilityDb = this.prisma,
  ): Promise<void> {
    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid reservation time');
    }
    const restaurant = await db.restaurant.findUnique({
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
      db,
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

  /**
   * Enforce only the per-slot cover cap for an existing reservation edit.
   * Unlike `assertSlotBookable`, this deliberately ignores lead time, booking
   * horizon, blackouts, and current service enablement: those rules must not
   * invalidate a booking the restaurant already accepted. If the reservation
   * is outside the current slot grid (for example a staff override), there is
   * no capacity window to enforce and the override remains valid.
   */
  async assertCapacityAvailable(
    restaurantId: string,
    startsAt: Date,
    partySize: number,
    excludeReservationId?: string,
    db: AvailabilityDb = this.prisma,
  ): Promise<void> {
    if (isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid reservation time');
    }

    const [settings, restaurant] = await Promise.all([
      db.reservationSettings.findUnique({ where: { restaurantId } }),
      db.restaurant.findUnique({
        where: { id: restaurantId },
        select: { timezone: true },
      }),
    ]);
    if (!settings || settings.maxCoversPerSlot === null) return;
    if (partySize < 1 || partySize > settings.maxTotalGuests) {
      throw new BadRequestException(
        `Party size must be between 1 and ${settings.maxTotalGuests}`,
      );
    }

    const zone = restaurant?.timezone || 'Europe/Sofia';
    const local = DateTime.fromJSDate(startsAt).setZone(zone);
    const hours = await db.reservationServiceHours.findUnique({
      where: {
        restaurantId_weekday: {
          restaurantId,
          weekday: local.weekday,
        },
      },
    });
    if (!hours) return;

    const intervalMs = settings.slotIntervalMinutes * 60_000;
    const startOfLocalDay = local.startOf('day');
    let windowStart: number | null = null;
    for (
      let minute = hours.openMinute;
      minute <= hours.lastSlotMinute;
      minute += settings.slotIntervalMinutes
    ) {
      // Same wall-clock-preserving construction as getSlots above (#DST-BUG)
      // — .plus({minutes}) here drifted window boundaries by an hour on DST
      // transition days, shifting which slot's capacity a booking counted
      // against.
      const targetHour = Math.floor(minute / 60);
      const targetMinute = minute % 60;
      const candidate = startOfLocalDay.set({
        hour: targetHour,
        minute: targetMinute,
        second: 0,
        millisecond: 0,
      });
      if (
        !candidate.isValid ||
        candidate.hour !== targetHour ||
        candidate.minute !== targetMinute
      ) {
        continue;
      }
      const candidateMillis = candidate.toUTC().toMillis();
      const targetMillis = startsAt.getTime();
      if (
        targetMillis >= candidateMillis &&
        targetMillis < candidateMillis + intervalMs
      ) {
        windowStart = candidateMillis;
        break;
      }
    }
    if (windowStart === null) return;

    const bookedBySlot = await this.coversByWindow(
      restaurantId,
      [windowStart],
      settings.slotIntervalMinutes,
      excludeReservationId,
      db,
    );
    const booked = bookedBySlot.get(windowStart) ?? 0;
    if (booked + partySize > settings.maxCoversPerSlot) {
      throw new ConflictException(
        'This time is no longer available. Please choose another slot.',
      );
    }
  }

  /**
   * Covers held per candidate slot. Each active-hold reservation counts toward
   * the slot window `[slotStart, slotStart + interval)` that contains its start
   * — so a staff manual booking made off the slot grid (e.g. 19:07 with 30-min
   * slots) still counts against the 19:00 cap instead of being invisible to it.
   * Keyed by candidate-start epoch millis so `getSlots` can look up by the same
   * `candidate.toUTC().toMillis()`.
   */
  private async coversByWindow(
    restaurantId: string,
    candidateStartMillis: number[],
    slotIntervalMinutes: number,
    excludeReservationId?: string,
    db: AvailabilityDb = this.prisma,
  ): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (candidateStartMillis.length === 0) return map;

    const intervalMs = slotIntervalMinutes * 60_000;
    // Ascending window-starts for a clean "largest start <= t" lookup.
    const starts = [...candidateStartMillis].sort((a, b) => a - b);
    const spanStart = new Date(starts[0]);
    const spanEnd = new Date(starts[starts.length - 1] + intervalMs);

    const rows = await db.reservation.findMany({
      where: {
        restaurantId,
        status: { in: [...ACTIVE_HOLD_STATUSES] },
        startsAt: { gte: spanStart, lt: spanEnd },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
      },
      select: { startsAt: true, adultsCount: true, childrenCount: true },
    });

    for (const r of rows) {
      const t = r.startsAt.getTime();
      // Largest candidate start <= t; count it only if t is within that window
      // (guards the gaps a DST-skipped middle slot could leave).
      let slotStart: number | null = null;
      for (let i = starts.length - 1; i >= 0; i--) {
        if (starts[i] <= t) {
          if (t < starts[i] + intervalMs) slotStart = starts[i];
          break;
        }
      }
      if (slotStart === null) continue;
      map.set(
        slotStart,
        (map.get(slotStart) ?? 0) + r.adultsCount + r.childrenCount,
      );
    }
    return map;
  }
}
