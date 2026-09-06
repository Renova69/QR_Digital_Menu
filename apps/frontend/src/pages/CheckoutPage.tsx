import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart, type SelectedOption } from "../context/CartContext";
import api, {
  createOrder,
  abandonCheckout,
  getMenu,
  getSessionBill,
  type FulfillmentMode,
  type SessionBill,
  type ServicePointPaymentMethod,
} from "../lib/api";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Zap, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerLoginModal } from "../components/auth/CustomerLoginModal";
import { PaymentModal } from "../components/payment/PaymentModal";
import { formatEuro } from "../lib/currency";
import { getCustomerFacingOrderSourceLabel } from "../lib/orderSourceLabel";
import { Toggle } from "../components/ui/Toggle";
import type { FeatureFlag } from "../hooks/useFeature";
import { isHappyHourActive } from "../lib/happyHour";
import { rememberOwnedOrder } from "../lib/publicOrderOwnership";
import { buildMenuReturnUrl } from "../lib/menuUrl";
import {
  resolveCartChoiceName,
  resolveCartItemName,
} from "../lib/cartTranslation";
import { resolveInitialLanguage } from "../lib/menuLanguage";
import {
  buildTableSessionCheckoutUrl,
  findHostedCheckoutMarker,
  findHostedCheckoutToken,
  hostedCheckoutStorageKey,
  readTableSessionTokenFromHash,
} from "../lib/tableSessionCredential";
import {
  formatLoyaltyExpiryDate,
  groupExpiringPointBatches,
} from "../lib/loyaltyExpiry";
import { cn } from "../lib/utils";
import { storePaymentConfirmationContext } from "../lib/paymentConfirmationContext";
import {
  clearOrderIdempotencyKey,
  getOrCreateOrderIdempotencyKey,
} from "../lib/orderIdempotency";

type FieldState = "neutral" | "valid" | "invalid";

const FIELD_FEEDBACK_CLASSES: Record<FieldState, string> = {
  neutral: "",
  valid:
    "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500/40",
  invalid: "border-red-500 focus:border-red-500 focus:ring-red-500/40",
};

// Cart selections retain translations for localised display. The order command
// sends only the DTO fields; the backend resolves and snapshots authoritative
// option names and prices from the menu.
const toOrderSelectedOption = ({
  optionId,
  optionName,
  choiceName,
  priceModifier,
}: SelectedOption) => ({
  optionId,
  optionName,
  choiceName,
  priceModifier,
});

const PAYMENT_PARTNERS = [
  {
    key: "visa",
    labelKey: "checkout.paymentTrust.visa",
    fallback: "Visa",
    className: "text-blue-700 italic",
  },
  {
    key: "mastercard",
    labelKey: "checkout.paymentTrust.mastercard",
    fallback: "Mastercard",
    className: "",
  },
] as const;

function getFieldState(hasSignal: boolean, isValid: boolean): FieldState {
  if (!hasSignal) return "neutral";
  return isValid ? "valid" : "invalid";
}

function PaymentPartnerMark({
  partner,
}: {
  partner: (typeof PAYMENT_PARTNERS)[number];
}) {
  const { t } = useTranslation();
  const label = t(partner.labelKey, partner.fallback);

  if (partner.key === "mastercard") {
    return (
      <span
        aria-label={label}
        title={label}
        className="flex min-h-[36px] items-center justify-center rounded-lg border border-border bg-card px-2 shadow-sm"
        role="img"
      >
        <span className="flex -space-x-2" aria-hidden="true">
          <span className="h-5 w-5 rounded-full bg-red-500" />
          <span className="h-5 w-5 rounded-full bg-amber-400 mix-blend-multiply" />
        </span>
      </span>
    );
  }

  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "flex min-h-[36px] items-center justify-center rounded-lg border border-border bg-card px-2 text-center text-sm font-black uppercase tracking-wide shadow-sm",
        partner.className,
      )}
      role="img"
    >
      {label}
    </span>
  );
}

function PaymentTrustGrid() {
  const { t } = useTranslation();

  return (
    <div className="rounded-2xl border border-border/70 bg-background/45 p-3">
      <p className="mb-2 flex items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        {t("checkout.paymentTrust.secure", "Secure checkout supported by")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PAYMENT_PARTNERS.map((partner) => (
          <PaymentPartnerMark key={partner.key} partner={partner} />
        ))}
      </div>
    </div>
  );
}

const CheckoutPage = () => {
  const { user } = useAuth();
  const { items, tableNumber, tableToken, orderLocation, getTotal, clearCart } =
    useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const restaurantId = location.state?.restaurantId;
  const tier = location.state?.tier as string | undefined;
  const features = Array.isArray(location.state?.features)
    ? (location.state.features as FeatureFlag[])
    : [];
  const themeVars = (location.state?.themeVars ?? {}) as React.CSSProperties;
  const paymentsEnabled = Boolean(location.state?.paymentsEnabled);
  // A customer paying via the POS Payment QR can switch the bill language with
  // the in-page selector; that override wins over the deep-link / browser guess.
  const [billLangOverride, setBillLangOverride] = useState<string | null>(null);
  const selectedLang = String(
    (billLangOverride ??
      location.state?.selectedLang ??
      searchParams.get("lang") ??
      i18n.resolvedLanguage) ||
      "bg",
  )
    .toLowerCase()
    .split("-")[0];
  const customersAuthEnabled = features.includes("customers:auth");

  useEffect(() => {
    if (i18n.resolvedLanguage !== selectedLang) {
      void i18n.changeLanguage(selectedLang);
    }
  }, [i18n, selectedLang]);

  // Fetch menu with selected lang so item/choice names are translated.
  const { data: menuData } = useQuery({
    queryKey: ["checkout-menu", restaurantId, selectedLang],
    queryFn: () => getMenu(restaurantId, selectedLang),
    enabled: !!restaurantId && !!selectedLang,
    staleTime: 5 * 60 * 1000,
  });
  const menuCategories = menuData?.categories;

  // ── Session-based checkout (POS Payment QR) ──
  // M-PAY-1: the POS payment credential arrives in the URL fragment, which is
  // client-only and never reaches Vercel/Cloud Run request logs or Referer.
  const [sessionToken, setSessionToken] = useState<string | null>(
    () =>
      readTableSessionTokenFromHash(location.hash) ??
      findHostedCheckoutToken(window.sessionStorage),
  );
  const isSessionFlow = !!sessionToken;
  const [sessionBill, setSessionBill] = useState<SessionBill | null>(null);
  const [sessionBillLoading, setSessionBillLoading] = useState(false);
  const [sessionBillError, setSessionBillError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [allowCashRequest, setAllowCashRequest] = useState(
    location.state?.autoOpenPayment !== true,
  );
  const autoOpenPaymentRef = useRef(location.state?.autoOpenPayment === true);

  useEffect(() => {
    if (!sessionToken || !autoOpenPaymentRef.current) return;
    autoOpenPaymentRef.current = false;
    setPaymentModalOpen(true);
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    const hostedOutcome = searchParams.get("payment");
    const stripeOutcome = searchParams.get("redirect_status");
    const succeeded =
      hostedOutcome === "borica-ok" ||
      hostedOutcome === "epay-ok" ||
      hostedOutcome === "mypos-ok" ||
      stripeOutcome === "succeeded";
    const failed =
      hostedOutcome === "borica-cancel" ||
      hostedOutcome === "epay-cancel" ||
      hostedOutcome === "mypos-cancel" ||
      stripeOutcome === "failed" ||
      stripeOutcome === "requires_payment_method";

    if (!succeeded && !failed) return;

    const marker = findHostedCheckoutMarker(window.sessionStorage);
    if (!marker || marker.token !== sessionToken) return;

    try {
      sessionStorage.removeItem(hostedCheckoutStorageKey(sessionToken));
    } catch {}

    if (succeeded && marker.paymentId) {
      storePaymentConfirmationContext({
        paymentId: marker.paymentId,
        sessionToken,
        ...(typeof marker.total === "number" ? { amount: marker.total } : {}),
        ...(marker.provider ? { provider: marker.provider } : {}),
        ...(marker.restaurantId ? { restaurantId: marker.restaurantId } : {}),
        menuReturnUrl:
          marker.menuReturnUrl ??
          buildMenuReturnUrl(marker.restaurantId, marker.tableNumber),
        ...(marker.tableNumber ? { tableNumber: marker.tableNumber } : {}),
        completedAt: Date.now(),
      });
      navigate("/payment-confirmation", { replace: true });
      return;
    }

    if (failed) {
      void abandonCheckout(sessionToken).catch(() => {});
      const cleanParams = new URLSearchParams(location.search);
      cleanParams.delete("payment");
      cleanParams.delete("payment_intent");
      cleanParams.delete("payment_intent_client_secret");
      cleanParams.delete("redirect_status");
      navigate(
        `${location.pathname}${
          cleanParams.toString() ? `?${cleanParams.toString()}` : ""
        }`,
        { replace: true },
      );
    }
  }, [
    location.pathname,
    location.search,
    navigate,
    searchParams,
    sessionToken,
  ]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    setSessionBillLoading(true);
    setSessionBillError(null);
    getSessionBill(sessionToken, selectedLang)
      .then((bill) => {
        if (!cancelled) setSessionBill(bill);
      })
      .catch(() => {
        if (!cancelled) {
          setSessionBillError(
            t(
              "payment.billLoadError",
              "Could not load bill — please try again",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSessionBillLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, selectedLang, t]);

  useEffect(() => {
    if (!isSessionFlow || !sessionBill?.targetLanguages?.length) return;
    const resolved = resolveInitialLanguage(
      sessionBill.targetLanguages,
      selectedLang,
    );
    const normalized = resolved?.toLowerCase().split("-")[0];
    if (normalized && normalized !== selectedLang) {
      setBillLangOverride(normalized);
    }
  }, [isSessionFlow, selectedLang, sessionBill?.targetLanguages]);

  const openPayment = () => setPaymentModalOpen(true);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [fulfillmentType, setFulfillmentType] =
    useState<FulfillmentMode | null>(null);
  const [paymentPreference, setPaymentPreference] =
    useState<ServicePointPaymentMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetCartAction, setShowResetCartAction] = useState(false);
  const [touchedFields, setTouchedFields] = useState({
    name: false,
    phone: false,
  });

  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(0);
  // Fix C-3 — track redemption per cart ENTRY (cartId), not per product (item.id).
  // Two cart lines for the same product must be redeemable independently.
  const [redeemedCartIds, setRedeemedCartIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // Fix M-4 — scope the "not enough points" message to the specific cart entry.
  const [notEnoughPointsItemId, setNotEnoughPointsItemId] = useState<
    string | null
  >(null);
  const [loyaltyLoadFailed, setLoyaltyLoadFailed] = useState(false);

  // Gamification helpers — config comes from enroll() or getPublicConfig() API
  const restaurantConfig = loyaltyData?.restaurantConfig || loyaltyData;
  const exchangeRate = restaurantConfig?.loyaltyExchangeRate || 10;
  const effectiveRedeemRate = restaurantConfig?.loyaltyRedeemRate || 150;
  const maxRedemptionPercent =
    restaurantConfig?.loyaltyMaxRedemptionPercent ?? 15;
  const loyaltyTimeZone = restaurantConfig?.timezone || "UTC";
  const expiryBatches =
    loyaltyData?.expiringSoon?.length > 0
      ? loyaltyData.expiringSoon
      : loyaltyData?.expiringSoonPoints > 0 && loyaltyData?.nextExpirationAt
        ? [
            {
              points: loyaltyData.expiringSoonPoints,
              value: loyaltyData.expiringSoonValue,
              expiresAt: loyaltyData.nextExpirationAt,
            },
          ]
        : [];
  const expiringPointGroups = groupExpiringPointBatches(
    expiryBatches,
    effectiveRedeemRate,
    loyaltyTimeZone,
  );
  const loyaltyLocale = i18n.resolvedLanguage || i18n.language || "en";
  const isServicePointOrder = !!orderLocation && orderLocation.type !== "TABLE";
  const orderLocationKey =
    tableNumber ?? (orderLocation?.token ? `sp-${orderLocation.token}` : null);
  const sessionStorageKey =
    restaurantId && orderLocationKey
      ? `session-${restaurantId}-${orderLocationKey}`
      : null;
  const customerNameStorageKey =
    restaurantId && orderLocationKey
      ? `customerName-${restaurantId}-${orderLocationKey}`
      : null;
  const fulfillmentOptions = isServicePointOrder
    ? orderLocation.fulfillmentModes
    : [];
  // The service-point resolve API (resolvePublicServicePoint) already strips
  // ONLINE from paymentMethods when no provider is configured, so trust it
  // directly — no redundant client-side paymentsEnabled gate.
  const paymentOptions = isServicePointOrder
    ? orderLocation.paymentMethods
    : [];
  const fulfillmentOptionsKey = fulfillmentOptions.join("|");
  const paymentOptionsKey = paymentOptions.join("|");
  const showPaymentTrust =
    paymentsEnabled ||
    paymentPreference === "ONLINE" ||
    paymentOptions.includes("ONLINE");
  const locationDisplayLabel =
    tableNumber ?? orderLocation?.label ?? t("checkout.notSpecified");
  const menuReturnUrl = buildMenuReturnUrl(
    restaurantId,
    tableNumber,
    orderLocation?.token,
  );
  const locationTypeLabel = tableNumber
    ? t("checkout.table")
    : orderLocation?.type === "ROOM"
      ? t("servicePoints.types.room", "Room")
      : orderLocation?.type === "PICKUP"
        ? t("servicePoints.types.pickup", "Pickup")
        : t("servicePoints.types.location", "Location");

  const hhMultiplier = isHappyHourActive(restaurantConfig)
    ? restaurantConfig?.happyHourMultiplier || 2.0
    : 1;

  // Tier multiplier comes from the API (backend is the single source of truth
  // for thresholds). Falls back to 1.0 for unauthenticated / pre-load state.
  const tierMultiplier: number = loyaltyData?.tierMultiplier ?? 1.0;
  const finalMultiplier = Math.max(hhMultiplier, tierMultiplier);

  const getItemsPointsCost = () => {
    return items.reduce((sum, item) => {
      if (redeemedCartIds.has(item.cartId) && item.rewardPointsPrice) {
        return sum + item.rewardPointsPrice * item.quantity;
      }
      return sum;
    }, 0);
  };

  const getAvailableLoyaltyPoints = () =>
    Math.max(loyaltyPoints - getItemsPointsCost(), 0);

  const getAvailableRewardValue = () =>
    getAvailableLoyaltyPoints() / effectiveRedeemRate;

  useEffect(() => {
    if (!isServicePointOrder) {
      setFulfillmentType(null);
      return;
    }
    setFulfillmentType(
      fulfillmentOptions.length === 1 ? fulfillmentOptions[0] : null,
    );
  }, [fulfillmentOptionsKey, isServicePointOrder, orderLocation?.token]);

  useEffect(() => {
    if (!isServicePointOrder) {
      setPaymentPreference(null);
      return;
    }
    setPaymentPreference(
      paymentOptions.length === 1 ? paymentOptions[0] : null,
    );
  }, [isServicePointOrder, orderLocation?.token, paymentOptionsKey]);

  // Fix H-6 — this is an APPROXIMATE client-side preview only. The backend
  // recalculates and caps the requested points from DB prices, DB balance,
  // redeem rate, and the owner-configured policy.
  // Fix H-10 — CartContext removes redeemed base prices while retaining paid
  // modifiers, matching the server-authoritative order calculation.
  const getMaximumDiscountPoints = () => {
    const availablePoints = getAvailableLoyaltyPoints();
    const maxDiscount =
      getTotal(redeemedCartIds) * (maxRedemptionPercent / 100);
    const maxDiscountPoints = Math.floor(maxDiscount * effectiveRedeemRate);
    const computed = Math.min(availablePoints, maxDiscountPoints);
    return Math.min(computed, loyaltyPoints);
  };

  const getEstimatedDiscountPoints = () => {
    if (!usePoints) return 0;
    return Math.min(redeemPoints, getMaximumDiscountPoints());
  };

  const getEstimatedPointsDiscount = () =>
    getEstimatedDiscountPoints() / effectiveRedeemRate;

  const handleUsePointsChange = (enabled: boolean) => {
    setUsePoints(enabled);
    setRedeemPoints(enabled ? getMaximumDiscountPoints() : 0);
  };

  const customerNameTrimmed = customerName.trim();
  const customerPhoneTrimmed = customerPhone.trim();
  const phoneDigits = customerPhoneTrimmed.replace(/\D/g, "");
  const isCustomerNameValid =
    customerNameTrimmed.length === 0 || customerNameTrimmed.length >= 2;
  const isCustomerPhoneValid =
    customerPhoneTrimmed.length === 0 ||
    (/^\+?[0-9\s().-]{7,20}$/.test(customerPhoneTrimmed) &&
      phoneDigits.length >= 7);
  const nameFieldState = getFieldState(
    touchedFields.name || customerNameTrimmed.length > 0,
    isCustomerNameValid,
  );
  const phoneFieldState = getFieldState(
    touchedFields.phone || customerPhoneTrimmed.length > 0,
    isCustomerPhoneValid,
  );
  const orderTotalBeforeSavings = getTotal();
  const orderTotalAfterSavings =
    getTotal(redeemedCartIds) - getEstimatedPointsDiscount();
  const checkoutSavings = Math.max(
    orderTotalBeforeSavings - orderTotalAfterSavings,
    0,
  );
  const submitLabel = submitting
    ? t("checkout.submitting")
    : checkoutSavings > 0
      ? t("checkout.placeOrderWithSavings", {
          defaultValue: "Place order — save {{amount}} on this bundle!",
          amount: formatEuro(checkoutSavings),
        })
      : t("checkout.placeOrder", "Place my order now");

  useEffect(() => {
    if (!restaurantId) return;

    // M-FE-1: abort + ignore-if-stale — without this, a slower request for a
    // previous restaurant/user can resolve after a newer one and overwrite
    // current loyalty state.
    const controller = new AbortController();
    const request = user
      ? api.post(`/loyalty/${restaurantId}/enroll`, undefined, {
          signal: controller.signal,
        })
      : api.get(`/loyalty/${restaurantId}/config`, {
          signal: controller.signal,
        });

    setLoyaltyLoadFailed(false);
    request
      .then((res) => {
        setLoyaltyData(res.data);
        setLoyaltyPoints(res.data.points || 0);
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // superseded by a newer request
        // Surface the failure (#F6) — otherwise the loyalty panel just silently
        // vanishes and a logged-in customer thinks they have no points.
        console.error("[CheckoutPage] Failed to load loyalty data:", err);
        setLoyaltyLoadFailed(true);
      });

    return () => controller.abort();
    // Fix M-6 — depend on the stable user id, not the user object reference,
    // so the enrollment POST does not re-fire on unrelated AuthContext renders.
  }, [user?.id, restaurantId]);

  // Pre-fill name if user is logged in
  useEffect(() => {
    if (user && !customerName) {
      setCustomerName(
        user.name || (user.email ? user.email.split("@")[0] : ""),
      );
    }
  }, [user, customerName]);

  // Pre-fill name for returning anonymous customers from the same table-session.
  // Persisted on submit below; the customer can still override it (e.g. ordering
  // for someone else). Runs once when the table/restaurant context is known.
  const namePrefilledRef = useRef(false);
  useEffect(() => {
    if (namePrefilledRef.current || user) return;
    if (!customerNameStorageKey) return;
    const saved = localStorage.getItem(customerNameStorageKey);
    if (saved) setCustomerName(saved);
    namePrefilledRef.current = true;
  }, [customerNameStorageKey, user]);

  // Redirect if no items in cart — skip when order was just submitted,
  // or when viewing a POS session bill (Payment QR flow).
  const orderPlaced = useRef(false);
  useEffect(() => {
    if (isSessionFlow) return;
    if (items.length === 0 && !orderPlaced.current) {
      navigate(-1); // Go back to the menu
    }
  }, [items, navigate, isSessionFlow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Hard re-entry guard (#F7) — the disabled button covers normal use, but a
    // double click within the same render frame could otherwise create two
    // orders (the backend has no order idempotency).
    if (submitting) return;

    if (!tableNumber && !orderLocation) {
      setError(t("checkout.tableRequired"));
      return;
    }

    if (
      isServicePointOrder &&
      fulfillmentOptions.length > 0 &&
      !fulfillmentType
    ) {
      setError(
        t(
          "servicePoints.checkout.fulfillmentRequired",
          "Choose how to receive the order.",
        ),
      );
      return;
    }

    if (isServicePointOrder && paymentOptions.length === 0) {
      setError(
        t(
          "servicePoints.checkout.noPaymentMethods",
          "No payment method is currently available for this order.",
        ),
      );
      return;
    }

    if (isServicePointOrder && !paymentPreference) {
      setError(
        t("servicePoints.checkout.paymentRequired", "Choose a payment method."),
      );
      return;
    }

    setTouchedFields({ name: true, phone: true });

    const orderData: any = {
      customerName,
      customerPhone,
      tableId: tableNumber ?? undefined,
      // P0-2: the table's publicToken is what actually authorises opening or
      // joining this table's session; tableId above is only the display name.
      tableToken: tableToken ?? undefined,
      servicePointToken: orderLocation?.token ?? undefined,
      fulfillmentType: isServicePointOrder
        ? (fulfillmentType ?? undefined)
        : undefined,
      paymentPreference: isServicePointOrder
        ? (paymentPreference ?? undefined)
        : undefined,
      // cartId is included on each line so the backend can match redeemCartIds
      // exactly — even when the same product appears twice with different options.
      items: items.map((item) => ({
        menuItemId: item.id,
        cartId: item.cartId,
        quantity: item.quantity,
        selectedOptions: (item.selectedOptions ?? []).map(
          toOrderSelectedOption,
        ),
      })),
      specialRequests,
      // Send the stable cartId-keyed set so the backend comps the specific line
      // the user chose, not just the first matching menuItemId.
      redeemCartIds: Array.from(redeemedCartIds),
      sessionToken: sessionStorageKey
        ? localStorage.getItem(sessionStorageKey) || undefined
        : undefined,
    };

    if (user?.role === "CUSTOMER") {
      orderData.customerId = user.id;
    }
    const selectedDiscountPoints = getEstimatedDiscountPoints();
    if (user && usePoints && selectedDiscountPoints > 0) {
      orderData.usePoints = true;
      orderData.redeemPoints = selectedDiscountPoints;
    }

    const idempotencyScope = `${restaurantId}:${orderLocationKey ?? tableNumber ?? "default"}`;
    const idempotencyKey = getOrCreateOrderIdempotencyKey(
      idempotencyScope,
      orderData,
    );

    try {
      setSubmitting(true);
      setError(null);

      const newOrder = await createOrder(orderData, idempotencyKey);
      clearOrderIdempotencyKey(idempotencyScope, idempotencyKey);

      if (newOrder.sessionToken && orderLocationKey && sessionStorageKey) {
        localStorage.setItem(sessionStorageKey, newOrder.sessionToken);
        rememberOwnedOrder(
          restaurantId,
          orderLocationKey,
          newOrder.sessionToken,
          newOrder.id,
        );
      }

      // Remember the name so a returning customer on this table is pre-filled.
      if (customerName.trim() && customerNameStorageKey) {
        localStorage.setItem(customerNameStorageKey, customerName.trim());
      }

      orderPlaced.current = true;
      clearCart();
      setShowResetCartAction(false);

      if (newOrder.status === "PENDING_PAYMENT" && newOrder.sessionToken) {
        const paymentUrl = new URL(
          buildTableSessionCheckoutUrl(
            window.location.origin,
            newOrder.sessionToken,
          ),
        );
        autoOpenPaymentRef.current = true;
        setAllowCashRequest(false);
        setSessionToken(newOrder.sessionToken);
        navigate(`${paymentUrl.pathname}${paymentUrl.hash}`, {
          replace: true,
          state: {
            ...location.state,
            menuReturnUrl,
            autoOpenPayment: true,
          },
        });
        return;
      }

      navigate("/order-confirmation", {
        state: {
          orderNumber: newOrder.id,
          orderId: newOrder.id,
          orderTrackToken: newOrder.orderTrackToken,
          restaurantId: newOrder.restaurantId,
          tableNumber: locationDisplayLabel,
          menuReturnUrl,
          tier,
          // Fix H-6 — the backend is authoritative for the loyalty discount.
          // Forward the actual points it redeemed (if present) so downstream
          // displays use the server value, not the client-side preview.
          pointsRedeemedForDiscount:
            newOrder.pointsRedeemedForDiscount ?? undefined,
        },
      });
    } catch (err: any) {
      console.error("[CheckoutPage] Order submission error:", err);
      if (err.response?.status === 404) {
        const backendMessage =
          typeof err.response?.data?.message === "string"
            ? err.response.data.message
            : null;
        const isTableNotFound = backendMessage
          ?.toLowerCase()
          .includes("table not found");
        setError(
          isTableNotFound
            ? t("checkout.tableNotFound")
            : t("checkout.itemNotFound"),
        );
        setShowResetCartAction(!isTableNotFound);
      } else if (err.response?.status === 409) {
        // Item-availability guard (staff 86'd it) or a payment-in-flight
        // conflict — surface the backend's specific message when available.
        const backendMessage =
          typeof err.response?.data?.message === "string"
            ? err.response.data.message
            : null;
        setError(
          backendMessage ||
            t("checkout.itemUnavailable", {
              defaultValue:
                "One of the items in your cart is no longer available.",
            }),
        );
        setShowResetCartAction(true);
      } else {
        setError(
          t("checkout.failedSubmit", {
            defaultValue: "Failed to submit order. Please try again.",
          }),
        );
        setShowResetCartAction(false);
      }
      setSubmitting(false);
    }
  };

  const getFulfillmentLabel = (mode: FulfillmentMode) => {
    if (mode === "ROOM_DELIVERY") {
      return t(
        "servicePoints.fulfillmentModes.roomDelivery",
        "Deliver to room",
      );
    }
    if (mode === "PICKUP") {
      return t(
        "servicePoints.fulfillmentModes.pickupCustomer",
        "I will pick it up",
      );
    }
    return t("servicePoints.fulfillmentModes.dineIn", "Dine in");
  };

  const getPaymentLabel = (method: ServicePointPaymentMethod) => {
    if (method === "ONLINE") {
      return t("servicePoints.paymentMethods.online", "Pay online");
    }
    if (method === "PAY_ON_DELIVERY") {
      return t("servicePoints.paymentMethods.payOnDelivery", "Pay on delivery");
    }
    if (method === "PAY_AT_PICKUP") {
      return t("servicePoints.paymentMethods.payAtPickup", "Pay at pickup");
    }
    return t("servicePoints.paymentMethods.cashCustomer", "Pay cash");
  };

  // ── Session bill view (POS Payment QR) ──────────────────────────────────
  if (isSessionFlow) {
    return (
      <div
        dir={i18n.dir(selectedLang)}
        className="min-h-screen premium-bg"
        style={themeVars}
      >
        <div
          className="max-w-2xl mx-auto px-4 pt-10 pb-24"
          style={{
            paddingBottom:
              "max(6rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))",
          }}
        >
          <h1 className="text-base font-extrabold text-foreground mb-8">
            {t("payment.yourBill", "Your Bill")}
          </h1>

          {(sessionBill?.targetLanguages?.length ?? 0) > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {sessionBill!.targetLanguages!.map((code) => {
                const active = code.toLowerCase() === selectedLang;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setBillLangOverride(code)}
                    aria-pressed={active}
                    className={`min-h-[44px] rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                      active
                        ? "bg-primary text-white"
                        : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                    }`}
                  >
                    {code.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}

          {sessionBillLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-3 border-primary border-t-transparent rounded-full" />
            </div>
          )}

          {sessionBillError && (
            <div className="glass-panel border-l-4 border-red-500 text-red-700 p-4 rounded-2xl mb-8">
              {sessionBillError}
            </div>
          )}

          {sessionBill && !sessionBillLoading && (
            <>
              <div className="glass-panel rounded-2xl p-5 mb-6">
                <h2 className="text-sm font-semibold text-muted-foreground mb-3">
                  {t("checkout.orderSummary", "Order Summary")}
                </h2>
                {sessionBill.orders?.map((order: any, oi: number) => (
                  <div key={order.id ?? oi} className="mb-4 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        {t("checkout.orderN", {
                          n: oi + 1,
                          defaultValue: "Order {{n}}",
                        })}
                        {" · "}
                        {getCustomerFacingOrderSourceLabel(order, t)}
                      </span>
                    </div>
                    {(order.items ?? []).map((it: any, ii: number) => (
                      <div
                        key={ii}
                        className="flex justify-between text-sm py-1.5 border-b border-border/20 last:border-b-0"
                      >
                        <span className="text-foreground">
                          {it.name}
                          {it.quantity > 1 && (
                            <span className="text-muted-foreground">
                              {" "}
                              ×{it.quantity}
                            </span>
                          )}
                        </span>
                        <span className="text-right leading-tight font-semibold text-foreground tabular-nums whitespace-nowrap">
                          <span className="block">
                            {formatEuro(
                              (it.unitPrice ?? 0) * (it.quantity ?? 1),
                            )}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="flex justify-between items-start mt-4 pt-3 border-t border-border">
                  <span className="text-base font-bold text-foreground">
                    {t("payment.total", "Total")}
                  </span>
                  <span className="text-right leading-tight whitespace-nowrap">
                    {/* Bill-level Total must reflect what's still owed, not
                        the original order total — on a partially-paid split
                        (another guest already paid part of the table), the
                        full subtotal overstates what this guest owes. */}
                    <span className="block text-base font-display font-bold text-foreground tabular-nums">
                      {formatEuro(
                        sessionBill.remaining ?? sessionBill.subtotal ?? 0,
                      )}
                    </span>
                  </span>
                </div>
                {sessionBill.paidSubtotal > 0 && (
                  <p className="mt-1 text-right text-sm text-muted-foreground">
                    {t("checkout.alreadyPaid", {
                      defaultValue: "{{amount}} already paid",
                      amount: formatEuro(sessionBill.paidSubtotal),
                    })}
                  </p>
                )}
              </div>

              {sessionBill.paymentProviders &&
              sessionBill.paymentProviders.length > 0 ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={openPayment}
                    className="w-full py-4 rounded-xl brand-cta text-white font-bold text-base min-h-[52px]"
                  >
                    {t("payment.pay", "Pay Now")} ·{" "}
                    {formatEuro(
                      sessionBill.remaining ?? sessionBill.subtotal ?? 0,
                    )}
                  </button>
                  <PaymentTrustGrid />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  {t(
                    "checkout.payAtCounter",
                    "Online payment isn't available — please pay your server or at the counter.",
                  )}
                </p>
              )}
            </>
          )}

          {paymentModalOpen && sessionToken && (
            <PaymentModal
              sessionToken={sessionToken}
              allowCashRequest={allowCashRequest}
              onClose={() => setPaymentModalOpen(false)}
              onSuccess={(completion) => {
                setPaymentModalOpen(false);
                const menuReturnUrl =
                  location.state?.menuReturnUrl ??
                  buildMenuReturnUrl(sessionBill?.restaurantId);
                storePaymentConfirmationContext({
                  paymentId: completion.paymentId,
                  sessionToken,
                  ...(typeof completion.amount === "number"
                    ? { amount: completion.amount }
                    : {}),
                  ...(completion.provider
                    ? { provider: completion.provider }
                    : {}),
                  ...(typeof completion.remaining === "number"
                    ? { remaining: completion.remaining }
                    : {}),
                  ...(sessionBill?.restaurantId
                    ? { restaurantId: sessionBill.restaurantId }
                    : {}),
                  menuReturnUrl,
                  ...(sessionBill?.tableName
                    ? { tableNumber: sessionBill.tableName }
                    : {}),
                  completedAt: Date.now(),
                });
                navigate("/payment-confirmation", { replace: true });
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      dir={i18n.dir(selectedLang)}
      className="min-h-screen premium-bg"
      style={themeVars}
    >
      <div
        className="max-w-2xl mx-auto px-4 pt-10 pb-24"
        style={{
          paddingBottom:
            "max(6rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))",
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="mb-4 flex min-h-[44px] items-center gap-2 text-muted-foreground hover:text-foreground font-semibold transition-colors"
        >
          {t("checkout.back")}
        </button>

        <h1 className="text-base font-extrabold text-foreground mb-8">
          {t("checkout.title")}
        </h1>

        {error && (
          <div className="glass-panel border-l-4 border-red-500 text-red-700 p-4 rounded-2xl mb-8 shadow-md">
            <p className="font-semibold">{error}</p>
            {showResetCartAction && (
              <button
                type="button"
                onClick={() => {
                  clearCart();
                  setError(null);
                  setShowResetCartAction(false);
                  navigate(-1);
                }}
                className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                {t("checkout.clearCartAndReturn", {
                  defaultValue: "Clear cart and return to menu",
                })}
              </button>
            )}
          </div>
        )}

        <div className="glass-panel p-5 md:p-8 rounded-[2rem] shadow-xl mb-5 border border-white/20">
          <h2 className="text-base font-bold mb-4 text-foreground">
            {t("checkout.orderSummary")}
          </h2>
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.cartId}
                className="flex justify-between items-start pb-3 border-b border-border/40 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-bold text-foreground text-base">
                    {resolveCartItemName(item, menuCategories, selectedLang)}{" "}
                    <span className="text-muted-foreground ml-2">
                      x{item.quantity}
                    </span>
                  </p>
                  {item.selectedOptions && item.selectedOptions.length > 0 && (
                    <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                      {item.selectedOptions.map((opt) => (
                        <li
                          key={`${opt.optionId}:${opt.choiceName}`}
                          className="flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50 block"></span>
                          {resolveCartChoiceName(
                            item.id,
                            opt,
                            menuCategories,
                            selectedLang,
                          )}{" "}
                          <span className="text-primary/80 font-semibold">
                            (+
                            {formatEuro(opt.priceModifier ?? 0)})
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.rewardPointsPrice && user && (
                    <>
                      <button
                        onClick={() => {
                          if (redeemedCartIds.has(item.cartId)) {
                            setRedeemedCartIds((prev) => {
                              const next = new Set(prev);
                              next.delete(item.cartId);
                              return next;
                            });
                          } else if (
                            loyaltyPoints - getItemsPointsCost() >=
                            (item.rewardPointsPrice ?? 0) * item.quantity
                          ) {
                            setRedeemedCartIds((prev) => {
                              const next = new Set(prev);
                              next.add(item.cartId);
                              return next;
                            });
                          } else {
                            setNotEnoughPointsItemId(item.cartId);
                            setTimeout(
                              () =>
                                setNotEnoughPointsItemId((cur) =>
                                  cur === item.cartId ? null : cur,
                                ),
                              3000,
                            );
                          }
                        }}
                        className={`mt-2 min-h-[44px] text-sm font-bold px-2 py-1 rounded-md transition-colors ${
                          redeemedCartIds.has(item.cartId)
                            ? "bg-primary text-white"
                            : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                        }`}
                      >
                        {redeemedCartIds.has(item.cartId)
                          ? t("checkout.redeemedFree")
                          : t("checkout.redeemForPts", {
                              pts:
                                (item.rewardPointsPrice ?? 0) * item.quantity,
                            })}
                      </button>
                      {notEnoughPointsItemId === item.cartId && (
                        <p className="text-red-500 text-sm mt-1">
                          {t("checkout.notEnoughPoints")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <p className="font-bold text-base text-foreground text-right leading-tight whitespace-nowrap">
                  {redeemedCartIds.has(item.cartId) ? (
                    <>
                      {t("checkout.free")}
                      {item.selectedOptions.reduce(
                        (sum, option) => sum + (option.priceModifier || 0),
                        0,
                      ) > 0 && (
                        <span className="block text-sm font-normal text-muted-foreground">
                          +
                          {formatEuro(
                            item.selectedOptions.reduce(
                              (sum, option) =>
                                sum + (option.priceModifier || 0),
                              0,
                            ) * item.quantity,
                          )}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="block">
                        {formatEuro(item.price * item.quantity)}
                      </span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-6 pt-6 border-t border-border flex justify-between font-extrabold text-base text-foreground">
            <span>{t("cart.total")}:</span>
            <div className="text-right whitespace-nowrap">
              <div>{formatEuro(getTotal(redeemedCartIds))}</div>
            </div>
          </div>

          {user && restaurantId && loyaltyLoadFailed && (
            <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
              {t("checkout.loyaltyLoadFailed", {
                defaultValue:
                  "Couldn't load your loyalty points right now — you can still place your order.",
              })}
            </div>
          )}

          {user && restaurantId && restaurantConfig?.isLoyaltyEnabled && (
            <div className="mt-6 pt-6 border-t border-border space-y-4">
              <div className="flex flex-col gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold text-primary">
                    {t("checkout.loyaltyPoints")}
                  </p>
                  <p className="text-sm text-primary/80">
                    {t("checkout.pointsAvailable", {
                      count: getAvailableLoyaltyPoints(),
                      value: getAvailableRewardValue().toFixed(2),
                    })}
                  </p>
                  {loyaltyData?.tier && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[11px] font-black shrink-0">
                        {loyaltyData.tier}
                      </span>
                      {loyaltyData.pointsToNextTier > 0 ? (
                        <>
                          <div className="h-1.5 min-w-[40px] flex-1 rounded-full bg-primary/15 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${Math.min(100, loyaltyData.tierProgressPercent)}%`,
                              }}
                            />
                          </div>
                          <span className="text-[10px] text-primary/70 shrink-0">
                            {t("checkout.tierProgressToNext", {
                              points: loyaltyData.pointsToNextTier,
                              tier: loyaltyData.nextTierName,
                            })}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-primary/70">
                          {t("checkout.tierProgressMaxTier", {
                            multiplier: loyaltyData.tierMultiplier,
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {getMaximumDiscountPoints() > 0 && (
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-bold text-foreground">
                      {t("checkout.redeemForDiscount")}
                    </span>
                    <Toggle
                      checked={usePoints}
                      onChange={handleUsePointsChange}
                      label={t("checkout.redeemForDiscount")}
                      size="sm"
                    />
                  </div>
                )}
              </div>

              {usePoints && getMaximumDiscountPoints() > 0 && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="checkout-redeem-points"
                        className="mb-1 block text-xs font-bold text-foreground"
                      >
                        {t("checkout.pointsToRedeem", {
                          defaultValue: "Points to use",
                        })}
                      </label>
                      <input
                        id="checkout-redeem-points"
                        aria-label={t("checkout.pointsToRedeem", {
                          defaultValue: "Points to use",
                        })}
                        type="number"
                        min={1}
                        max={getMaximumDiscountPoints()}
                        step={1}
                        value={getEstimatedDiscountPoints()}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          setRedeemPoints(
                            Math.max(
                              1,
                              Math.min(
                                Number.isFinite(next) ? Math.floor(next) : 1,
                                getMaximumDiscountPoints(),
                              ),
                            ),
                          );
                        }}
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRedeemPoints(getMaximumDiscountPoints())
                      }
                      className="h-10 shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/15"
                    >
                      {t("checkout.useMaximumPoints", {
                        defaultValue: "Use maximum",
                      })}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("checkout.redemptionSelectionSummary", {
                      defaultValue:
                        "{{points}} points = {{value}} discount (maximum {{max}} points)",
                      points: getEstimatedDiscountPoints(),
                      value: formatEuro(getEstimatedPointsDiscount()),
                      max: getMaximumDiscountPoints(),
                    })}
                  </p>
                </div>
              )}

              {loyaltyData?.expiringSoonPoints > 0 && (
                <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm">
                  <p className="font-bold text-yellow-600 dark:text-yellow-400">
                    {t("checkout.expiringSoon", {
                      value: formatEuro(loyaltyData.expiringSoonValue),
                    })}
                  </p>
                  <div className="mt-1 space-y-1">
                    {expiringPointGroups.map((group) => (
                      <p key={group.dateKey} className="text-muted-foreground">
                        {t("checkout.pointsExpire", {
                          points: group.points,
                          date: formatLoyaltyExpiryDate(
                            group.expiresAt,
                            loyaltyLocale,
                            loyaltyTimeZone,
                          ),
                        })}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {usePoints && loyaltyPoints - getItemsPointsCost() > 0 && (
                <div className="flex justify-between items-start font-bold text-base text-green-600">
                  <span>{t("checkout.discountApplied")}</span>
                  <span className="text-right leading-tight whitespace-nowrap">
                    <span className="block">
                      -{formatEuro(getEstimatedPointsDiscount())}
                    </span>
                  </span>
                </div>
              )}

              <div className="flex justify-between font-extrabold text-base text-foreground">
                <span>{t("checkout.finalTotal")}</span>
                <div className="text-right whitespace-nowrap">
                  <div>
                    {formatEuro(
                      getTotal(redeemedCartIds) - getEstimatedPointsDiscount(),
                    )}
                  </div>
                </div>
              </div>

              {isHappyHourActive(restaurantConfig) && (
                <div className="flex items-center gap-2 text-yellow-500 font-bold bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg justify-end">
                  <Zap className="mr-1 h-3.5 w-3.5" />
                  {t("checkout.happyHourBonus", { multiplier: hhMultiplier })}
                </div>
              )}

              <p className="text-sm text-muted-foreground text-right font-medium">
                {t("checkout.willEarn", {
                  pts: Math.floor(
                    (getTotal(redeemedCartIds) - getEstimatedPointsDiscount()) *
                      exchangeRate *
                      finalMultiplier,
                  ),
                })}
                {finalMultiplier > 1 && (
                  <span className="ml-1 text-sm text-primary/70">
                    ({finalMultiplier}
                    {t("auto.x", "x)")}
                  </span>
                )}
              </p>
            </div>
          )}

          {!user && restaurantConfig?.isLoyaltyEnabled && (
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-5 bg-primary/5 border border-primary/10 rounded-xl">
                <div>
                  <p className="font-bold text-foreground">
                    {t("checkout.earnFreeFood")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("checkout.signInToEarn")}
                  </p>
                </div>
                <Button
                  onClick={() => setIsLoginModalOpen(true)}
                  variant="outline"
                  className="shrink-0 rounded-xl border-primary text-primary hover:bg-primary/10"
                >
                  {t("checkout.signIn")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-panel p-5 md:p-8 rounded-[2rem] shadow-xl space-y-4 border border-white/20"
        >
          <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl mb-6">
            <p className="font-bold text-primary text-base flex items-center gap-2">
              <span className="bg-primary text-white px-2 py-0.5 rounded-md text-sm">
                {locationTypeLabel}
              </span>
              {locationDisplayLabel}
            </p>
          </div>

          {isServicePointOrder && fulfillmentOptions.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">
                {t(
                  "servicePoints.checkout.fulfillmentQuestion",
                  "Where should we send it?",
                )}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {fulfillmentOptions.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFulfillmentType(mode)}
                    className={`h-12 rounded-xl border px-3 text-sm font-black transition ${
                      fulfillmentType === mode
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {getFulfillmentLabel(mode)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isServicePointOrder && paymentOptions.length > 1 && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-foreground">
                {t(
                  "servicePoints.checkout.paymentQuestion",
                  "How would you like to pay?",
                )}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {paymentOptions.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentPreference(method)}
                    className={`h-12 rounded-xl border px-3 text-sm font-black transition ${
                      paymentPreference === method
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {getPaymentLabel(method)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isServicePointOrder && paymentOptions.length === 0 && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
              {t(
                "servicePoints.checkout.noPaymentMethods",
                "No payment method is currently available for this order.",
              )}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-bold text-foreground">
              {t("checkout.name")}{" "}
              <span className="text-muted-foreground font-normal ml-1">
                ({t("common.optional", "optional")})
              </span>
            </label>
            <Input
              id="name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onBlur={() =>
                setTouchedFields((prev) => ({ ...prev, name: true }))
              }
              aria-invalid={nameFieldState === "invalid"}
              className={cn(
                "h-12 rounded-xl",
                FIELD_FEEDBACK_CLASSES[nameFieldState],
              )}
            />
            {nameFieldState === "invalid" && (
              <p className="text-sm font-semibold text-red-500">
                {t(
                  "checkout.nameTooShort",
                  "Use at least 2 characters, or leave it blank.",
                )}
              </p>
            )}
            {nameFieldState === "valid" && customerNameTrimmed && (
              <p className="text-sm font-semibold text-emerald-600">
                {t(
                  "checkout.nameLooksGood",
                  "Great - we'll use this for your order.",
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="phone"
              className="text-sm font-bold text-foreground"
            >
              {t("checkout.phone")}{" "}
              <span className="text-muted-foreground font-normal ml-1">
                ({t("common.optional", "optional")})
              </span>
            </label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              onBlur={() =>
                setTouchedFields((prev) => ({ ...prev, phone: true }))
              }
              aria-invalid={phoneFieldState === "invalid"}
              className={cn(
                "h-12 rounded-xl",
                FIELD_FEEDBACK_CLASSES[phoneFieldState],
              )}
            />
            {phoneFieldState === "invalid" && (
              <p className="text-sm font-semibold text-red-500">
                {t(
                  "checkout.phoneInvalid",
                  "Enter a reachable phone number with at least 7 digits, or leave it blank.",
                )}
              </p>
            )}
            {phoneFieldState === "valid" && customerPhoneTrimmed && (
              <p className="text-sm font-semibold text-emerald-600">
                {t(
                  "checkout.phoneLooksGood",
                  "Looks good - staff can reach you if needed.",
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="requests"
              className="text-sm font-bold text-foreground"
            >
              {t("checkout.specialRequests")}{" "}
              <span className="text-muted-foreground font-normal ml-1">
                ({t("common.optional", "optional")})
              </span>
            </label>
            <Textarea
              id="requests"
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              placeholder={t("checkout.specialPlaceholder")}
              className="rounded-xl min-h-[100px] resize-none"
            />
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[56px] bg-foreground hover:bg-foreground/90 text-background font-bold py-4 px-6 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitLabel}
            </button>
            {showPaymentTrust && <PaymentTrustGrid />}
          </div>
        </form>

        {customersAuthEnabled && (
          <CustomerLoginModal
            isOpen={isLoginModalOpen}
            onClose={() => setIsLoginModalOpen(false)}
            returnTo={location.pathname + location.search}
          />
        )}
      </div>
    </div>
  );
};

export default CheckoutPage;
