import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Footer from "./Footer";

describe("Footer", () => {
  it("combines the street address and city", () => {
    render(
      <Footer
        restaurantName="Test Restaurant"
        address="7 Rhodope Street"
        city="Smolyan"
      />,
    );

    expect(screen.getByText("7 Rhodope Street, Smolyan")).toBeTruthy();
  });

  it.each([
    {
      address: "7 Rhodope Street",
      city: undefined,
      expected: "7 Rhodope Street",
    },
    { address: undefined, city: "Smolyan", expected: "Smolyan" },
  ])("renders a partial location", ({ address, city, expected }) => {
    render(
      <Footer restaurantName="Test Restaurant" address={address} city={city} />,
    );

    expect(screen.getByText(expected)).toBeTruthy();
  });

  it("does not repeat a city already included in the address", () => {
    render(
      <Footer
        restaurantName="Test Restaurant"
        address="7 Rhodope Street, Smolyan"
        city="Smolyan"
      />,
    );

    expect(screen.getByText("7 Rhodope Street, Smolyan")).toBeTruthy();
    expect(screen.queryByText("7 Rhodope Street, Smolyan, Smolyan")).toBeNull();
  });

  it("keeps the required WeatherAPI.com attribution visible", () => {
    render(<Footer restaurantName="Test Restaurant" />);

    const attribution = screen.getByRole("link", { name: "WeatherAPI.com" });
    expect(attribution.getAttribute("href")).toBe(
      "https://www.weatherapi.com/",
    );
  });
});
