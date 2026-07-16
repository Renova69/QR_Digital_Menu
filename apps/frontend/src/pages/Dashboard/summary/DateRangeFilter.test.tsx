import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DateRangeFilter from "./DateRangeFilter";

const { datePickerMock } = vi.hoisted(() => ({
  datePickerMock: vi.fn(),
}));

vi.mock("react-datepicker", () => ({
  default: (props: any) => {
    datePickerMock(props);

    if (props.customInput) {
      return (
        <button
          data-class-name={props.className}
          data-testid="date-picker-trigger"
          type="button"
        >
          {props.placeholderText}
        </button>
      );
    }

    return <input aria-label="date-input" data-testid="date-picker-textbox" />;
  },
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
  beforeEach(() => {
    datePickerMock.mockClear();
  });

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

  it("uses mobile-friendly custom date triggers", () => {
    render(
      <DateRangeFilter
        period={7}
        startDate="2026-07-01"
        endDate="2026-07-16"
        label="Last 7 days"
        onPeriodChange={vi.fn()}
        onCustomRange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("date-picker-textbox")).toBeNull();
    const triggers = screen.getAllByTestId("date-picker-trigger");
    expect(triggers).toHaveLength(2);
    triggers.forEach((trigger) => {
      expect(trigger.getAttribute("data-class-name")).toContain("w-full");
      expect(trigger.getAttribute("data-class-name")).toContain("min-h-11");
    });

    const [startPicker, endPicker] = datePickerMock.mock.calls.map(
      ([props]) => props,
    );
    expect(startPicker.customInput).toBeTruthy();
    expect(endPicker.customInput).toBeTruthy();
    expect(startPicker.wrapperClassName).toContain("w-full");
    expect(startPicker.portalId).toBe("dashboard-date-range-picker-root");
    expect(endPicker.portalId).toBe("dashboard-date-range-picker-root");
    expect(startPicker.popperPlacement).toBe("bottom-start");
    expect(endPicker.popperPlacement).toBe("bottom-end");
    expect(startPicker.showPopperArrow).toBe(false);
  });
});
