import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GeneralSettingsTab from "./GeneralSettingsTab";
import RestaurantContext from "../../../context/RestaurantContext";
import { renameRestaurantSlug } from "../../../lib/api";

// #Task20b — OWNER-only slug rename control on top of the read-only
// "Menu address" section from #Task20a. Release UI is explicitly out of
// scope (see task-20b-report.md): the slug controller has no findMany, so
// there is no way to list a restaurant's retired aliases for a release
// picker to show.

const mockT = vi.fn((key: string, opts?: unknown) => {
  if (typeof opts === "string") return opts;
  if (opts && typeof opts === "object" && "defaultValue" in opts) {
    const vars = opts as Record<string, unknown>;
    const raw = String(vars.defaultValue);
    return raw.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
  }
  return key;
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

// canLanguages=false keeps the Localization section (and its translation-
// status fetch) out of the render — irrelevant here, mirrors the sibling
// menuAddress test file.
vi.mock("../../../hooks/useFeature", () => ({
  useFeature: () => false,
}));

vi.mock("../../../context/SocketContext", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));

const mockAuthState = vi.hoisted(() => ({ role: "OWNER" }));
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", role: mockAuthState.role } }),
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
  slug: "bistro-oranzh",
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

function openRenameDialog(
  restaurant: Record<string, unknown> = baseRestaurant,
) {
  renderWithRestaurant(restaurant);
  fireEvent.click(screen.getByRole("button", { name: /change/i }));
  return screen.getByLabelText(/new menu address/i) as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState.role = "OWNER";
  vi.mocked(fetchRestaurants).mockResolvedValue(undefined);
});

describe("GeneralSettingsTab - slug rename control (role gating)", () => {
  it("shows the Change control to an OWNER", () => {
    renderWithRestaurant(baseRestaurant);
    expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();
  });

  it("hides the Change control from a MANAGER", () => {
    mockAuthState.role = "MANAGER";
    renderWithRestaurant(baseRestaurant);
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
  });
});

describe("GeneralSettingsTab - slug rename dialog", () => {
  it("lowercases the address as the owner types", () => {
    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "BISTRO-NEW" } });
    expect(input.value).toBe("bistro-new");
  });

  it("states plainly that existing QR codes keep working", () => {
    openRenameDialog();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /qr codes.*keep working/i,
    );
  });

  it("surfaces the returned cooldown date instead of a generic error", async () => {
    vi.mocked(renameRestaurantSlug).mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: "Slug can be changed again on 2026-08-29T10:00:00.000Z",
        },
      },
    });

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "bistro-new" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    await screen.findByText(/2026-08-29/);
    expect(fetchRestaurants).not.toHaveBeenCalled();
    // The dialog stays open on failure — the owner can retry or cancel.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("surfaces a taken-slug conflict intelligibly, not as a raw dump", async () => {
    vi.mocked(renameRestaurantSlug).mockRejectedValue({
      response: {
        status: 409,
        data: { message: "This slug is already taken" },
      },
    });

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "taken-name" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
    expect(screen.queryByText(/statusCode/i)).toBeNull();
  });

  it("refreshes the restaurant after a successful rename", async () => {
    vi.mocked(renameRestaurantSlug).mockResolvedValue({ slug: "bistro-new" });

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "bistro-new" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    await waitFor(() => expect(fetchRestaurants).toHaveBeenCalledTimes(1));
    expect(renameRestaurantSlug).toHaveBeenCalledWith("rest-1", "bistro-new");
  });
});

describe("GeneralSettingsTab - slug rename control (null slug)", () => {
  it("renders the not-yet-assigned state instead of a broken URL, with no Change control", () => {
    renderWithRestaurant({ ...baseRestaurant, slug: null });

    expect(screen.getByText(/hasn't been set up yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/\/m\//)).toBeNull();
    expect(screen.queryByRole("button", { name: /change/i })).toBeNull();
  });
});
