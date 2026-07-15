import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSummaryDateRange } from "./useSummaryDateRange";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) =>
      key === "analytics.today" ? "Today" : (fallback ?? key),
    i18n: { language: "en-GB" },
  }),
}));

describe("useSummaryDateRange", () => {
  it("defaults to Today", () => {
    const { result } = renderHook(() => useSummaryDateRange());

    expect(result.current.period).toBe(1);
    expect(result.current.label).toBe("Today");
    expect(result.current.startDate).toBeUndefined();
    expect(result.current.endDate).toBeUndefined();
  });

  it("switches between presets and a custom range", () => {
    const { result } = renderHook(() => useSummaryDateRange());

    act(() => result.current.setPeriod(14));
    expect(result.current.period).toBe(14);
    expect(result.current.label).toBe("Last 14 days");

    act(() => result.current.setCustomRange("2026-07-01", "2026-07-03"));
    expect(result.current.period).toBe(0);
    expect(result.current.startDate).toBe("2026-07-01");
    expect(result.current.endDate).toBe("2026-07-03");
  });
});
