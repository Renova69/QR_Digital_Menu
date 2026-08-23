import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getPaymentHistory: vi.fn(),
  getPaymentOverview: vi.fn(),
  getPaymentPayouts: vi.fn(),
  getPaymentSettings: vi.fn(),
  getPaymentDetail: vi.fn(),
  getPaymentsExport: vi.fn(),
  refundPayment: vi.fn(),
}));
const router = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: new URLSearchParams(),
  setSearchParams: vi.fn(),
}));
const socketHolder = vi.hoisted(() => ({ socket: null as any }));
const exportHelpers = vi.hoisted(() => ({
  exportPaymentsCsv: vi.fn(),
  downloadPaymentsExport: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => router.navigate,
  useSearchParams: () => [router.searchParams, router.setSearchParams],
}));
vi.mock("../../context/SocketContext", () => ({
  useSocket: () => ({ socket: socketHolder.socket }),
}));
vi.mock("../../context/RestaurantContext", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    default: React.createContext({ activeRestaurant: undefined }),
  };
});
vi.mock("../../lib/api", () => ({
  getPaymentHistory: api.getPaymentHistory,
  getPaymentOverview: api.getPaymentOverview,
  getPaymentPayouts: api.getPaymentPayouts,
  getPaymentSettings: api.getPaymentSettings,
  getPaymentDetail: api.getPaymentDetail,
  getPaymentsExport: api.getPaymentsExport,
  refundPayment: api.refundPayment,
}));
vi.mock("../../lib/paymentsExport", () => ({
  downloadPaymentsExport: exportHelpers.downloadPaymentsExport,
}));
vi.mock("./paymentsShared", () => ({
  formatMoney: (value: number) => `${value.toFixed(2)} €`,
  formatDateTime: (value: string) => value.slice(11, 16),
  shortId: (value: string) => (value ? value.slice(0, 8) : ""),
  methodStyles: {
    STRIPE: { tone: "bg-primary", Icon: () => null },
    EPAY: { tone: "bg-blue-500", Icon: () => null },
    BORICA: { tone: "bg-green-600", Icon: () => null },
    MYPOS: { tone: "bg-slate-600", Icon: () => null },
    CASH: { tone: "bg-amber-500", Icon: () => null },
  },
  statusStyles: {
    SUCCEEDED: "bg-emerald-100",
    PENDING: "bg-amber-100",
    FAILED: "bg-red-100",
    REFUNDED: "bg-slate-100",
  },
  exportPaymentsCsv: exportHelpers.exportPaymentsCsv,
}));
vi.mock("./PaymentDrawer", () => ({
  PaymentDrawer: (props: any) => (
    <div
      data-testid="payment-drawer"
      data-payment-id={props.payment?.id ?? ""}
      data-loading={String(!!props.loading)}
      data-refunding={String(!!props.refunding)}
    >
      <button
        type="button"
        data-testid="drawer-refund"
        onClick={() => props.onRefund(props.payment)}
      />
      <button
        type="button"
        data-testid="drawer-close"
        onClick={() => props.onClose()}
      />
    </div>
  ),
}));
vi.mock("./PaymentReconciliationQueue", () => ({
  PaymentReconciliationQueue: (props: any) => (
    <div data-testid="reconciliation-queue" data-restaurant={props.restaurantId} />
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import RestaurantContext from "../../context/RestaurantContext";
import type { RestaurantContextType } from "../../context/RestaurantContext";
import type { Restaurant } from "../../services/restaurantService";
import PaymentsView from "./PaymentsView";

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    status: "SUCCEEDED",
    amount: 24.5,
    tipAmount: 2,
    platformFeeAmount: 0.74,
    provider: "STRIPE",
    currency: "EUR",
    createdAt: "2026-08-22T10:00:00.000Z",
    customerName: "Ivan Petrov",
    tableNumber: "T-3",
    stripePaymentIntentId: "pi_12345678",
    ...overrides,
  };
}

function renderView(options: {
  restaurant?: Restaurant;
  history?: { data: unknown[]; meta?: Record<string, unknown> };
  overview?: Record<string, unknown>;
  payouts?: Record<string, unknown>;
  settings?: Record<string, unknown>;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (options.history) {
    api.getPaymentHistory.mockResolvedValue(options.history);
  }
  if (options.overview) {
    api.getPaymentOverview.mockResolvedValue(options.overview);
  }
  if (options.payouts) {
    api.getPaymentPayouts.mockResolvedValue(options.payouts);
  }
  if (options.settings) {
    api.getPaymentSettings.mockResolvedValue(options.settings);
  }
  const utils = render(
    <QueryClientProvider client={client}>
      <RestaurantContext.Provider
        value={
          {
            activeRestaurant: options.restaurant ?? {
              id: "rest-1",
              name: "Cafe Nova",
              country: "BG",
              ownerId: "owner-1",
            },
          } as RestaurantContextType
        }
      >
        <PaymentsView />
      </RestaurantContext.Provider>
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  router.searchParams = new URLSearchParams();
  router.setSearchParams.mockReset();
  socketHolder.socket = null;
  api.getPaymentHistory.mockResolvedValue({
    data: [],
    meta: { total: 0, page: 1, limit: 20 },
  });
  api.getPaymentOverview.mockResolvedValue({
    metrics: {
      totalCollected: 0,
      tipsCollected: 0,
      platformFees: 0,
      averageTransaction: 0,
      refundsIssued: 0,
      successfulTransactions: 0,
      refundsCount: 0,
      netCollected: 0,
    },
    methodTotals: [],
    account: {},
  });
  api.getPaymentPayouts.mockResolvedValue({
    methodTotals: [],
    estimatedBalance: 0,
  });
  api.getPaymentSettings.mockResolvedValue({});
  api.getPaymentDetail.mockResolvedValue(null);
  api.getPaymentsExport.mockResolvedValue([]);
  api.refundPayment.mockResolvedValue({});
});

describe("PaymentsView header & provider cards", () => {
  it("renders the header and the reconciliation queue", async () => {
    renderView();

    expect(screen.getByText("payments.title")).toBeTruthy();
    expect(screen.getByText("payments.description")).toBeTruthy();
    expect(
      await screen.findByTestId("reconciliation-queue"),
    ).toBeTruthy();
  });

  it("opens Stripe Connect in a new tab when onboarded", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    renderView({
      overview: {
        metrics: {},
        account: { stripeOnboarded: true, stripeAccountId: "acct_123" },
      },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /payments\.viewOnStripe/ }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      "https://dashboard.stripe.com/connect/accounts/acct_123",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("disables View on Stripe without an account id", async () => {
    renderView();

    const button = (await screen.findByRole("button", {
      name: /payments\.viewOnStripe/,
    })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("shows provider readiness states and routes Configure to settings", async () => {
    renderView({
      overview: {
        metrics: {},
        account: {
          stripeOnboarded: true,
          epayEnabled: true,
          epayMerchantEmail: "pay@cafe.bg",
        },
      },
    });

    expect(await screen.findByText("payments.connected")).toBeTruthy();
    expect(screen.getByText("payments.needsSetup")).toBeTruthy();
    expect(screen.getAllByText("Disabled").length).toBe(2);

    const configureButtons = screen.getAllByRole("button", {
      name: /Configure/,
    });
    expect(configureButtons.length).toBe(3);
    await userEvent.click(configureButtons[0]);
    expect(router.navigate).toHaveBeenCalledWith(
      "?tab=settings&settingsTab=payments",
    );
  });

  it("shows the hosted-provider alert when nothing is ready", async () => {
    renderView({
      overview: { metrics: {}, account: { paymentsEnabled: true } },
    });

    expect(
      await screen.findByText("payments.stripeNotConnectedTitle"),
    ).toBeTruthy();
  });

  it("hides the hosted-provider alert when a provider is ready", async () => {
    renderView({
      overview: {
        metrics: {},
        account: {
          paymentsEnabled: true,
          stripeOnboarded: true,
          stripeAccountId: "acct_1",
        },
      },
    });

    await screen.findByText("payments.connected");
    expect(screen.queryByText("payments.stripeNotConnectedTitle")).toBeNull();
  });
});

describe("PaymentsView metrics", () => {
  it("renders metric cards from the overview", async () => {
    renderView({
      overview: {
        metrics: {
          totalCollected: 100,
          tipsCollected: 10,
          platformFees: 3,
          averageTransaction: 12.5,
          refundsIssued: 20,
          successfulTransactions: 8,
          refundsCount: 2,
          netCollected: 97,
        },
        account: { platformFeePercent: 2.5 },
      },
    });

    expect(await screen.findByText("100.00 €")).toBeTruthy();
    expect(screen.getByText("payments.totalCollected")).toBeTruthy();
    expect(screen.getByText("payments.avgTransaction")).toBeTruthy();
    expect(screen.getByText("12.50 €")).toBeTruthy();
    expect(screen.getByText("payments.tipsCollected")).toBeTruthy();
    expect(screen.getByText("10.00 €")).toBeTruthy();
    expect(screen.getByText("payments.platformFees")).toBeTruthy();
    expect(screen.getByText("3.00 €")).toBeTruthy();
    expect(screen.getByText("payments.refundsIssued")).toBeTruthy();
    expect(screen.getByText("20.00 €")).toBeTruthy();
  });
});

describe("PaymentsView transactions table", () => {
  it("renders payment rows with id, customer, method, amounts and status", async () => {
    renderView({
      history: {
        data: [makePayment()],
        meta: { total: 1, page: 1, limit: 20 },
      },
    });

    expect(await screen.findByText("pi_12345")).toBeTruthy();
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Ivan Petrov")).toBeTruthy();
    expect(table.getByText("payments.stripeMethod")).toBeTruthy();
    expect(table.getByText("24.50 €")).toBeTruthy();
    expect(table.getByText("2.00 €")).toBeTruthy();
    expect(table.getByText("-0.74 €")).toBeTruthy();
    expect(table.getByText("23.76 €")).toBeTruthy();
    expect(table.getByText("payments.succeeded")).toBeTruthy();
  });

  it("opens the drawer with the selected payment on row click", async () => {
    renderView({
      history: {
        data: [makePayment()],
        meta: { total: 1, page: 1, limit: 20 },
      },
    });

    fireEvent.click((await screen.findByText("pi_12345")).closest("tr")!);

    await waitFor(() =>
      expect(
        screen.getByTestId("payment-drawer").getAttribute("data-payment-id"),
      ).toBe("pay-1"),
    );
    expect(api.getPaymentDetail).toHaveBeenCalledWith("pay-1");
  });

  it("shows the empty state label per tab", async () => {
    renderView();

    expect(await screen.findByText("payments.noPayments")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "payments.refunds" }));
    expect(await screen.findByText("payments.noRefunds")).toBeTruthy();
  });

  it("renders skeleton rows while loading", () => {
    api.getPaymentHistory.mockReturnValue(new Promise(() => {}));
    const { container } = renderView();

    expect(container.querySelectorAll(".animate-pulse").length).toBe(7);
  });

  it("shows the error state when the history query fails", async () => {
    api.getPaymentHistory.mockRejectedValue(new Error("down"));
    renderView();

    expect(await screen.findByText("payments.failedLoad")).toBeTruthy();
  });

  it("passes the status and method filters to the query", async () => {
    renderView();

    const selects = await screen.findAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "SUCCEEDED" } });
    fireEvent.change(selects[1], { target: { value: "EPAY" } });

    await waitFor(() => {
      const lastCall = api.getPaymentHistory.mock.calls.at(-1)!;
      expect(lastCall[1]).toMatchObject({
        status: "SUCCEEDED",
        provider: "EPAY",
      });
    });
  });

  it("resets to page 1 and passes the deferred search term", async () => {
    renderView();
    const input = screen.getByPlaceholderText("payments.searchPlaceholder");

    fireEvent.change(input, { target: { value: "ivan" } });

    await waitFor(() => {
      const lastCall = api.getPaymentHistory.mock.calls.at(-1)!;
      expect(lastCall[1]).toMatchObject({ search: "ivan", page: 1 });
    });
  });

  it("forces the REFUNDED status and hides the status select on refunds tab", async () => {
    renderView();
    fireEvent.click(screen.getByRole("tab", { name: "payments.refunds" }));

    await waitFor(() => {
      const lastCall = api.getPaymentHistory.mock.calls.at(-1)!;
      expect(lastCall[1].status).toBe("REFUNDED");
    });
    expect(screen.getAllByRole("combobox").length).toBe(1);
  });

  it("paginates with disabled prev at page 1 and a working next", async () => {
    renderView({
      history: { data: [makePayment()], meta: { total: 45, page: 1, limit: 20 } },
    });

    const prev = (await screen.findByRole("button", {
      name: "payments.previous",
    })) as HTMLButtonElement;
    expect(prev.disabled).toBe(true);
    expect(screen.getByText("payments.pageOf")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "payments.next" }));

    await waitFor(() => {
      const lastCall = api.getPaymentHistory.mock.calls.at(-1)!;
      expect(lastCall[1].page).toBe(2);
    });
  });
});

describe("PaymentsView exports", () => {
  it("exports CSV through the export helpers", async () => {
    exportHelpers.exportPaymentsCsv.mockResolvedValue(undefined);
    renderView({
      history: { data: [makePayment()], meta: { total: 1, page: 1, limit: 20 } },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /payments\.exportCsv/ }),
    );

    await waitFor(() =>
      expect(api.getPaymentsExport).toHaveBeenCalledWith("rest-1", {
        status: undefined,
        provider: undefined,
        search: undefined,
      }),
    );
    await waitFor(() =>
      expect(exportHelpers.exportPaymentsCsv).toHaveBeenCalled(),
    );
  });

  it("disables both export buttons when there are no payments", async () => {
    renderView();

    await screen.findByText("payments.noPayments");
    expect(
      (screen.getByRole("button", {
        name: /payments\.exportCsv/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", {
        name: /Export XLSX/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("exports XLSX with the restaurant name", async () => {
    renderView({
      restaurant: {
        id: "rest-1",
        name: "Cafe Nova",
        country: "BG",
        ownerId: "owner-1",
      },
      history: { data: [makePayment()], meta: { total: 1, page: 1, limit: 20 } },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Export XLSX/ }),
    );

    await waitFor(() =>
      expect(exportHelpers.downloadPaymentsExport).toHaveBeenCalledWith(
        [],
        { restaurantName: "Cafe Nova" },
        expect.any(Function),
      ),
    );
  });

  it("shows the export error alert when the export fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    api.getPaymentsExport.mockRejectedValue(new Error("boom"));
    renderView({
      history: { data: [makePayment()], meta: { total: 1, page: 1, limit: 20 } },
    });

    await userEvent.click(
      await screen.findByRole("button", { name: /Export XLSX/ }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("The export could not be created. Please try again.");
    consoleError.mockRestore();
  });
});

describe("PaymentsView payouts & settings tabs", () => {
  it("loads and renders the payouts panel with method totals", async () => {
    renderView({
      payouts: {
        methodTotals: [
          { method: "STRIPE", amount: 500, fees: 12, count: 4 },
          { method: "CASH", amount: 120, fees: 0, count: 2 },
        ],
        estimatedBalance: 608,
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "payments.payouts" }));

    expect(await screen.findByText("608.00 €")).toBeTruthy();
    expect(screen.getByText("payments.payoutBalance")).toBeTruthy();
    expect(screen.getByText("500.00 €")).toBeTruthy();
    expect(screen.getAllByText("payments.stripeMethod").length).toBeGreaterThanOrEqual(1);
    expect(api.getPaymentPayouts).toHaveBeenCalledWith("rest-1");
  });

  it("loads and renders the settings panel", async () => {
    renderView({
      settings: {
        paymentsEnabled: true,
        stripeOnboarded: false,
        boricaEnabled: false,
        myposEnabled: false,
      },
    });

    fireEvent.click(screen.getByRole("tab", { name: "payments.settings" }));

    expect(await screen.findByText("payments.paymentCollection")).toBeTruthy();
    expect(screen.getByText("payments.stripeConnect")).toBeTruthy();
    expect(screen.getAllByText("ePay.bg").length).toBe(2);
    expect(screen.getAllByText("BORICA").length).toBe(2);
    expect(screen.getAllByText("myPOS").length).toBe(2);
    expect(screen.getAllByText("Not configured").length).toBe(3);
    expect(api.getPaymentSettings).toHaveBeenCalledWith("rest-1");
  });
});

describe("PaymentsView drawer, refunds & socket", () => {
  it("refunds the selected payment through the drawer", async () => {
    renderView({
      history: { data: [makePayment()], meta: { total: 1, page: 1, limit: 20 } },
    });

    fireEvent.click((await screen.findByText("pi_12345")).closest("tr")!);
    await waitFor(() =>
      expect(
        screen.getByTestId("payment-drawer").getAttribute("data-payment-id"),
      ).toBe("pay-1"),
    );

    fireEvent.click(screen.getByTestId("drawer-refund"));

    await waitFor(() =>
      expect(api.refundPayment).toHaveBeenCalledWith("pay-1", {}),
    );
  });

  it("loads a payment detail from the paymentId search param", async () => {
    router.searchParams = new URLSearchParams({ paymentId: "pay-9" });
    renderView();

    await waitFor(() =>
      expect(api.getPaymentDetail).toHaveBeenCalledWith("pay-9"),
    );
  });

  it("removes the paymentId param when the drawer closes", async () => {
    router.searchParams = new URLSearchParams({ paymentId: "pay-9" });
    renderView();

    fireEvent.click(await screen.findByTestId("drawer-close"));

    await waitFor(() => expect(router.setSearchParams).toHaveBeenCalled());
    const nextParams = router.setSearchParams.mock.calls.at(-1)![0];
    expect(nextParams.has("paymentId")).toBe(false);
  });

  it("invalidates queries when the socket emits payment:refunded", async () => {
    const on = vi.fn();
    const off = vi.fn();
    socketHolder.socket = { on, off };
    const { client } = renderView();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await waitFor(() =>
      expect(on).toHaveBeenCalledWith("payment:refunded", expect.any(Function)),
    );
    const handler = on.mock.calls.find(
      (call: unknown[]) => call[0] === "payment:refunded",
    )![1];
    handler();

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalledTimes(2));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["paymentHistory", "rest-1"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["paymentOverview", "rest-1"],
    });
  });
});
