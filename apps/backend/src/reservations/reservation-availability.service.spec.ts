import { DateTime } from 'luxon';
import { ConflictException } from '@nestjs/common';
import { ReservationAvailabilityService } from './reservation-availability.service';

const ZONE = 'Europe/Sofia';
// A date safely inside [now + lead, now + horizon] for the settings below.
const DATE = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;

function instant(localTime: string): Date {
  return DateTime.fromISO(`${DATE}T${localTime}`, { zone: ZONE }).toJSDate();
}
function utcIso(localTime: string): string {
  return DateTime.fromISO(`${DATE}T${localTime}`, { zone: ZONE })
    .toUTC()
    .toISO()!;
}

function build(reservations: any[]) {
  const findMany = jest.fn().mockResolvedValue(reservations);
  const prisma = {
    reservationSettings: {
      findUnique: jest.fn().mockResolvedValue({
        enabled: true,
        maxTotalGuests: 20,
        maxCoversPerSlot: 4,
        slotIntervalMinutes: 30,
        minLeadMinutes: 0,
        bookingHorizonDays: 365,
      }),
    },
    restaurant: { findUnique: jest.fn().mockResolvedValue({ timezone: ZONE }) },
    reservationBlackout: { findUnique: jest.fn().mockResolvedValue(null) },
    reservationServiceHours: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ openMinute: 12 * 60, lastSlotMinute: 22 * 60 }),
    },
    reservation: { findMany },
  };
  const service = new ReservationAvailabilityService(
    prisma as unknown as ConstructorParameters<
      typeof ReservationAvailabilityService
    >[0],
  );
  return { service, findMany };
}

describe('ReservationAvailabilityService.getSlots capacity windowing', () => {
  it('counts an OFF-grid manual booking (19:07) against the 19:00 slot cap', async () => {
    const { service } = build([
      { startsAt: instant('19:07'), adultsCount: 4, childrenCount: 0 },
    ]);

    const slots = await service.getSlots('rest1', DATE, 2);
    const starts = slots.map((s) => s.startsAt);

    // 19:00 window [19:00,19:30) holds the 19:07 booking → 4 + 2 > cap 4.
    expect(starts).not.toContain(utcIso('19:00'));
    // The adjacent 19:30 slot is untouched and still bookable.
    expect(starts).toContain(utcIso('19:30'));
  });

  it('still counts an ON-grid booking exactly on the slot (regression)', async () => {
    const { service } = build([
      { startsAt: instant('19:00'), adultsCount: 4, childrenCount: 0 },
    ]);

    const slots = await service.getSlots('rest1', DATE, 1);
    const starts = slots.map((s) => s.startsAt);

    expect(starts).not.toContain(utcIso('19:00')); // 4 + 1 > cap 4
    expect(starts).toContain(utcIso('18:30'));
  });

  it('does not leak a booking across the window boundary (19:30 → its own slot)', async () => {
    const { service } = build([
      { startsAt: instant('19:30'), adultsCount: 4, childrenCount: 0 },
    ]);

    const slots = await service.getSlots('rest1', DATE, 2);
    const starts = slots.map((s) => s.startsAt);

    // The 19:30 booking counts for 19:30, NOT for the earlier 19:00 window.
    expect(starts).toContain(utcIso('19:00'));
    expect(starts).not.toContain(utcIso('19:30'));
  });

  it('keeps ARRIVED reservations in the active cover hold', async () => {
    const { service, findMany } = build([]);

    await service.getSlots('rest1', DATE, 2);

    expect(findMany.mock.calls[0][0].where.status.in).toEqual([
      'PENDING',
      'CONFIRMED',
      'ARRIVED',
    ]);
  });

  it('rejects a same-slot party increase that would exceed the cover cap', async () => {
    const { service } = build([
      { startsAt: instant('19:10'), adultsCount: 2, childrenCount: 0 },
    ]);

    await expect(
      service.assertCapacityAvailable(
        'rest1',
        instant('19:00'),
        3,
        'reservation-being-edited',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReservationAvailabilityService DST transitions', () => {
  // EU DST: clocks spring forward at 03:00->04:00 local on the last Sunday of
  // March, and fall back at 04:00->03:00 local on the last Sunday of October.
  // Regression coverage for a real bug: slots were built as
  // `day.startOf('day').plus({minutes})`, which adds an EXACT real-time
  // duration from midnight — so on a transition day, every slot after the
  // transition point silently drifted by the DST offset change (a full
  // hour), independent of how far the slot itself is from 03:00.
  const SPRING_FORWARD_DATE = '2027-03-28';
  const FALL_BACK_DATE = '2026-10-25';

  function instantOn(date: string, localTime: string): Date {
    return DateTime.fromISO(`${date}T${localTime}`, { zone: ZONE }).toJSDate();
  }
  function utcIsoOn(date: string, localTime: string): string {
    return DateTime.fromISO(`${date}T${localTime}`, { zone: ZONE })
      .toUTC()
      .toISO()!;
  }

  it('does not drift slots forward on the spring-forward transition day', async () => {
    const { service } = build([]);

    const slots = await service.getSlots('rest1', SPRING_FORWARD_DATE, 2);
    const starts = slots.map((s) => s.startsAt);
    const labels = slots.map((s) => s.label);

    // Service hours are 12:00-22:00 (30-min slots, from the shared `build()`
    // fixture). The drift bug shifted the WHOLE grid forward by an hour on
    // this transition day (first slot became 13:00, last became 23:00) —
    // check the actual boundaries, not just a middle slot's presence, since
    // a shifted grid still contains most of the same middle labels.
    expect(labels[0]).toBe('12:00');
    expect(labels[labels.length - 1]).toBe('22:00');
    expect(starts).toContain(utcIsoOn(SPRING_FORWARD_DATE, '18:00'));
    expect(labels).toContain('18:00');
  });

  it('does not drift slots backward on the fall-back transition day', async () => {
    const { service } = build([]);

    const slots = await service.getSlots('rest1', FALL_BACK_DATE, 2);
    const starts = slots.map((s) => s.startsAt);
    const labels = slots.map((s) => s.label);

    // Same boundary check as the spring-forward test above, other direction:
    // the drift bug shifted this grid backward by an hour (first slot became
    // 11:00, last became 21:00).
    expect(labels[0]).toBe('12:00');
    expect(labels[labels.length - 1]).toBe('22:00');
    expect(starts).toContain(utcIsoOn(FALL_BACK_DATE, '18:00'));
    expect(labels).toContain('18:00');
  });

  it('assertCapacityAvailable resolves the correct slot window on a DST transition day', async () => {
    const { service } = build([
      {
        startsAt: instantOn(SPRING_FORWARD_DATE, '18:10'),
        adultsCount: 4,
        childrenCount: 0,
      },
    ]);

    // A booking at 18:10 (drifted-bug version would have keyed this to the
    // wrong window, e.g. 19:00) must count against the real 18:00 window.
    await expect(
      service.assertCapacityAvailable(
        'rest1',
        instantOn(SPRING_FORWARD_DATE, '18:00'),
        1,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
