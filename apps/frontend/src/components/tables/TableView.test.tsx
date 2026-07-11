import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import TableView from "./TableView";
import RestaurantContext from "../../context/RestaurantContext";

const featureState = vi.hoisted(() => ({ servicePointsEnabled: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === "string" ? fallback : fallback?.defaultValue || _key,
  }),
}));

vi.mock("../../hooks/useFeature", () => ({
  useTier: () => ({ tier: "PRO", features: ["payments:stripe"] }),
  useFeature: () => featureState.servicePointsEnabled,
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "OWNER" } }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === "tables" || queryKey[0] === "tableSessions"
        ? []
        : queryKey[0] === "zones"
          ? []
          : undefined,
    isLoading: false,
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../lib/api", () => ({
  createTable: vi.fn(),
  deleteTable: vi.fn(),
  getTables: vi.fn(),
  getTableSessions: vi.fn(),
  getZones: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  deleteZone: vi.fn(),
  reorderZones: vi.fn(),
  updateTable: vi.fn(),
  getLogoBase64: vi.fn(),
}));

vi.mock("./ServicePointsTab", () => ({
  default: ({ onShowQr }: { onShowQr: (point: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onShowQr({
          id: "room-301",
          name: "301",
          type: "ROOM",
          publicToken: "room-token",
        })
      }
    >
      Generate service-point QR
    </button>
  ),
}));

vi.mock("./PrintableQRCodes", () => ({ default: () => null }));
vi.mock("../../pages/Dashboard/LiveTablesView", () => ({
  default: () => <div>Live tables</div>,
}));
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div>{value}</div>,
  QRCodeCanvas: () => <canvas />,
}));
vi.mock("../ui/modal", () => ({
  Modal: ({ open, children, title }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

describe("TableView service-point QR", () => {
  beforeEach(() => {
    featureState.servicePointsEnabled = true;
  });

  it("opens the QR dialog while the Service Points tab is active", () => {
    render(
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: {
              id: "restaurant-1",
              name: "Hotel Restaurant",
              accentColor: "#000000",
              logoUrl: null,
            },
          } as any
        }
      >
        <TableView />
      </RestaurantContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Service Points" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Generate service-point QR" }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/\?sp=room-token$/)).toBeInTheDocument();
  });

  it("hides service points when the active plan does not include them", () => {
    featureState.servicePointsEnabled = false;

    render(
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: {
              id: "restaurant-1",
              name: "Free Restaurant",
              accentColor: "#000000",
              logoUrl: null,
            },
          } as any
        }
      >
        <TableView />
      </RestaurantContext.Provider>,
    );

    expect(
      screen.queryByRole("button", { name: "Service Points" }),
    ).not.toBeInTheDocument();
  });
});
