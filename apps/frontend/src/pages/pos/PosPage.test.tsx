import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PosPage from "./PosPage";
import { MemoryRouter } from "react-router-dom";
import RestaurantContext from "../../context/RestaurantContext";

// Mocks
vi.mock("../../lib/api", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { categories: [] } }),
  },
}));
vi.mock("../../lib/posOfflineOrders", () => ({
  getPosSnapshot: vi.fn().mockResolvedValue(null),
  putPosSnapshot: vi.fn().mockResolvedValue(undefined),
  discardOrdersForSession: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../context/PosContext", () => ({
  usePos: vi.fn(),
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));
vi.mock("../../context/SocketContext", () => ({
  useSocket: vi.fn(),
}));
vi.mock("../../hooks/useIdleTimer", () => ({
  useIdleTimer: vi.fn(),
}));
vi.mock("../../hooks/useFeature", () => ({
  useFeature: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, def: string, options?: Record<string, unknown>) => {
      let res = def;
      if (options?.name) res = res.replace("{{name}}", String(options.name));
      return res;
    },
  }),
}));

// Mock inner components so we don't have to render full POS tree
vi.mock("../../components/pos/PosTopBar", () => ({
  default: () => <div data-testid="pos-top-bar" />,
}));
vi.mock("../../components/pos/PosCategoryFilter", () => ({
  default: () => <div data-testid="pos-category-filter" />,
}));
vi.mock("../../components/pos/PosItemGrid", () => ({
  default: ({ items }: { items: Array<{ name: string }> }) => (
    <div data-testid="pos-item-grid">
      {items.map((item) => item.name).join(",")}
    </div>
  ),
}));
vi.mock("../../components/pos/PosTableModal", () => ({
  default: () => <div data-testid="pos-table-modal" />,
}));
vi.mock("../../components/pos/PosOptionsDrawer", () => ({
  default: () => <div data-testid="pos-options-drawer" />,
}));
vi.mock("../../components/pos/PosSeatSelector", () => ({
  default: () => <div data-testid="pos-seat-selector" />,
}));
vi.mock("../../components/pos/PosCartDrawer", () => ({
  default: () => <div data-testid="pos-cart-drawer" />,
}));

import { usePos } from "../../context/PosContext";
import { useSocket } from "../../context/SocketContext";
import { useAuth } from "../../context/AuthContext";
import { useFeature } from "../../hooks/useFeature";
import api from "../../lib/api";
import {
  getPosSnapshot,
  discardOrdersForSession,
} from "../../lib/posOfflineOrders";

describe("PosPage", () => {
  const mockRestaurant = { id: "rest-1", name: "Test Rest" };

  beforeEach(() => {
    vi.clearAllMocks();
    (useFeature as Mock).mockReturnValue(true);
    (useAuth as Mock).mockReturnValue({ logout: vi.fn() });
    (useSocket as Mock).mockReturnValue({
      socket: { on: vi.fn(), off: vi.fn() },
    });
    (usePos as Mock).mockReturnValue({
      session: { sessionId: "sess-1", tableName: "Table 1" },
      items: [],
      getTotal: () => 0,
      clearSession: vi.fn(),
    });
  });

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <RestaurantContext.Provider
          value={
            {
              activeRestaurant: mockRestaurant,
              setActiveRestaurant: vi.fn(),
              restaurants: [],
              loading: false,
              refreshRestaurants: vi.fn(),
            } as unknown as React.ContextType<typeof RestaurantContext>
          }
        >
          <PosPage />
        </RestaurantContext.Provider>
      </MemoryRouter>,
    );
  };

  it("renders POS components when session is active", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("pos-top-bar")).toBeDefined();
      expect(screen.getByTestId("pos-category-filter")).toBeDefined();
      expect(screen.getByTestId("pos-item-grid")).toBeDefined();
      expect(screen.getByTestId("pos-seat-selector")).toBeDefined();
      expect(screen.getByTestId("pos-cart-drawer")).toBeDefined();
    });
  });

  it("handles payment confirmed socket event", async () => {
    let socketCb: (payload?: unknown) => void = () => {};
    const clearSessionMock = vi.fn();
    (usePos as Mock).mockReturnValue({
      session: {
        sessionId: "sess-1",
        localSessionId: "local-sess-1",
        tableName: "Table 1",
      },
      items: [],
      getTotal: () => 0,
      clearSession: clearSessionMock,
    });
    (useSocket as Mock).mockReturnValue({
      socket: {
        on: (event: string, cb: (payload?: unknown) => void) => {
          if (event === "payment:confirmed") socketCb = cb;
        },
        off: vi.fn(),
      },
    });

    renderPage();
    expect(socketCb).toBeDefined();

    // Trigger payment confirmed for matching session
    socketCb({ tableSessionId: "sess-1", tableNumber: "Table 1" });

    await waitFor(() => {
      expect(clearSessionMock).toHaveBeenCalled();
      expect(
        screen.getByText(/Table Table 1 paid — bill cleared/i),
      ).toBeDefined();
    });

    // Bug 1c: a queued offline order for this session must be purged before
    // (or alongside) clearing it — otherwise it can later flush against a
    // session that's already closed.
    expect(discardOrdersForSession).toHaveBeenCalledWith("local-sess-1");
  });

  it("does not attempt to purge the outbox when the session has no localSessionId yet", async () => {
    let socketCb: (payload?: unknown) => void = () => {};
    (usePos as Mock).mockReturnValue({
      session: { sessionId: "sess-2", tableName: "Table 2" },
      items: [],
      getTotal: () => 0,
      clearSession: vi.fn(),
    });
    (useSocket as Mock).mockReturnValue({
      socket: {
        on: (event: string, cb: (payload?: unknown) => void) => {
          if (event === "payment:confirmed") socketCb = cb;
        },
        off: vi.fn(),
      },
    });

    renderPage();
    socketCb({ tableSessionId: "sess-2", tableNumber: "Table 2" });

    await waitFor(() => {
      expect(
        screen.getByText(/Table Table 2 paid — bill cleared/i),
      ).toBeDefined();
    });
    expect(discardOrdersForSession).not.toHaveBeenCalled();
  });

  it("loads the last menu snapshot when the network is unavailable", async () => {
    (api.get as Mock).mockRejectedValueOnce({ code: "ERR_NETWORK" });
    (getPosSnapshot as Mock).mockResolvedValueOnce({
      key: "pos-menu:rest-1",
      cachedAt: "2026-07-13T10:00:00.000Z",
      value: {
        categories: [
          {
            id: "category-1",
            name: "Food",
            items: [{ id: "item-1", name: "Cached Burger", price: 10 }],
          },
        ],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Cached Burger")).toBeDefined();
    });
  });
});
