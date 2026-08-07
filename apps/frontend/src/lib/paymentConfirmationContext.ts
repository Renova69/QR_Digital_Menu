const PAYMENT_CONFIRMATION_KEY = "payment-confirmation";
const MAX_CONTEXT_AGE_MS = 48 * 60 * 60 * 1000;

export type PaymentCompletionProvider =
  | "STRIPE"
  | "EPAY"
  | "BORICA"
  | "MYPOS"
  | "CASH";

export type PaymentCompletionDetails = {
  paymentId: string;
  amount?: number;
  provider?: PaymentCompletionProvider;
  remaining?: number;
};

export type PaymentConfirmationContext = {
  /**
   * Optional: a hosted-checkout round-trip can return without its
   * sessionStorage marker, and waiter-settled payments never carry one. The
   * session token alone is enough — the server resolves the session's latest
   * succeeded payment. Requiring an id here used to drop the customer back to
   * the menu with only a banner, silently skipping the review.
   */
  paymentId?: string;
  sessionToken: string;
  amount?: number;
  provider?: PaymentCompletionProvider;
  remaining?: number;
  restaurantId?: string;
  menuReturnUrl: string;
  tableNumber?: string;
  completedAt: number;
};

export function storePaymentConfirmationContext(
  context: PaymentConfirmationContext,
): void {
  try {
    sessionStorage.setItem(PAYMENT_CONFIRMATION_KEY, JSON.stringify(context));
  } catch {}
}

export function readPaymentConfirmationContext(): PaymentConfirmationContext | null {
  try {
    const raw = sessionStorage.getItem(PAYMENT_CONFIRMATION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PaymentConfirmationContext>;
    if (
      (value.paymentId !== undefined && typeof value.paymentId !== "string") ||
      typeof value.sessionToken !== "string" ||
      typeof value.menuReturnUrl !== "string" ||
      typeof value.completedAt !== "number" ||
      Date.now() - value.completedAt > MAX_CONTEXT_AGE_MS
    ) {
      sessionStorage.removeItem(PAYMENT_CONFIRMATION_KEY);
      return null;
    }
    return value as PaymentConfirmationContext;
  } catch {
    return null;
  }
}

export function clearPaymentConfirmationContext(): void {
  try {
    sessionStorage.removeItem(PAYMENT_CONFIRMATION_KEY);
  } catch {}
}
