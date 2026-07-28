import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardButton } from "./DashboardButton";
import { dashboardSurface } from "./dashboardUi";

describe("DashboardButton", () => {
  it("uses a touch-sized action style with button text capped at 14px", () => {
    const onClick = vi.fn();

    render(<DashboardButton onClick={onClick}>Create table</DashboardButton>);

    const button = screen.getByRole("button", { name: "Create table" });
    expect(button).toHaveClass(
      "min-h-11",
      "px-4",
      "text-sm",
      "font-semibold",
      "rounded-lg",
    );
    expect(button).not.toHaveClass("text-base", "uppercase", "tracking-wider");
  });

  it("keeps tabs and icon actions on the same mobile touch-height system", () => {
    const { rerender } = render(
      <DashboardButton density="tab">Reservations</DashboardButton>,
    );

    expect(screen.getByRole("button", { name: "Reservations" })).toHaveClass(
      "min-h-11",
      "px-3",
      "text-sm",
    );

    rerender(
      <DashboardButton density="icon" aria-label="Delete">
        ×
      </DashboardButton>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "h-11",
      "w-11",
      "text-sm",
    );
  });

  it("keeps compact actions at the same 14px label size", () => {
    render(
      <DashboardButton density="compact">Dismiss</DashboardButton>,
    );

    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveClass(
      "min-h-11",
      "sm:h-9",
      "text-sm",
      "font-semibold",
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).not.toHaveClass(
      "text-xs",
    );
  });

  it("exports responsive dashboard surface spacing", () => {
    expect(dashboardSurface.card).toContain("p-3");
    expect(dashboardSurface.card).toContain("sm:p-5");
    expect(dashboardSurface.roomy).toContain("p-4");
    expect(dashboardSurface.roomy).toContain("sm:p-6");
    expect(dashboardSurface.empty).toContain("p-4");
    expect(dashboardSurface.empty).toContain("sm:p-8");
  });
});
