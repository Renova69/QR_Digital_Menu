import { ForbiddenException } from '@nestjs/common';
import { assertRestaurantActive } from './assert-restaurant-active';

describe('assertRestaurantActive', () => {
  it('does nothing for an active restaurant', () => {
    expect(() =>
      assertRestaurantActive({ id: 'r1', isActive: true, deletedAt: null }),
    ).not.toThrow();
  });

  it('does nothing when isActive is undefined (legacy row treated as active)', () => {
    expect(() => assertRestaurantActive({ id: 'r1' })).not.toThrow();
  });

  it('does nothing for null/undefined restaurant', () => {
    expect(() => assertRestaurantActive(null)).not.toThrow();
    expect(() => assertRestaurantActive(undefined)).not.toThrow();
  });

  it('throws RESTAURANT_SUSPENDED when isActive is false', () => {
    expect(() =>
      assertRestaurantActive({ id: 'r1', isActive: false, deletedAt: null }),
    ).toThrow(ForbiddenException);
  });

  it('throws RESTAURANT_SUSPENDED with a code when deletedAt is a Date', () => {
    let caught: ForbiddenException | null = null;
    try {
      assertRestaurantActive({
        id: 'r1',
        isActive: true,
        deletedAt: new Date(),
      });
    } catch (e) {
      caught = e as ForbiddenException;
    }
    expect(caught).toBeInstanceOf(ForbiddenException);
    expect((caught?.getResponse() as { code?: string })?.code).toBe(
      'RESTAURANT_SUSPENDED',
    );
  });

  it('throws RESTAURANT_SUSPENDED when deletedAt is a string', () => {
    expect(() =>
      assertRestaurantActive({
        id: 'r1',
        isActive: true,
        deletedAt: '2026-08-01',
      }),
    ).toThrow(ForbiddenException);
  });

  it('fails closed when isActive is false even with deletedAt null', () => {
    expect(() =>
      assertRestaurantActive({ id: 'r1', isActive: false, deletedAt: null }),
    ).toThrow(ForbiddenException);
  });
});
