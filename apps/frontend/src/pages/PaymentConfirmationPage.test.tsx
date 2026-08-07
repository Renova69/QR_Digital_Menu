import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PaymentConfirmationPage from "./PaymentConfirmationPage";
import {
  createFeedbackInvitation,
  markFeedbackInvitationPresented,
  submitVisitFeedback,
} from "../lib/api";
import { storePaymentConfirmationContext } from "../lib/paymentConfirmationContext";

vi.mock("../lib/api", () => ({
  createFeedbackInvitation: vi.fn(),
  submitVisitFeedback: vi.fn(),
  markFeedbackInvitationPresented: vi.fn(),
  markGoogleReviewClick: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe("PaymentConfirmationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(markFeedbackInvitationPresented).mockResolvedValue({
      acknowledged: true,
    });
    storePaymentConfirmationContext({
      paymentId: "payment-1",
      sessionToken: "session-token",
      amount: 24.5,
      provider: "CASH",
      menuReturnUrl: "/menu/public/rest-1?table=10",
      tableNumber: "10",
      completedAt: Date.now(),
    });
  });

  it("keeps payment proof primary and collects optional post-visit feedback", async () => {
    vi.mocked(createFeedbackInvitation).mockResolvedValue({
      eligible: true,
      submitted: false,
      invitationToken: "invitation-token",
      payment: {
        id: "payment-1",
        amount: 24.5,
        currency: "eur",
        provider: "CASH",
      },
      restaurant: {
        id: "rest-1",
        name: "Daffi",
        googleReviewUrl: "https://g.page/r/example/review",
      },
    });
    vi.mocked(submitVisitFeedback).mockResolvedValue({ id: "feedback-1" });

    render(
      <MemoryRouter initialEntries={["/payment-confirmation"]}>
        <PaymentConfirmationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Payment received successfully"),
    ).toBeVisible();
    // App-wide money format via formatEuro() — matches CartDrawer,
    // CheckoutPage, PaymentModal and ItemWithOptions.
    expect(screen.getByText("24.50 €")).toBeVisible();

    const stars = await screen.findAllByRole("button", {
      name: /star/i,
    });
    await waitFor(() =>
      expect(markFeedbackInvitationPresented).toHaveBeenCalledWith(
        "invitation-token",
      ),
    );
    fireEvent.click(stars[2]);
    expect(
      screen.getByPlaceholderText(
        "Tell us more about your experience (optional)",
      ),
    ).toBeVisible();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Good food" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(submitVisitFeedback).toHaveBeenCalledWith({
        invitationToken: "invitation-token",
        rating: 3,
        comment: "Good food",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Leave a Google Review" }),
    ).toBeVisible();
  });

  it("does not ask for a review before the food is served", async () => {
    vi.mocked(createFeedbackInvitation).mockResolvedValue({
      eligible: false,
      submitted: false,
      reason: "ORDERS_NOT_SERVED",
      payment: {
        id: "payment-1",
        amount: 24.5,
        currency: "eur",
        provider: "CASH",
      },
      restaurant: {
        id: "rest-1",
        name: "Daffi",
        googleReviewUrl: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/payment-confirmation"]}>
        <PaymentConfirmationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Payment received successfully"),
    ).toBeVisible();
    await waitFor(() => expect(createFeedbackInvitation).toHaveBeenCalled());
    expect(
      screen.queryByText("How was your experience?"),
    ).not.toBeInTheDocument();
  });

  it("shows processing until the backend verifies payment success", async () => {
    vi.mocked(createFeedbackInvitation).mockResolvedValue({
      eligible: false,
      submitted: false,
      reason: "PAYMENT_PENDING",
      payment: {
        id: "payment-1",
        amount: 24.5,
        currency: "eur",
        provider: "STRIPE",
      },
      restaurant: {
        id: "rest-1",
        name: "Daffi",
        googleReviewUrl: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/payment-confirmation"]}>
        <PaymentConfirmationPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Confirming payment")).toBeVisible();
    expect(
      screen.queryByText("Payment received successfully"),
    ).not.toBeInTheDocument();
  });

  // Stripe redirects the customer back before its webhook lands, so the first
  // invitation call routinely reads PAYMENT_PENDING. The retry has to be fast:
  // the invitation row is only created once the payment reads SUCCEEDED, and a
  // customer who closes the tab first never gets a review. The old 30s flat
  // interval lost most of them.
  it("re-checks a webhook-lagged payment within seconds, not half a minute", async () => {
    vi.useFakeTimers();
    try {
      const pending = {
        eligible: false,
        submitted: false,
        reason: "PAYMENT_PENDING",
        payment: {
          id: "payment-1",
          amount: 24.5,
          currency: "eur",
          provider: "STRIPE",
        },
        restaurant: { id: "rest-1", name: "Daffi", googleReviewUrl: null },
      } as const;
      vi.mocked(createFeedbackInvitation)
        .mockResolvedValueOnce(pending)
        .mockResolvedValue({
          eligible: true,
          submitted: false,
          invitationToken: "invitation-token",
          payment: pending.payment,
          restaurant: pending.restaurant,
        });

      render(
        <MemoryRouter initialEntries={["/payment-confirmation"]}>
          <PaymentConfirmationPage />
        </MemoryRouter>,
      );

      // First call resolves to PAYMENT_PENDING.
      await vi.waitFor(() =>
        expect(createFeedbackInvitation).toHaveBeenCalledTimes(1),
      );

      // Well under the old 30s interval, the retry has already fired.
      await vi.advanceTimersByTimeAsync(1000);
      await vi.waitFor(() =>
        expect(createFeedbackInvitation).toHaveBeenCalledTimes(2),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying once the invitation is no longer blocked", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(createFeedbackInvitation).mockResolvedValue({
        eligible: true,
        submitted: false,
        invitationToken: "invitation-token",
        payment: {
          id: "payment-1",
          amount: 24.5,
          currency: "eur",
          provider: "CASH",
        },
        restaurant: { id: "rest-1", name: "Daffi", googleReviewUrl: null },
      });

      render(
        <MemoryRouter initialEntries={["/payment-confirmation"]}>
          <PaymentConfirmationPage />
        </MemoryRouter>,
      );

      await vi.waitFor(() =>
        expect(createFeedbackInvitation).toHaveBeenCalledTimes(1),
      );

      await vi.advanceTimersByTimeAsync(60_000);
      expect(createFeedbackInvitation).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the one claimed prompt when StrictMode retries issuance", async () => {
    const verifiedInvitation = {
      eligible: true,
      submitted: false,
      invitationToken: "invitation-token",
      payment: {
        id: "payment-1",
        amount: 24.5,
        currency: "eur",
        provider: "CASH",
      },
      restaurant: {
        id: "rest-1",
        name: "Daffi",
        googleReviewUrl: null,
      },
    } as const;
    vi.mocked(createFeedbackInvitation)
      .mockResolvedValueOnce(verifiedInvitation)
      .mockResolvedValueOnce({
        ...verifiedInvitation,
        eligible: false,
        reason: "ALREADY_PROMPTED",
        invitationToken: undefined,
      });

    render(
      <React.StrictMode>
        <MemoryRouter initialEntries={["/payment-confirmation"]}>
          <PaymentConfirmationPage />
        </MemoryRouter>
      </React.StrictMode>,
    );

    expect(await screen.findByText("How was your experience?")).toBeVisible();
    await waitFor(() =>
      expect(createFeedbackInvitation).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText("How was your experience?")).toBeVisible();
  });

  it("does not repeat a feedback prompt already presented for the visit", async () => {
    vi.mocked(createFeedbackInvitation).mockResolvedValue({
      eligible: false,
      submitted: false,
      reason: "ALREADY_PROMPTED",
      payment: {
        id: "payment-1",
        amount: 24.5,
        currency: "eur",
        provider: "CASH",
      },
      restaurant: {
        id: "rest-1",
        name: "Daffi",
        googleReviewUrl: null,
      },
    });

    render(
      <MemoryRouter initialEntries={["/payment-confirmation"]}>
        <PaymentConfirmationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("Payment received successfully"),
    ).toBeVisible();
    expect(
      screen.queryByText("How was your experience?"),
    ).not.toBeInTheDocument();
  });
});
