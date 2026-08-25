import { describe, it, expect } from "vitest";
import {
  BGN_RATE,
  formatEuro,
  formatBgn,
  formatDualCurrency,
  formatInlineDual,
  formatStackedDual,
} from "../currency";

describe("currency", () => {
  describe("BGN_RATE", () => {
    it("is the fixed BNB rate", () => {
      expect(BGN_RATE).toBe(1.95583);
    });
  });

  describe("formatEuro", () => {
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

  describe("formatBgn", () => {
    it("converts EUR value to BGN at fixed rate", () => {
      expect(formatBgn(10)).toBe("19.56 лв");
    });

    it("handles zero", () => {
      expect(formatBgn(0)).toBe("0.00 лв");
    });

    it("handles non-finite values safely", () => {
      expect(formatBgn(NaN)).toBe("— лв");
      expect(formatBgn(Infinity)).toBe("— лв");
      expect(formatBgn(-Infinity)).toBe("— лв");
    });
  });

  describe("formatDualCurrency", () => {
    it("returns EUR as primary and BGN as secondary", () => {
      const result = formatDualCurrency(10, "EUR");
      expect(result.primary).toBe("10.00 €");
      expect(result.secondary).toBe("19.56 лв");
    });

    it("returns BGN as primary and EUR as secondary when BGN requested", () => {
      const result = formatDualCurrency(19.5583, "BGN");
      expect(result.primary).toBe("19.56 лв");
      expect(result.secondary).toBe("10.00 €");
    });
  });

  describe("formatInlineDual", () => {
    it("formats single-line dual display", () => {
      expect(formatInlineDual(10)).toBe("10.00 € / 19.56 лв");
    });
  });

  describe("formatStackedDual", () => {
    it("formats EUR value with EUR on top and converted BGN underneath", () => {
      const result = formatStackedDual(10, "EUR");
      expect(result.eur).toBe("10.00 €");
      expect(result.bgn).toBe("19.56 лв");
    });

    it("normalizes BGN value to EUR before formatting", () => {
      const result = formatStackedDual(19.5583, "BGN");
      expect(result.eur).toBe("10.00 €");
      expect(result.bgn).toBe("19.56 лв");
    });

    it("handles non-finite values gracefully", () => {
      const result = formatStackedDual(NaN, "EUR");
      expect(result.eur).toBe("— €");
      expect(result.bgn).toBe("— лв");
    });
  });
});
