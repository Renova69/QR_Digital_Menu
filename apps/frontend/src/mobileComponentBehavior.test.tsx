import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomPreferencesEditor } from "./components/reservations/CustomPreferencesEditor";
import { HourlyDemand } from "./pages/Dashboard/analytics/panels";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrValues?: string | Record<string, unknown>) =>
      typeof fallbackOrValues === "string" ? fallbackOrValues : key,
  }),
}));

describe("mobile component behavior", () => {
  it("keeps the custom-preference field touch-sized in its stacked layout", () => {
    render(
      <CustomPreferencesEditor
        initial={["Window seat"]}
        onSave={vi.fn()}
        saving={false}
      />,
    );

    const field = screen.getByPlaceholderText("Add a chip…");
    expect(field).toHaveClass("h-12", "min-h-12", "text-base", "sm:flex-1");
    expect(field).not.toHaveClass("flex-1");

    const addButton = screen.getByRole("button", { name: "Add" });
    expect(addButton).toHaveClass("min-h-12", "text-sm", "font-semibold");
    expect(addButton).not.toHaveClass("text-base");
  });

  it("renders a compact, non-interactive mobile demand map", () => {
    render(
      <HourlyDemand
        hours={Array.from({ length: 24 }, (_, hour) => ({
          hour,
          label: `${hour.toString().padStart(2, "0")}:00`,
          orders: hour % 4,
          revenue: 0,
        }))}
      />,
    );

    const mobileMap = screen.getByTestId("hourly-demand-mobile");
    expect(mobileMap).toHaveClass("grid", "grid-cols-4");
    expect(within(mobileMap).queryAllByRole("button")).toHaveLength(0);
  });
});
