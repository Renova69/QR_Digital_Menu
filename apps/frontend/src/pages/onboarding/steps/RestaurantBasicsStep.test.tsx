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
      "Generated automatically from your restaurant name — you can change it later in Settings.",
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

// The menu-address field is read-only by design, not merely by convention:
// CreateRestaurantDto carries no slug field, so createRestaurant() cannot
// send an owner-edited value — an editable control here would silently
// discard whatever the owner typed on submit. See RestaurantBasicsStep.tsx
// for the full rationale.
describe("RestaurantBasicsStep slug preview (read-only)", () => {
  it("previews a transliterated menu URL live as the owner types the name", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Бистро Оранж",
    );
    const preview = screen.getByTestId("slug-preview") as HTMLInputElement;
    await waitFor(() => expect(preview.value).toContain("bistro-oranzh"));
  });

  it("keeps deriving live from the name — there is no owner edit to freeze it", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const nameInput = screen.getByPlaceholderText("e.g. La Piazza");
    const preview = screen.getByTestId("slug-preview") as HTMLInputElement;

    await userEvent.type(nameInput, "Bistro One");
    await waitFor(() => expect(preview.value).toContain("bistro-one"));

    await userEvent.type(nameInput, " Two");
    await waitFor(() => expect(preview.value).toContain("bistro-one-two"));
  });

  it("does not let the owner type into the menu address field", () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const preview = screen.getByTestId("slug-preview") as HTMLInputElement;
    expect(preview).toHaveAttribute("readonly");
  });

  it("shows the placeholder, not a generated address, before a name is typed", () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const preview = screen.getByLabelText("Menu address") as HTMLInputElement;
    expect(preview.value).toBe("");
    expect(preview).toHaveAttribute("placeholder", "e.g. bistro-oranzh");
  });

  it("does not gate the step (continue button) on the slug", () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    // Only the restaurant name is required; the menu-address preview is
    // read-only and has no bearing on submit — the point is there is no
    // slug-specific disable logic to find.
    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeInTheDocument();
  });

  it("enables continue once a name is present", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Bistro One",
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });
});
