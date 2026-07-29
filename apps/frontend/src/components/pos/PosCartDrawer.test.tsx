import React from "react";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi, type Mock } from "vitest";
import PosCartDrawer from "./PosCartDrawer";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";
import { usePosTheme } from "../../context/PosThemeContext";
import * as api from "../../lib/api";
import * as offlineOrders from "../../lib/posOfflineOrders";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../context/PosContext", () => ({
  usePos: vi.fn(),
}));

vi.mock("../../context/PosThemeContext", () => ({
  usePosTheme: vi.fn(),
}));

const socketMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(payload?: unknown) => void>> = {};
  const socket: { on: Mock; off: Mock } = {
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
      return socket;
    }),
    off: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter(
        (registered) => registered !== handler,
      );
      return socket;
    }),
  };

  return {
    handlers,
    socket,
    state: {
      socket: null as { on: Mock; off: Mock } | null,
      isConnected: false,
    },
  };
});

vi.mock("../../context/SocketContext", () => ({
  useSocket: () => socketMocks.state,
}));

vi.mock("../../lib/api", () => ({
  createOrder: vi.fn(),
  closeSession: vi.fn(),
  closeSessionWithCard: vi.fn(),
  closeSessionWithCash: vi.fn(),
  getSessionBill: vi.fn(),
  getOrCreateSession: vi.fn(),
}));

vi.mock("../../lib/posOfflineOrders", () => ({
  createPosClientOrderId: vi.fn(() => "client-order-1"),
  createPosLocalSessionId: vi.fn(() => "local-session-1"),
  isPosTransportFailure: vi.fn(() => false),
  queuePosOrder: vi.fn(),
  discardOrdersForSession: vi.fn(),
}));

vi.mock("react-dom", async () => {
  const actual = (await vi.importActual("react-dom")) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock("./PosSplitDrawer", () => ({
  default: () => <div data-testid="split-drawer" />,
}));
vi.mock("./PosQRBill", () => ({
  default: () => <div data-testid="qr-bill" />,
}));
vi.mock("./PaymentModal", () => ({
  default: () => <div data-testid="payment-modal" />,
}));

describe("PosCartDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(socketMocks.handlers).forEach((event) => {
      delete socketMocks.handlers[event];
    });
    socketMocks.state.socket = null;
    socketMocks.state.isConnected = false;
    (api.getSessionBill as Mock).mockResolvedValue({
      sessionId: "session-1",
      tableId: "t1",
      tableName: "Table 1",
      restaurantId: "r1",
      orders: [],
      subtotal: 0,
      paidSubtotal: 0,
      remaining: 0,
      splitItemsAvailable: true,
      tipsEnabled: false,
      tipOptions: [],
      paymentProviders: [],
      pendingPayment: null,
    });
    (usePosTheme as Mock).mockReturnValue({ theme: "light" });
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 2,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        sessionId: "session-1",
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      setSession: vi.fn(),
      removeItem: vi.fn(),
      updateQuantity: vi.fn(),
      updateNote: vi.fn(),
      markAsSubmitted: vi.fn(),
      markAsQueued: vi.fn(),
      clearSession: vi.fn(),
      getPendingTotal: () => 20,
      buildSpecialRequests: () => "",
      historyLoading: false,
      historyError: null,
    });
  });

  const renderWithContext = (ui: React.ReactElement) => {
    return render(
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: { id: "r1", paymentsEnabled: true },
          } as unknown as React.ContextType<typeof RestaurantContext>
        }
      >
        {ui}
      </RestaurantContext.Provider>,
    );
  };

  it("renders cart summary button and opens sheet on click", () => {
    renderWithContext(<PosCartDrawer itemCount={2} total={20} />);
    const openBtn = screen.getByRole("button", { name: /item/i });
    expect(openBtn).toBeInTheDocument();
    fireEvent.click(openBtn);
    expect(screen.getByText(/pos.tableLabel/i)).toBeInTheDocument();
  });

  it("allows modifying quantity of items", () => {
    const updateQuantityMock = vi.fn();
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 2,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        sessionId: "session-1",
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      updateQuantity: updateQuantityMock,
      getPendingTotal: () => 20,
      buildSpecialRequests: () => "",
    });

    renderWithContext(<PosCartDrawer itemCount={2} total={20} />);
    fireEvent.click(screen.getByRole("button", { name: /item/i })); // open
    const minusBtn = screen.getByRole("button", { name: "−" });
    const plusBtn = screen.getByRole("button", { name: "+" });

    fireEvent.click(plusBtn);
    expect(updateQuantityMock).toHaveBeenCalledWith("c1", 3);

    fireEvent.click(minusBtn);
    expect(updateQuantityMock).toHaveBeenCalledWith("c1", 1);
  });

  it("handles checkout submission correctly", async () => {
    const markAsSubmittedMock = vi.fn();
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        sessionId: "session-1",
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      getPendingTotal: () => 10,
      buildSpecialRequests: () => "",
      markAsSubmitted: markAsSubmittedMock,
      markAsQueued: vi.fn(),
      setSession: vi.fn(),
    });
    (api.createOrder as Mock).mockResolvedValue({});

    renderWithContext(<PosCartDrawer itemCount={1} total={10} />);
    fireEvent.click(screen.getByRole("button", { name: /item/i })); // open

    const submitBtn = screen.getByRole("button", {
      name: /pos.submitOrderTotal/i,
    });
    fireEvent.click(submitBtn);

    // opens confirm dialog
    const confirmBtn = screen.getByRole("button", { name: /pos.submit/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: "r1",
          tableId: "Table 1",
          posSubmission: {
            clientOrderId: "client-order-1",
            restaurantId: "r1",
            tableId: "t1",
            expectedTableSessionId: "session-1",
          },
          items: [
            {
              menuItemId: "m1",
              quantity: 1,
              expectedUnitPrice: 10,
              selectedOptions: [],
            },
          ],
        }),
      );
      expect(markAsSubmittedMock).toHaveBeenCalledWith(["c1"]);
    });
  });

  it("queues the exact order intent when submission loses the network", async () => {
    const markAsQueued = vi.fn();
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          seatNumber: "Seat 1",
          itemNote: "",
          submitted: false,
        },
      ],
      session: {
        sessionToken: null,
        sessionId: null,
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      getPendingTotal: () => 10,
      buildSpecialRequests: () => "",
      markAsSubmitted: vi.fn(),
      markAsQueued,
      setSession: vi.fn(),
    });
    (api.createOrder as Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (offlineOrders.isPosTransportFailure as Mock).mockReturnValue(true);

    renderWithContext(<PosCartDrawer itemCount={1} total={10} />);
    fireEvent.click(screen.getByRole("button", { name: /item/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /pos.submitOrderTotal/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /pos.submit/i }));

    await waitFor(() => {
      expect(offlineOrders.queuePosOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          clientOrderId: "client-order-1",
          localSessionId: "local-session-1",
          status: "pending",
          payload: expect.objectContaining({
            posSubmission: expect.objectContaining({
              expectedTableSessionId: null,
            }),
          }),
        }),
      );
      expect(markAsQueued).toHaveBeenCalledWith("client-order-1", ["c1"]);
    });
  });

  it("clears the queued-offline notice once the order actually syncs", async () => {
    const queuedItem = {
      cartId: "c1",
      menuItemId: "m1",
      name: "Burger",
      quantity: 1,
      price: 10,
      selectedOptions: [],
      seatNumber: "Seat 1",
      itemNote: "",
      submitted: false,
    };
    const baseMock = {
      session: {
        sessionToken: null,
        sessionId: null,
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      getPendingTotal: () => 10,
      buildSpecialRequests: () => "",
      markAsSubmitted: vi.fn(),
      markAsQueued: vi.fn(),
      setSession: vi.fn(),
    };
    (usePos as Mock).mockReturnValue({ ...baseMock, items: [queuedItem] });
    (api.createOrder as Mock).mockRejectedValue({ code: "ERR_NETWORK" });
    (offlineOrders.isPosTransportFailure as Mock).mockReturnValue(true);

    const { rerender } = renderWithContext(
      <PosCartDrawer itemCount={1} total={10} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /item/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /pos.submitOrderTotal/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /pos.submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/pos.orderQueuedOffline/i)).toBeInTheDocument();
    });

    // The order synced (its item flips submitted + syncState "sent"), but
    // nothing previously cleared the queued-offline notice — it stuck around
    // until the drawer remounted.
    (usePos as Mock).mockReturnValue({
      ...baseMock,
      items: [{ ...queuedItem, submitted: true, syncState: "sent" }],
    });
    rerender(
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: { id: "r1", paymentsEnabled: true },
          } as unknown as React.ContextType<typeof RestaurantContext>
        }
      >
        <PosCartDrawer itemCount={1} total={10} />
      </RestaurantContext.Provider>,
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/pos.orderQueuedOffline/i),
      ).not.toBeInTheDocument();
    });
  });

  it("does not double-submit when the confirm button fires twice before the request resolves (Bug 1a)", async () => {
    const markAsSubmittedMock = vi.fn();
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          submitted: false,
        },
      ],
      session: {
        sessionToken: "token123",
        sessionId: "session-1",
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      getPendingTotal: () => 10,
      buildSpecialRequests: () => "",
      markAsSubmitted: markAsSubmittedMock,
      markAsQueued: vi.fn(),
      setSession: vi.fn(),
    });
    // Never-resolving promise simulates a slow request: both clicks land
    // while `submitting` is still true from the first one.
    (api.createOrder as Mock).mockReturnValue(new Promise(() => {}));

    renderWithContext(<PosCartDrawer itemCount={1} total={10} />);
    fireEvent.click(screen.getByRole("button", { name: /item/i }));
    fireEvent.click(
      screen.getByRole("button", { name: /pos.submitOrderTotal/i }),
    );
    const confirmBtn = screen.getByRole("button", { name: /pos.submit/i });
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.createOrder).toHaveBeenCalledTimes(1);
    });
  });

  it("blocks payment and force-close while this table has an unsynced order", () => {
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "c1",
          menuItemId: "m1",
          name: "Burger",
          quantity: 1,
          price: 10,
          selectedOptions: [],
          submitted: true,
          syncState: "queued",
          queuedOrderId: "client-order-1",
        },
      ],
      session: {
        sessionToken: "token123",
        sessionId: "session-1",
        localSessionId: "local-session-1",
        tableName: "Table 1",
        tableId: "t1",
      },
      sessionBill: null,
      setSessionBill: vi.fn(),
      getPendingTotal: () => 0,
      buildSpecialRequests: () => "",
      historyLoading: false,
      historyError: null,
    });

    renderWithContext(<PosCartDrawer itemCount={1} total={10} />);
    fireEvent.click(screen.getByRole("button", { name: /queued/i }));

    expect(
      screen.getByRole("button", { name: /pos.closeCardTotal/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /pos.closeCashTotal/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /pos.forceCloseNoPayment/i }),
    ).toBeDisabled();
  });

  it("renders the shared authoritative bill instead of a stale item sum", () => {
    (usePos as Mock).mockReturnValue({
      items: [
        {
          cartId: "old-order",
          menuItemId: "m1",
          name: "Previous items",
          quantity: 1,
          price: 62.62,
          selectedOptions: [],
          submitted: true,
        },
      ],
      session: {
        sessionToken: "token123",
        sessionId: "session-1",
        localSessionId: "local-session-1",
        tableName: "Table 10",
        tableId: "t10",
      },
      sessionBill: {
        sessionId: "session-1",
        tableId: "t10",
        tableName: "Table 10",
        restaurantId: "r1",
        orders: [],
        subtotal: 68.24,
        paidSubtotal: 0,
        remaining: 68.24,
        splitItemsAvailable: true,
        tipsEnabled: false,
        tipOptions: [],
        paymentProviders: [],
        pendingPayment: null,
      },
      setSessionBill: vi.fn(),
      getPendingTotal: () => 0,
      buildSpecialRequests: () => "",
      historyLoading: false,
      historyError: null,
    });

    renderWithContext(<PosCartDrawer itemCount={1} total={62.62} />);
    fireEvent.click(screen.getByRole("button", { name: /pos.allSent/i }));

    expect(screen.getAllByText(/68\.24/).length).toBeGreaterThan(0);
  });

  it("marks item-scoped payments and charges only the authoritative remainder", async () => {
    socketMocks.state.socket = socketMocks.socket;
    socketMocks.state.isConnected = true;
    const setHistoryItems = vi.fn();
    const setHistoryLoading = vi.fn();
    const setHistoryError = vi.fn();
    const submittedItems = [
      {
        cartId: "order-old-oi-shopska",
        serverOrderItemId: "oi-shopska",
        menuItemId: "",
        name: "Шопска салата",
        quantity: 1,
        paidQuantity: 0,
        remainingQuantity: 1,
        price: 5.63,
        selectedOptions: [],
        seatNumber: "Shared",
        itemNote: "",
        submitted: true,
      },
      {
        cartId: "order-paid-oi-selska",
        serverOrderItemId: "oi-selska",
        menuItemId: "",
        name: "Селска салата лятна",
        quantity: 1,
        paidQuantity: 1,
        remainingQuantity: 0,
        price: 5.62,
        selectedOptions: [],
        seatNumber: "Shared",
        itemNote: "",
        submitted: true,
      },
      {
        cartId: "order-new-oi-lukanka",
        serverOrderItemId: "oi-lukanka",
        menuItemId: "",
        name: "Луканка",
        quantity: 1,
        paidQuantity: 0,
        remainingQuantity: 1,
        price: 4.29,
        selectedOptions: [],
        seatNumber: "Shared",
        itemNote: "",
        submitted: true,
      },
    ];
    const bill = {
      sessionId: "session-1",
      tableId: "t1",
      tableName: "Table 1",
      restaurantId: "r1",
      orders: [],
      subtotal: 29.61,
      paidSubtotal: 16.11,
      remaining: 13.5,
      splitItemsAvailable: true,
      tipsEnabled: false,
      tipOptions: [],
      paymentProviders: [],
      pendingPayment: null,
    };
    (api.getSessionBill as Mock).mockResolvedValue(bill);
    (usePos as Mock).mockImplementation(() => {
      const [sessionBill, setSessionBill] = React.useState(null);
      return {
        items: submittedItems,
        session: {
          sessionToken: "token123",
          sessionId: "session-1",
          localSessionId: "local-session-1",
          tableName: "Table 1",
          tableId: "t1",
        },
        sessionBill,
        setSessionBill,
        setSession: vi.fn(),
        setHistoryItems,
        setHistoryLoading,
        setHistoryError,
        removeItem: vi.fn(),
        updateQuantity: vi.fn(),
        updateNote: vi.fn(),
        markAsSubmitted: vi.fn(),
        markAsQueued: vi.fn(),
        clearSession: vi.fn(),
        getPendingTotal: () => 0,
        buildSpecialRequests: () => "",
        historyLoading: false,
        historyError: null,
      };
    });

    renderWithContext(<PosCartDrawer itemCount={3} total={15.54} />);
    fireEvent.click(screen.getByRole("button", { name: /pos.allSent/i }));

    await waitFor(() => {
      expect(api.getSessionBill).toHaveBeenCalledWith("token123");
      expect(screen.getAllByText(/13\.50/).length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText("pos.paymentStatus.paid")).toBeInTheDocument();
    expect(screen.queryByText(/29\.61/)).not.toBeInTheDocument();

    (api.getSessionBill as Mock).mockResolvedValueOnce({
      ...bill,
      paidSubtotal: 20.29,
      remaining: 9.32,
    });
    act(() => {
      socketMocks.handlers["bill:updated"][0]({
        tableSessionId: "session-1",
      });
    });

    await waitFor(() => {
      expect(api.getSessionBill).toHaveBeenCalledTimes(2);
      expect(screen.getAllByText(/9\.32/).length).toBeGreaterThan(0);
    });
  });
});
