import { BadRequestException } from '@nestjs/common';
import {
  getReservationSettings,
  updateReservationSettings,
  setReservationServiceHours,
  deleteReservationServiceHours,
} from './reservation-settings.service';

// Test exported pure functions directly — no class / access-service overhead

describe('getReservationSettings', () => {
  it('returns settings and ordered service hours in parallel', async () => {
    const settings = { restaurantId: 'r1', enabled: true };
    const hours = [{ weekday: 1, openMinute: 540, lastSlotMinute: 1200 }];
    const prisma = {
      reservationSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
      },
      reservationServiceHours: {
        findMany: jest.fn().mockResolvedValue(hours),
      },
    };

    const result = await getReservationSettings(prisma as any, 'r1');

    expect(result.settings).toEqual(settings);
    expect(result.serviceHours).toEqual(hours);
    expect(prisma.reservationServiceHours.findMany).toHaveBeenCalledWith({
      where: { restaurantId: 'r1' },
      orderBy: { weekday: 'asc' },
    });
  });
});

describe('updateReservationSettings', () => {
  it('upserts settings', async () => {
    const prisma = {
      reservationSettings: { upsert: jest.fn().mockResolvedValue({ id: 1 }) },
      reservationServiceHours: { count: jest.fn() },
    };

    await updateReservationSettings(
      prisma as any,
      'r1',
      { enabled: true },
      () => Promise.resolve(undefined),
    );

    expect(prisma.reservationSettings.upsert).toHaveBeenCalled();
  });

  it('requires entitlement when enabling', async () => {
    const prisma = {
      reservationSettings: { upsert: jest.fn() },
      reservationServiceHours: { count: jest.fn().mockResolvedValue(1) },
    };
    const requireEntitlement = jest.fn().mockResolvedValue(undefined);

    await updateReservationSettings(
      prisma as any,
      'r1',
      { enabled: true },
      requireEntitlement,
    );

    expect(requireEntitlement).toHaveBeenCalledWith('r1');
  });

  it('throws when enabling without service hours', async () => {
    const prisma = {
      reservationSettings: { upsert: jest.fn() },
      reservationServiceHours: { count: jest.fn().mockResolvedValue(0) },
    };

    await expect(
      updateReservationSettings(prisma as any, 'r1', { enabled: true }, () =>
        Promise.resolve(undefined),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('sanitizes customPreferences before storing', async () => {
    const prisma = {
      reservationSettings: { upsert: jest.fn().mockResolvedValue({}) },
      reservationServiceHours: { count: jest.fn() },
    };

    await updateReservationSettings(
      prisma as any,
      'r1',
      { customPreferences: ['  VIP  ', 'vip', ''] },
      () => Promise.resolve(undefined),
    );

    expect(prisma.reservationSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          customPreferences: expect.any(Array),
        }),
      }),
    );
  });
});

describe('setReservationServiceHours', () => {
  it('upserts each row in a transaction', async () => {
    const rows = [
      { weekday: 1, openMinute: 540, lastSlotMinute: 1200 },
      { weekday: 2, openMinute: 540, lastSlotMinute: 1140 },
    ];
    const mockTx = {
      reservationServiceHours: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: Function) => {
        await fn(mockTx);
      }),
      reservationServiceHours: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
    };

    const result = await setReservationServiceHours(prisma as any, 'r1', rows);

    expect(mockTx.reservationServiceHours.upsert).toHaveBeenCalledTimes(2);
    expect(result).toEqual(rows);
  });

  it('throws when lastSlotMinute < openMinute', async () => {
    const prisma = {};

    await expect(
      setReservationServiceHours(prisma as any, 'r1', [
        { weekday: 1, openMinute: 800, lastSlotMinute: 600 },
      ]),
    ).rejects.toThrow(BadRequestException);
  });

  it('accepts equal openMinute and lastSlotMinute gracefully', async () => {
    const mockTx = {
      reservationServiceHours: { upsert: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: Function) => {
        await fn(mockTx);
      }),
      reservationServiceHours: { findMany: jest.fn().mockResolvedValue([]) },
    };

    // Should not throw — equal times mean instant slots (valid edge case)
    await setReservationServiceHours(prisma as any, 'r1', [
      { weekday: 3, openMinute: 720, lastSlotMinute: 720 },
    ]);
  });
});

describe('deleteReservationServiceHours', () => {
  it('deletes hours for a specific weekday', async () => {
    const prisma = {
      reservationServiceHours: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await deleteReservationServiceHours(prisma as any, 'r1', 3);

    expect(result).toEqual({ success: true });
    expect(prisma.reservationServiceHours.deleteMany).toHaveBeenCalledWith({
      where: { restaurantId: 'r1', weekday: 3 },
    });
  });
});
