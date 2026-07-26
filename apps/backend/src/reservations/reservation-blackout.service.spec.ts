import { BadRequestException } from '@nestjs/common';
import {
  listReservationBlackouts,
  addReservationBlackout,
  removeReservationBlackout,
} from './reservation-blackout.service';

describe('listReservationBlackouts', () => {
  it('returns blackouts ordered by date asc', async () => {
    const prisma = {
      reservationBlackout: {
        findMany: jest.fn().mockResolvedValue([
          { date: '2026-12-24', reason: 'Christmas Eve' },
          { date: '2026-12-25', reason: 'Christmas' },
        ]),
      },
    };

    const result = await listReservationBlackouts(prisma as any, 'r1');

    expect(result).toHaveLength(2);
    expect(prisma.reservationBlackout.findMany).toHaveBeenCalledWith({
      where: { restaurantId: 'r1' },
      orderBy: { date: 'asc' },
    });
  });
});

describe('addReservationBlackout', () => {
  it('upserts a blackout date', async () => {
    const prisma = {
      reservationBlackout: {
        upsert: jest.fn().mockResolvedValue({
          date: '2026-08-15',
          reason: 'Holiday',
        }),
      },
    };

    const result = await addReservationBlackout(
      prisma as any,
      'r1',
      '2026-08-15',
      'Holiday',
    );

    expect(result.date).toBe('2026-08-15');
    expect(prisma.reservationBlackout.upsert).toHaveBeenCalledWith({
      where: {
        restaurantId_date: { restaurantId: 'r1', date: '2026-08-15' },
      },
      create: { restaurantId: 'r1', date: '2026-08-15', reason: 'Holiday' },
      update: { reason: 'Holiday' },
    });
  });

  it('trims reason and defaults null', async () => {
    const prisma = {
      reservationBlackout: { upsert: jest.fn().mockResolvedValue({}) },
    };

    await addReservationBlackout(prisma as any, 'r1', '2026-12-31', '  NYE  ');

    expect(prisma.reservationBlackout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: 'NYE' }),
      }),
    );
  });

  it('rejects non-ISO date strings', async () => {
    const prisma = { reservationBlackout: { upsert: jest.fn() } };

    await expect(
      addReservationBlackout(prisma as any, 'r1', 'not-a-date'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      addReservationBlackout(prisma as any, 'r1', '2026-08-15T12:00:00Z'),
    ).rejects.toThrow(BadRequestException);

    await expect(
      addReservationBlackout(prisma as any, 'r1', '2026-13-01'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects empty string date', async () => {
    await expect(addReservationBlackout({} as any, 'r1', '')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('removeReservationBlackout', () => {
  it('removes a blackout by date', async () => {
    const prisma = {
      reservationBlackout: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await removeReservationBlackout(
      prisma as any,
      'r1',
      '2026-08-15',
    );

    expect(result).toEqual({ success: true });
    expect(prisma.reservationBlackout.deleteMany).toHaveBeenCalledWith({
      where: { restaurantId: 'r1', date: '2026-08-15' },
    });
  });

  it('rejects invalid date', async () => {
    await expect(
      removeReservationBlackout({} as any, 'r1', 'bad-date'),
    ).rejects.toThrow(BadRequestException);
  });
});
