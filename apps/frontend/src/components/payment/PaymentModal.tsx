import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  getSessionBill,
  createCheckout,
  createCashPaymentRequest,
  abandonCheckout,
  type BoricaCardholderDetails,
  type CheckoutProvider,
  type PendingBillPayment,
} from "../../lib/api";
import { Button } from "../ui/button";
import { useTranslation } from "react-i18next";
import { Banknote, CheckCircle2, ReceiptText, Users, X } from "lucide-react";
import { formatEuro, formatBgn } from "../../lib/currency";
import { getCustomerFacingOrderSourceLabel } from "../../lib/orderSourceLabel";
import { useSocket } from "../../context/SocketContext";
import {
  hostedCheckoutStorageKey,
  stripUrlFragment,
} from "../../lib/tableSessionCredential";
import { getApiError } from "../../lib/apiError";

const stripePublishableKey = (import.meta as any).env
  .VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

if (!stripePublishableKey) {
  // Fix C-6 — do not silently fall back to an empty key; warn so the missing
  // configuration is visible in the console and the component can show an error.
  console.warn(
    "[PaymentModal] VITE_STRIPE_PUBLISHABLE_KEY is missing — Stripe will not initialize and payment is disabled.",
  );
}

// loadStripe(null) resolves to null, which the component handles with a visible
// error state instead of a no-op submit.
const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : Promise.resolve(null);

interface PaymentModalProps {
  sessionToken: string;
  ownedOrderIds?: string[];
  allowCashRequest?: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onCashRequestCreated?: (requestId: string) => void;
}

type Step = "tip" | "pay" | "redirect" | "done";

interface BillItem {
  orderItemId: string;
  name: string;
  quantity: number;
  paidQuantity: number;
  unitPrice: number;
  unitPriceWithOptions: number;
  selectedOptions: any[];
}

interface BillOrder {
  id: string;
  source: "CUSTOMER" | "POS";
  customerName?: string | null;
  customerPhone?: string | null;
  staffName: string | null;
  staffRole: string | null;
  totalPrice: number;
  items: BillItem[];
}

interface BillData {
  sessionId?: string;
  tableName?: string | null;
  orders: BillOrder[];
  subtotal: number;
  remaining: number;
  splitItemsAvailable: boolean;
  tipsEnabled: boolean;
  tipOptions: number[];
  paymentProviders: CheckoutProvider[];
  restaurantId?: string;
  pendingPayment?: PendingBillPayment | null;
}

type StripePaymentState = {
  provider: "STRIPE";
  clientSecret: string;
  total: number;
  tipAmount: number;
};

type StripeConfirmationError = {
  code?: string;
  decline_code?: string;
  type?: string;
};

function getStripeConfirmationErrorMessage(
  error: StripeConfirmationError | null | undefined,
  t: (key: string, fallback: string) => string,
) {
  const category = error?.decline_code || error?.code || error?.type;
  switch (category) {
    case "insufficient_funds":
      return t(
        "payment.stripeErrors.insufficientFunds",
        "Insufficient funds. Please use another payment method.",
      );
    case "expired_card":
      return t(
        "payment.stripeErrors.expiredCard",
        "This card has expired. Please use another card.",
      );
    case "incorrect_cvc":
      return t(
        "payment.stripeErrors.incorrectCvc",
        "The security code is incorrect. Check it and try again.",
      );
    case "authentication_required":
      return t(
        "payment.stripeErrors.authenticationRequired",
        "Card authentication is required. Please try the payment again.",
      );
    case "card_declined":
      return t(
        "payment.stripeErrors.cardDeclined",
        "Your card was declined. Please contact your bank or use another card.",
      );
    case "validation_error":
      return t(
        "payment.stripeErrors.invalidDetails",
        "Check your card details and try again.",
      );
    case "api_connection_error":
    case "api_error":
      return t(
        "payment.stripeErrors.connection",
        "We could not reach the payment service. Check your connection and try again.",
      );
    default:
      return t(
        "payment.stripeErrors.unavailable",
        "We could not confirm the payment. Check your connection and try again.",
      );
  }
}

type HostedFormPaymentState = {
  paymentId: string;
  total: number;
  tipAmount: number;
  action: string;
  method: "POST";
  fields: Record<string, string>;
};

type EpayPaymentState = HostedFormPaymentState & { provider: "EPAY" };

type BoricaPaymentState = HostedFormPaymentState & { provider: "BORICA" };

type MyposPaymentState = HostedFormPaymentState & { provider: "MYPOS" };

type PaymentState =
  | StripePaymentState
  | EpayPaymentState
  | BoricaPaymentState
  | MyposPaymentState;

function showGroupHeaders(orders: BillOrder[]): boolean {
  return orders.some((o) => o.source === "POS");
}

function getBillItemUnitPrice(item: BillItem): number {
  return typeof item.unitPriceWithOptions === "number" &&
    item.unitPriceWithOptions > 0
    ? item.unitPriceWithOptions
    : item.unitPrice;
}

function getBillItemRemainingQuantity(item: BillItem): number {
  return Math.max(0, item.quantity - (item.paidQuantity ?? 0));
}

function getOrderRemainingSubtotal(order: BillOrder): number {
  return order.items.reduce((sum, item) => {
    return (
      sum + getBillItemUnitPrice(item) * getBillItemRemainingQuantity(item)
    );
  }, 0);
}

function pendingPaymentOverlapsScope(
  pendingPayment: PendingBillPayment | null,
  scope: "MY_ORDERS" | "FULL_TABLE",
  orderIds?: string[],
): boolean {
  if (!pendingPayment) return false;
  if (pendingPayment.scope === "FULL_TABLE" || scope === "FULL_TABLE") {
    return true;
  }
  const activeOrderIds = new Set(orderIds ?? []);
  return pendingPayment.orderIds.some((id) => activeOrderIds.has(id));
}

function PaymentForm({
  clientSecret,
  sessionToken,
  total,
  tipAmount,
  onSuccess,
  onClose,
}: {
  clientSecret: string;
  sessionToken: string;
  total: number;
  tipAmount: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Fix C-6 — if Stripe failed to initialize (missing key), surface a visible
    // error instead of silently doing nothing.
    if (!stripe || !elements) {
      setError(
        t(
          "payment.stripeUnavailable",
          "Payment is currently unavailable — please contact staff.",
        ),
      );
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      sessionStorage.setItem(
        hostedCheckoutStorageKey(sessionToken),
        JSON.stringify({
          token: sessionToken,
          provider: "STRIPE",
          startedAt: Date.now(),
        }),
      );
    } catch {}

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: stripUrlFragment(window.location.href) },
        redirect: "if_required",
      });

      if (result.error) {
        try {
          sessionStorage.removeItem(hostedCheckoutStorageKey(sessionToken));
        } catch {}
        setError(getStripeConfirmationErrorMessage(result.error, t));
        setProcessing(false);
      } else if (result.paymentIntent?.status === "succeeded") {
        onSuccess();
      } else {
        // Fix H-5 — any other status (processing, requires_action, etc.) must not
        // leave the form locked with no feedback.
        setError(
          t(
            "payment.unexpectedStatus",
            "Payment status unclear — please contact staff",
          ),
        );
        setProcessing(false);
      }
    } catch (confirmationError) {
      try {
        sessionStorage.removeItem(hostedCheckoutStorageKey(sessionToken));
      } catch {}
      setError(
        getStripeConfirmationErrorMessage(
          confirmationError as StripeConfirmationError,
          t,
        ),
      );
      setProcessing(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col flex-1 min-h-0 gap-4"
    >
      <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 space-y-4">
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex justify-between">
            <span>{t("payment.subtotal", "Subtotal")}</span>
            <div className="text-right">
              <div>{formatEuro(total - tipAmount)}</div>
              <span className="text-xs text-muted-foreground">
                {formatBgn(total - tipAmount)}
              </span>
            </div>
          </div>
          {tipAmount > 0 && (
            <div className="flex justify-between">
              <span>{t("payment.tip", "Tip")}</span>
              <div className="text-right">
                <div>{formatEuro(tipAmount)}</div>
                <span className="text-xs text-muted-foreground">
                  {formatBgn(tipAmount)}
                </span>
              </div>
            </div>
          )}
          <div className="flex justify-between font-semibold text-foreground border-t pt-1">
            <span>{t("payment.total", "Total")}</span>
            <div className="text-right">
              <div>{formatEuro(total)}</div>
              <span className="text-xs text-muted-foreground">
                {formatBgn(total)}
              </span>
            </div>
          </div>
        </div>

        <PaymentElement />

        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={processing}
        >
          {t("common.cancel", "Cancel")}
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={processing || !stripe}
        >
          {processing
            ? t("payment.processing", "Processing...")
            : `${t("payment.pay", "Pay")} ${formatEuro(total)}`}
        </Button>
      </div>
    </form>
  );
}

export function PaymentModal({
  sessionToken,
  ownedOrderIds = [],
  allowCashRequest = true,
  onClose,
  onSuccess,
  onCashRequestCreated,
}: PaymentModalProps) {
  const { t } = useTranslation();
  const { socket, isConnected } = useSocket();
  const [step, setStep] = useState<Step>("tip");
  const [bill, setBill] = useState<BillData | null>(null);
  const [selectedTip, setSelectedTip] = useState(0);
  const [customTip, setCustomTip] = useState("");
  const [boricaCardholderName, setBoricaCardholderName] = useState("");
  const [boricaEmail, setBoricaEmail] = useState("");
  const [boricaPhone, setBoricaPhone] = useState("");
  const [boricaBillingAddress, setBoricaBillingAddress] = useState("");
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutProvider>("STRIPE");
  const [paymentScope, setPaymentScope] = useState<"MY_ORDERS" | "FULL_TABLE">(
    "MY_ORDERS",
  );
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [paymentInitiated, setPaymentInitiated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cashRequesting, setCashRequesting] = useState(false);
  const [cashRequested, setCashRequested] = useState(false);
  const [cashRequestId, setCashRequestId] = useState<string | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  const [pendingBillPayment, setPendingBillPayment] =
    useState<PendingBillPayment | null>(null);
  // Fix H-8 — a failed bill load must show an error with retry, not silently close.
  const [billError, setBillError] = useState<string | null>(null);
  const [billReloadKey, setBillReloadKey] = useState(0);
  const epayFormRef = useRef<HTMLFormElement | null>(null);
  const liveCompletionHandledRef = useRef(false);

  useEffect(() => {
    liveCompletionHandledRef.current = false;
    setCashRequestId(null);
    setPendingBillPayment(null);
  }, [sessionToken]);

  const completeFromLiveSettlement = useCallback(() => {
    if (liveCompletionHandledRef.current) return;
    liveCompletionHandledRef.current = true;
    try {
      sessionStorage.removeItem(hostedCheckoutStorageKey(sessionToken));
    } catch {}
    onSuccess();
  }, [onSuccess, sessionToken]);

  useEffect(() => {
    if (!socket || !isConnected || !sessionToken) return;

    socket.emit("joinTableSessionRoom", { token: sessionToken });

    const handlePaymentConfirmed = () => {
      completeFromLiveSettlement();
    };

    const handleBillUpdated = (payload: { sessionPaid?: boolean }) => {
      if (payload?.sessionPaid) {
        completeFromLiveSettlement();
      } else {
        setBillReloadKey((k) => k + 1);
      }
    };

    const handleCashRequestUpdated = (request: {
      id?: string;
      status?: string;
    }) => {
      if (!cashRequestId || request?.id !== cashRequestId) return;
      if (request.status === "PAID") {
        completeFromLiveSettlement();
        return;
      }
      if (request.status === "CANCELLED") {
        setCashRequested(false);
        setCashRequestId(null);
        setCashError(
          t(
            "payment.cashRequestCancelled",
            "Staff cancelled this cash request. Please ask your waiter or try again.",
          ),
        );
      }
    };

    const handlePendingBillPayment = (payment: PendingBillPayment) => {
      if (
        payment?.tableSessionId &&
        bill?.sessionId &&
        payment.tableSessionId !== bill.sessionId
      )
        return;
      setPendingBillPayment(payment);
    };

    const handleBillPaymentCleared = (payload: {
      id?: string;
      tableSessionId?: string;
    }) => {
      if (
        payload?.tableSessionId &&
        bill?.sessionId &&
        payload.tableSessionId !== bill.sessionId
      )
        return;
      setPendingBillPayment((current) => {
        if (!current) return current;
        return !payload?.id || payload.id === current.id ? null : current;
      });
      setBillReloadKey((k) => k + 1);
    };

    socket.on("payment:confirmed", handlePaymentConfirmed);
    socket.on("bill:updated", handleBillUpdated);
    socket.on("cashPaymentRequest:updated", handleCashRequestUpdated);
    socket.on("billPayment:pending", handlePendingBillPayment);
    socket.on("billPayment:cleared", handleBillPaymentCleared);

    return () => {
      socket.off("payment:confirmed", handlePaymentConfirmed);
      socket.off("bill:updated", handleBillUpdated);
      socket.off("cashPaymentRequest:updated", handleCashRequestUpdated);
      socket.off("billPayment:pending", handlePendingBillPayment);
      socket.off("billPayment:cleared", handleBillPaymentCleared);
      socket.emit("leaveTableSessionRoom", { token: sessionToken });
    };
  }, [
    bill?.sessionId,
    cashRequestId,
    completeFromLiveSettlement,
    isConnected,
    sessionToken,
    socket,
    t,
  ]);

  useEffect(() => {
    let cancelled = false;
    setBillError(null);
    getSessionBill(sessionToken)
      .then((data) => {
        if (!cancelled) {
          setBill(data);
          setPendingBillPayment(data.pendingPayment ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBillError(
            t(
              "payment.billLoadError",
              "Could not load bill — please try again",
            ),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, billReloadKey, t]);

  useEffect(() => {
    if (!bill) return;
    const providers = bill.paymentProviders ?? [];
    if (providers.length > 0 && !providers.includes(selectedProvider)) {
      setSelectedProvider(providers[0]);
    }
  }, [bill, selectedProvider]);

  useEffect(() => {
    if (!bill) return;
    const customerOrder = bill.orders.find(
      (order) => order.source === "CUSTOMER" && order.customerName,
    );
    if (customerOrder?.customerName) {
      setBoricaCardholderName(
        (current) => current || customerOrder.customerName || "",
      );
    }
    if (customerOrder?.customerPhone) {
      setBoricaPhone((current) => current || customerOrder.customerPhone || "");
    }
  }, [bill]);

  useEffect(() => {
    if (
      step !== "redirect" ||
      (payment?.provider !== "EPAY" &&
        payment?.provider !== "BORICA" &&
        payment?.provider !== "MYPOS")
    )
      return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(
          hostedCheckoutStorageKey(sessionToken),
          JSON.stringify({
            token: sessionToken,
            provider: payment.provider,
            paymentId: payment.paymentId,
            startedAt: Date.now(),
          }),
        );
      } catch {}
      epayFormRef.current?.submit();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [payment, sessionToken, step]);

  const retryBillFetch = () => {
    setBill(null);
    setBillError(null);
    setBillReloadKey((k) => k + 1);
  };

  const rawTipPercent =
    customTip !== "" ? parseFloat(customTip) || 0 : selectedTip;
  // Fix M-3 — clamp tip to a sane 0–100 range before it reaches the API.
  const activeTipPercent = Math.max(0, Math.min(100, rawTipPercent));
  const availableProviders = bill?.paymentProviders ?? [];
  const hasPaymentProvider = availableProviders.length > 0;
  const effectiveProvider: CheckoutProvider =
    hasPaymentProvider && availableProviders.includes(selectedProvider)
      ? selectedProvider
      : (availableProviders[0] ?? selectedProvider);
  const boricaNamePattern = /^[A-Za-z0-9 .,'-]{1,45}$/;
  const ownedOrderKey = ownedOrderIds.join("|");
  const ownedOrderIdSet = useMemo(
    () => new Set(ownedOrderIds.filter(Boolean)),
    [ownedOrderKey],
  );
  const ownedOrders = useMemo(
    () => (bill?.orders ?? []).filter((order) => ownedOrderIdSet.has(order.id)),
    [bill?.orders, ownedOrderIdSet],
  );
  const ownedRemainingSubtotal = useMemo(
    () =>
      Math.round(
        ownedOrders.reduce(
          (sum, order) => sum + getOrderRemainingSubtotal(order),
          0,
        ) * 100,
      ) / 100,
    [ownedOrders],
  );
  const billRemaining = bill?.remaining ?? bill?.subtotal ?? 0;
  const hasOtherUnpaidOrders = useMemo(
    () =>
      (bill?.orders ?? []).some(
        (order) =>
          !ownedOrderIdSet.has(order.id) &&
          getOrderRemainingSubtotal(order) > 0,
      ),
    [bill?.orders, ownedOrderIdSet],
  );
  const canPayOwnedOrders =
    ownedOrders.length > 0 &&
    ownedRemainingSubtotal > 0 &&
    !!bill?.splitItemsAvailable &&
    hasOtherUnpaidOrders;
  const activePaymentScope = canPayOwnedOrders ? paymentScope : "FULL_TABLE";
  const displayedOrders =
    activePaymentScope === "MY_ORDERS" ? ownedOrders : (bill?.orders ?? []);
  const activeSubtotal =
    activePaymentScope === "MY_ORDERS" ? ownedRemainingSubtotal : billRemaining;
  const activeCheckoutOrderIds =
    activePaymentScope === "MY_ORDERS"
      ? ownedOrders.map((order) => order.id)
      : undefined;
  const ownPendingCashRequest =
    pendingBillPayment?.source === "CASH_REQUEST" &&
    !!cashRequestId &&
    pendingBillPayment.id === cashRequestId;
  const pendingBillMessage =
    pendingBillPayment?.scope === "FULL_TABLE"
      ? t(
          "payment.fullTablePaymentPending",
          "Someone else is already paying the full table bill. This screen will update automatically once it is finished or cancelled.",
        )
      : t(
          "payment.partialPaymentPending",
          "Part of this table bill is already being paid. You can pay your own unpaid orders, or wait until it is finished or cancelled to pay the full table.",
        );
  const activePaymentScopeLocked =
    !paymentInitiated &&
    pendingPaymentOverlapsScope(
      pendingBillPayment,
      activePaymentScope,
      activeCheckoutOrderIds,
    );
  const fullTableOptionLocked = !paymentInitiated && !!pendingBillPayment;
  const myOrdersOptionLocked =
    !paymentInitiated && pendingBillPayment?.scope === "FULL_TABLE";
  useEffect(() => {
    setPaymentScope("MY_ORDERS");
  }, [sessionToken, ownedOrderKey]);

  useEffect(() => {
    if (
      canPayOwnedOrders &&
      paymentScope === "FULL_TABLE" &&
      fullTableOptionLocked &&
      !myOrdersOptionLocked
    ) {
      setPaymentScope("MY_ORDERS");
    }
  }, [
    canPayOwnedOrders,
    fullTableOptionLocked,
    myOrdersOptionLocked,
    paymentScope,
  ]);

  const handleContinueToPayment = async () => {
    if (activePaymentScopeLocked) {
      setError(
        ownPendingCashRequest
          ? t(
              "payment.cashRequestAlreadyPending",
              "Your cash request is already waiting for staff.",
            )
          : pendingBillMessage,
      );
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let boricaCardholder: BoricaCardholderDetails | undefined;
      if (effectiveProvider === "BORICA") {
        const cardholderName = boricaCardholderName.trim();
        const email = boricaEmail.trim();
        const phone = boricaPhone.trim();
        const billingAddress = boricaBillingAddress.trim();

        if (!cardholderName || !email || !billingAddress) {
          setError(
            t(
              "payment.boricaDetailsRequired",
              "Enter cardholder name, email, and billing address.",
            ),
          );
          return;
        }

        if (!boricaNamePattern.test(cardholderName)) {
          setError(
            t(
              "payment.boricaNameInvalid",
              "Use Latin letters for the BORICA cardholder name.",
            ),
          );
          return;
        }

        boricaCardholder = {
          cardholderName,
          email,
          phone,
          billingAddress,
        };
      }

      const result = await createCheckout(sessionToken, {
        provider: effectiveProvider,
        tipPercent: activeTipPercent,
        ...(boricaCardholder ? { boricaCardholder } : {}),
        ...(activeCheckoutOrderIds?.length
          ? { orderIds: activeCheckoutOrderIds }
          : {}),
      });
      setPayment(result);
      setPaymentInitiated(true);
      setStep(
        result.provider === "EPAY" ||
          result.provider === "BORICA" ||
          result.provider === "MYPOS"
          ? "redirect"
          : "pay",
      );
    } catch (e: any) {
      setError(t(getApiError(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleCashPaymentRequest = async () => {
    if (!bill) return;
    if (activePaymentScopeLocked) {
      setCashError(
        ownPendingCashRequest
          ? t(
              "payment.cashRequestAlreadyPending",
              "Your cash request is already waiting for staff.",
            )
          : pendingBillMessage,
      );
      return;
    }
    if (!bill.restaurantId) {
      setCashError(
        t(
          "payment.cashRequestUnavailable",
          "Cash request is unavailable for this bill.",
        ),
      );
      return;
    }

    setCashRequesting(true);
    setCashError(null);
    try {
      const request = await createCashPaymentRequest(sessionToken, {
        restaurantId: bill.restaurantId,
        ...(activeCheckoutOrderIds?.length
          ? { orderIds: activeCheckoutOrderIds }
          : {}),
      });
      setCashRequestId(request.id);
      onCashRequestCreated?.(request.id);
      setCashRequested(true);
    } catch (e: any) {
      setCashError(t(getApiError(e)));
    } finally {
      setCashRequesting(false);
    }
  };

  const handleClose = () => {
    if (paymentInitiated) {
      abandonCheckout(sessionToken).catch(() => {});
    }
    try {
      sessionStorage.removeItem(hostedCheckoutStorageKey(sessionToken));
    } catch {}
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 overflow-hidden">
      <div className="bg-card text-card-foreground rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 shadow-2xl flex flex-col gap-4 max-h-[90dvh] overflow-x-hidden">
        <div className="flex items-center justify-between flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {step === "tip" && t("payment.yourBill", "Your Bill")}
            {step === "pay" && t("payment.payment", "Payment")}
            {step === "redirect" && t("payment.redirecting", "Redirecting")}
            {step === "done" && t("payment.thankYou", "Thank You")}
          </h2>
          {/* When payment is done, X clears the session (same as "Back to Menu") */}
          <button
            onClick={step === "done" ? completeFromLiveSettlement : handleClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={20} />
          </button>
        </div>

        {/* Fix H-8 — bill load failure: visible error + retry, modal stays open */}
        {step === "tip" && billError && (
          <div className="space-y-4">
            <p className="text-red-500 text-sm">{billError}</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button type="button" className="flex-1" onClick={retryBillFetch}>
                {t("common.retry", "Retry")}
              </Button>
            </div>
          </div>
        )}

        {step === "tip" && !bill && !billError && (
          <p className="text-sm text-muted-foreground py-4">
            {t("payment.loading", "Loading...")}
          </p>
        )}

        {step === "tip" && bill && (
          <>
            <div className="space-y-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0">
              {canPayOwnedOrders && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentScope("MY_ORDERS")}
                    disabled={myOrdersOptionLocked}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      activePaymentScope === "MY_ORDERS"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <ReceiptText className="h-4 w-4" />
                    {t("payment.myOrders", "My orders")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentScope("FULL_TABLE")}
                    disabled={fullTableOptionLocked}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      activePaymentScope === "FULL_TABLE"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <Users className="h-4 w-4" />
                    {t("payment.fullTable", "Full table")}
                  </button>
                </div>
              )}

              {pendingBillPayment &&
                !ownPendingCashRequest &&
                !paymentInitiated && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                    {pendingBillMessage}
                  </p>
                )}

              {/* Itemized order breakdown */}
              {displayedOrders && showGroupHeaders(displayedOrders) ? (
                <div className="mb-4 space-y-3">
                  {displayedOrders.map((order) => (
                    <div key={order.id}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        👤 {getCustomerFacingOrderSourceLabel(order, t)}
                      </p>
                      {order.items
                        .filter(
                          (item) => getBillItemRemainingQuantity(item) > 0,
                        )
                        .map((item) => (
                          <div
                            key={item.orderItemId}
                            className="flex justify-between text-xs py-0.5"
                          >
                            <span className="text-gray-700 min-w-0 mr-2">
                              {item.name} ×{getBillItemRemainingQuantity(item)}
                            </span>
                            <span className="text-gray-700 shrink-0 whitespace-nowrap">
                              {formatEuro(
                                getBillItemUnitPrice(item) *
                                  getBillItemRemainingQuantity(item),
                              )}
                            </span>
                          </div>
                        ))}
                    </div>
                  ))}
                  <hr className="border-gray-200" />
                </div>
              ) : displayedOrders && displayedOrders.length > 0 ? (
                <div className="mb-4 space-y-1">
                  {displayedOrders.flatMap((order) =>
                    order.items
                      .filter((item) => getBillItemRemainingQuantity(item) > 0)
                      .map((item) => (
                        <div
                          key={item.orderItemId}
                          className="flex justify-between text-xs py-0.5"
                        >
                          <span className="text-gray-700 min-w-0 mr-2">
                            {item.name} ×{getBillItemRemainingQuantity(item)}
                          </span>
                          <span className="text-gray-700 shrink-0 whitespace-nowrap">
                            {formatEuro(
                              getBillItemUnitPrice(item) *
                                getBillItemRemainingQuantity(item),
                            )}
                          </span>
                        </div>
                      )),
                  )}
                  <hr className="border-gray-200" />
                </div>
              ) : null}
              <div>
                <p className="text-2xl font-bold">
                  {formatEuro(activeSubtotal)}
                </p>
                <span className="text-xs text-muted-foreground">
                  {formatBgn(activeSubtotal)}
                </span>
              </div>

              {bill.tipsEnabled && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {t("payment.addTip", "Add a tip")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setSelectedTip(0);
                        setCustomTip("");
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === 0 && customTip === "" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                    >
                      {t("payment.noTip", "No tip")}
                    </button>
                    {bill.tipOptions.map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                          setSelectedTip(pct);
                          setCustomTip("");
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${selectedTip === pct && customTip === "" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {t("payment.custom", "Custom")}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={customTip}
                      onChange={(e) => {
                        setCustomTip(e.target.value);
                        setSelectedTip(0);
                      }}
                      placeholder="0"
                      className="w-16 px-2 py-1 border border-border rounded text-sm bg-background"
                    />
                    <span className="text-sm">%</span>
                  </div>
                  {activeTipPercent > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("payment.tipAmount", "Tip amount")}:{" "}
                      {formatEuro((activeSubtotal * activeTipPercent) / 100)}
                    </p>
                  )}
                </div>
              )}

              {availableProviders.length > 1 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {t("payment.paymentMethod", "Payment method")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {availableProviders.map((provider) => (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => setSelectedProvider(provider)}
                        disabled={activePaymentScopeLocked}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                          selectedProvider === provider
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {provider === "EPAY"
                          ? "ePay.bg"
                          : provider === "BORICA"
                            ? t("payment.cardBorica", "Card (BORICA)")
                            : provider === "MYPOS"
                              ? t("payment.cardMypos", "Card (myPOS)")
                              : t("payment.cardOnline", "Card online")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!hasPaymentProvider && (
                <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded-lg">
                  {t(
                    "payment.noProviders",
                    "Online payment is not configured for this restaurant.",
                  )}
                </p>
              )}

              {effectiveProvider === "BORICA" && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      {t("payment.boricaDetails", "Cardholder details")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "payment.boricaDetailsHelp",
                        "BORICA requires Latin cardholder details for 3-D Secure.",
                      )}
                    </p>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.boricaName", "Cardholder name (Latin)")}
                    </span>
                    <input
                      type="text"
                      value={boricaCardholderName}
                      onChange={(e) => setBoricaCardholderName(e.target.value)}
                      maxLength={45}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("payment.boricaEmail", "Email")}
                      </span>
                      <input
                        type="email"
                        value={boricaEmail}
                        onChange={(e) => setBoricaEmail(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("payment.boricaPhoneOptional", "Phone (optional)")}
                      </span>
                      <input
                        type="tel"
                        value={boricaPhone}
                        onChange={(e) => setBoricaPhone(e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.boricaBillingAddress", "Billing address")}
                    </span>
                    <input
                      type="text"
                      value={boricaBillingAddress}
                      onChange={(e) => setBoricaBillingAddress(e.target.value)}
                      maxLength={50}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}

              {error && <p className="text-red-500 text-sm">{error}</p>}
              {cashError && <p className="text-red-500 text-sm">{cashError}</p>}
              {cashRequested && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {t(
                    "payment.cashRequestSent",
                    "Staff has been asked to collect cash at your table.",
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-shrink-0 flex-col gap-2">
              <Button
                data-testid="payment-continue-button"
                className="w-full flex-shrink-0"
                onClick={handleContinueToPayment}
                disabled={
                  loading || !hasPaymentProvider || activePaymentScopeLocked
                }
              >
                {loading
                  ? t("payment.loading", "Loading...")
                  : effectiveProvider === "EPAY"
                    ? t("payment.continueToEpay", "Continue to ePay.bg")
                    : effectiveProvider === "BORICA"
                      ? t("payment.continueToBorica", "Pay by card (BORICA)")
                      : effectiveProvider === "MYPOS"
                        ? t("payment.continueToMypos", "Pay by card (myPOS)")
                        : t("payment.continue", "Continue")}
              </Button>
              {allowCashRequest && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full flex-shrink-0 gap-2"
                  onClick={handleCashPaymentRequest}
                  disabled={
                    cashRequesting || cashRequested || activePaymentScopeLocked
                  }
                >
                  <Banknote className="h-4 w-4" />
                  {cashRequesting
                    ? t("payment.requestingCash", "Asking staff...")
                    : cashRequested
                      ? t("payment.cashRequested", "Cash request sent")
                      : t("payment.payCashToWaiter", "Pay cash to waiter")}
                </Button>
              )}
            </div>
          </>
        )}

        {step === "pay" && payment?.provider === "STRIPE" && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: payment.clientSecret,
              appearance: { theme: "stripe" },
            }}
          >
            <PaymentForm
              clientSecret={payment.clientSecret}
              sessionToken={sessionToken}
              total={payment.total}
              tipAmount={payment.tipAmount}
              onSuccess={() => setStep("done")}
              onClose={handleClose}
            />
          </Elements>
        )}

        {step === "redirect" &&
          (payment?.provider === "EPAY" ||
            payment?.provider === "BORICA" ||
            payment?.provider === "MYPOS") && (
            <div className="space-y-4 py-4">
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between font-semibold text-foreground">
                  <span>{t("payment.total", "Total")}</span>
                  <div className="text-right">
                    <div>{formatEuro(payment.total)}</div>
                    <span className="text-xs text-muted-foreground">
                      {formatBgn(payment.total)}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {payment.provider === "BORICA"
                  ? t(
                      "payment.redirectingToBorica",
                      "Opening BORICA secure checkout...",
                    )
                  : payment.provider === "MYPOS"
                    ? t(
                        "payment.redirectingToMypos",
                        "Opening myPOS secure checkout...",
                      )
                    : t(
                        "payment.redirectingToEpay",
                        "Opening ePay.bg secure checkout...",
                      )}
              </p>
              <form
                ref={epayFormRef}
                action={payment.action}
                method={payment.method}
                onSubmit={() => {
                  try {
                    sessionStorage.setItem(
                      hostedCheckoutStorageKey(sessionToken),
                      JSON.stringify({
                        token: sessionToken,
                        provider: payment.provider,
                        paymentId: payment.paymentId,
                        startedAt: Date.now(),
                      }),
                    );
                  } catch {}
                }}
              >
                {Object.entries(payment.fields).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <Button type="submit" className="w-full">
                  {payment.provider === "BORICA"
                    ? t("payment.openBorica", "Open BORICA checkout")
                    : payment.provider === "MYPOS"
                      ? t("payment.openMypos", "Open myPOS checkout")
                      : t("payment.openEpay", "Open ePay.bg")}
                </Button>
              </form>
            </div>
          )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 size={48} className="text-green-500" />
            <p className="text-lg font-medium">
              {t("payment.paymentReceived", "Payment received successfully")}
            </p>
            <div>
              <p className="text-2xl font-bold">
                {formatEuro(payment?.total ?? 0)}
              </p>
              <span className="text-xs text-muted-foreground">
                {formatBgn(payment?.total ?? 0)}
              </span>
            </div>
            <Button className="w-full" onClick={completeFromLiveSettlement}>
              {t("payment.backToMenu", "Back to Menu")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
