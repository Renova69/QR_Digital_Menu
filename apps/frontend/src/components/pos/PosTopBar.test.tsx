import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PosTopBar from "./PosTopBar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

vi.mock("../../context/PosContext", () => ({
  usePos: () => ({
    session: { tableName: "Table 1" },
    searchQuery: "",
    setSearchQuery: vi.fn(),
  }),
}));

vi.mock("../../context/PosThemeContext", () => ({
  usePosTheme: () => ({
    theme: "light",
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("../../context/RestaurantContext", () => ({
  useRestaurantContext: () => ({
    activeRestaurant: {
      id: "rest-1",
      name: "Daffi Restaurant With A Long Display Name",
    },
  }),
}));

vi.mock("./PosSyncStatus", () => ({
  default: () => <div data-testid="sync-status" />,
}));

vi.mock("./PosServiceRequests", () => ({
  default: () => <div data-testid="service-requests" />,
}));

describe("PosTopBar", () => {
  it("shows the active restaurant name in the POS header", () => {
    render(<PosTopBar />);

    const restaurantName = screen.getByText(
      "Daffi Restaurant With A Long Display Name",
    );
    expect(restaurantName).toBeDefined();
    expect(restaurantName.getAttribute("title")).toBe(
      "Daffi Restaurant With A Long Display Name",
    );
  });
});
