import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearOrderIdempotencyKey,
  getOrCreateOrderIdempotencyKey,
} from "./orderIdempotency";

describe("order idempotency identity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
  });

  it("reuses the key for the same payload after an interrupted retry", () => {
    const payload = { customerName: "Mira", items: [{ id: "item-1" }] };

    expect(getOrCreateOrderIdempotencyKey("rest-1:table-1", payload)).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(getOrCreateOrderIdempotencyKey("rest-1:table-1", payload)).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("creates a new key when the semantic payload changes", () => {
    getOrCreateOrderIdempotencyKey("rest-1:table-1", { quantity: 1 });

    expect(
      getOrCreateOrderIdempotencyKey("rest-1:table-1", { quantity: 2 }),
    ).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("clears only the completed submission key", () => {
    const key = getOrCreateOrderIdempotencyKey("rest-1:table-1", {
      quantity: 1,
    });

    clearOrderIdempotencyKey("rest-1:table-1", "another-key");
    expect(
      getOrCreateOrderIdempotencyKey("rest-1:table-1", { quantity: 1 }),
    ).toBe(key);

    clearOrderIdempotencyKey("rest-1:table-1", key);
    expect(
      getOrCreateOrderIdempotencyKey("rest-1:table-1", { quantity: 1 }),
    ).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("still returns a usable key when crypto.randomUUID is unavailable", () => {
    // Simulates a non-secure-context deployment (plain HTTP on a
    // restaurant LAN), where crypto.randomUUID does not exist.
    vi.restoreAllMocks();
    sessionStorage.clear();
    const original = crypto.randomUUID;
    // @ts-expect-error - deliberately deleting a browser API for the test
    delete crypto.randomUUID;

    try {
      const key = getOrCreateOrderIdempotencyKey("rest-1:table-1", {
        quantity: 1,
      });
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("still returns a usable key when sessionStorage throws", () => {
    const throwing = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(throwing);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(throwing);

    expect(() =>
      getOrCreateOrderIdempotencyKey("rest-1:table-1", { quantity: 1 }),
    ).not.toThrow();
  });

  it("does not throw when clearing a key while sessionStorage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() =>
      clearOrderIdempotencyKey("rest-1:table-1", "some-key"),
    ).not.toThrow();
  });
});
