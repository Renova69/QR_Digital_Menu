import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableView from "./TableView";
import RestaurantContext from "../../context/RestaurantContext";

// Task 17 fix round 1: the bulk print sheet (PrintableQRCodes, mounted
// inline the moment the QR tab is shown) must carry the same "commit
// before render" guarantee as QrCodeModal, but the trigger has to be
// print *intent* (the "Print all QR codes" button), not render, or every
// owner who merely looks at their Tables screen would silently end their
// slug's edit-grace window. This suite exercises the real TableView +
// PrintableQRCodes wiring against a real QueryClient (not the blanket
// react-query mock TableView.test.tsx uses) so the actual commit-gated
// behavior is under test, not a stand-in for it.

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === "string" ? fallback : fallback?.defaultValue || _key,
  }),
}));

vi.mock("../../hooks/useFeature", () => ({
  useTier: () => ({
    tier: "FREE",
    features: [
      "menu:view",
      "menu:edit",
      "menu:import",
      "qr:manage",
      "analytics:basic",
    ],
  }),
  useFeature: (flag: string) =>
    [
      "menu:view",
      "menu:edit",
      "menu:import",
      "qr:manage",
      "analytics:basic",
    ].includes(flag),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", role: "OWNER" } }),
}));

vi.mock("../../pages/Dashboard/LiveTablesView", () => ({
  default: () => <div>Live tables</div>,
}));
vi.mock("./ServicePointsTab", () => ({ default: () => null }));

const getTables = vi.fn();
const getTableSessions = vi.fn();
const getZones = vi.fn();
const getLogoBase64 = vi.fn();
const commitRestaurantSlug = vi.fn();

vi.mock("../../lib/api", () => ({
  createTable: vi.fn(),
  deleteTable: vi.fn(),
  getTables: (...args: unknown[]) => getTables(...args),
  getTableSessions: (...args: unknown[]) => getTableSessions(...args),
  getZones: (...args: unknown[]) => getZones(...args),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  deleteZone: vi.fn(),
  reorderZones: vi.fn(),
  updateTable: vi.fn(),
  getLogoBase64: (...args: unknown[]) => getLogoBase64(...args),
  commitRestaurantSlug: (...args: unknown[]) => commitRestaurantSlug(...args),
}));

const restaurant = {
  id: "restaurant-1",
  name: "Bistro",
  slug: "bistro-oranzh",
  accentColor: "#000000",
  logoUrl: null,
  paymentsEnabled: false,
  tier: "FREE",
};

function renderTableView() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: 0, networkMode: "always" },
            mutations: { retry: false, networkMode: "always" },
          },
        })
      }
    >
      <RestaurantContext.Provider
        value={{ activeRestaurant: restaurant } as any}
      >
        <TableView />
      </RestaurantContext.Provider>
    </QueryClientProvider>,
  );
}

let printSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getTables.mockReset().mockResolvedValue([{ id: "t1", name: "5" }]);
  getTableSessions.mockReset().mockResolvedValue([]);
  getZones.mockReset().mockResolvedValue([]);
  getLogoBase64.mockReset().mockResolvedValue(null);
  commitRestaurantSlug.mockReset();
  // jsdom has no print pipeline ("Not implemented: window.print"). Stubbing
  // it also lets the tests assert directly on *when* window.print() fires
  // relative to the commit, which is exactly what's under test here.
  printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
});

afterEach(() => {
  printSpy.mockRestore();
});

describe("PrintableQRCodes commit precondition (via TableView)", () => {
  it("does not call commitRestaurantSlug just from viewing the tables screen", async () => {
    renderTableView();

    // Let the tables/zones/sessions queries settle so we know the screen has
    // fully rendered, not just that we haven't waited long enough.
    await screen.findByText("5");

    expect(commitRestaurantSlug).not.toHaveBeenCalled();
    expect(printSpy).not.toHaveBeenCalled();
    // And the sheet must be showing its safe placeholder, not real codes.
    expect(screen.queryByTestId("printable-qr-grid")).not.toBeInTheDocument();
  });

  it("calls commitRestaurantSlug when the owner initiates a print, then prints", async () => {
    commitRestaurantSlug.mockResolvedValue({
      slug: "bistro-oranzh",
      committedAt: "2026-08-16T00:00:00Z",
    });
    renderTableView();
    await screen.findByText("5");

    fireEvent.click(screen.getByRole("button", { name: "tables.printAllQr" }));

    await waitFor(() =>
      expect(commitRestaurantSlug).toHaveBeenCalledWith("restaurant-1"),
    );
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  });

  it("keeps the printable QR codes absent until the commit resolves, and only prints after", async () => {
    let resolveCommit: (value: unknown) => void = () => {};
    commitRestaurantSlug.mockReturnValue(
      new Promise((resolve) => {
        resolveCommit = resolve;
      }),
    );
    renderTableView();
    await screen.findByText("5");

    fireEvent.click(screen.getByRole("button", { name: "tables.printAllQr" }));

    await waitFor(() => expect(commitRestaurantSlug).toHaveBeenCalled());
    // Commit is in flight -- still no printable codes in the DOM, and the
    // browser print dialog must not have been reached yet either.
    expect(screen.queryByTestId("printable-qr-grid")).not.toBeInTheDocument();
    expect(printSpy).not.toHaveBeenCalled();

    resolveCommit({
      slug: "bistro-oranzh",
      committedAt: "2026-08-16T00:00:00Z",
    });

    expect(await screen.findByTestId("printable-qr-grid")).toBeInTheDocument();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  });

  it("shows an error, produces no printable QR codes, and never reaches window.print() when the commit fails", async () => {
    commitRestaurantSlug.mockRejectedValue(new Error("offline"));
    renderTableView();
    await screen.findByText("5");

    fireEvent.click(screen.getByRole("button", { name: "tables.printAllQr" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("printable-qr-grid")).not.toBeInTheDocument();
    expect(printSpy).not.toHaveBeenCalled();
  });
});
