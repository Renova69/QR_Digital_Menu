import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { usePosOfflineSync } from "./usePosOfflineSync";
import { PosProvider, usePos } from "../context/PosContext";

vi.mock("../lib/api", () => ({ createOrder: vi.fn() }));

vi.mock("../lib/posOfflineOrders", () => ({
  POS_SYNC_EVENT: "pos:offline-sync",
  createPosSyncEngine: () => ({
    sync: vi.fn().mockResolvedValue({ synced: 0, conflicts: 0, pending: 0 }),
  }),
  discardPosOrder: vi.fn(),
  retryPosOrder: vi.fn(),
  indexedDbPosOutbox: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

import { indexedDbPosOutbox } from "../lib/posOfflineOrders";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PosProvider>{children}</PosProvider>
);

function useCombined(restaurantId?: string) {
  const pos = usePos();
  const sync = usePosOfflineSync(restaurantId);
  return { pos, sync };
}

describe("usePosOfflineSync reconciliation (Bug 1d)", () => {
  // PosProvider persists its cart draft to sessionStorage, which jsdom
  // retains across tests in the same file — without clearing it, the second
  // test's PosProvider mounts with the first test's leftover item still in
  // `items[0]` (see PosContext.test.tsx for the same convention).
  beforeEach(() => {
    sessionStorage.clear();
  });
  afterEach(() => {
    sessionStorage.clear();
  });

  it("releases a cart item stuck 'queued' once its outbox order no longer exists", async () => {
    (indexedDbPosOutbox.list as Mock).mockResolvedValue([]);
    const { result } = renderHook(() => useCombined("r1"), { wrapper });

    // Simulate an order that queued while offline, then synced successfully
    // while this hook was unmounted (idle-logout / route switch) — the
    // "synced" event that would normally clear this was missed, so the item
    // is left `syncState: "queued"` even though the outbox is now empty.
    act(() => {
      result.current.pos.addItem({
        menuItemId: "m1",
        name: "Burger",
        price: 10,
        quantity: 1,
        selectedOptions: [],
        seatNumber: "Seat 1",
        itemNote: "",
      });
    });
    const cartId = result.current.pos.items[0].cartId;
    act(() => {
      result.current.pos.markAsQueued("orphaned-client-order", [cartId]);
    });
    expect(result.current.pos.items[0].syncState).toBe("queued");

    // Any refresh (here triggered via syncNow, matching what the "online"
    // handler / periodic timer would do) must reconcile it.
    await act(async () => {
      await result.current.sync.syncNow();
    });

    expect(result.current.pos.items[0].syncState).toBe("sent");
    expect(result.current.pos.items[0].submitted).toBe(true);
    expect(result.current.pos.items[0].queuedOrderId).toBeUndefined();
  });

  it("leaves a queued item alone while its outbox order still exists", async () => {
    (indexedDbPosOutbox.list as Mock).mockResolvedValue([
      { clientOrderId: "still-queued", restaurantId: "r1" },
    ]);
    const { result } = renderHook(() => useCombined("r1"), { wrapper });

    act(() => {
      result.current.pos.addItem({
        menuItemId: "m1",
        name: "Burger",
        price: 10,
        quantity: 1,
        selectedOptions: [],
        seatNumber: "Seat 1",
        itemNote: "",
      });
    });
    const cartId = result.current.pos.items[0].cartId;
    act(() => {
      result.current.pos.markAsQueued("still-queued", [cartId]);
    });

    await act(async () => {
      await result.current.sync.syncNow();
    });

    expect(result.current.pos.items[0].syncState).toBe("queued");
  });
});
