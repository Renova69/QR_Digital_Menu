import { beforeEach, describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { CartProvider, useCart } from "./CartContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

// Node's own experimental global `localStorage` can shadow jsdom's in this
// environment — use an explicit in-memory mock, matching ThemeContext.test.tsx.
let store: Record<string, string> = {};
const storageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
};

describe("CartContext", () => {
  beforeEach(() => {
    store = {};
    Object.defineProperty(window, "localStorage", {
      value: storageMock,
      writable: true,
    });
  });

  // M-FE-3: a malformed-but-valid-JSON cart must not reach getTotal() and
  // produce NaN/Infinity, and must not crash the provider on mount.
  it("discards malformed entries from a corrupted localStorage cart", () => {
    localStorage.setItem(
      "cartItems",
      JSON.stringify([
        {
          cartId: "ok-1",
          id: "i1",
          name: "Pizza",
          price: 10,
          quantity: 2,
          selectedOptions: [],
        },
        {
          cartId: "bad-price",
          id: "i2",
          name: "Bad",
          price: "ten",
          quantity: 1,
          selectedOptions: [],
        },
        {
          cartId: "bad-qty",
          id: "i3",
          name: "Bad",
          price: 5,
          quantity: -1,
          selectedOptions: [],
        },
        {
          cartId: "bad-qty-nan",
          id: "i4",
          name: "Bad",
          price: 5,
          quantity: NaN,
          selectedOptions: [],
        },
        {
          id: "i5",
          name: "Missing cartId",
          price: 5,
          quantity: 1,
          selectedOptions: [],
        },
        {
          cartId: "bad-options",
          id: "i6",
          name: "Bad",
          price: 5,
          quantity: 1,
          selectedOptions: [{ optionId: "o" }],
        },
        "not-an-object",
      ]),
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].cartId).toBe("ok-1");
    expect(result.current.getTotal()).toBe(20);
  });

  it("clears the cart when localStorage holds non-array JSON", () => {
    localStorage.setItem("cartItems", JSON.stringify({ not: "an array" }));

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toEqual([]);
    expect(localStorage.getItem("cartItems")).toBeNull();
  });

  it("clears the cart when localStorage holds invalid JSON", () => {
    localStorage.setItem("cartItems", "{not valid json");

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toEqual([]);
    expect(localStorage.getItem("cartItems")).toBeNull();
  });

  it("loads a fully valid cart unchanged", () => {
    localStorage.setItem(
      "cartItems",
      JSON.stringify([
        {
          cartId: "c1",
          id: "i1",
          name: "Burger",
          price: 8,
          quantity: 2,
          selectedOptions: [
            {
              optionId: "o1",
              optionName: "Size",
              choiceName: "Large",
              priceModifier: 1.5,
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.getTotal()).toBe(19); // (8 + 1.5) * 2
  });

  it("keeps paid option charges when a loyalty reward covers the base item", () => {
    localStorage.setItem(
      "cartItems",
      JSON.stringify([
        {
          cartId: "reward-line",
          id: "i1",
          name: "Burger",
          price: 8,
          quantity: 2,
          selectedOptions: [
            {
              optionId: "o1",
              optionName: "Size",
              choiceName: "Large",
              priceModifier: 1.5,
            },
          ],
        },
      ]),
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.getTotal(new Set(["reward-line"]))).toBe(3);
  });
});
