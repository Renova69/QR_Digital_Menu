import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DateRangeFilter from "./DateRangeFilter";

vi.mock("react-datepicker", () => ({
  default: () => <input aria-label="date-input" readOnly />,
  registerLocale: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const labels: Record<string, string> = {
        "analytics.today": "Today",
        "analytics.days7": "7 Days",
        "analytics.days14": "14 Days",
        "analytics.days30": "30 Days",
        "analytics.datePresets": "Date presets",
        "dashboard.tabs.summary": "Dashboard",
      };
      return labels[key] ?? fallback ?? key;
    },
    i18n: { language: "en" },
  }),
}));

describe("DateRangeFilter", () => {
  it("renders Today as the active quick preset", () => {
    const onPeriodChange = vi.fn();

    render(
      <DateRangeFilter
        period={1}
        label="Today"
        onPeriodChange={onPeriodChange}
        onCustomRange={vi.fn()}
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Today" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "14 Days" }));
    expect(onPeriodChange).toHaveBeenCalledWith(14);
  });
});
