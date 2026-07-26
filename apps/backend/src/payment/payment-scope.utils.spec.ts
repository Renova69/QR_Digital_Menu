import { BadRequestException } from '@nestjs/common';
import {
  normalizeCheckoutScope,
  normalizeScopeOrderIds,
  billScopesEqual,
  billScopesOverlap,
  billScopeFromCheckoutScope,
} from './payment-scope.utils';

describe('normalizeCheckoutScope', () => {
  it('returns null for empty scope', () => {
    expect(normalizeCheckoutScope(undefined)).toBeNull();
    expect(normalizeCheckoutScope({})).toBeNull();
  });

  it('throws for non-array orderIds', () => {
    expect(() => normalizeCheckoutScope({ orderIds: 'abc' as any })).toThrow(
      BadRequestException,
    );
  });

  it('deduplicates and trims orderIds', () => {
    const result = normalizeCheckoutScope({
      orderIds: ['  o1  ', 'o1', 'o2'],
    });
    expect(result).toEqual({ orderIds: ['o1', 'o2'] });
  });

  it('filters empty string ids', () => {
    const result = normalizeCheckoutScope({
      orderIds: ['', '  ', 'o1'],
    });
    expect(result).toEqual({ orderIds: ['o1'] });
  });

  it('throws when all ids are empty after filter', () => {
    expect(() => normalizeCheckoutScope({ orderIds: ['', '  '] })).toThrow(
      BadRequestException,
    );
  });

  it('throws for more than 50 order ids', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `order-${i}`);
    expect(() => normalizeCheckoutScope({ orderIds: ids })).toThrow(
      BadRequestException,
    );
  });
});

describe('normalizeScopeOrderIds', () => {
  it('deduplicates, trims, and sorts', () => {
    const result = normalizeScopeOrderIds(['b', 'a', 'b', '  c  ']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('filters empty strings', () => {
    expect(normalizeScopeOrderIds(['a', '', 'b'])).toEqual(['a', 'b']);
  });
});

describe('billScopesEqual', () => {
  it('returns true for two FULL_TABLE scopes', () => {
    expect(
      billScopesEqual({ kind: 'FULL_TABLE' }, { kind: 'FULL_TABLE' }),
    ).toBe(true);
  });

  it('returns false when kinds differ', () => {
    expect(
      billScopesEqual(
        { kind: 'FULL_TABLE' },
        { kind: 'ORDER_ITEMS', orderIds: ['a'] },
      ),
    ).toBe(false);
  });

  it('returns false for different order lists', () => {
    expect(
      billScopesEqual(
        { kind: 'ORDER_ITEMS', orderIds: ['a', 'b'] },
        { kind: 'ORDER_ITEMS', orderIds: ['b', 'c'] },
      ),
    ).toBe(false);
  });

  it('returns true for same order lists regardless of order', () => {
    expect(
      billScopesEqual(
        { kind: 'ORDER_ITEMS', orderIds: ['b', 'a'] },
        { kind: 'ORDER_ITEMS', orderIds: ['a', 'b'] },
      ),
    ).toBe(true);
  });

  it('returns true for same normalized order lists', () => {
    expect(
      billScopesEqual(
        { kind: 'ORDER_ITEMS', orderIds: ['a', 'b'] },
        { kind: 'ORDER_ITEMS', orderIds: ['b', 'a'] },
      ),
    ).toBe(true);
  });
});

describe('billScopesOverlap', () => {
  it('returns true when either is FULL_TABLE', () => {
    expect(
      billScopesOverlap(
        { kind: 'FULL_TABLE' },
        { kind: 'ORDER_ITEMS', orderIds: ['a'] },
      ),
    ).toBe(true);
  });

  it('returns true when order lists share at least one id', () => {
    expect(
      billScopesOverlap(
        { kind: 'ORDER_ITEMS', orderIds: ['a', 'b'] },
        { kind: 'ORDER_ITEMS', orderIds: ['b', 'c'] },
      ),
    ).toBe(true);
  });

  it('returns false when order lists are disjoint', () => {
    expect(
      billScopesOverlap(
        { kind: 'ORDER_ITEMS', orderIds: ['a'] },
        { kind: 'ORDER_ITEMS', orderIds: ['b'] },
      ),
    ).toBe(false);
  });
});

describe('billScopeFromCheckoutScope', () => {
  it('returns FULL_TABLE for null scope', () => {
    expect(billScopeFromCheckoutScope(null)).toEqual({ kind: 'FULL_TABLE' });
  });

  it('returns ORDER_ITEMS with normalized orderIds', () => {
    const scope = {
      kind: 'ORDER_ITEMS' as const,
      orderIds: ['o2', 'o1', 'o2'],
      allocations: [],
      chargeSubtotal: 0,
    };
    const result = billScopeFromCheckoutScope(scope);
    expect(result).toEqual({ kind: 'ORDER_ITEMS', orderIds: ['o1', 'o2'] });
  });
});
