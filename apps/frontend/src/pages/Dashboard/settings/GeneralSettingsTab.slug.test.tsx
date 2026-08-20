import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import GeneralSettingsTab from "./GeneralSettingsTab";
import RestaurantContext from "../../../context/RestaurantContext";
import {
  getRestaurantSlugSettings,
  releaseRestaurantSlug,
  renameRestaurantSlug,
} from "../../../lib/api";

// OWNER-only slug lifecycle controls: rename, history, and permanent release.

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
  getRestaurantSlugSettings: vi.fn(),
  releaseRestaurantSlug: vi.fn(),
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
  vi.mocked(getRestaurantSlugSettings).mockResolvedValue({
    primary: {
      slug: "bistro-oranzh",
      committedAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    },
    aliases: [],
  });
  vi.mocked(releaseRestaurantSlug).mockResolvedValue({
    released: "old-name",
  });
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

// Fix round 1 — backend commit e4cb511f made renameSlug reject RESERVED,
// NUMERIC and PUNYCODE slugs (previously only reachable via the advisory
// /available check). Each backend message must map to its own translated
// key rather than falling through to the raw-message fallback branch.
describe("GeneralSettingsTab - slug rename dialog (reserved/numeric/punycode rejections)", () => {
  it("translates a RESERVED rejection instead of showing the raw backend string", async () => {
    vi.mocked(renameRestaurantSlug).mockRejectedValue({
      response: {
        status: 400,
        data: { message: "This slug is reserved and cannot be used" },
      },
    });

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "admin" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    expect(
      await screen.findByText(
        "This address is reserved and can't be used. Try a different one.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This slug is reserved and cannot be used"),
    ).toBeNull();
  });

  it("translates a NUMERIC rejection instead of showing the raw backend string", async () => {
    vi.mocked(renameRestaurantSlug).mockRejectedValue({
      response: {
        status: 400,
        data: {
          message:
            "Slug cannot be all numeric — it would be ambiguous with an ID",
        },
      },
    });

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    expect(
      await screen.findByText(
        "Your menu address can't be all numbers — add a letter or word.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Slug cannot be all numeric — it would be ambiguous with an ID",
      ),
    ).toBeNull();
  });

  it("translates a PUNYCODE rejection instead of showing the raw backend string", async () => {
    vi.mocked(renameRestaurantSlug).mockRejectedValue({
      response: {
        status: 400,
        data: {
          message: 'Slug cannot start with the reserved "xn--" prefix',
        },
      },
    });

    const input = openRenameDialog();
    fireEvent.change(input, { target: { value: "xn--abc" } });
    fireEvent.click(screen.getByRole("button", { name: /save address/i }));

    expect(
      await screen.findByText(
        'Your menu address can\'t start with "xn--". Choose a different address.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Slug cannot start with the reserved "xn--" prefix'),
    ).toBeNull();
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

describe("GeneralSettingsTab - slug lifecycle and previous URLs", () => {
  it("explains that an uncommitted address can still be edited freely", async () => {
    renderWithRestaurant(baseRestaurant);

    expect(
      await screen.findByText(/not frozen yet.*changes are free/i),
    ).toBeInTheDocument();
  });

  it("shows the real cooldown date once the current slug is committed", async () => {
    vi.mocked(getRestaurantSlugSettings).mockResolvedValue({
      primary: {
        slug: "bistro-oranzh",
        committedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-07-01T10:00:00.000Z",
      },
      aliases: [],
    });

    renderWithRestaurant(baseRestaurant);

    expect(await screen.findByText(/2026-08-15/)).toBeInTheDocument();
  });

  it("lists live and released previous URLs only for the owner", async () => {
    vi.mocked(getRestaurantSlugSettings).mockResolvedValue({
      primary: {
        slug: "bistro-oranzh",
        committedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-07-01T10:00:00.000Z",
      },
      aliases: [
        {
          slug: "old-name",
          committedAt: "2026-01-01T10:00:00.000Z",
          releasedAt: null,
          createdAt: "2026-01-01T10:00:00.000Z",
        },
        {
          slug: "released-name",
          committedAt: "2025-01-01T10:00:00.000Z",
          releasedAt: "2026-01-01T10:00:00.000Z",
          createdAt: "2025-01-01T10:00:00.000Z",
        },
      ],
    });

    renderWithRestaurant(baseRestaurant);

    expect(await screen.findByText(/\/m\/old-name/)).toBeInTheDocument();
    expect(screen.getByText(/\/m\/released-name/)).toBeInTheDocument();
    expect(screen.getByText(/^released$/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /release old-name/i }),
    ).toBeVisible();
  });

  it("never fetches or renders alias controls for a manager", async () => {
    mockAuthState.role = "MANAGER";
    renderWithRestaurant(baseRestaurant);

    await waitFor(() =>
      expect(getRestaurantSlugSettings).not.toHaveBeenCalled(),
    );
    expect(screen.queryByText(/previous urls/i)).toBeNull();
  });

  it("requires literal CONFIRM and refreshes history after permanent release", async () => {
    vi.mocked(getRestaurantSlugSettings).mockResolvedValue({
      primary: {
        slug: "bistro-oranzh",
        committedAt: "2026-08-01T10:00:00.000Z",
        createdAt: "2026-07-01T10:00:00.000Z",
      },
      aliases: [
        {
          slug: "old-name",
          committedAt: "2026-01-01T10:00:00.000Z",
          releasedAt: null,
          createdAt: "2026-01-01T10:00:00.000Z",
        },
      ],
    });
    renderWithRestaurant(baseRestaurant);

    fireEvent.click(
      await screen.findByRole("button", { name: /release old-name/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/permanent and irreversible/i);
    expect(dialog).toHaveTextContent(/qr codes.*stop working/i);
    expect(dialog).toHaveTextContent(/contacting support/i);

    const confirmButton = screen.getByRole("button", {
      name: /release url/i,
    });
    expect(confirmButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/type confirm/i), {
      target: { value: "CONFIRM" },
    });
    expect(confirmButton).toBeEnabled();
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(releaseRestaurantSlug).toHaveBeenCalledWith(
        "rest-1",
        "old-name",
        "CONFIRM",
      ),
    );
    await waitFor(() =>
      expect(getRestaurantSlugSettings).toHaveBeenCalledTimes(2),
    );
  });
});
