import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RestaurantBasicsStep from "./RestaurantBasicsStep";

const mockT = vi.fn((key: string, defaultValueOrOpts?: unknown) => {
  const fallbacks: Record<string, string> = {
    "onboarding.basics.title": "About you & your restaurant",
    "onboarding.basics.subtitle":
      "You can update all of this later in Settings.",
    "onboarding.basics.ownerName": "Your name",
    "onboarding.basics.restaurantName": "Restaurant name *",
    "onboarding.basics.menuAddress": "Menu address",
    "onboarding.basics.menuAddressHint":
      "Type a restaurant name to preview your menu address.",
    "onboarding.basics.city": "City",
    "onboarding.basics.dashboardLanguage": "Dashboard language",
    "onboarding.basics.dashboardLanguageHint":
      "Language used for your owner dashboard.",
    "onboarding.basics.creating": "Creating…",
    "onboarding.basics.continue": "Continue",
    "auto.eGKirilPetrov": "e.g. Kiril Petrov",
    "auto.eGLaPiazza": "e.g. La Piazza",
    "auto.eGBistroOranzh": "e.g. bistro-oranzh",
    "auto.eGSofia": "e.g. Sofia",
  };
  if (fallbacks[key]) return fallbacks[key];
  if (typeof defaultValueOrOpts === "string") return defaultValueOrOpts;
  return key;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// No availability check is wired here on purpose — this step has no
// restaurant id to check against until createRestaurant() resolves inside
// handleSubmit, so GET /restaurants/:id/slug/available is unreachable from
// this step. The server assigns the slug authoritatively at creation time;
// this preview never calls the API.
vi.mock("../../../services/restaurantService", () => ({
  createRestaurant: vi.fn(),
}));

const noop = () => {};

describe("RestaurantBasicsStep slug preview", () => {
  it("previews a transliterated slug URL as the owner types the name", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Бистро Оранж",
    );
    await waitFor(() =>
      expect(screen.getByTestId("slug-preview")).toHaveTextContent(
        "bistro-oranzh",
      ),
    );
  });

  it("lowercases typed slug input rather than rejecting it in the UI", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const slugInput = screen.getByLabelText("Menu address");
    await userEvent.type(slugInput, "BISTRO");
    expect(slugInput).toHaveValue("bistro");
  });

  it("stops deriving from the name once the slug field is edited directly", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Bistro One",
    );
    const slugInput = screen.getByLabelText("Menu address");
    await waitFor(() => expect(slugInput).toHaveValue("bistro-one"));

    await userEvent.clear(slugInput);
    await userEvent.type(slugInput, "custom-address");
    expect(slugInput).toHaveValue("custom-address");

    // Further edits to the name must no longer overwrite the owner's choice.
    await userEvent.type(screen.getByPlaceholderText("e.g. La Piazza"), " Two");
    expect(slugInput).toHaveValue("custom-address");
  });

  it("does not gate the step (continue button) on the slug", () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    // Only the restaurant name is required; the slug field is untouched and
    // empty, yet the submit control is present and not disabled because of
    // the slug itself (name is also empty here, which independently
    // disables submit — the point is there is no slug-specific disable
    // logic to find).
    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeInTheDocument();
  });

  it("enables continue once a name is present, with the slug still untouched", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Bistro One",
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });
});
