import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PosProvider, usePos } from "./PosContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PosProvider>{children}</PosProvider>
);

const makeItem = (
  over: Partial<Parameters<ReturnType<typeof usePos>["addItem"]>[0]> = {},
) => ({
  menuItemId: "m1",
  name: "Pizza",
  price: 10,
  quantity: 1,
  selectedOptions: [],
  seatNumber: "Seat 1",
  itemNote: "",
  ...over,
});

describe("PosContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("addItem appends a non-submitted item with a generated cartId", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].submitted).toBe(false);
    expect(result.current.items[0].cartId).toBeTruthy();
  });

  it("getPendingTotal sums only non-submitted items (incl. option modifiers)", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.addItem(makeItem({ price: 10, quantity: 2 })); // 20
      result.current.addItem(
        makeItem({
          price: 5,
          quantity: 1,
          selectedOptions: [
            {
              optionId: "o",
              optionName: "Size",
              choiceName: "L",
              priceModifier: 2,
            },
          ],
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

  it("rounds displayed totals to currency precision", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.addItem(makeItem({ price: 0.1 }));
      result.current.addItem(makeItem({ price: 0.2 }));
    });

    expect(result.current.getPendingTotal()).toBe(0.3);
    expect(result.current.getTotal()).toBe(0.3);
  });

  it("markAsSubmitted flips pending items to submitted", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    act(() => result.current.markAsSubmitted());

    expect(result.current.items.every((i) => i.submitted)).toBe(true);
  });

  it("tracks the queued, conflict, retry-edit, and delivered lifecycle by batch", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    const cartId = result.current.items[0].cartId;

    act(() => result.current.markAsQueued("client-order-1", [cartId]));
    expect(result.current.items[0]).toMatchObject({
      submitted: true,
      syncState: "queued",
      queuedOrderId: "client-order-1",
    });

    act(() => result.current.markQueuedAsConflict("client-order-1"));
    expect(result.current.items[0].syncState).toBe("conflict");

    act(() => result.current.restoreQueuedOrder("client-order-1"));
    expect(result.current.items[0]).toMatchObject({
      submitted: false,
      syncState: undefined,
      queuedOrderId: undefined,
    });

    act(() => result.current.markAsQueued("client-order-2", [cartId]));
    act(() => result.current.markQueuedAsSubmitted("client-order-2"));
    expect(result.current.items[0]).toMatchObject({
      submitted: true,
      syncState: "sent",
      queuedOrderId: undefined,
    });
  });

  it("marks only the cart lines captured by a submission", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem({ name: "First" })));
    const firstCartId = result.current.items[0].cartId;
    act(() => result.current.addItem(makeItem({ name: "Second" })));

    act(() => result.current.markAsSubmitted([firstCartId]));

    expect(
      result.current.items.find((item) => item.name === "First")?.submitted,
    ).toBe(true);
    expect(
      result.current.items.find((item) => item.name === "Second")?.submitted,
    ).toBe(false);
  });

  it("reopens a queued batch for editing after the waiter switched tables", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() =>
      result.current.loadQueuedOrderForEdit({
        clientOrderId: "client-order-1",
        restaurantId: "restaurant-1",
        tableId: "table-1",
        tableName: "Table 1",
        localSessionId: "local-session-1",
        createdAt: "2026-07-13T10:00:00.000Z",
        updatedAt: "2026-07-13T10:00:00.000Z",
        attempts: 1,
        status: "conflict",
        payload: {
          customerName: "Guest",
          source: "POS",
          tableId: "Table 1",
          restaurantId: "restaurant-1",
          posSubmission: {
            clientOrderId: "client-order-1",
            restaurantId: "restaurant-1",
            tableId: "table-1",
            expectedTableSessionId: "server-session-1",
          },
          items: [],
        },
        cartItems: [
          {
            ...makeItem({ name: "Queued Pizza" }),
            cartId: "queued-cart-1",
          },
        ],
      }),
    );

    expect(result.current.session).toMatchObject({
      tableId: "table-1",
      sessionId: "server-session-1",
      localSessionId: "local-session-1",
    });
    expect(result.current.items).toEqual([
      expect.objectContaining({
        name: "Queued Pizza",
        submitted: false,
        queuedOrderId: undefined,
      }),
    ]);
  });

  it("keeps the rest of the current table when editing one queued batch", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.setSession({
        tableId: "table-1",
        tableName: "Table 1",
        sessionToken: null,
        sessionId: null,
        localSessionId: "local-session-1",
      });
      result.current.addItem(makeItem({ name: "Already sent" }));
    });
    act(() => result.current.markAsSubmitted());
    act(() => result.current.addItem(makeItem({ name: "Queued original" })));
    const queuedCartId = result.current.items.find(
      (item) => item.name === "Queued original",
    )!.cartId;
    act(() => result.current.markAsQueued("client-order-1", [queuedCartId]));
    act(() => result.current.addItem(makeItem({ name: "New pending" })));

    act(() =>
      result.current.loadQueuedOrderForEdit({
        clientOrderId: "client-order-1",
        restaurantId: "restaurant-1",
        tableId: "table-1",
        tableName: "Table 1",
        localSessionId: "local-session-1",
        createdAt: "2026-07-13T10:00:00.000Z",
        updatedAt: "2026-07-13T10:00:00.000Z",
        attempts: 1,
        status: "conflict",
        payload: {
          customerName: "Guest",
          source: "POS",
          tableId: "Table 1",
          restaurantId: "restaurant-1",
          posSubmission: {
            clientOrderId: "client-order-1",
            restaurantId: "restaurant-1",
            tableId: "table-1",
            expectedTableSessionId: null,
          },
          items: [],
        },
        cartItems: [
          {
            ...makeItem({ name: "Queued editable" }),
            cartId: queuedCartId,
          },
        ],
      }),
    );

    expect(result.current.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Already sent", submitted: true }),
        expect.objectContaining({ name: "New pending", submitted: false }),
        expect.objectContaining({
          name: "Queued editable",
          submitted: false,
          queuedOrderId: undefined,
        }),
      ]),
    );
    expect(result.current.items).toHaveLength(3);
  });

  it("clearCart removes only pending items, preserving submitted history", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem({ name: "Submitted" })));
    act(() => result.current.markAsSubmitted());
    act(() => result.current.addItem(makeItem({ name: "Pending" })));

    act(() => result.current.clearCart());

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("Submitted");
    expect(result.current.items[0].submitted).toBe(true);
  });

  it("resetCart removes ALL items", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    act(() => result.current.markAsSubmitted());
    act(() => result.current.addItem(makeItem({ name: "Pending" })));

    act(() => result.current.resetCart());

    expect(result.current.items).toHaveLength(0);
  });

  it("does not resurrect a stale persisted draft after the cart becomes empty", () => {
    const first = renderHook(() => usePos(), { wrapper });

    act(() => first.result.current.addItem(makeItem()));
    expect(first.result.current.items).toHaveLength(1);

    act(() => first.result.current.resetCart());
    expect(first.result.current.items).toHaveLength(0);

    first.unmount();

    const second = renderHook(() => usePos(), { wrapper });
    expect(second.result.current.items).toHaveLength(0);
  });

  it("setHistoryItems replaces submitted items and keeps pending ones", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem({ name: "Pending" })));
    act(() =>
      result.current.setHistoryItems([
        { ...makeItem({ name: "History" }), cartId: "h1", submitted: true },
      ]),
    );

    const names = result.current.items.map((i) => i.name).sort();
    expect(names).toEqual(["History", "Pending"]);
    // History first, pending appended after.
    expect(result.current.items[0].name).toBe("History");
  });

  it("updateQuantity(0) removes the item", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => result.current.addItem(makeItem()));
    const cartId = result.current.items[0].cartId;

    act(() => result.current.updateQuantity(cartId, 0));

    expect(result.current.items).toHaveLength(0);
  });

  it("buildSpecialRequests groups pending items by seat and ignores submitted", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.addItem(
        makeItem({
          name: "Burger",
          seatNumber: "Seat 1",
          itemNote: "no onion",
        }),
      );
      result.current.addItem(
        makeItem({ name: "Fries", seatNumber: "Seat 1", quantity: 2 }),
      );
      result.current.addItem(makeItem({ name: "Cola", seatNumber: "Seat 2" }));
    });

    const summary = result.current.buildSpecialRequests();
    expect(summary).toContain("[Seat 1] Burger: no onion, Fries x2");
    expect(summary).toContain("[Seat 2] Cola");

    // Submitted items are excluded from the next special-requests payload.
    act(() => result.current.markAsSubmitted());
    expect(result.current.buildSpecialRequests()).toBe("");
  });

  it("clearSession resets items, session, and active seat", () => {
    const { result } = renderHook(() => usePos(), { wrapper });

    act(() => {
      result.current.setSession({
        tableId: "t1",
        tableName: "1",
        sessionToken: "tok",
        sessionId: "s1",
      });
      result.current.addItem(makeItem());
      result.current.setActiveSeat("Seat 3");
    });

    act(() => result.current.clearSession());

    expect(result.current.session).toBeNull();
    expect(result.current.items).toHaveLength(0);
    expect(result.current.activeSeat).toBe("Seat 1");
  });
});
