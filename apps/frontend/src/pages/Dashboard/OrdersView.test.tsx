import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const ordersMock = vi.hoisted(() => ({
  useOrders: vi.fn(),
}));
const featureMock = vi.hoisted(() => ({
  useFeature: vi.fn(),
}));

vi.mock("../../context/OrderContext", () => ({
  useOrders: ordersMock.useOrders,
}));
vi.mock("../../hooks/useFeature", () => ({
  useFeature: featureMock.useFeature,
}));
vi.mock("../../hooks/useMinuteTicker", () => ({
  useMinuteTicker: () => 1_700_000_000_000,
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
vi.mock("../../components/tables/TableDetailModal", () => ({
  default: (props: any) => (
    <div
      data-testid="detail-modal"
      data-open={String(!!props.open)}
      data-payment={String(!!props.paymentInfo)}
      data-table={props.table?.name ?? ""}
      data-session={props.table?.sessionStatus ?? ""}
      data-order-count={String(props.orders?.length ?? 0)}
    />
  ),
}));

import OrdersView from "./OrdersView";

const NOW = 1_700_000_000_000;
const minutesAgo = (min: number) => new Date(NOW - min * 60_000).toISOString();

type ContextOverrides = Record<string, unknown>;

function makeContext(overrides: ContextOverrides = {}) {
  return {
    orders: [],
    updateOrderStatus: vi.fn().mockResolvedValue(undefined),
    batchUpdateOrderStatus: vi.fn().mockResolvedValue(undefined),
    isOrderUpdating: () => false,
    loadMoreHistory: vi.fn().mockResolvedValue(undefined),
    hasMoreHistory: false,
    isLoadingMoreHistory: false,
    error: null,
    refreshOrders: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderView(overrides: ContextOverrides = {}) {
  ordersMock.useOrders.mockReturnValue(makeContext(overrides));
  return render(<OrdersView />);
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-abc-123456",
    status: "NEW",
    createdAt: minutesAgo(5),
    totalPrice: 24.5,
    customerName: "Ivan",
    source: "CUSTOMER",
    specialRequests: "",
    tableName: "Table 3",
    tableId: "t-3",
    servicePointLabel: undefined,
    servicePointType: undefined,
    fulfillmentType: undefined,
    paymentPreference: undefined,
    tableSession: undefined,
    items: [
      {
        id: "item-1",
        menuItem: { name: "Margherita", price: 10 },
        itemName: "Margherita",
        quantity: 2,
        unitPriceWithOptions: "10.00",
        selectedOptions: [{ choiceName: "Extra cheese", priceModifier: 1 }],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  featureMock.useFeature.mockReturnValue(false);
});

describe("OrdersView rendering & filters", () => {
  it("renders the header, search input and the clear-kitchen empty state", () => {
    renderView();

    expect(screen.getByText("Orders")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("Search by order # or table..."),
    ).toBeTruthy();
    expect(screen.getByText("orders.noOrders")).toBeTruthy();
    expect(screen.getByText("The kitchen is clear for now.")).toBeTruthy();
  });

  it("renders a NEW order card with code, items, option chips, total and elapsed time", () => {
    renderView({ orders: [makeOrder()] });

    expect(screen.getByText("#123456")).toBeTruthy();
    expect(screen.getByText("2x")).toBeTruthy();
    expect(screen.getByText("Margherita")).toBeTruthy();
    expect(screen.getByText("Extra cheese")).toBeTruthy();
    expect(screen.getByText("€20.00")).toBeTruthy();
    expect(screen.getByText("€24.50")).toBeTruthy();
    expect(screen.getByText("5 min ago")).toBeTruthy();
    expect(screen.getByText("QR")).toBeTruthy();
  });

  it("falls back to menuItem price + option modifiers when the snapshot price is missing", () => {
    renderView({
      orders: [
        makeOrder({
          items: [
            {
              id: "item-2",
              menuItem: { name: "Salad", price: 8 },
              itemName: "Salad",
              quantity: 1,
              unitPriceWithOptions: undefined,
              selectedOptions: [{ choiceName: "Avocado", priceModifier: 1.5 }],
            },
          ],
        }),
      ],
    });

    expect(screen.getByText("€9.50")).toBeTruthy();
  });

  it("parses special requests with seat tags and shows the note badge", () => {
    renderView({
      orders: [
        makeOrder({ specialRequests: "[Seat 2] No onions|Plain water" }),
      ],
    });

    expect(screen.getByText("Note")).toBeTruthy();
    expect(screen.getByText("Seat 2")).toBeTruthy();
    expect(screen.getByText("No onions")).toBeTruthy();
  });

  it("shows +N more when an order has more than 6 items", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      id: `item-${i}`,
      menuItem: { name: `Dish ${i}`, price: 5 },
      itemName: `Dish ${i}`,
      quantity: 1,
      unitPriceWithOptions: "5.00",
      selectedOptions: [],
    }));
    renderView({ orders: [makeOrder({ items })] });

    expect(screen.getByText("+1 more")).toBeTruthy();
  });

  it("switches tabs and only shows orders matching the active tab", () => {
    renderView({
      orders: [
        makeOrder({ id: "order-1", status: "NEW" }),
        makeOrder({
          id: "order-2",
          status: "COMPLETED",
          items: [
            {
              id: "item-3",
              menuItem: { name: "Sushi", price: 12 },
              itemName: "Sushi",
              quantity: 1,
              unitPriceWithOptions: "12.00",
              selectedOptions: [],
            },
          ],
        }),
      ],
    });

    const completedTab = screen.getByRole("button", { name: /Completed/ });
    expect(completedTab.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("Margherita")).toBeTruthy();
    expect(screen.queryByText("Sushi")).toBeNull();

    fireEvent.click(completedTab);

    expect(completedTab.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Margherita")).toBeNull();
    expect(screen.getByText("Sushi")).toBeTruthy();
  });

  it("hides the PENDING_PAYMENT tab without the payments feature and no such orders", () => {
    renderView({ orders: [makeOrder()] });

    expect(
      screen.queryByRole("button", { name: /Awaiting payment/ }),
    ).toBeNull();
  });

  it("shows the PENDING_PAYMENT tab when such orders exist even without the feature", () => {
    renderView({ orders: [makeOrder({ status: "PENDING_PAYMENT" })] });

    expect(
      screen.getByRole("button", { name: /Awaiting payment/ }),
    ).toBeTruthy();
  });

  it("shows the PENDING_PAYMENT tab when the payments feature is enabled", () => {
    featureMock.useFeature.mockReturnValue(true);
    renderView({ orders: [makeOrder()] });

    expect(
      screen.getByRole("button", { name: /Awaiting payment/ }),
    ).toBeTruthy();
  });

  it("filters by order code and shows the no-results hint", () => {
    renderView({ orders: [makeOrder()] });
    const input = screen.getByPlaceholderText(
      "Search by order # or table...",
    );

    fireEvent.change(input, { target: { value: "123456" } });
    expect(screen.getByText("Margherita")).toBeTruthy();

    fireEvent.change(input, { target: { value: "999999" } });
    expect(screen.queryByText("Margherita")).toBeNull();
    expect(
      screen.getByText("Try a different order number, table, or dish."),
    ).toBeTruthy();
  });

  it("filters by item name and by table name", () => {
    renderView({ orders: [makeOrder()] });
    const input = screen.getByPlaceholderText(
      "Search by order # or table...",
    );

    fireEvent.change(input, { target: { value: "margherita" } });
    expect(screen.getByText("Margherita")).toBeTruthy();

    fireEvent.change(input, { target: { value: "table 3" } });
    expect(screen.getByText("Margherita")).toBeTruthy();

    fireEvent.change(input, { target: { value: "sushi" } });
    expect(screen.queryByText("Margherita")).toBeNull();
  });
});

describe("OrdersView single-order actions", () => {
  it("starts preparing a NEW order", async () => {
    const updateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({ orders: [makeOrder()], updateOrderStatus });
    const card = screen.getByText("#123456").closest("article")!;

    await userEvent.click(
      within(card).getByRole("button", { name: /orders\.startPreparing/ }),
    );

    expect(updateOrderStatus).toHaveBeenCalledWith(
      "order-abc-123456",
      "IN_PROGRESS",
    );
  });

  it("cancels a NEW order", async () => {
    const updateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({ orders: [makeOrder()], updateOrderStatus });
    const card = screen.getByText("#123456").closest("article")!;

    await userEvent.click(
      within(card).getByRole("button", { name: /orders\.cancel/ }),
    );

    expect(updateOrderStatus).toHaveBeenCalledWith(
      "order-abc-123456",
      "CANCELED",
    );
  });

  it("does not open the detail modal when a card action button is clicked", async () => {
    const updateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({ orders: [makeOrder()], updateOrderStatus });
    const card = screen.getByText("#123456").closest("article")!;

    await userEvent.click(
      within(card).getByRole("button", { name: /orders\.startPreparing/ }),
    );

    expect(screen.getByTestId("detail-modal").getAttribute("data-open")).toBe(
      "false",
    );
  });

  it("marks an IN_PROGRESS order as served", async () => {
    const updateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({
      orders: [makeOrder({ status: "IN_PROGRESS" })],
      updateOrderStatus,
    });
    fireEvent.click(screen.getByRole("button", { name: /In Progress/ }));
    const card = screen.getByText("#123456").closest("article")!;

    await userEvent.click(
      within(card).getByRole("button", { name: /orders\.markServed/ }),
    );
    expect(updateOrderStatus).toHaveBeenCalledWith(
      "order-abc-123456",
      "SERVED",
    );
  });

  it("marks a SERVED order as completed", async () => {
    const updateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({ orders: [makeOrder({ status: "SERVED" })], updateOrderStatus });
    fireEvent.click(screen.getByRole("button", { name: /Served/ }));
    const card = screen.getByText("#123456").closest("article")!;

    await userEvent.click(
      within(card).getByRole("button", { name: /orders\.markCompleted/ }),
    );
    expect(updateOrderStatus).toHaveBeenCalledWith(
      "order-abc-123456",
      "COMPLETED",
    );
  });

  it("shows the sync-error banner when a status update fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderView({
      orders: [makeOrder()],
      updateOrderStatus: vi.fn().mockRejectedValue(new Error("boom")),
    });
    const card = screen.getByText("#123456").closest("article")!;

    await userEvent.click(
      within(card).getByRole("button", { name: /orders\.startPreparing/ }),
    );

    expect(
      await screen.findByText(
        "Orders could not be synchronized. Please retry.",
      ),
    ).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("OrdersView bulk actions", () => {
  it("marks all NEW orders as IN_PROGRESS", async () => {
    const batchUpdateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({
      orders: [
        makeOrder({ id: "order-aaa" }),
        makeOrder({ id: "order-bbb" }),
      ],
      batchUpdateOrderStatus,
    });

    await userEvent.click(
      screen.getByRole("button", { name: /Mark all as In Progress/ }),
    );

    expect(batchUpdateOrderStatus).toHaveBeenCalledWith(
      ["order-aaa", "order-bbb"],
      "NEW",
      "IN_PROGRESS",
    );
  });

  it("marks all IN_PROGRESS orders as SERVED", async () => {
    const batchUpdateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({
      orders: [makeOrder({ id: "order-aaa", status: "IN_PROGRESS" })],
      batchUpdateOrderStatus,
    });
    fireEvent.click(screen.getByRole("button", { name: /In Progress/ }));

    await userEvent.click(
      screen.getByRole("button", { name: /Mark all as Served/ }),
    );

    expect(batchUpdateOrderStatus).toHaveBeenCalledWith(
      ["order-aaa"],
      "IN_PROGRESS",
      "SERVED",
    );
  });

  it("marks all SERVED orders as COMPLETED", async () => {
    const batchUpdateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({
      orders: [makeOrder({ id: "order-aaa", status: "SERVED" })],
      batchUpdateOrderStatus,
    });
    fireEvent.click(screen.getByRole("button", { name: /Served/ }));

    await userEvent.click(
      screen.getByRole("button", { name: /Mark all as Completed/ }),
    );

    expect(batchUpdateOrderStatus).toHaveBeenCalledWith(
      ["order-aaa"],
      "SERVED",
      "COMPLETED",
    );
  });

  it("disables the bulk button while any filtered order is updating", async () => {
    const batchUpdateOrderStatus = vi.fn().mockResolvedValue(undefined);
    renderView({
      orders: [makeOrder({ id: "order-aaa" })],
      batchUpdateOrderStatus,
      isOrderUpdating: () => true,
    });

    const button = screen.getByRole("button", {
      name: /Mark all as In Progress/,
    });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(button);
    expect(batchUpdateOrderStatus).not.toHaveBeenCalled();
  });
});

describe("OrdersView detail modal", () => {
  it("opens the modal on card click with the derived table and no payment info", async () => {
    renderView({
      orders: [
        makeOrder({
          servicePointType: "PICKUP",
          servicePointLabel: "Bar counter",
          paymentPreference: "PAY_ON_DELIVERY",
          fulfillmentType: "PICKUP",
        }),
      ],
    });

    await userEvent.click(screen.getByText("Margherita").closest("article")!);

    const modal = screen.getByTestId("detail-modal");
    expect(modal.getAttribute("data-open")).toBe("true");
    expect(modal.getAttribute("data-table")).toBe("Bar counter");
    expect(modal.getAttribute("data-payment")).toBe("false");
    expect(modal.getAttribute("data-order-count")).toBe("1");
  });

  it("opens the modal with keyboard Enter", () => {
    renderView({ orders: [makeOrder()] });

    fireEvent.keyDown(screen.getByText("Margherita").closest("article")!, {
      key: "Enter",
    });

    expect(screen.getByTestId("detail-modal").getAttribute("data-open")).toBe(
      "true",
    );
  });

  it("passes payment info when the table session is PAID", async () => {
    renderView({
      orders: [makeOrder({ tableSession: { status: "PAID" } })],
    });

    await userEvent.click(screen.getByText("Margherita").closest("article")!);

    expect(
      screen.getByTestId("detail-modal").getAttribute("data-payment"),
    ).toBe("true");
  });
});

describe("OrdersView error & history", () => {
  it("shows the context error and retries via refreshOrders", async () => {
    const refreshOrders = vi.fn().mockResolvedValue(undefined);
    renderView({ error: "sync failed", refreshOrders });

    expect(
      screen.getByText("Orders could not be synchronized. Please retry."),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refreshOrders).toHaveBeenCalledTimes(1);
  });

  it("loads older orders on COMPLETED when more history exists", async () => {
    const loadMoreHistory = vi.fn().mockResolvedValue(undefined);
    renderView({
      orders: [makeOrder({ status: "COMPLETED" })],
      hasMoreHistory: true,
      loadMoreHistory,
    });
    fireEvent.click(screen.getByRole("button", { name: /Completed/ }));

    await userEvent.click(
      screen.getByRole("button", { name: /Load older orders/ }),
    );
    expect(loadMoreHistory).toHaveBeenCalledTimes(1);
  });

  it("disables the load-older button while history is loading", () => {
    renderView({
      orders: [makeOrder({ status: "COMPLETED" })],
      hasMoreHistory: true,
      isLoadingMoreHistory: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /Completed/ }));

    expect(
      (screen.getByRole("button", {
        name: /Load older orders/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("hides the load-older button while searching", () => {
    renderView({
      orders: [makeOrder({ status: "COMPLETED" })],
      hasMoreHistory: true,
    });
    fireEvent.click(screen.getByRole("button", { name: /Completed/ }));
    fireEvent.change(
      screen.getByPlaceholderText("Search by order # or table..."),
      { target: { value: "123456" } },
    );

    expect(
      screen.queryByRole("button", { name: /Load older orders/ }),
    ).toBeNull();
  });
});
