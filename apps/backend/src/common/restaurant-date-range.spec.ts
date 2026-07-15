import { buildRestaurantDateRange } from './restaurant-date-range';

describe('buildRestaurantDateRange', () => {
  it('converts summer calendar boundaries from the restaurant zone to UTC', () => {
    const range = buildRestaurantDateRange(
      '2026-07-15',
      '2026-07-15',
      'Europe/Sofia',
    );

    expect(range.gte?.toISOString()).toBe('2026-07-14T21:00:00.000Z');
    expect(range.lte?.toISOString()).toBe('2026-07-15T20:59:59.999Z');
  });

  it('accounts for the winter offset independently', () => {
    const range = buildRestaurantDateRange(
      '2026-01-15',
      '2026-01-15',
      'Europe/Sofia',
    );

    expect(range.gte?.toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(range.lte?.toISOString()).toBe('2026-01-15T21:59:59.999Z');
  });
});
