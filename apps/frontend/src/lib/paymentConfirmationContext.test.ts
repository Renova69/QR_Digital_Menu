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
});
