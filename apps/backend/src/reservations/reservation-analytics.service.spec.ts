import { fetchReservationAnalytics } from './reservation-analytics.service';

describe('fetchReservationAnalytics', () => {
  it('returns analytics summary from reservations', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockPrisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Sofia' }),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            startsAt: new Date('2026-07-18T19:00:00Z'),
            status: 'CONFIRMED',
            adultsCount: 2,
            childrenCount: 0,
          },
          {
            startsAt: new Date('2026-07-19T20:00:00Z'),
            status: 'CONFIRMED',
            adultsCount: 4,
            childrenCount: 1,
          },
        ]),
      },
    };

    const result = await fetchReservationAnalytics(mockPrisma as any, 'r1');

    expect(result.total).toBe(2);
    expect(result.windowDays).toBe(30);
    expect(result.avgPartySize).toBeGreaterThan(0);
    expect(result.statusCounts).toBeDefined();
    jest.useRealTimers();
  });

  it('excludes DECLINED and CANCELLED from avg party size', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockPrisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Sofia' }),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            startsAt: new Date('2026-07-18T19:00:00Z'),
            status: 'DECLINED',
            adultsCount: 3,
            childrenCount: 0,
          },
          {
            startsAt: new Date('2026-07-19T20:00:00Z'),
            status: 'CANCELLED',
            adultsCount: 1,
            childrenCount: 0,
          },
          {
            startsAt: new Date('2026-07-20T19:00:00Z'),
            status: 'CONFIRMED',
            adultsCount: 2,
            childrenCount: 0,
          },
        ]),
      },
    };

    const result = await fetchReservationAnalytics(mockPrisma as any, 'r1');

    expect(result.avgPartySize).toBe(2); // Only CONFIRMED counted
    jest.useRealTimers();
  });

  it('counts NO_SHOW in status counts', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockPrisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Sofia' }),
      },
      reservation: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              startsAt: new Date('2026-07-18T19:00:00Z'),
              status: 'NO_SHOW',
              adultsCount: 2,
              childrenCount: 0,
            },
          ]),
      },
    };

    const result = await fetchReservationAnalytics(mockPrisma as any, 'r1');

    expect(result.noShows).toBe(1);
    jest.useRealTimers();
  });

  it('returns empty results when no reservations exist', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockPrisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const result = await fetchReservationAnalytics(mockPrisma as any, 'r1');

    expect(result.total).toBe(0);
    expect(result.avgPartySize).toBe(0);
    jest.useRealTimers();
  });

  it('falls back to Europe/Sofia timezone', async () => {
    const now = new Date('2026-07-20T12:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockPrisma = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(null) },
      reservation: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await fetchReservationAnalytics(mockPrisma as any, 'r1');
    // Should not throw — falls back to Europe/Sofia
    jest.useRealTimers();
  });
});
