import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getTableStatuses: vi.fn(),
  getTableOrders: vi.fn(),
  closeSession: vi.fn(),
}));
const socketHolder = vi.hoisted(() => ({ socket: null as any }));

vi.mock("../../context/SocketContext", () => ({
  useSocket: () => ({ socket: socketHolder.socket, isConnected: true }),
}));
vi.mock("../../context/RestaurantContext", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: React.createContext({ activeRestaurant: undefined }),
  };
});
vi.mock("../../lib/api", () => ({
  getTableStatuses: api.getTableStatuses,
  getTableOrders: api.getTableOrders,
  closeSession: api.closeSession,
}));
vi.mock("../../components/tables/TableCard", () => ({
  default: (props: any) => (
    <div
      data-testid={`table-card-${props.name}`}
      data-status={props.status}
      onClick={() => props.onClick()}
    >
      {props.name}
    </div>
  ),
}));
vi.mock("../../components/tables/TableDetailModal", () => ({
  default: (props: any) => (
    <div
      data-testid="detail-modal"
      data-open={String(!!props.open)}
      data-orders-first={props.orders?.[0]?.id ?? ""}
      data-orders-loading={String(!!props.ordersLoading)}
      data-orders-error={String(!!props.ordersError)}
      data-payment={String(!!props.paymentInfo)}
      data-closing={String(!!props.closing)}
    >
      <button
        type="button"
        data-testid="modal-close"
        onClick={() => props.onOpenChange(false)}
      />
      <button
        type="button"
        data-testid="modal-close-session"
        onClick={() => props.onCloseSession?.()}
      />
    </div>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: unknown,
      options?: Record<string, unknown>,
    ) => {
      if (typeof fallback === "string") {
        return fallback.replace(
          /\{\{(\w+)\}\}/g,
          (_m, name: string) => String(options?.[name] ?? `{{${name}}}`),
        );
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

import RestaurantContext from "../../context/RestaurantContext";
import type { RestaurantContextType } from "../../context/RestaurantContext";
import LiveTablesView from "./LiveTablesView";

function makeTable(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    name: "Table 1",
    status: "occupied",
    orderCount: 2,
    customerNames: ["Ivan"],
    totalAmount: 24.5,
    updatedAt: "2026-08-22T10:00:00.000Z",
    sessionToken: "tok-1",
    ...overrides,
  };
}

function renderView(options: {
  tables?: unknown[];
  socket?: { on: () => void; off: () => void } | null;
  isConnected?: boolean;
  rejectStatuses?: boolean;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.rejectStatuses) {
    api.getTableStatuses.mockRejectedValue(new Error("down"));
  } else {
    api.getTableStatuses.mockResolvedValue(options.tables ?? []);
  }
  socketHolder.socket = options.socket ?? null;
  const utils = render(
    <QueryClientProvider client={client}>
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: {
              id: "rest-1",
              name: "Cafe Nova",
              country: "BG",
              ownerId: "owner-1",
            },
          } as RestaurantContextType
        }
      >
        <LiveTablesView />
      </RestaurantContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getTableStatuses.mockResolvedValue([]);
  api.getTableOrders.mockResolvedValue([]);
  api.closeSession.mockResolvedValue({});
  socketHolder.socket = null;
});

describe("LiveTablesView data states", () => {
  it("renders skeleton placeholders while loading", () => {
    api.getTableStatuses.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();

    expect(container.querySelectorAll(".animate-pulse").length).toBe(8);
  });

  it("shows the error state and invalidates on retry", async () => {
    const { client } = renderView({ rejectStatuses: true });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    expect(await screen.findByText("tables.failedLoadTables")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /tables\.retry/ }),
    );

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tableStatuses", "rest-1"],
    });
  });

  it("shows the no-tables empty state", async () => {
    renderView();

    expect(await screen.findByText("tables.noTablesCreated")).toBeTruthy();
  });
});

describe("LiveTablesView stats & filters", () => {
  const threeTables = () => [
    makeTable(),
    makeTable({ id: "t-2", name: "Table 2", status: "empty", customerNames: [], totalAmount: 0, sessionToken: undefined }),
    makeTable({ id: "t-3", name: "Table 3", status: "paid", customerNames: [], totalAmount: 12, sessionToken: undefined }),
  ];

  it("renders total, active and open-value stats", async () => {
    renderView({ tables: threeTables() });

    const totalTile = (await screen.findByText("tables.totalTables"))
      .parentElement!;
    expect(totalTile.textContent).toContain("3");
    const activeTile = screen.getByText("tables.active").parentElement!;
    expect(activeTile.textContent).toContain("2");
    const openTile = screen.getByText("tables.openValue").parentElement!;
    expect(openTile.textContent).toContain("€36.50");
  });

  it("switches filters and counts per status", async () => {
    renderView({ tables: threeTables() });

    const activeTab = await screen.findByRole("button", { name: /Active/ });
    expect(activeTab.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("table-card-Table 1")).toBeTruthy();
    expect(screen.getByTestId("table-card-Table 3")).toBeTruthy();
    expect(screen.queryByTestId("table-card-Table 2")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Paid/ }));

    expect(screen.queryByTestId("table-card-Table 1")).toBeNull();
    expect(screen.getByTestId("table-card-Table 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(screen.getByTestId("table-card-Table 2")).toBeTruthy();
  });

  it("searches tables by name and shows the all-free state on no match", async () => {
    renderView({ tables: threeTables() });
    const input = await screen.findByPlaceholderText("tables.searchTable");

    fireEvent.change(input, { target: { value: "table 3" } });
    expect(screen.getByTestId("table-card-Table 3")).toBeTruthy();
    expect(screen.queryByTestId("table-card-Table 1")).toBeNull();

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("tables.allFree")).toBeTruthy();
  });
});

describe("LiveTablesView table detail", () => {
  it("opens the modal and loads orders for an occupied table", async () => {
    api.getTableOrders.mockResolvedValue([{ id: "ord-1" }]);
    renderView({ tables: [makeTable()] });

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));

    expect(
      screen.getByTestId("detail-modal").getAttribute("data-open"),
    ).toBe("true");
    await waitFor(() =>
      expect(api.getTableOrders).toHaveBeenCalledWith("t-1", "rest-1"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("detail-modal").getAttribute("data-orders-first"),
      ).toBe("ord-1"),
    );
  });

  it("opens the modal without fetching orders for an empty table", async () => {
    renderView({
      tables: [makeTable({ status: "empty", customerNames: [], sessionToken: undefined })],
    });

    fireEvent.click(await screen.findByRole("button", { name: /All/ }));
    fireEvent.click(screen.getByTestId("table-card-Table 1"));

    expect(
      screen.getByTestId("detail-modal").getAttribute("data-open"),
    ).toBe("true");
    expect(api.getTableOrders).not.toHaveBeenCalled();
  });

  it("ignores a stale orders response after switching tables", async () => {
    let resolveA!: (value: unknown) => void;
    api.getTableOrders
      .mockImplementationOnce(() => new Promise((resolve) => (resolveA = resolve)))
      .mockResolvedValueOnce([{ id: "ord-b" }]);
    renderView({
      tables: [
        makeTable(),
        makeTable({ id: "t-3", name: "Table 3", status: "paid", customerNames: [], totalAmount: 12, sessionToken: undefined }),
      ],
    });

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));
    fireEvent.click(screen.getByTestId("table-card-Table 3"));
    await waitFor(() =>
      expect(
        screen.getByTestId("detail-modal").getAttribute("data-orders-first"),
      ).toBe("ord-b"),
    );

    resolveA([{ id: "ord-a" }]);
    await waitFor(() => expect(api.getTableOrders).toHaveBeenCalledTimes(2));
    expect(
      screen.getByTestId("detail-modal").getAttribute("data-orders-first"),
    ).toBe("ord-b");
  });

  it("flags the orders error inside the modal", async () => {
    api.getTableOrders.mockRejectedValue(new Error("boom"));
    renderView({ tables: [makeTable()] });

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));

    await waitFor(() =>
      expect(
        screen.getByTestId("detail-modal").getAttribute("data-orders-error"),
      ).toBe("true"),
    );
  });

  it("closes the modal via onOpenChange", async () => {
    renderView({ tables: [makeTable()] });

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));
    expect(
      screen.getByTestId("detail-modal").getAttribute("data-open"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("modal-close"));
    expect(
      screen.getByTestId("detail-modal").getAttribute("data-open"),
    ).toBe("false");
  });
});

describe("LiveTablesView session close", () => {
  it("does not call closeSession when the user cancels the confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView({ tables: [makeTable()] });

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));
    fireEvent.click(screen.getByTestId("modal-close-session"));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("Table 1"),
    );
    expect(api.closeSession).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("closes the session and invalidates queries when confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { client } = renderView({ tables: [makeTable()] });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));
    fireEvent.click(screen.getByTestId("modal-close-session"));

    await waitFor(() =>
      expect(api.closeSession).toHaveBeenCalledWith("tok-1", "rest-1"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("detail-modal").getAttribute("data-open"),
      ).toBe("false"),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tableStatuses", "rest-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tableSessions", "rest-1"],
    });
    confirmSpy.mockRestore();
  });

  it("skips the confirm entirely without a session token", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderView({
      tables: [makeTable({ sessionToken: undefined })],
    });

    fireEvent.click(await screen.findByTestId("table-card-Table 1"));
    fireEvent.click(screen.getByTestId("modal-close-session"));

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("LiveTablesView socket integration", () => {
  it("invalidates table statuses when socket events arrive", async () => {
    const on = vi.fn();
    const off = vi.fn();
    const { client } = renderView({
      tables: [makeTable()],
      socket: { on, off } as any,
      isConnected: true,
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await waitFor(() =>
      expect(on).toHaveBeenCalledWith(
        "table:status-changed",
        expect.any(Function),
      ),
    );
    expect(on).toHaveBeenCalledWith("table:updated", expect.any(Function));

    const handler = on.mock.calls.find(
      (call: unknown[]) => call[0] === "table:status-changed",
    )![1];
    handler();

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["tableStatuses", "rest-1"],
    });
  });
});
