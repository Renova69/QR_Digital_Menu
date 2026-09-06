import { describe, it, expect } from "vitest";
import { formatEuro } from "../currency";

describe("EUR formatting", () => {
  it("formats value with € suffix", () => {
    expect(formatEuro(12.5)).toBe("12.50 €");
  });

  it("handles zero", () => {
    expect(formatEuro(0)).toBe("0.00 €");
  });

  it("rounds to 2 decimals", () => {
    expect(formatEuro(12.999)).toBe("13.00 €");
  });

  it("handles non-finite values safely", () => {
    expect(formatEuro(NaN)).toBe("— €");
    expect(formatEuro(Infinity)).toBe("— €");
    expect(formatEuro(-Infinity)).toBe("— €");
  });
});
