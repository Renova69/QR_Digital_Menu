import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isValidTwentyFourHourTime } from "../../lib/twentyFourHourTime";
import { TwentyFourHourTimeInput } from "./TwentyFourHourTimeInput";

describe("TwentyFourHourTimeInput", () => {
  it("uses an explicit locale-independent HH:mm text control", () => {
    const onValueChange = vi.fn();
    render(
      <TwentyFourHourTimeInput
        aria-label="Start"
        value="18:05"
        onValueChange={onValueChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Start" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("placeholder", "HH:mm");
    expect(input).toHaveValue("18:05");

    fireEvent.change(input, { target: { value: "1930" } });
    expect(onValueChange).toHaveBeenCalledWith("19:30");
  });

  it("accepts only real 24-hour HH:mm values", () => {
    expect(isValidTwentyFourHourTime("00:00")).toBe(true);
    expect(isValidTwentyFourHourTime("23:59")).toBe(true);
    expect(isValidTwentyFourHourTime("12:30 PM")).toBe(false);
    expect(isValidTwentyFourHourTime("24:00")).toBe(false);
  });
});
