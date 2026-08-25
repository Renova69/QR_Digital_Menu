import { describe, it, expect, vi } from "vitest";
import type { PaymentDetail } from "./paymentsShared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const shared = vi.hoisted(() => ({
  exportPaymentsCsv: vi.fn(),
  openStripePayment: vi.fn(),
}));

vi.mock("./paymentsShared", () => ({
  formatMoney: (value: number) => `${value.toFixed(2)} €`,
  formatDateTime: (value: string) => value.slice(11, 16),
  shortId: (value: string) => (value ? value.slice(0, 8) : ""),
  statusStyles: {
    SUCCEEDED: "bg-emerald-100",
    PENDING: "bg-amber-100",
    FAILED: "bg-red-100",
    REFUNDED: "bg-slate-100",
  },
  methodStyles: {
    STRIPE: { tone: "bg-primary", Icon: () => null },
    EPAY: { tone: "bg-blue-500", Icon: () => null },
    BORICA: { tone: "bg-green-600", Icon: () => null },
    MYPOS: { tone: "bg-slate-600", Icon: () => null },
    CASH: { tone: "bg-amber-500", Icon: () => null },
  },
  exportPaymentsCsv: shared.exportPaymentsCsv,
  openStripePayment: shared.openStripePayment,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: unknown) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

import { PaymentDrawer } from "./PaymentDrawer";

function makePayment(overrides: Record<string, unknown> = {}): PaymentDetail {
  return {
    id: "pay-1",
    status: "SUCCEEDED",
    provider: "STRIPE",
    amount: 24.5,
    tipAmount: 2,
    platformFeeAmount: 0.74,
    currency: "EUR",
    createdAt: "2026-08-22T10:00:00.000Z",
    stripePaymentIntentId: "pi_12345678",
    tableSessionId: "sess-1",
    tableNumber: "T-3",
    customerName: "Ivan",
    ...overrides,
  };
}

function renderDrawer(overrides: Record<string, unknown> = {}) {
  const onRefund = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <PaymentDrawer
      payment={makePayment(overrides.payment as Record<string, unknown>)}
      loading={(overrides.loading as boolean) ?? false}
      refunding={(overrides.refunding as boolean) ?? false}
      onRefund={onRefund}
      onClose={onClose}
    />,
  );
  return { onRefund, onClose, ...utils };
}

describe("PaymentDrawer rendering", () => {
  it("renders nothing when there is no payment", () => {
    const { container } = render(
      <PaymentDrawer
        payment={null}
        loading={false}
        refunding={false}
        onRefund={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the amount, status badge, id and order summary", () => {
    renderDrawer();

    expect(screen.getAllByText("24.50 €").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("payments.succeeded")).toBeTruthy();
    expect(screen.getByText("pi_12345")).toBeTruthy();
    expect(screen.getByText("sess-1")).toBeTruthy();
    expect(screen.getByText(/T-3/)).toBeTruthy();
    expect(screen.getByText(/Ivan/)).toBeTruthy();
  });

  it("shows the loading detail alert", () => {
    renderDrawer({ loading: true });

    expect(screen.getByText("payments.loadingDetail")).toBeTruthy();
  });

  it("shows the itemization-unavailable alert for split payments", () => {
    renderDrawer({
      payment: { itemizationUnavailable: true },
    });

    expect(
      screen.getByText(
        "This split payment was recorded by amount, so an item-level receipt is not available.",
      ),
    ).toBeTruthy();
  });

  it("renders POS orders with staff badge, items, options and special requests", () => {
    renderDrawer({
      payment: {
        orders: [
          {
            id: "ord-1",
            source: "POS",
            staffName: "Gosho",
            customerName: "Ivan",
            totalPrice: 10,
            specialRequests: "Fast",
            items: [
              { name: "Salad", quantity: 2, unitPrice: 5, options: ["No onions"] },
            ],
          },
        ],
      },
    });

    expect(screen.getByText("Gosho")).toBeTruthy();
    expect(screen.getByText("Staff")).toBeTruthy();
    expect(screen.getByText("2x Salad")).toBeTruthy();
    expect(screen.getByText("No onions")).toBeTruthy();
    expect(screen.getByText("Fast")).toBeTruthy();
  });

  it("renders self orders with the Self badge and customer name", () => {
    renderDrawer({
      payment: {
        orders: [
          {
            id: "ord-2",
            source: "CUSTOMER",
            customerName: "Ivan",
            totalPrice: 10,
            items: [{ name: "Soup", quantity: 1, unitPrice: 4, options: [] }],
          },
        ],
      },
    });

    expect(screen.getByText("Self")).toBeTruthy();
  });

  it("computes the breakdown from the payment when no breakdown is given", () => {
    renderDrawer();

    // subtotal = amount - tip = 22.50
    expect(screen.getByText("22.50 €")).toBeTruthy();
    expect(screen.getByText("2.00 €")).toBeTruthy();
    expect(screen.getAllByText("24.50 €").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("-0.74 €")).toBeTruthy();
    // net = amount - fee = 23.76
    expect(screen.getByText("23.76 €")).toBeTruthy();
  });

  it("prefers the explicit breakdown values", () => {
    renderDrawer({
      payment: {
        breakdown: {
          subtotal: 20,
          tip: 3,
          totalCharged: 25,
          platformFee: 1,
          net: 24,
        },
      },
    });

    expect(screen.getByText("20.00 €")).toBeTruthy();
    expect(screen.getByText("25.00 €")).toBeTruthy();
    expect(screen.getByText("-1.00 €")).toBeTruthy();
    expect(screen.getByText("24.00 €")).toBeTruthy();
  });

  it("renders the default timeline from the payment status", () => {
    renderDrawer();

    expect(screen.getByText("payments.paymentStatus")).toBeTruthy();
  });

  it("translates known timeline labels and appends the refunded item", () => {
    renderDrawer({
      payment: {
        status: "REFUNDED",
        timeline: [
          { label: "Payment succeeded", at: "2026-08-22T10:00:00.000Z" },
        ],
      },
    });

    expect(screen.getByText("Payment succeeded")).toBeTruthy();
    expect(screen.getByText("payments.refundRecorded")).toBeTruthy();
  });

  it("renders the method label per provider", () => {
    renderDrawer({ payment: { provider: "EPAY" } });

    expect(screen.getByText("ePay.bg")).toBeTruthy();
  });
});

describe("PaymentDrawer actions", () => {
  it("opens the Stripe payment page", async () => {
    shared.openStripePayment.mockImplementation(() => {});
    renderDrawer();

    await userEvent.click(
      screen.getByRole("button", { name: "payments.viewOnStripe" }),
    );

    expect(shared.openStripePayment).toHaveBeenCalledWith("pi_12345678");
  });

  it("disables View on Stripe without a payment intent", () => {
    renderDrawer({ payment: { stripePaymentIntentId: undefined } });

    expect(
      (screen.getByRole("button", {
        name: "payments.viewOnStripe",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("hides the Stripe button for non-Stripe providers", () => {
    renderDrawer({ payment: { provider: "CASH" } });

    expect(
      screen.queryByRole("button", { name: "payments.viewOnStripe" }),
    ).toBeNull();
  });

  it("exports the receipt CSV", async () => {
    shared.exportPaymentsCsv.mockImplementation(() => {});
    renderDrawer();

    await userEvent.click(
      screen.getByRole("button", { name: "payments.receipt" }),
    );

    expect(shared.exportPaymentsCsv).toHaveBeenCalledTimes(1);
    expect(shared.exportPaymentsCsv.mock.calls[0][0]).toHaveLength(1);
  });

  it("walks the refund confirmation flow", async () => {
    const { onRefund } = renderDrawer();

    await userEvent.click(
      screen.getByRole("button", { name: "payments.refund" }),
    );
    expect(screen.getByText("payments.cancel")).toBeTruthy();
    expect(screen.getByText("payments.confirmRefund")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "payments.confirmRefund" }),
    );
    expect(onRefund).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("payments.confirmRefund")).toBeNull();
  });

  it("cancels the refund confirmation", async () => {
    renderDrawer();

    await userEvent.click(
      screen.getByRole("button", { name: "payments.refund" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "payments.cancel" }),
    );

    expect(screen.getByRole("button", { name: "payments.refund" })).toBeTruthy();
  });

  it("shows the refunding label while the refund is pending", async () => {
    renderDrawer({ refunding: true });

    await userEvent.click(
      screen.getByRole("button", { name: "payments.refund" }),
    );

    expect(screen.getByText("payments.refunding")).toBeTruthy();
  });

  it("hides the refund button for non-succeeded payments", () => {
    renderDrawer({ payment: { status: "FAILED" } });

    expect(
      screen.queryByRole("button", { name: "payments.refund" }),
    ).toBeNull();
  });

  it("calls onClose from the close button", async () => {
    const { onClose } = renderDrawer();

    await userEvent.click(
      screen.getByRole("button", { name: "payments.close" }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
