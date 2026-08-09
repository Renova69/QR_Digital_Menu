/**
 * Shared by ReviewInbox and the visit drawer so a payment renders identically
 * in the list and in the detail view.
 */

export const formatPaymentAmount = (
  amount: number,
  currency: string,
  language: string,
) =>
  new Intl.NumberFormat(language, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);

export const formatPaymentProvider = (
  provider: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
) => {
  if (provider === "STRIPE") {
    return t("payments.stripeMethod", { defaultValue: "Stripe" });
  }
  if (provider === "CASH") {
    return t("payments.cashMethod", { defaultValue: "Cash" });
  }
  if (provider === "EPAY") return "ePay.bg";
  if (provider === "BORICA") return "BORICA";
  if (provider === "MYPOS") return "myPOS";
  return provider;
};
