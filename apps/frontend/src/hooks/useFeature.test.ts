import { describe, expect, it } from "vitest";
import { hasTierFeature } from "./useFeature";

describe("reservation tier fallback", () => {
  it("matches the backend Professional-and-above entitlement", () => {
    expect(hasTierFeature("FREE", "reservations:enabled")).toBe(false);
    expect(hasTierFeature("STARTER", "reservations:enabled")).toBe(false);
    expect(hasTierFeature("PROFESSIONAL", "reservations:enabled")).toBe(true);
    expect(hasTierFeature("ENTERPRISE", "reservations:enabled")).toBe(true);
  });
});
