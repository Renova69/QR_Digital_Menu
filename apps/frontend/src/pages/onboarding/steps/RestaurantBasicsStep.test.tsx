import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantBasicsStep from "./RestaurantBasicsStep";
import {
  checkRestaurantSlugAvailable,
  createRestaurant,
} from "../../../services/restaurantService";

const mockT = vi.fn((key: string, defaultValueOrOpts?: unknown) => {
  const fallbacks: Record<string, string> = {
    "onboarding.basics.title": "About you & your restaurant",
    "onboarding.basics.subtitle":
      "You can update all of this later in Settings.",
    "onboarding.basics.ownerName": "Your name",
    "onboarding.basics.restaurantName": "Restaurant name *",
    "onboarding.basics.menuAddress": "Menu address",
    "onboarding.basics.menuAddressHint":
      "Generated from your restaurant name. You can edit it now or leave it as suggested.",
    "onboarding.basics.slugChecking": "Checking availability…",
    "onboarding.basics.slugAvailable": "This address is available.",
    "onboarding.basics.slugTaken": "This address is already taken.",
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

vi.mock("../../../services/restaurantService", () => ({
  createRestaurant: vi.fn(),
  checkRestaurantSlugAvailable: vi.fn(),
}));

const noop = () => {};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkRestaurantSlugAvailable).mockResolvedValue({
    available: true,
  });
  vi.mocked(createRestaurant).mockResolvedValue({
    id: "r1",
    name: "Bistro One",
    country: "Bulgaria",
    ownerId: "owner-1",
    slug: "owners-choice",
  });
});

describe("RestaurantBasicsStep editable slug picker", () => {
  it("previews a transliterated menu URL live as the owner types the name", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Бистро Оранж",
    );
    const slugInput = screen.getByTestId("slug-preview") as HTMLInputElement;
    await waitFor(() => expect(slugInput.value).toBe("bistro-oranzh"));
  });

  it("keeps deriving from the name until the owner edits the slug", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const nameInput = screen.getByPlaceholderText("e.g. La Piazza");
    const slugInput = screen.getByTestId("slug-preview") as HTMLInputElement;

    await userEvent.type(nameInput, "Bistro One");
    await waitFor(() => expect(slugInput.value).toBe("bistro-one"));

    await userEvent.clear(slugInput);
    await userEvent.type(slugInput, "OWNERS-CHOICE");
    expect(slugInput.value).toBe("owners-choice");

    await userEvent.type(nameInput, " Two");
    expect(slugInput.value).toBe("owners-choice");
  });

  it("checks an edited slug through the authenticated pre-creation endpoint", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const slugInput = screen.getByTestId("slug-preview") as HTMLInputElement;

    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Bistro One",
    );
    await userEvent.clear(slugInput);
    await userEvent.type(slugInput, "owners-choice");

    await waitFor(
      () =>
        expect(checkRestaurantSlugAvailable).toHaveBeenCalledWith(
          "owners-choice",
        ),
      { timeout: 1500 },
    );
    expect(await screen.findByText("This address is available.")).toBeVisible();
  });

  it("shows the placeholder, not a generated address, before a name is typed", () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    const slugInput = screen.getByLabelText("Menu address") as HTMLInputElement;
    expect(slugInput.value).toBe("");
    expect(slugInput).toHaveAttribute("placeholder", "e.g. bistro-oranzh");
  });

  it("does not gate the step (continue button) on the slug", () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    // Only the restaurant name is required. Skipping the picker lets the
    // server derive the authoritative value.
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

  it("submits an owner-edited slug to atomic restaurant creation", async () => {
    render(<RestaurantBasicsStep onCreated={noop} />);
    await userEvent.type(
      screen.getByPlaceholderText("e.g. La Piazza"),
      "Bistro One",
    );
    const slugInput = screen.getByTestId("slug-preview");
    await userEvent.clear(slugInput);
    await userEvent.type(slugInput, "owners-choice");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(createRestaurant).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Bistro One",
          slug: "owners-choice",
        }),
      ),
    );
  });
});
