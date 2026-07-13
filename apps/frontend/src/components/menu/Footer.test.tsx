import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Footer from "./Footer";

describe("Footer", () => {
  it("keeps the required WeatherAPI.com attribution visible", () => {
    render(<Footer restaurantName="Test Restaurant" />);

    const attribution = screen.getByRole("link", { name: "WeatherAPI.com" });
    expect(attribution.getAttribute("href")).toBe(
      "https://www.weatherapi.com/",
    );
  });
});
