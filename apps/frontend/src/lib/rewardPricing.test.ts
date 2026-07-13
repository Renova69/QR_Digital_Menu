import { describe, expect, it } from "vitest";
import { calculateAutomaticRewardPoints } from "./rewardPricing";

describe("calculateAutomaticRewardPoints", () => {
  it("uses the restaurant redemption rate", () => {
    expect(calculateAutomaticRewardPoints(9.9, 100)).toBe(990);
  });

  it("rounds cents safely and always rounds the points cost up", () => {
    expect(calculateAutomaticRewardPoints(9.99, 150)).toBe(1499);
  });

  it("returns null for an incomplete or invalid price", () => {
    expect(calculateAutomaticRewardPoints("", 150)).toBeNull();
    expect(calculateAutomaticRewardPoints(0, 150)).toBeNull();
  });
});
