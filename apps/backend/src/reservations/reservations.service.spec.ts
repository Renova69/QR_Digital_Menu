import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
  const availability = { getSlots: jest.fn().mockResolvedValue([]) };
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
    const { service, prisma, events } = build();
    asOwner(prisma);
    prisma.reservation.findFirst
      .mockResolvedValueOnce({ id: 'r1', status: 'PENDING', startsAt: FUTURE })
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
});
