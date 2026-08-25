import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const ctx = vi.hoisted(() => ({
  useAssistance: vi.fn(),
  useAuth: vi.fn(),
  useRestaurantContext: vi.fn(),
  useSocket: vi.fn(),
}));
const api = vi.hoisted(() => ({
  getCashPaymentRequests: vi.fn(),
  confirmCashPaymentRequest: vi.fn(),
  cancelCashPaymentRequest: vi.fn(),
}));

vi.mock("../../context/AssistanceContext", () => ({
  useAssistance: ctx.useAssistance,
}));
vi.mock("../../context/AuthContext", () => ({
  useAuth: ctx.useAuth,
}));
vi.mock("../../context/RestaurantContext", () => ({
  useRestaurantContext: ctx.useRestaurantContext,
}));
vi.mock("../../context/SocketContext", () => ({
  useSocket: ctx.useSocket,
}));
vi.mock("../../lib/api", () => ({
  getCashPaymentRequests: api.getCashPaymentRequests,
  confirmCashPaymentRequest: api.confirmCashPaymentRequest,
  cancelCashPaymentRequest: api.cancelCashPaymentRequest,
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

import AssistanceView from "./AssistanceView";

const NOW = 1_700_000_000_000;
const minutesAgo = (min: number) => new Date(NOW - min * 60_000).toISOString();

function makeAssistance(overrides: Record<string, unknown> = {}) {
  return {
    requests: [],
    markAsResolved: vi.fn().mockResolvedValue(undefined),
    markAsUnresolved: vi.fn().mockResolvedValue(undefined),
    loadMoreResolved: vi.fn().mockResolvedValue(undefined),
    hasMoreResolved: false,
    isLoadingMoreResolved: false,
    error: null,
    refreshRequests: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    tableId: "T-12",
    createdAt: minutesAgo(3),
    updatedAt: minutesAgo(3),
    isResolved: false,
    type: "STANDARD",
    ...overrides,
  };
}

function makeCash(overrides: Record<string, unknown> = {}) {
  return {
    id: "cash-1",
    tableName: "Table 7",
    tableId: "t-7",
    requestedAmount: 50,
    status: "PENDING",
    scope: "ORDER_ITEMS",
    createdAt: minutesAgo(4),
    updatedAt: minutesAgo(4),
    ...overrides,
  };
}

function renderView(options: {
  assistance?: Record<string, unknown>;
  cash?: ReturnType<typeof makeCash>[];
  user?: Record<string, unknown> | null;
  restaurant?: Record<string, unknown> | null;
  socket?: { on: () => void; off: () => void } | null;
  isConnected?: boolean;
} = {}) {
  ctx.useAssistance.mockReturnValue(makeAssistance(options.assistance));
  ctx.useAuth.mockReturnValue({ user: options.user ?? { role: "MANAGER" } });
  ctx.useRestaurantContext.mockReturnValue({
    activeRestaurant:
      options.restaurant === undefined ? { id: "rest-1" } : options.restaurant,
  });
  ctx.useSocket.mockReturnValue({
    socket: options.socket ?? null,
    isConnected: options.isConnected ?? false,
  });
  if (options.cash !== undefined) {
    api.getCashPaymentRequests.mockResolvedValue(options.cash);
  }
  return render(<AssistanceView />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getCashPaymentRequests.mockResolvedValue([]);
});

describe("AssistanceView rendering & filters", () => {
  it("renders the header and the active empty state with no data", () => {
    renderView();

    expect(screen.getByText("Assistance Requests")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search by table...")).toBeTruthy();
    expect(screen.getByText("assistance.noActive")).toBeTruthy();
    expect(screen.getByText("assistance.allGuestsAssisted")).toBeTruthy();
  });

  it("renders an active request card with badges, title, table and elapsed time", () => {
    renderView({ assistance: { requests: [makeRequest()] } });
    const card = screen.getByText("T-12").closest("article")!;

    expect(within(card).getByText("Active")).toBeTruthy();
    expect(screen.getByText("assistance.guestNeedsStaff")).toBeTruthy();
    expect(screen.getByText("3 min")).toBeTruthy();
    expect(within(card).getByText("assistance.waiting")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /assistance\.markResolved/ }),
    ).toBeTruthy();
  });

  it("shows the Urgent badge for unresolved URGENT requests", () => {
    renderView({
      assistance: { requests: [makeRequest({ type: "URGENT" })] },
    });

    expect(screen.getByText("Urgent")).toBeTruthy();
  });

  it("shows the Cash badge for CASH_PAYMENT requests", () => {
    renderView({
      assistance: { requests: [makeRequest({ type: "CASH_PAYMENT" })] },
    });

    expect(screen.getByText("Cash")).toBeTruthy();
  });

  it("escalates the urgency stripe after 10 minutes and 5 minutes", () => {
    renderView({
      assistance: {
        requests: [
          makeRequest({ id: "req-old", tableId: "T-1", createdAt: minutesAgo(12) }),
          makeRequest({ id: "req-mid", tableId: "T-2", createdAt: minutesAgo(7) }),
          makeRequest({ id: "req-fresh", tableId: "T-3", createdAt: minutesAgo(2) }),
        ],
      },
    });

    const cardOf = (tableId: string) =>
      screen.getByText(tableId).closest("article")!;
    expect(cardOf("T-1").className).toContain("before:bg-red-500");
    expect(cardOf("T-2").className).toContain("before:bg-orange-500");
    expect(cardOf("T-3").className).toContain("before:bg-primary");
  });

  it("renders a resolved request with the Resolved badge and Reopen button", () => {
    renderView({
      assistance: {
        requests: [makeRequest({ isResolved: true })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Resolved/ }));

    expect(screen.getByText("assistance.requestCompleted")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /assistance\.reopen/ }),
    ).toBeTruthy();
  });

  it("switches filters and hides active requests on the resolved tab", () => {
    renderView({
      assistance: { requests: [makeRequest({ id: "active-1" })] },
    });

    expect(screen.getByText("assistance.guestNeedsStaff")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Resolved/ }));
    expect(screen.queryByText("assistance.guestNeedsStaff")).toBeNull();
    expect(screen.getByText("assistance.noRequestsHere")).toBeTruthy();
  });

  it("filters by table id and shows the no-match state", () => {
    renderView({ assistance: { requests: [makeRequest()] } });
    const input = screen.getByPlaceholderText("Search by table...");

    fireEvent.change(input, { target: { value: "t-12" } });
    expect(screen.getByText("assistance.guestNeedsStaff")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.queryByText("assistance.guestNeedsStaff")).toBeNull();
    expect(screen.getByText("assistance.noMatchingRequests")).toBeTruthy();
  });

  it("counts pending cash requests into the Active filter", async () => {
    renderView({
      assistance: { requests: [makeRequest()] },
      cash: [makeCash()],
    });

    await waitFor(() =>
      expect(api.getCashPaymentRequests).toHaveBeenCalledTimes(1),
    );
    const activeTab = screen.getByRole("button", { name: /^Active/ });
    expect(within(activeTab).getByText("2")).toBeTruthy();
  });
});

describe("AssistanceView request actions", () => {
  it("marks a request as resolved", async () => {
    const markAsResolved = vi.fn().mockResolvedValue(undefined);
    renderView({
      assistance: { requests: [makeRequest()], markAsResolved },
    });

    await userEvent.click(
      screen.getByRole("button", { name: /assistance\.markResolved/ }),
    );

    expect(markAsResolved).toHaveBeenCalledWith("req-1");
  });

  it("reopens a resolved request", async () => {
    const markAsUnresolved = vi.fn().mockResolvedValue(undefined);
    renderView({
      assistance: {
        requests: [makeRequest({ isResolved: true })],
        markAsUnresolved,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Resolved/ }));

    await userEvent.click(
      screen.getByRole("button", { name: /assistance\.reopen/ }),
    );

    expect(markAsUnresolved).toHaveBeenCalledWith("req-1");
  });

  it("shows an alert when resolving fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    renderView({
      assistance: {
        requests: [makeRequest()],
        markAsResolved: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    await userEvent.click(
      screen.getByRole("button", { name: /assistance\.markResolved/ }),
    );

    expect(
      await screen.findByText(
        "The request could not be updated. Please try again.",
      ),
    ).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("AssistanceView cash payment requests", () => {
  it("renders the cash section for a pending cash request", async () => {
    renderView({ cash: [makeCash()] });

    expect(await screen.findByText("Cash collection")).toBeTruthy();
    expect(screen.getByText("Confirm only after staff has physically collected the cash.")).toBeTruthy();
    expect(screen.getByText("Waiting")).toBeTruthy();
    expect(screen.getByText("My orders")).toBeTruthy();
    expect(screen.getByText("Table 7")).toBeTruthy();
    expect(screen.getByText("50.00 €")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Confirm cash collected/ }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancel/ })).toBeTruthy();
  });

  it("confirms a pending cash request and refetches the list", async () => {
    const confirm = vi.fn().mockResolvedValue(undefined);
    api.confirmCashPaymentRequest.mockImplementation(confirm);
    renderView({ cash: [makeCash()] });

    await userEvent.click(
      await screen.findByRole("button", { name: /Confirm cash collected/ }),
    );

    expect(confirm).toHaveBeenCalledWith("cash-1");
    await waitFor(() =>
      expect(api.getCashPaymentRequests).toHaveBeenCalledTimes(2),
    );
  });

  it("cancels a pending cash request", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    api.cancelCashPaymentRequest.mockImplementation(cancel);
    renderView({ cash: [makeCash()] });

    await userEvent.click(
      await screen.findByRole("button", { name: /Cancel/ }),
    );

    expect(cancel).toHaveBeenCalledWith("cash-1");
  });

  it("shows the recorded label for a PAID cash request", async () => {
    renderView({ cash: [makeCash({ status: "PAID" })] });
    fireEvent.click(screen.getByRole("button", { name: /^Resolved/ }));

    expect(
      await screen.findByText("Cash payment recorded"),
    ).toBeTruthy();
  });

  it("shows the cancelled label for a CANCELLED cash request", async () => {
    renderView({ cash: [makeCash({ status: "CANCELLED" })] });
    fireEvent.click(screen.getByRole("button", { name: /^Resolved/ }));

    expect(await screen.findByText("Cash request cancelled")).toBeTruthy();
  });

  it("disables cash actions for roles that cannot manage cash", async () => {
    renderView({ cash: [makeCash()], user: { role: "KITCHEN" } });

    expect(
      (await screen.findByRole("button", {
        name: /Confirm cash collected/,
      })) as HTMLButtonElement,
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", {
        name: /Confirm cash collected/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /Cancel/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("surfaces an api error when confirming cash fails", async () => {
    api.confirmCashPaymentRequest.mockRejectedValue({
      response: { status: 409 },
    });
    renderView({ cash: [makeCash()] });

    await userEvent.click(
      await screen.findByRole("button", { name: /Confirm cash collected/ }),
    );

    expect(await screen.findByText("apiErrors.conflict")).toBeTruthy();
  });

  it("shows the fetch-error banner and retries both sources", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    api.getCashPaymentRequests.mockRejectedValue(new Error("net down"));
    const refreshRequests = vi.fn().mockResolvedValue(undefined);
    renderView({ assistance: { refreshRequests } });

    expect(
      await screen.findByText(
        "Some assistance requests could not be loaded.",
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refreshRequests).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(api.getCashPaymentRequests).toHaveBeenCalledTimes(2),
    );
    consoleError.mockRestore();
  });

  it("does not fetch cash requests without an active restaurant", async () => {
    renderView({ restaurant: null });

    expect(screen.getByText("assistance.noActive")).toBeTruthy();
    expect(api.getCashPaymentRequests).not.toHaveBeenCalled();
  });
});

describe("AssistanceView socket & history", () => {
  it("refetches cash requests when the socket emits a created event", async () => {
    const on = vi.fn();
    const off = vi.fn();
    renderView({ socket: { on, off } as any, isConnected: true });

    await waitFor(() =>
      expect(api.getCashPaymentRequests).toHaveBeenCalledTimes(1),
    );
    expect(on).toHaveBeenCalledWith(
      "cashPaymentRequest:created",
      expect.any(Function),
    );
    expect(on).toHaveBeenCalledWith(
      "cashPaymentRequest:updated",
      expect.any(Function),
    );

    const createdHandler = on.mock.calls.find(
      (call: unknown[]) => call[0] === "cashPaymentRequest:created",
    )![1];
    await act(async () => {
      createdHandler();
    });

    await waitFor(() =>
      expect(api.getCashPaymentRequests).toHaveBeenCalledTimes(2),
    );
  });

  it("loads more resolved requests from the history pager", async () => {
    const loadMoreResolved = vi.fn().mockResolvedValue(undefined);
    renderView({
      assistance: {
        requests: [makeRequest({ isResolved: true })],
        hasMoreResolved: true,
        loadMoreResolved,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Resolved/ }));

    await userEvent.click(
      screen.getByRole("button", { name: /Load older resolved requests/ }),
    );

    expect(loadMoreResolved).toHaveBeenCalledTimes(1);
  });
});
