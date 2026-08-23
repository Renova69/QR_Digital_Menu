import { describe, it, expect, beforeEach, vi } from "vitest";
import { getVisitorId } from "../visitorId";

describe("getVisitorId", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("generates and stores a new UUID in localStorage when none exists", () => {
    const id = getVisitorId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(localStorage.getItem("qr-visitor-id")).toBe(id);
  });

  it("returns existing UUID from localStorage on subsequent calls", () => {
    localStorage.setItem("qr-visitor-id", "existing-uuid-12345");
    const id = getVisitorId();
    expect(id).toBe("existing-uuid-12345");
  });

  it("returns a generated UUID when localStorage throws a security or quota exception", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: The operation is insecure.");
    });

    const id = getVisitorId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("falls back to pseudo-UUID generation when crypto.randomUUID is not a function", () => {
    const originalRandomUUID = crypto.randomUUID;
    // @ts-expect-error test environment override
    delete crypto.randomUUID;

    const id = getVisitorId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    crypto.randomUUID = originalRandomUUID;
  });
});
