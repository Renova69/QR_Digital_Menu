import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GeneralSettingsTab from "./GeneralSettingsTab";
import RestaurantContext from "../../../context/RestaurantContext";
import { getMenuUrl } from "../../../lib/menuUrl";

// Task 20a — read-only "Menu address" section. The migration/backfill that
// populates Restaurant.slug has not run against any database yet, so a null
// slug is the only state every restaurant is actually in today. These tests
// cover both states: null (not-yet-assigned) and populated.

const mockT = vi.fn((key: string, opts?: unknown) => {
  if (typeof opts === "string") return opts;
  if (opts && typeof opts === "object" && "defaultValue" in opts) {
    return String((opts as Record<string, unknown>).defaultValue);
  }
  return key;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// canLanguages=false keeps the Localization section (and its translation-
// status fetch) out of the render — irrelevant to this section, and it would
// otherwise require mocking getTranslationStatus's resolution.
vi.mock("../../../hooks/useFeature", () => ({
  useFeature: () => false,
}));

vi.mock("../../../context/SocketContext", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));

// Fixed OWNER user — these tests cover the read-only copy/not-yet-assigned
// states from #Task20a, not the #Task20b role gate (see
// GeneralSettingsTab.slug.test.tsx for OWNER-vs-MANAGER coverage).
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", role: "OWNER" } }),
}));

vi.mock("../../../lib/api", () => ({
  updateRestaurant: vi.fn(),
  renameRestaurantSlug: vi.fn(),
  triggerTranslation: vi.fn(),
  getTranslationStatus: vi.fn(),
}));

const fetchRestaurants = vi.fn();

const baseRestaurant = {
  id: "rest-1",
  name: "Test Restaurant",
  country: "Bulgaria",
};

function renderWithRestaurant(restaurant: Record<string, unknown>) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RestaurantContext.Provider
      value={
        {
          activeRestaurant: restaurant,
          fetchRestaurants,
        } as unknown as React.ContextType<typeof RestaurantContext>
      }
    >
      {children}
    </RestaurantContext.Provider>
  );
  return render(<GeneralSettingsTab />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GeneralSettingsTab - Menu address section (null slug)", () => {
  it("shows the not-yet-assigned state instead of a broken URL", () => {
    renderWithRestaurant({ ...baseRestaurant, slug: null });

    expect(screen.getByText(/hasn't been set up yet/i)).toBeInTheDocument();
    // No broken/partial /m/ URL anywhere on the page — not "/m/null", not a
    // bare "/m/".
    expect(screen.queryByText(/\/m\//)).toBeNull();
  });

  it("does not render a copy control when there is nothing meaningful to copy", () => {
    renderWithRestaurant({ ...baseRestaurant, slug: null });
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
  });
});

describe("GeneralSettingsTab - Menu address section (slug present)", () => {
  it("displays the correct full menu URL, composed via getMenuUrl", () => {
    renderWithRestaurant({ ...baseRestaurant, slug: "bistro-oranzh" });

    const expectedUrl = getMenuUrl({ id: "rest-1", slug: "bistro-oranzh" });
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
    expect(expectedUrl).toContain("/m/bistro-oranzh");
  });

  it("copies the exact menu URL to the clipboard when Copy is clicked", async () => {
    // fireEvent (not userEvent) deliberately — userEvent.setup() installs its
    // own navigator.clipboard accessor for paste emulation, which fights with
    // the manual Object.assign below (matches the pattern already used in
    // StaffCreatedModal.test.tsx for the same reason).
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithRestaurant({ ...baseRestaurant, slug: "bistro-oranzh" });
    const expectedUrl = getMenuUrl({ id: "rest-1", slug: "bistro-oranzh" });

    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await screen.findByText(/copied/i);
    expect(writeText).toHaveBeenCalledWith(expectedUrl);
  });

  it("does not surface a copied confirmation when the clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });

    renderWithRestaurant({ ...baseRestaurant, slug: "bistro-oranzh" });
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByText(/^copied$/i)).toBeNull();
  });
});
