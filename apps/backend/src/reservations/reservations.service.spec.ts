import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';

const FUTURE = new Date(Date.now() + 2 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

function build() {
  const txReservationCreate = jest.fn().mockResolvedValue({
    id: 'r1',
    referenceCode: 'ABC234',
    status: 'PENDING',
    startsAt: FUTURE,
    guestName: 'Guest',
    adultsCount: 2,
    childrenCount: 0,
  });
  const tx = {
    reservation: { create: txReservationCreate },
    reservationEvent: { create: jest.fn() },
    patron: { update: jest.fn() },
  };
  const prisma: any = {
    restaurant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    reservation: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    reservationEvent: { create: jest.fn() },
    reservationSettings: { findUnique: jest.fn() },
    reservationServiceHours: { count: jest.fn(), findMany: jest.fn() },
    patron: { update: jest.fn() },
    $transaction: jest.fn((fn: any) => fn(tx)),
  };
  const availability = {
    getSlots: jest.fn().mockResolvedValue([]),
    assertSlotBookable: jest.fn().mockResolvedValue(undefined),
  };
  const allergens = {
    getMenuAllergenSummary: jest
      .fn()
      .mockResolvedValue({ allergens: [], dietaryTags: [] }),
  };
  const patrons = {
    matchOrCreate: jest.fn().mockResolvedValue({ id: 'p1' }),
    setStaffTags: jest.fn(),
  };
  const features = { restaurantHasFeature: jest.fn().mockReturnValue(true) };
  const events = {
    emitReservationCreated: jest.fn(),
    emitReservationUpdated: jest.fn(),
  };
  const notifications = { notify: jest.fn() };
  const service = new ReservationsService(
    prisma,
    availability as any,
    allergens as any,
    patrons as any,
    features as any,
    events as any,
    notifications as any,
  );
  return {
    service,
    prisma,
    tx,
    txReservationCreate,
    availability,
    features,
    events,
    notifications,
  };
}

describe('ReservationsService access control', () => {
  it('denies a KITCHEN user', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner' });
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: 'rest1',
      role: 'KITCHEN',
    });
    await expect(service.list('rest1', 'kitchen-user', {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the owner', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner' });
    prisma.reservation.findMany.mockResolvedValue([]);
    await expect(service.list('rest1', 'owner', {})).resolves.toEqual([]);
  });

  it('aggregates analytics, excluding declined/cancelled from party avg (Feature 6)', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner',
      timezone: 'Europe/Sofia',
    });
    const day = 86400000;
    prisma.reservation.findMany.mockResolvedValue([
      {
        startsAt: new Date(Date.now() - 2 * day),
        status: 'CONFIRMED',
        adultsCount: 2,
        childrenCount: 0,
      },
      {
        startsAt: new Date(Date.now() - 1 * day),
        status: 'NO_SHOW',
        adultsCount: 4,
        childrenCount: 1,
      },
      {
        startsAt: new Date(Date.now() - 3 * day),
        status: 'DECLINED',
        adultsCount: 4,
        childrenCount: 0,
      },
      {
        startsAt: new Date(Date.now() - 10 * day),
        status: 'CANCELLED',
        adultsCount: 3,
        childrenCount: 0,
      },
    ]);

    const stats = await service.getAnalytics('rest1', 'owner');

    expect(stats.total).toBe(4);
    expect(stats.thisWeek).toBe(3); // the 10-day-old one is outside the week
    expect(stats.noShows).toBe(1);
    // Party avg over CONFIRMED(2) + NO_SHOW(5) only = 3.5.
    expect(stats.avgPartySize).toBe(3.5);
    expect(stats.statusCounts.DECLINED).toBe(1);
  });

  it('upcoming mode filters to actionable statuses from today, ignoring date', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner' });
    await service.list('rest1', 'owner', {
      upcoming: 'true',
      date: '2020-01-01',
    });
    const arg = prisma.reservation.findMany.mock.calls[0][0];
    expect(arg.where.status).toEqual({
      in: ['PENDING', 'CONFIRMED', 'ARRIVED'],
    });
    expect(arg.where.startsAt.gte).toBeInstanceOf(Date);
    expect(arg.where.startsAt.lte).toBeUndefined();
  });
});

describe('ReservationsService.executeAction (state machine)', () => {
  const asOwner = (prisma: any) => {
    prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner' });
  };

  it('accepts a PENDING reservation (guarded CAS) and emits', async () => {
    const { service, prisma, events, notifications } = build();
    asOwner(prisma);
    prisma.reservation.findFirst
      .mockResolvedValueOnce({
        id: 'r1',
        status: 'PENDING',
        startsAt: FUTURE,
        notificationLocale: 'bg',
      })
      .mockResolvedValueOnce({
        id: 'r1',
        status: 'CONFIRMED',
        startsAt: FUTURE,
        patron: { staffTags: [] },
      });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    await service.executeAction('r1', 'owner', 'rest1', 'ACCEPT');

    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'r1',
        restaurantId: 'rest1',
        status: { in: ['PENDING'] },
      },
      data: { status: 'CONFIRMED' },
    });
    expect(events.emitReservationUpdated).toHaveBeenCalledWith('rest1', {
      id: 'r1',
      status: 'CONFIRMED',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      'CONFIRMED',
      expect.objectContaining({ notificationLocale: 'bg' }),
    );
  });

  it('rejects the action when the CAS finds no matching source status', async () => {
    const { service, prisma } = build();
    asOwner(prisma);
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CONFIRMED',
      startsAt: FUTURE,
    });
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.executeAction('r1', 'owner', 'rest1', 'ACCEPT'),
    ).rejects.toThrow(ConflictException);
  });

  it('forbids NO_SHOW before the reservation start time', async () => {
    const { service, prisma } = build();
    asOwner(prisma);
    prisma.reservation.findFirst.mockResolvedValue({
      id: 'r1',
      status: 'CONFIRMED',
      startsAt: FUTURE,
    });
    await expect(
      service.executeAction('r1', 'owner', 'rest1', 'NO_SHOW'),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows NO_SHOW after start', async () => {
    const { service, prisma } = build();
    asOwner(prisma);
    prisma.reservation.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'CONFIRMED', startsAt: PAST })
      .mockResolvedValueOnce({
        id: 'r1',
        status: 'NO_SHOW',
        startsAt: PAST,
        patron: { staffTags: [] },
      });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.executeAction('r1', 'owner', 'rest1', 'NO_SHOW'),
    ).resolves.toBeDefined();
  });

  it('forbids a STAFF user from accepting', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner' });
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: 'rest1',
      role: 'STAFF',
    });
    await expect(
      service.executeAction('r1', 'staff-user', 'rest1', 'ACCEPT'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('ReservationsService.createPublic (consent gate + entitlement)', () => {
  const baseDto = {
    guestName: 'Guest',
    guestPhone: '0888123456',
    startsAt: FUTURE.toISOString(),
    adultsCount: 2,
    customerPreferences: ['VEGAN', 'PET'],
    allergyNotes: 'peanuts',
  };

  it('drops dietary/allergy when consent is not given', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue({
      enabled: true,
      maxTotalGuests: 12,
      autoConfirm: false,
      requirePhone: true,
    });

    await service.createPublic('rest1', { ...baseDto, dietaryConsent: false });

    const data = txReservationCreate.mock.calls[0][0].data;
    expect(data.customerPreferences).toEqual(['PET']); // VEGAN dropped
    expect(data.allergyNotes).toBeNull();
    expect(data.dietaryConsentAt).toBeNull();
  });

  it('snapshots the base dining duration for a small party (Feature 4)', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue({
      enabled: true,
      maxTotalGuests: 12,
      autoConfirm: false,
      requirePhone: true,
      diningDurationMinutes: 90,
      largePartyThreshold: 5,
      largePartyDurationMinutes: 150,
    });

    await service.createPublic('rest1', { ...baseDto, dietaryConsent: true });

    expect(txReservationCreate.mock.calls[0][0].data.durationMinutes).toBe(90);
  });

  it('snapshots the large-party dining duration at/above the threshold', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue({
      enabled: true,
      maxTotalGuests: 12,
      autoConfirm: false,
      requirePhone: true,
      diningDurationMinutes: 90,
      largePartyThreshold: 5,
      largePartyDurationMinutes: 150,
    });

    await service.createPublic('rest1', {
      ...baseDto,
      adultsCount: 6,
      dietaryConsent: true,
    });

    expect(txReservationCreate.mock.calls[0][0].data.durationMinutes).toBe(150);
  });

  it('stores dietary/allergy when consent is given', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue({
      enabled: true,
      maxTotalGuests: 12,
      autoConfirm: false,
      requirePhone: true,
    });

    await service.createPublic('rest1', { ...baseDto, dietaryConsent: true });

    const data = txReservationCreate.mock.calls[0][0].data;
    expect(data.customerPreferences).toEqual(['VEGAN', 'PET']);
    expect(data.allergyNotes).toBe('peanuts');
    expect(data.dietaryConsentAt).toBeInstanceOf(Date);
  });

  it('is FEATURE_LOCKED without the reservations entitlement', async () => {
    const { service, features } = build();
    features.restaurantHasFeature.mockReturnValue(false);
    await expect(
      service.createPublic('rest1', { ...baseDto, dietaryConsent: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('normalizes the phone to E.164 (+359 default)', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue({
      enabled: true,
      maxTotalGuests: 12,
      autoConfirm: false,
      requirePhone: true,
    });
    await service.createPublic('rest1', { ...baseDto, dietaryConsent: true });
    expect(txReservationCreate.mock.calls[0][0].data.guestPhone).toBe(
      '+359888123456',
    );
  });

  it('rejects a public booking when the slot is no longer bookable (Fix 1/2)', async () => {
    const { service, prisma, availability, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue({
      enabled: true,
      maxTotalGuests: 12,
      autoConfirm: false,
      requirePhone: true,
    });
    availability.assertSlotBookable.mockRejectedValueOnce(
      new ConflictException('This time is no longer available.'),
    );
    await expect(
      service.createPublic('rest1', { ...baseDto, dietaryConsent: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Guard runs before the write — nothing is persisted.
    expect(txReservationCreate).not.toHaveBeenCalled();
  });
});

describe('ReservationsService guest self-service (manage token, Feature 2)', () => {
  const LATER = new Date(FUTURE.getTime() + 60 * 60 * 1000); // a different slot
  const liveReservation = {
    id: 'r1',
    restaurantId: 'rest1',
    referenceCode: 'ABC234',
    status: 'CONFIRMED',
    guestName: 'Guest',
    guestEmail: 'g@example.com',
    guestPhone: '+359888123456',
    startsAt: FUTURE,
    adultsCount: 2,
    childrenCount: 0,
    notifyByEmail: true,
    notifyBySms: false,
    notificationLocale: 'bg',
    manageToken: 'tok_live',
    updatedAt: new Date('2026-07-01T10:00:00.000Z'),
  };

  it('rejects an unknown token with NotFound', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue(null);
    await expect(
      service.cancelByManageToken('rest1', 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a token that belongs to another restaurant', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue({
      ...liveReservation,
      restaurantId: 'other',
    });
    await expect(
      service.cancelByManageToken('rest1', 'tok_live'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels a live booking and notifies the guest', async () => {
    const { service, prisma, events, notifications } = build();
    prisma.reservation.findUnique.mockResolvedValue(liveReservation);
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.cancelByManageToken('rest1', 'tok_live');

    expect(res.status).toBe('CANCELLED');
    expect(prisma.reservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'r1',
          status: { in: ['PENDING', 'CONFIRMED'] },
        }),
        data: { status: 'CANCELLED' },
      }),
    );
    expect(events.emitReservationUpdated).toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenCalledWith(
      'CANCELLED',
      expect.objectContaining({
        referenceCode: 'ABC234',
        notificationLocale: 'bg',
      }),
    );
  });

  it('no-ops the cancel when the CAS loses (already acted on)', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue(liveReservation);
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.cancelByManageToken('rest1', 'tok_live'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('changes party size in the SAME slot without re-running the slot guard', async () => {
    // C-HIGH-2: a party-only edit must not re-apply the lead-time/hours guard,
    // which would wrongly reject an edit made inside the lead window.
    const { service, prisma, availability } = build();
    prisma.reservation.findUnique.mockResolvedValue(liveReservation);
    prisma.reservationSettings.findUnique.mockResolvedValue({
      maxTotalGuests: 12,
    });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    const res = await service.modifyByManageToken('rest1', 'tok_live', {
      adultsCount: 4,
    });

    expect(res.totalGuests).toBe(4);
    expect(availability.assertSlotBookable).not.toHaveBeenCalled();
    // Same-slot change keeps the existing reminder state (no reset).
    const data = prisma.reservation.updateMany.mock.calls[0][0].data;
    expect(data.reminderSentAt).toBeUndefined();
  });

  it('re-validates availability (excluding own hold) and re-arms the reminder when the time changes', async () => {
    const { service, prisma, availability } = build();
    prisma.reservation.findUnique.mockResolvedValue(liveReservation);
    prisma.reservationSettings.findUnique.mockResolvedValue({
      maxTotalGuests: 12,
    });
    prisma.reservation.updateMany.mockResolvedValue({ count: 1 });

    await service.modifyByManageToken('rest1', 'tok_live', {
      startsAt: LATER.toISOString(),
    });

    expect(availability.assertSlotBookable).toHaveBeenCalledWith(
      'rest1',
      expect.any(Date),
      2,
      'r1',
    );
    // A time change re-arms the 24h reminder for the new slot.
    const data = prisma.reservation.updateMany.mock.calls[0][0].data;
    expect(data.reminderSentAt).toBeNull();
  });

  it('no-ops (Conflict) when a concurrent write bumped updatedAt (lost-update guard)', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue(liveReservation);
    prisma.reservationSettings.findUnique.mockResolvedValue({
      maxTotalGuests: 12,
    });
    prisma.reservation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.modifyByManageToken('rest1', 'tok_live', { adultsCount: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
    // CAS is guarded on updatedAt, not just status.
    const where = prisma.reservation.updateMany.mock.calls[0][0].where;
    expect(where.updatedAt).toEqual(liveReservation.updatedAt);
  });

  it('refuses to modify a booking that has already started', async () => {
    const { service, prisma } = build();
    prisma.reservation.findUnique.mockResolvedValue({
      ...liveReservation,
      startsAt: PAST,
    });
    await expect(
      service.modifyByManageToken('rest1', 'tok_live', { adultsCount: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('propagates the availability guard rejection on a time change', async () => {
    const { service, prisma, availability } = build();
    prisma.reservation.findUnique.mockResolvedValue(liveReservation);
    availability.assertSlotBookable.mockRejectedValueOnce(
      new ConflictException('This time is no longer available.'),
    );
    await expect(
      service.modifyByManageToken('rest1', 'tok_live', {
        startsAt: LATER.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ReservationsService createReservation hardening', () => {
  const dto = {
    guestName: 'Guest',
    guestPhone: '0888123456',
    startsAt: FUTURE.toISOString(),
    adultsCount: 2,
  };
  const enabledSettings = {
    enabled: true,
    maxTotalGuests: 12,
    autoConfirm: false,
    requirePhone: true,
  };

  it('does not record marketing consent for a STAFF manual booking (S-LOW)', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner' });
    prisma.reservationSettings.findUnique.mockResolvedValue(enabledSettings);

    await service.createManual('rest1', 'owner', {
      ...dto,
      marketingConsent: true,
    });

    expect(
      txReservationCreate.mock.calls[0][0].data.marketingConsentAt,
    ).toBeNull();
  });

  it('records marketing consent for a PUBLIC booking when opted in', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue(enabledSettings);

    await service.createPublic('rest1', {
      ...dto,
      marketingConsent: true,
      dietaryConsent: true,
    });

    expect(
      txReservationCreate.mock.calls[0][0].data.marketingConsentAt,
    ).not.toBeNull();
  });

  it('persists the guest locale and reuses it for lifecycle notifications', async () => {
    const { service, prisma, txReservationCreate, notifications } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue(enabledSettings);
    txReservationCreate.mockResolvedValueOnce({
      id: 'r1',
      referenceCode: 'ABC234',
      status: 'PENDING',
      startsAt: FUTURE,
      guestName: 'Guest',
      guestEmail: 'g@example.com',
      guestPhone: '+359888123456',
      adultsCount: 2,
      childrenCount: 0,
      notifyByEmail: true,
      notifyBySms: false,
      notificationLocale: 'bg',
      manageToken: 'manage-secret',
    });

    await service.createPublic('rest1', {
      ...dto,
      guestEmail: 'g@example.com',
      locale: 'bg',
    });

    expect(txReservationCreate.mock.calls[0][0].data.notificationLocale).toBe(
      'bg',
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      'RECEIVED',
      expect.objectContaining({ notificationLocale: 'bg' }),
    );
  });

  it('replays the idempotent result instead of 500 on a concurrent key collision (C-MED-5)', async () => {
    const { service, prisma, txReservationCreate } = build();
    prisma.reservationSettings.findUnique.mockResolvedValue(enabledSettings);
    // Pre-check finds nothing; the create loses the unique-insert race; the
    // post-collision refetch returns the request that won.
    const winner = {
      referenceCode: 'WIN123',
      status: 'PENDING',
      startsAt: FUTURE,
    };
    prisma.reservation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    const p2002 = Object.assign(new Error('unique constraint'), {
      code: 'P2002',
      meta: { target: ['restaurantId', 'idempotencyKey'] },
    });
    txReservationCreate.mockRejectedValueOnce(p2002);

    const res = await service.createPublic('rest1', {
      ...dto,
      dietaryConsent: true,
      idempotencyKey: 'key-1',
    });

    expect(res.referenceCode).toBe('WIN123');
  });
});
