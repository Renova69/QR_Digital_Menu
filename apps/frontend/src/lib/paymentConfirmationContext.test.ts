import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPaymentConfirmationContext,
  readPaymentConfirmationContext,
  storePaymentConfirmationContext,
} from "./paymentConfirmationContext";

describe("payment confirmation context", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("persists the payment result across the provider return navigation", () => {
    const completedAt = Date.now();
    storePaymentConfirmationContext({
      paymentId: "payment-1",
      sessionToken: "session-token",
      amount: 24.5,
      provider: "STRIPE",
      menuReturnUrl: "/menu/public/rest-1?table=10",
      tableNumber: "10",
      completedAt,
    });

    expect(readPaymentConfirmationContext()).toEqual({
      paymentId: "payment-1",
      sessionToken: "session-token",
      amount: 24.5,
      provider: "STRIPE",
      menuReturnUrl: "/menu/public/rest-1?table=10",
      tableNumber: "10",
      completedAt,
    });

    clearPaymentConfirmationContext();
    expect(readPaymentConfirmationContext()).toBeNull();
  });

  // A hosted-checkout return can lose its sessionStorage marker, so the id is
  // unknown; the session token alone is enough for the server to resolve the
  // payment. Rejecting this context used to drop the customer back to the menu
  // with only a banner and no review prompt.
  it("accepts a context with no paymentId", () => {
    const completedAt = Date.now();
    storePaymentConfirmationContext({
      sessionToken: "session-token",
      menuReturnUrl: "/menu/public/rest-1?table=10",
      completedAt,
    });

    expect(readPaymentConfirmationContext()).toEqual({
      sessionToken: "session-token",
      menuReturnUrl: "/menu/public/rest-1?table=10",
      completedAt,
    });
  });

  it("still rejects a context with a non-string paymentId", () => {
    sessionStorage.setItem(
      "payment-confirmation",
      JSON.stringify({
        paymentId: 42,
        sessionToken: "session-token",
        menuReturnUrl: "/menu",
        completedAt: Date.now(),
      }),
    );

    expect(readPaymentConfirmationContext()).toBeNull();
  });
});
