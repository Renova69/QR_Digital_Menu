import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Footer from "./Footer";

const consentMocks = vi.hoisted(() => ({
  categories: [] as Array<"analytics" | "marketing">,
  openPreferences: vi.fn(),
}));

vi.mock("../../context/ConsentContext", () => ({
  useConsent: () => consentMocks,
}));

describe("Footer", () => {
  beforeEach(() => {
    consentMocks.categories = [];
    consentMocks.openPreferences.mockClear();
  });

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

  it("hides the Cookie Settings link when there is nothing optional to configure", () => {
    consentMocks.categories = [];
    render(<Footer restaurantName="Test Restaurant" />);

    expect(screen.queryByText("gdpr.cookieSettingsLink")).toBeNull();
  });

  it("shows the Cookie Settings link and opens preferences on click", () => {
    consentMocks.categories = ["analytics"];
    render(<Footer restaurantName="Test Restaurant" />);

    fireEvent.click(screen.getByText("gdpr.cookieSettingsLink"));
    expect(consentMocks.openPreferences).toHaveBeenCalledTimes(1);
  });
});
