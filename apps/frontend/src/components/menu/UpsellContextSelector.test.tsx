import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpsellContextSelector } from "./UpsellContextSelector";

describe("UpsellContextSelector", () => {
  it("returns the selected contexts through the existing form boundary", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <UpsellContextSelector value={[]} onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Morning" }));
    expect(onChange).toHaveBeenLastCalledWith(["MORNING"]);

    rerender(<UpsellContextSelector value={["MORNING"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Cold weather" }));
    expect(onChange).toHaveBeenLastCalledWith(["MORNING", "COLD"]);
  });
});
