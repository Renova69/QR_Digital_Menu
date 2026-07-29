import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PosServiceRequests from "./PosServiceRequests";

const testState = vi.hoisted(() => ({
  assistanceRequests: [
    {
      id: "assistance-1",
      tableId: "Table 6",
      isResolved: false,
      type: "STANDARD" as const,
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
    },
  ],
  markAsResolved: vi.fn(),
  socketHandlers: {} as Record<string, (payload: unknown) => void>,
  getCashPaymentRequests: vi.fn(),
  confirmCashPaymentRequest: vi.fn(),
  cancelCashPaymentRequest: vi.fn(),
}));

vi.mock("../../context/AssistanceContext", () => ({
  useAssistance: () => ({
    requests: testState.assistanceRequests,
    markAsResolved: testState.markAsResolved,
  }),
}));

vi.mock("../../context/RestaurantContext", () => ({
  useRestaurantContext: () => ({
    activeRestaurant: { id: "rest-1", name: "Test Rest" },
  }),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: () => ({
    isConnected: true,
    socket: {
      on: (event: string, callback: (payload: unknown) => void) => {
        testState.socketHandlers[event] = callback;
      },
      off: vi.fn(),
    },
  }),
}));

vi.mock("../../context/PosThemeContext", () => ({
  usePosTheme: () => ({ theme: "light" }),
}));

vi.mock("../../lib/api", () => ({
  getCashPaymentRequests: testState.getCashPaymentRequests,
  confirmCashPaymentRequest: testState.confirmCashPaymentRequest,
  cancelCashPaymentRequest: testState.cancelCashPaymentRequest,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string | Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => {
      const values =
        typeof fallback === "object" ? fallback : (options ?? undefined);
      let result =
        typeof fallback === "string"
          ? fallback
          : typeof fallback?.defaultValue === "string"
            ? fallback.defaultValue
            : key;
      for (const [name, value] of Object.entries(values ?? {})) {
        result = result.replace(`{{${name}}}`, String(value));
      }
      return result;
    },
  }),
}));

const cashRequest = {
  id: "cash-1",
  restaurantId: "rest-1",
  tableSessionId: "session-7",
  tableId: "table-7",
  tableName: "Table 7",
  status: "PENDING" as const,
  scope: "FULL_TABLE" as const,
  orderIds: [],
  requestedAmount: 42,
  currency: "EUR",
  paymentId: null,
  resolvedById: null,
  resolvedAt: null,
  createdAt: "2026-07-29T10:01:00.000Z",
  updatedAt: "2026-07-29T10:01:00.000Z",
};

describe("PosServiceRequests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.socketHandlers = {};
    testState.getCashPaymentRequests.mockResolvedValue([cashRequest]);
    testState.confirmCashPaymentRequest.mockResolvedValue({
      ...cashRequest,
      status: "PAID",
    });
  });

  it("gives waiters one inbox for pending QR waiter calls and cash requests", async () => {
    const user = userEvent.setup();
    render(<PosServiceRequests />);

    const trigger = await screen.findByRole("button", {
      name: /assistance requests.*2/i,
    });
    await user.click(trigger);

    expect(screen.getByText("Table 6")).toBeDefined();
    expect(screen.getByText("Guest needs staff")).toBeDefined();
    expect(screen.getByText("Table 7")).toBeDefined();
    expect(screen.getByText(/42/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Mark as Resolved" }));
    await waitFor(() => {
      expect(testState.markAsResolved).toHaveBeenCalledWith("assistance-1");
    });

    await user.click(
      screen.getByRole("button", { name: "Confirm cash collected" }),
    );
    await waitFor(() => {
      expect(testState.confirmCashPaymentRequest).toHaveBeenCalledWith(
        "cash-1",
      );
    });
  });

  it("keeps a newly emitted cash request when an older fetch finishes later", async () => {
    let finishInitialFetch: (
      requests: (typeof cashRequest)[],
    ) => void = () => {};
    testState.getCashPaymentRequests.mockReturnValue(
      new Promise((resolve) => {
        finishInitialFetch = resolve;
      }),
    );
    render(<PosServiceRequests />);

    await waitFor(() => {
      expect(
        testState.socketHandlers["cashPaymentRequest:created"],
      ).toBeDefined();
    });

    act(() => {
      testState.socketHandlers["cashPaymentRequest:created"](cashRequest);
    });

    expect(
      screen.getByRole("button", {
        name: /assistance requests.*2/i,
      }),
    ).toBeDefined();

    await act(async () => {
      finishInitialFetch([]);
      await Promise.resolve();
    });

    expect(
      screen.getByRole("button", {
        name: /assistance requests.*2/i,
      }),
    ).toBeDefined();
  });
});
