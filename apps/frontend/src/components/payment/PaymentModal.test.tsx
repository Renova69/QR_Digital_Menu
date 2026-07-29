import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { PaymentModal } from "./PaymentModal";

const apiMocks = vi.hoisted(() => ({
  getSessionBill: vi.fn(),
  createCheckout: vi.fn(),
  createCashPaymentRequest: vi.fn(),
  abandonCheckout: vi.fn(),
}));
const stripeMocks = vi.hoisted(() => ({
  confirmPayment: vi.fn(),
}));
const i18nMocks = vi.hoisted(() => ({
  // Mirrors real i18next's two calling conventions: `t(key, options)` where
  // options carries `defaultValue`, or `t(key, fallback, options)`. Either
  // way, interpolation vars come from whichever side is the options object,
  // substituted generically so new `{{placeholder}}` keys need no mock changes.
  t: (
    key: string,
    fallbackOrOptions?: string | Record<string, unknown>,
    maybeOptions?: Record<string, unknown>,
  ) => {
    const isFallbackString = typeof fallbackOrOptions === "string";
    const template = isFallbackString
      ? fallbackOrOptions
      : ((fallbackOrOptions?.defaultValue as string | undefined) ?? key);
    const vars = (isFallbackString ? maybeOptions : fallbackOrOptions) ?? {};
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, varName) =>
      vars[varName] !== undefined ? String(vars[varName]) : "",
    );
  },
}));
const socketMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(payload?: unknown) => void>> = {};
  const socket: { emit: Mock; on: Mock; off: Mock } = {
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
      return socket;
    }),
    off: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
      return socket;
    }),
  };

  return {
    handlers,
    socket,
    state: {
      socket: null as { emit: Mock; on: Mock; off: Mock } | null,
      isConnected: false,
    },
  };
});

vi.mock("../../lib/api", () => ({
  getSessionBill: apiMocks.getSessionBill,
  createCheckout: apiMocks.createCheckout,
  createCashPaymentRequest: apiMocks.createCashPaymentRequest,
  abandonCheckout: apiMocks.abandonCheckout,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: i18nMocks.t,
  }),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: () => socketMocks.state,
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmPayment: stripeMocks.confirmPayment }),
  useElements: () => ({}),
}));

function billWithProviders(
  paymentProviders: Array<"STRIPE" | "EPAY" | "BORICA" | "MYPOS">,
) {
  return {
    orders: [
      {
        id: "order1",
        source: "CUSTOMER",
        customerName: "Maria Petrova",
        customerPhone: "+359893999888",
        staffName: null,
        staffRole: null,
        totalPrice: 20,
        items: [
          {
            orderItemId: "oi-soup",
            name: "Soup",
            quantity: 1,
            paidQuantity: 0,
            unitPrice: 20,
            unitPriceWithOptions: 20,
            selectedOptions: [],
          },
        ],
      },
    ],
    subtotal: 20,
    paidSubtotal: 0,
    remaining: 20,
    splitItemsAvailable: true,
    restaurantId: "rest1",
    tableName: "6",
    tipsEnabled: false,
    tipOptions: [],
    paymentProviders,
    pendingPayment: null,
  };
}

function fullTablePendingPayment() {
  return {
    id: "pending-full",
    tableSessionId: "s1",
    source: "ONLINE_PAYMENT",
    provider: "STRIPE",
    status: "PENDING",
    scope: "FULL_TABLE",
    orderIds: [],
    amount: 20,
    createdAt: "2026-06-21T08:00:00.000Z",
  };
}

function scopedPendingPayment(orderIds: string[]) {
  return {
    id: "pending-scoped",
    tableSessionId: "s1",
    source: "CASH_REQUEST",
    provider: "CASH",
    status: "PENDING",
    scope: "ORDER_ITEMS",
    orderIds,
    amount: 20,
    createdAt: "2026-06-21T08:00:00.000Z",
  };
}

function twoOrderBill() {
  return {
    ...billWithProviders(["STRIPE"]),
    sessionId: "s1",
    orders: [
      ...billWithProviders(["STRIPE"]).orders,
      {
        id: "order2",
        source: "CUSTOMER",
        customerName: "Ivan",
        customerPhone: null,
        staffName: null,
        staffRole: null,
        totalPrice: 12,
        items: [
          {
            orderItemId: "oi-salad",
            name: "Salad",
            quantity: 1,
            paidQuantity: 0,
            unitPrice: 12,
            unitPriceWithOptions: 12,
            selectedOptions: [],
          },
        ],
      },
    ],
    subtotal: 32,
    remaining: 32,
  };
}

describe("PaymentModal hosted provider choices", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    apiMocks.getSessionBill.mockReset();
    apiMocks.createCheckout.mockReset();
    apiMocks.createCashPaymentRequest.mockReset();
    apiMocks.abandonCheckout.mockReset();
    stripeMocks.confirmPayment.mockReset();
    Object.keys(socketMocks.handlers).forEach((event) => {
      delete socketMocks.handlers[event];
    });
    socketMocks.socket.emit.mockClear();
    socketMocks.socket.on.mockClear();
    socketMocks.socket.off.mockClear();
    socketMocks.state.socket = null;
    socketMocks.state.isConnected = false;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows the ePay option only when the bill advertises EPAY", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE", "EPAY"]),
    );

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Card via ePay.bg" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Card via Stripe" }),
    ).toBeTruthy();

    cleanup();
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByTestId("payment-continue-button");
    expect(screen.queryByRole("button", { name: "ePay.bg" })).toBeNull();
  });

  it("never sends the table-session fragment to Stripe return_url", async () => {
    window.history.replaceState({}, "", "/checkout#session=tok1");
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "STRIPE",
      clientSecret: "secret",
      total: 20,
      tipAmount: 0,
    });
    stripeMocks.confirmPayment.mockResolvedValueOnce({
      paymentIntent: { status: "succeeded" },
    });
    const onSuccess = vi.fn();

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(await screen.findByTestId("payment-continue-button"));
    await screen.findByTestId("payment-element");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Pay / }));
    });

    await waitFor(() => {
      expect(stripeMocks.confirmPayment).toHaveBeenCalledTimes(1);
    });
    const call = stripeMocks.confirmPayment.mock.calls[0][0];
    expect(new URL(call.confirmParams.return_url).hash).toBe("");
    expect(call.confirmParams.return_url).not.toContain("tok1");
    expect(sessionStorage.getItem("hosted-checkout:tok1")).toContain(
      '"token":"tok1"',
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Back to Menu" }),
    );
    expect(sessionStorage.getItem("hosted-checkout:tok1")).toBeNull();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("shows an actionable insufficient-funds message from Stripe", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "STRIPE",
      clientSecret: "secret",
      total: 20,
      tipAmount: 0,
    });
    stripeMocks.confirmPayment.mockResolvedValueOnce({
      error: {
        code: "card_declined",
        decline_code: "insufficient_funds",
      },
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("payment-continue-button"));
    await screen.findByTestId("payment-element");
    fireEvent.click(screen.getByRole("button", { name: /^Pay / }));

    expect(
      await screen.findByText(
        "Insufficient funds. Please use another payment method.",
      ),
    ).toBeTruthy();
  });

  it("shows a recoverable connection message when Stripe confirmation rejects", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "STRIPE",
      clientSecret: "secret",
      total: 20,
      tipAmount: 0,
    });
    stripeMocks.confirmPayment.mockRejectedValueOnce(new Error("network"));

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTestId("payment-continue-button"));
    await screen.findByTestId("payment-element");
    fireEvent.click(screen.getByRole("button", { name: /^Pay / }));

    expect(
      await screen.findByText(
        "We could not confirm the payment. Check your connection and try again.",
      ),
    ).toBeTruthy();
    expect(sessionStorage.getItem("hosted-checkout:tok1")).toBeNull();
  });

  it("creates a formal cash payment request without starting online checkout", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );
    apiMocks.createCashPaymentRequest.mockResolvedValueOnce({ id: "cash-1" });
    const onCashRequestCreated = vi.fn();

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        onCashRequestCreated={onCashRequestCreated}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Pay cash to waiter/i }),
    );

    await waitFor(() => {
      expect(apiMocks.createCashPaymentRequest).toHaveBeenCalledWith("tok1", {
        restaurantId: "rest1",
      });
    });
    expect(await screen.findByText("Cash request sent")).toBeTruthy();
    expect(onCashRequestCreated).toHaveBeenCalledWith("cash-1");
    expect(apiMocks.createCheckout).not.toHaveBeenCalled();
  });

  it("hides the cash fallback when the caller requires online payment", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(["MYPOS"]));

    render(
      <PaymentModal
        sessionToken="tok1"
        allowCashRequest={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Pay by card (myPOS)" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Pay cash to waiter" }),
    ).toBeNull();
  });

  it("completes the modal when a cash request fully pays the session", async () => {
    socketMocks.state.socket = socketMocks.socket;
    socketMocks.state.isConnected = true;
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );
    apiMocks.createCashPaymentRequest.mockResolvedValueOnce({ id: "cash-1" });
    const onSuccess = vi.fn();

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Pay cash to waiter/i }),
    );
    await screen.findByText("Cash request sent");

    await waitFor(() => {
      expect(socketMocks.handlers["cashPaymentRequest:updated"]?.length).toBe(
        1,
      );
    });

    act(() => {
      socketMocks.handlers["cashPaymentRequest:updated"][0]({
        id: "cash-1",
        status: "PAID",
        requestedAmount: 20,
      });
      socketMocks.handlers["bill:updated"][0]({
        tableSessionId: "s1",
        remaining: 0,
        sessionPaid: true,
      });
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(socketMocks.socket.emit).toHaveBeenCalledWith(
      "joinTableSessionRoom",
      {
        token: "tok1",
      },
    );
  });

  it("keeps the public table session after an item-scoped cash payment", async () => {
    socketMocks.state.socket = socketMocks.socket;
    socketMocks.state.isConnected = true;
    const initialBill = twoOrderBill();
    const refreshedBill = {
      ...initialBill,
      paidSubtotal: 20,
      remaining: 12,
      orders: initialBill.orders.map((order) =>
        order.id === "order1"
          ? {
              ...order,
              items: order.items.map((item) => ({
                ...item,
                paidQuantity: item.quantity,
              })),
            }
          : order,
      ),
    };
    apiMocks.getSessionBill
      .mockResolvedValueOnce(initialBill)
      .mockResolvedValueOnce(refreshedBill);
    apiMocks.createCashPaymentRequest.mockResolvedValueOnce({
      id: "cash-owned",
    });
    const onSuccess = vi.fn();

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={["order1"]}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Pay cash to waiter/i }),
    );
    await screen.findByText("Cash request sent");

    act(() => {
      socketMocks.handlers["cashPaymentRequest:updated"][0]({
        id: "cash-owned",
        status: "PAID",
        requestedAmount: 20,
      });
      socketMocks.handlers["bill:updated"][0]({
        tableSessionId: "s1",
        remaining: 12,
        sessionPaid: false,
      });
    });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Your items were paid:.*20\.00/),
    ).toBeTruthy();
    expect(screen.getByText(/Remaining table balance:.*12\.00/)).toBeTruthy();
    await waitFor(() => {
      expect(apiMocks.getSessionBill).toHaveBeenCalledTimes(2);
    });
  });

  it("blocks payment actions when the loaded bill already has a full-table payment pending", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      pendingPayment: fullTablePendingPayment(),
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        /Someone else is already paying the full table bill/i,
      ),
    ).toBeTruthy();
    expect(
      (screen.getByTestId("payment-continue-button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: /Pay cash to waiter/i,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("blocks an already-open modal when a full-table pending payment arrives over the socket", async () => {
    socketMocks.state.socket = socketMocks.socket;
    socketMocks.state.isConnected = true;
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      sessionId: "s1",
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByTestId("payment-continue-button");
    await waitFor(() => {
      expect(socketMocks.handlers["billPayment:pending"]?.length).toBe(1);
    });

    act(() => {
      socketMocks.handlers["billPayment:pending"][0](fullTablePendingPayment());
    });

    expect(
      await screen.findByText(
        /Someone else is already paying the full table bill/i,
      ),
    ).toBeTruthy();
    expect(
      (screen.getByTestId("payment-continue-button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows the consistent cash-request message for a full-table cash request, even on a fresh mount", async () => {
    // Regression: simulates the customer refreshing the page after asking
    // staff for cash — local `cashRequested`/`cashRequestId` state is gone,
    // so the banner must derive its wording from the fetched bill alone.
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      sessionId: "s1",
      pendingPayment: {
        id: "pending-cash-full",
        tableSessionId: "s1",
        source: "CASH_REQUEST",
        provider: "CASH",
        status: "PENDING",
        scope: "FULL_TABLE",
        orderIds: [],
        amount: 20,
        createdAt: "2026-06-21T08:00:00.000Z",
      },
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        /Staff has been asked to collect cash at your table/i,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Someone else is already paying/i)).toBeNull();
  });

  it("disables full-table payment while allowing non-overlapping owned orders", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...twoOrderBill(),
      pendingPayment: scopedPendingPayment(["order1"]),
    });
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "STRIPE",
      clientSecret: "cs_test",
      paymentId: "pay-owned",
      total: 12,
      tipAmount: 0,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={["order2"]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/Part of this table bill is already being paid/i),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "My orders" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "Full table" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("payment-continue-button") as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    fireEvent.click(screen.getByTestId("payment-continue-button"));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith("tok1", {
        provider: "STRIPE",
        tipPercent: 0,
        orderIds: ["order2"],
      }),
    );
  });

  it("blocks owned-order payment when the pending scoped payment overlaps", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...twoOrderBill(),
      pendingPayment: scopedPendingPayment(["order1"]),
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={["order1"]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/Part of this table bill is already being paid/i),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Full table" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("payment-continue-button") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(apiMocks.createCheckout).not.toHaveBeenCalled();
  });

  it("passes owned order ids when paying my orders online", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      orders: [
        ...billWithProviders(["STRIPE"]).orders,
        {
          id: "order2",
          source: "CUSTOMER",
          customerName: "Ivan",
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 12,
          items: [
            {
              orderItemId: "oi-salad",
              name: "Salad",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 12,
              unitPriceWithOptions: 12,
              selectedOptions: [],
            },
          ],
        },
      ],
      subtotal: 32,
      remaining: 32,
    });
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "STRIPE",
      clientSecret: "cs_test",
      paymentId: "pay-owned",
      total: 20,
      tipAmount: 0,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={["order1"]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "My orders" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("payment-continue-button"));

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith("tok1", {
        provider: "STRIPE",
        tipPercent: 0,
        orderIds: ["order1"],
      }),
    );
  });

  it("does not show My orders tabs for the first customer on a table", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["STRIPE"]),
    );

    render(
      <PaymentModal
        sessionToken="tok1"
        ownedOrderIds={["order1"]}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    await screen.findByTestId("payment-continue-button");
    expect(screen.queryByRole("button", { name: "My orders" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Full table" })).toBeNull();
  });

  it("uses customer-facing source labels instead of exposing staff roles", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      orders: [
        {
          id: "pos-order",
          source: "POS",
          customerName: "Table",
          customerPhone: null,
          staffName: "666",
          staffRole: "OWNER",
          totalPrice: 12,
          items: [
            {
              orderItemId: "oi-salad",
              name: "Salad",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 12,
              unitPriceWithOptions: 12,
              selectedOptions: [],
            },
          ],
        },
        {
          id: "customer-order",
          source: "CUSTOMER",
          customerName: "Johny",
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 8,
          items: [
            {
              orderItemId: "oi-soup",
              name: "Soup",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 8,
              unitPriceWithOptions: 8,
              selectedOptions: [],
            },
          ],
        },
      ],
      subtotal: 20,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Staff: 666/)).toBeTruthy();
    expect(screen.getByText(/You$/)).toBeTruthy();
    expect(screen.queryByText(/Owner/i)).toBeNull();
  });

  it("shows redeemed order items as free while preserving their original prices", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      orders: [
        {
          id: "paid-order",
          source: "CUSTOMER",
          customerName: "Johny",
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 15.34,
          items: [
            {
              orderItemId: "oi-paid",
              name: "Paid items",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 15.34,
              unitPriceWithOptions: 15.34,
              selectedOptions: [],
            },
          ],
        },
        {
          id: "redeemed-order",
          source: "CUSTOMER",
          customerName: "Johny",
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 0,
          items: [
            {
              orderItemId: "oi-redeemed",
              name: "Redeemed salad",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 0,
              unitPriceWithOptions: 0,
              originalUnitPriceWithOptions: 5.62,
              redeemedWithPoints: true,
              selectedOptions: [],
            },
          ],
        },
      ],
      subtotal: 15.34,
      remaining: 15.34,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const redeemedItemName = await screen.findByText(/Redeemed salad/);
    const redeemedLine = redeemedItemName.closest("div");
    expect(redeemedLine).not.toBeNull();

    const paidItemName = screen.getByText(/Paid items/);
    const paidLine = paidItemName.closest("div");
    expect(paidLine).not.toBeNull();
    expect(
      within(paidLine as HTMLElement).getByText(/^15\.34/).className,
    ).not.toContain("line-through");

    const originalPrice = within(redeemedLine as HTMLElement).getByText(
      /^5\.62/,
    );
    expect(originalPrice.className).toContain("line-through");
    expect(
      within(redeemedLine as HTMLElement).getByText(/^0\.00/),
    ).toBeTruthy();
  });

  it("shows sequential full and partial item reductions for a partial loyalty redemption", async () => {
    apiMocks.getSessionBill.mockResolvedValueOnce({
      ...billWithProviders(["STRIPE"]),
      orders: [
        {
          id: "partially-redeemed-order",
          source: "CUSTOMER",
          customerName: "Johny",
          customerPhone: null,
          staffName: null,
          staffRole: null,
          totalPrice: 8.5,
          items: [
            {
              orderItemId: "oi-first",
              name: "First covered item",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 0,
              unitPriceWithOptions: 0,
              originalUnitPriceWithOptions: 5,
              redeemedWithPoints: true,
              selectedOptions: [],
            },
            {
              orderItemId: "oi-boundary",
              name: "Boundary item",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 2,
              unitPriceWithOptions: 2,
              originalUnitPriceWithOptions: 7,
              redeemedWithPoints: true,
              selectedOptions: [],
            },
            {
              orderItemId: "oi-full-price",
              name: "Full price item",
              quantity: 1,
              paidQuantity: 0,
              unitPrice: 6.5,
              unitPriceWithOptions: 6.5,
              originalUnitPriceWithOptions: 6.5,
              redeemedWithPoints: false,
              selectedOptions: [],
            },
          ],
        },
      ],
      subtotal: 8.5,
      remaining: 8.5,
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    const coveredLine = (await screen.findByText(/First covered item/)).closest(
      "div",
    ) as HTMLElement;
    expect(within(coveredLine).getByText(/^5\.00/).className).toContain(
      "line-through",
    );
    expect(within(coveredLine).getByText(/^0\.00/)).toBeTruthy();

    const boundaryLine = screen
      .getByText(/Boundary item/)
      .closest("div") as HTMLElement;
    expect(within(boundaryLine).getByText(/^7\.00/).className).toContain(
      "line-through",
    );
    expect(within(boundaryLine).getByText(/^2\.00/)).toBeTruthy();

    const fullPriceLine = screen
      .getByText(/Full price item/)
      .closest("div") as HTMLElement;
    expect(within(fullPriceLine).getByText(/^6\.50/).className).not.toContain(
      "line-through",
    );
  });

  it("auto-submits returned ePay form fields", async () => {
    vi.useFakeTimers();
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(["EPAY"]));
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "EPAY",
      paymentId: "pay1",
      total: 20,
      tipAmount: 0,
      action: "https://demo.epay.bg/",
      method: "POST",
      fields: {
        PAGE: "credit_paydirect",
        ENCODED: "encoded",
        CHECKSUM: "checksum",
        URL_OK: "https://app.test/ok",
        URL_CANCEL: "https://app.test/cancel",
      },
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue to ePay.bg" }),
    );

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith("tok1", {
        provider: "EPAY",
        tipPercent: 0,
      }),
    );
    await screen.findByText("Opening ePay.bg secure checkout...");
    expect(screen.getByDisplayValue("encoded")).toBeTruthy();
    expect(screen.getByDisplayValue("checksum")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it("sends BORICA cardholder details and auto-submits returned BORICA form fields", async () => {
    vi.useFakeTimers();
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    apiMocks.getSessionBill.mockResolvedValueOnce(
      billWithProviders(["BORICA"]),
    );
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "BORICA",
      paymentId: "pay-borica",
      total: 20,
      tipAmount: 0,
      action: "https://3dsgate-dev.borica.bg/cgi-bin/cgi_link",
      method: "POST",
      fields: {
        TERMINAL: "V1800001",
        ORDER: "000001",
        P_SIGN: "abc123",
      },
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(await screen.findByDisplayValue("Maria Petrova")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "maria@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Billing address"), {
      target: { value: "1 Vitosha Blvd" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Pay by card (BORICA)" }),
    );

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith("tok1", {
        provider: "BORICA",
        tipPercent: 0,
        boricaCardholder: {
          cardholderName: "Maria Petrova",
          email: "maria@example.com",
          phone: "+359893999888",
          billingAddress: "1 Vitosha Blvd",
        },
      }),
    );
    await screen.findByText("Opening BORICA secure checkout...");
    expect(screen.getByDisplayValue("V1800001")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });

  it("auto-submits returned myPOS form fields", async () => {
    vi.useFakeTimers();
    const submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    apiMocks.getSessionBill.mockResolvedValueOnce(billWithProviders(["MYPOS"]));
    apiMocks.createCheckout.mockResolvedValueOnce({
      provider: "MYPOS",
      paymentId: "pay-mypos",
      total: 20,
      tipAmount: 0,
      action: "https://www.mypos.com/vmp/checkout-test",
      method: "POST",
      fields: {
        IPCmethod: "IPCPurchase",
        OrderID: "MP123",
        Signature: "signed",
      },
    });

    render(
      <PaymentModal
        sessionToken="tok1"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Pay by card (myPOS)" }),
    );

    await waitFor(() =>
      expect(apiMocks.createCheckout).toHaveBeenCalledWith("tok1", {
        provider: "MYPOS",
        tipPercent: 0,
      }),
    );
    await screen.findByText("Opening myPOS secure checkout...");
    expect(screen.getByDisplayValue("IPCPurchase")).toBeTruthy();
    expect(screen.getByDisplayValue("MP123")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
  });
});
