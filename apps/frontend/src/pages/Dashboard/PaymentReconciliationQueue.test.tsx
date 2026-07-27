import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReconciliationQueue } from "./PaymentReconciliationQueue";

const api = vi.hoisted(() => ({
  getPaymentReconciliationIssues: vi.fn(),
  resolvePaymentReconciliationIssue: vi.fn(),
  reopenPaymentReconciliationIssue: vi.fn(),
}));

const socketState = vi.hoisted(() => ({
  handlers: {} as Record<string, () => void>,
  socket: {
    on: vi.fn((event: string, handler: () => void) => {
      socketState.handlers[event] = handler;
    }),
    off: vi.fn((event: string) => {
      delete socketState.handlers[event];
    }),
  },
}));

const translations: Record<string, string> = {
  "payments.reconciliation.title": "Payments need review",
  "payments.reconciliation.description":
    "Captured payments that need an owner decision.",
  "payments.reconciliation.count": "1 open issue",
  "payments.reconciliation.table": "Table",
  "payments.reconciliation.session": "Session",
  "payments.reconciliation.payment": "Payment",
  "payments.reconciliation.created": "Captured",
  "payments.reconciliation.resolve": "Resolve",
  "payments.reconciliation.dismiss": "Dismiss",
  "payments.reconciliation.reopenSession": "Reopen for re-collection",
  "payments.reconciliation.note": "Resolution note (optional)",
  "payments.reconciliation.notePlaceholder": "What was checked or corrected?",
  "payments.reconciliation.confirmResolve": "Confirm resolve",
  "payments.reconciliation.confirmDismiss": "Confirm dismiss",
  "payments.reconciliation.confirmReopen": "Confirm reopen",
  "payments.reconciliation.cancel": "Cancel",
  "payments.reconciliation.reason.SESSION_NOT_OPEN":
    "The table session was no longer open when the provider confirmed payment.",
  "payments.reconciliation.reason.REFUND_LEFT_BALANCE":
    "A refund left an outstanding balance on a session that was already closed. Reopen it to collect the remainder.",
  "payments.reconciliation.sessionStatus.CLOSED_NO_PAYMENT":
    "Closed without payment",
  "payments.reconciliation.sessionStatus.CLOSED_PAID": "Closed and paid",
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; defaultValue?: string }) => {
      if (key === "payments.reconciliation.count") {
        return `${options?.count ?? 0} open issue`;
      }
      return translations[key] ?? options?.defaultValue ?? key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: () => ({ socket: socketState.socket, isConnected: true }),
}));

vi.mock("../../lib/api", () => ({
  getPaymentReconciliationIssues: api.getPaymentReconciliationIssues,
  resolvePaymentReconciliationIssue: api.resolvePaymentReconciliationIssue,
  reopenPaymentReconciliationIssue: api.reopenPaymentReconciliationIssue,
}));

const issue = {
  id: "issue-1",
  paymentId: "payment-1",
  restaurantId: "restaurant-1",
  tableSessionId: "session-1",
  provider: "BORICA" as const,
  reason: "SESSION_NOT_OPEN" as const,
  status: "OPEN" as const,
  amount: 42.5,
  currency: "EUR",
  providerReference: "provider-ref-1",
  providerStatus: "SESSION_NOT_OPEN_NEEDS_RECONCILIATION",
  resolutionNote: null,
  resolvedAt: null,
  createdAt: "2026-07-18T09:15:00.000Z",
  updatedAt: "2026-07-18T09:15:00.000Z",
  payment: {
    id: "payment-1",
    status: "SUCCEEDED",
    provider: "BORICA",
    amount: 42.5,
    currency: "EUR",
    tipAmount: 0,
    providerReference: "provider-ref-1",
    stripePaymentIntentId: null,
    createdAt: "2026-07-18T09:15:00.000Z",
  },
  tableSession: {
    id: "session-1",
    status: "CLOSED_NO_PAYMENT" as const,
    table: { name: "Garden 4" },
  },
};

const refundBalanceIssue = {
  ...issue,
  id: "issue-2",
  paymentId: "payment-2",
  reason: "REFUND_LEFT_BALANCE" as const,
  tableSession: {
    id: "session-1",
    status: "CLOSED_PAID" as const,
    table: { name: "Garden 4" },
  },
};

function renderQueue(
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  return render(
    <QueryClientProvider client={client}>
      <PaymentReconciliationQueue restaurantId="restaurant-1" />
    </QueryClientProvider>,
  );
}

describe("PaymentReconciliationQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const event of Object.keys(socketState.handlers)) {
      delete socketState.handlers[event];
    }
  });

  it("loads persisted open issues and shows the captured payment context", async () => {
    api.getPaymentReconciliationIssues.mockResolvedValue([issue]);

    renderQueue();

    expect(await screen.findByText("Payments need review")).toBeTruthy();
    expect(api.getPaymentReconciliationIssues).toHaveBeenCalledWith(
      "restaurant-1",
      "OPEN",
    );
    expect(screen.getByText("BORICA")).toBeTruthy();
    expect(screen.getByText("Garden 4")).toBeTruthy();
    expect(screen.getByText("Closed without payment")).toBeTruthy();
    expect(
      screen.getByText(
        "The table session was no longer open when the provider confirmed payment.",
      ),
    ).toBeTruthy();
  });

  it("treats the socket event as invalidation and reloads the API queue", async () => {
    api.getPaymentReconciliationIssues
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([issue]);

    renderQueue();

    await waitFor(() =>
      expect(api.getPaymentReconciliationIssues).toHaveBeenCalledTimes(1),
    );
    expect(screen.queryByText("Payments need review")).toBeNull();

    await act(async () => {
      socketState.handlers["payment:reconciliationRequired"]();
    });

    expect(await screen.findByText("Payments need review")).toBeTruthy();
    expect(api.getPaymentReconciliationIssues).toHaveBeenCalledTimes(2);
  });

  it("resolves an issue with an optional note and removes it from the open queue", async () => {
    api.getPaymentReconciliationIssues.mockResolvedValue([issue]);
    api.resolvePaymentReconciliationIssue.mockResolvedValue({
      ...issue,
      status: "RESOLVED",
    });

    renderQueue();

    await screen.findByText("Payments need review");
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "Resolution note (optional)" }),
      { target: { value: "Matched against the BORICA settlement." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm resolve" }));

    await waitFor(() =>
      expect(api.resolvePaymentReconciliationIssue).toHaveBeenCalledWith(
        "issue-1",
        {
          status: "RESOLVED",
          note: "Matched against the BORICA settlement.",
        },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Payments need review")).toBeNull(),
    );
  });

  it("only shows Reopen for re-collection on refund-left-balance issues", async () => {
    api.getPaymentReconciliationIssues.mockResolvedValue([issue]);

    renderQueue();

    await screen.findByText("Payments need review");
    expect(
      screen.queryByRole("button", { name: "Reopen for re-collection" }),
    ).toBeNull();
  });

  it("reopens the session for re-collection and removes the issue from the queue", async () => {
    api.getPaymentReconciliationIssues.mockResolvedValue([refundBalanceIssue]);
    api.reopenPaymentReconciliationIssue.mockResolvedValue({
      ...refundBalanceIssue,
      status: "RESOLVED",
    });

    renderQueue();

    await screen.findByText("Payments need review");
    fireEvent.click(
      screen.getByRole("button", { name: "Reopen for re-collection" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Resolution note (optional)" }),
      { target: { value: "Collected cash from guest." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm reopen" }));

    await waitFor(() =>
      expect(api.reopenPaymentReconciliationIssue).toHaveBeenCalledWith(
        "issue-2",
        { note: "Collected cash from guest." },
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Payments need review")).toBeNull(),
    );
  });
});
