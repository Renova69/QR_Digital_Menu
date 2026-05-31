import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PosProvider, usePos } from './PosContext';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <PosProvider>{children}</PosProvider>
);

const makeItem = (over: Partial<Parameters<ReturnType<typeof usePos>['addItem']>[0]> = {}) => ({
  menuItemId: 'm1',
  name: 'Pizza',
  price: 10,
  quantity: 1,
  selectedOptions: [],
  seatNumber: 'Seat 1',
  itemNote: '',
  ...over,
});

describe('PosContext', () => {
  it('addItem appends a non-submitted item with a generated cartId', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].submitted).toBe(false);
    expect(result.current.items[0].cartId).toBeTruthy();
  });

  it('getPendingTotal sums only non-submitted items (incl. option modifiers)', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.addItem(makeItem({ price: 10, quantity: 2 })); // 20
      result.current.addItem(
        makeItem({
          price: 5,
          quantity: 1,
          selectedOptions: [{ optionId: 'o', optionName: 'Size', choiceName: 'L', priceModifier: 2 }],
        }), // 7
      );
    });

    expect(result.current.getPendingTotal()).toBe(27);

    act(() => result.current.markAsSubmitted());
    // After submit, nothing is pending.
    expect(result.current.getPendingTotal()).toBe(0);
    // ...but the running total still counts everything.
    expect(result.current.getTotal()).toBe(27);
  });

  it('markAsSubmitted flips pending items to submitted', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    act(() => result.current.markAsSubmitted());

    expect(result.current.items.every((i) => i.submitted)).toBe(true);
  });

  it('clearCart removes only pending items, preserving submitted history', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem({ name: 'Submitted' })));
    act(() => result.current.markAsSubmitted());
    act(() => result.current.addItem(makeItem({ name: 'Pending' })));

    act(() => result.current.clearCart());

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe('Submitted');
    expect(result.current.items[0].submitted).toBe(true);
  });

  it('resetCart removes ALL items', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    act(() => result.current.markAsSubmitted());
    act(() => result.current.addItem(makeItem({ name: 'Pending' })));

    act(() => result.current.resetCart());

    expect(result.current.items).toHaveLength(0);
  });

  it('setHistoryItems replaces submitted items and keeps pending ones', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem({ name: 'Pending' })));
    act(() =>
      result.current.setHistoryItems([
        { ...makeItem({ name: 'History' }), cartId: 'h1', submitted: true },
      ]),
    );

    const names = result.current.items.map((i) => i.name).sort();
    expect(names).toEqual(['History', 'Pending']);
    // History first, pending appended after.
    expect(result.current.items[0].name).toBe('History');
  });

  it('updateQuantity(0) removes the item', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    const cartId = result.current.items[0].cartId;

    act(() => result.current.updateQuantity(cartId, 0));

    expect(result.current.items).toHaveLength(0);
  });

  it('buildSpecialRequests groups pending items by seat and ignores submitted', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.addItem(makeItem({ name: 'Burger', seatNumber: 'Seat 1', itemNote: 'no onion' }));
      result.current.addItem(makeItem({ name: 'Fries', seatNumber: 'Seat 1', quantity: 2 }));
      result.current.addItem(makeItem({ name: 'Cola', seatNumber: 'Seat 2' }));
    });

    const summary = result.current.buildSpecialRequests();
    expect(summary).toContain('[Seat 1] Burger: no onion, Fries x2');
    expect(summary).toContain('[Seat 2] Cola');

    // Submitted items are excluded from the next special-requests payload.
    act(() => result.current.markAsSubmitted());
    expect(result.current.buildSpecialRequests()).toBe('');
  });

  it('clearSession resets items, session, and active seat', () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.setSession({ tableId: 't1', tableName: '1', sessionToken: 'tok', sessionId: 's1' });
      result.current.addItem(makeItem());
      result.current.setActiveSeat('Seat 3');
    });

    act(() => result.current.clearSession());

    expect(result.current.session).toBeNull();
    expect(result.current.items).toHaveLength(0);
    expect(result.current.activeSeat).toBe('Seat 1');
  });
});
