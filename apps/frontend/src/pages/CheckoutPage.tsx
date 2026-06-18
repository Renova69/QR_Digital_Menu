import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import api, { createOrder, getSessionBill } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerLoginModal } from "../components/auth/CustomerLoginModal";
import { PaymentModal } from "../components/payment/PaymentModal";
import { formatInlineDual, formatEuro, formatBgn } from "../lib/currency";
import { Toggle } from "../components/ui/Toggle";
import type { FeatureFlag } from "../hooks/useFeature";
import { isHappyHourActive } from "../lib/happyHour";

const MAX_ORDER_DISCOUNT_RATE = 0.15;

const CheckoutPage = () => {
  const { user } = useAuth();
  const { items, tableNumber, getTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const restaurantId = location.state?.restaurantId;
  const tier = location.state?.tier as string | undefined;
  const features = Array.isArray(location.state?.features)
    ? (location.state.features as FeatureFlag[])
    : [];
  const customersAuthEnabled = features.includes('customers:auth');
  const { t } = useTranslation();

  // ── Session-based checkout (POS Payment QR) ──
  const sessionToken = searchParams.get("session");
  const isSessionFlow = !!sessionToken;
  const [sessionBill, setSessionBill] = useState<any>(null);
  const [sessionBillLoading, setSessionBillLoading] = useState(false);
  const [sessionBillError, setSessionBillError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    if (!sessionToken) return;
    setSessionBillLoading(true);
    setSessionBillError(null);
    getSessionBill(sessionToken)
      .then((bill) => setSessionBill(bill))
      .catch((err) =>
        setSessionBillError(
          err?.response?.data?.message ?? "Failed to load bill. The session may have expired.",
        ),
      )
      .finally(() => setSessionBillLoading(false));
  }, [sessionToken]);

  const openPayment = () => setPaymentModalOpen(true);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetCartAction, setShowResetCartAction] = useState(false);

  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  // Fix C-3 — track redemption per cart ENTRY (cartId), not per product (item.id).
  // Two cart lines for the same product must be redeemable independently.
  const [redeemedCartIds, setRedeemedCartIds] = useState<Set<string>>(new Set());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // Fix M-4 — scope the "not enough points" message to the specific cart entry.
  const [notEnoughPointsItemId, setNotEnoughPointsItemId] = useState<string | null>(null);
  const [loyaltyLoadFailed, setLoyaltyLoadFailed] = useState(false);

  // Gamification helpers — config comes from enroll() or getPublicConfig() API
  const restaurantConfig = loyaltyData?.restaurantConfig || loyaltyData;
  const exchangeRate = restaurantConfig?.loyaltyExchangeRate || 10;
  const effectiveRedeemRate = restaurantConfig?.loyaltyRedeemRate || 150;

  const hhMultiplier = isHappyHourActive(restaurantConfig)
    ? restaurantConfig?.happyHourMultiplier || 2.0
    : 1;

  // Tier multiplier comes from the API (backend is the single source of truth
  // for thresholds). Falls back to 1.0 for unauthenticated / pre-load state.
  const tierMultiplier: number = loyaltyData?.tierMultiplier ?? 1.0;
  const finalMultiplier = Math.max(hhMultiplier, tierMultiplier);

  const getItemsPointsCost = () => {
    return items.reduce((sum, item: any) => {
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

  // Fix H-6 — this is an APPROXIMATE client-side preview only. The backend
  // recalculates and caps the loyalty discount from DB prices and DB points.
  // The frontend never sends a discount amount.
  // Fix H-10 — cart total comes from CartContext.getTotal, excluding
  // fully-redeemed entries by cartId (no duplicated local calculation).
  const getEstimatedDiscountPoints = () => {
    if (!usePoints) return 0;
    const availablePoints = getAvailableLoyaltyPoints();
    const maxDiscount = getTotal(redeemedCartIds) * MAX_ORDER_DISCOUNT_RATE;
    const maxDiscountPoints = Math.floor(maxDiscount * effectiveRedeemRate);
    const computed = Math.min(availablePoints, maxDiscountPoints);
    return Math.min(computed, loyaltyPoints);
  };

  const getEstimatedPointsDiscount = () =>
    getEstimatedDiscountPoints() / effectiveRedeemRate;

  useEffect(() => {
    if (!restaurantId) return;

    const request = user
      ? api.post(`/loyalty/${restaurantId}/enroll`)
      : api.get(`/loyalty/${restaurantId}/config`);

    setLoyaltyLoadFailed(false);
    request
      .then((res) => {
        setLoyaltyData(res.data);
        setLoyaltyPoints(res.data.points || 0);
      })
      .catch((err) => {
        // Surface the failure (#F6) — otherwise the loyalty panel just silently
        // vanishes and a logged-in customer thinks they have no points.
        console.error("[CheckoutPage] Failed to load loyalty data:", err);
        setLoyaltyLoadFailed(true);
      });
    // Fix M-6 — depend on the stable user id, not the user object reference,
    // so the enrollment POST does not re-fire on unrelated AuthContext renders.
  }, [user?.id, restaurantId]);

  // Pre-fill name if user is logged in
  useEffect(() => {
    if (user && !customerName) {
      setCustomerName(user.name || (user.email ? user.email.split("@")[0] : ""));
    }
  }, [user, customerName]);

  // Pre-fill name for returning anonymous customers from the same table-session.
  // Persisted on submit below; the customer can still override it (e.g. ordering
  // for someone else). Runs once when the table/restaurant context is known.
  const namePrefilledRef = useRef(false);
  useEffect(() => {
    if (namePrefilledRef.current || user) return;
    if (!restaurantId || !tableNumber) return;
    const saved = localStorage.getItem(`customerName-${restaurantId}-${tableNumber}`);
    if (saved) setCustomerName(saved);
    namePrefilledRef.current = true;
  }, [user, restaurantId, tableNumber]);

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

    if (!tableNumber) {
      setError(t("checkout.tableRequired"));
      return;
    }

    const orderData: any = {
      customerName,
      customerPhone,
      tableId: tableNumber,
      // cartId is included on each line so the backend can match redeemCartIds
      // exactly — even when the same product appears twice with different options.
      items: items.map((item) => ({
        menuItemId: item.id,
        cartId: item.cartId,
        quantity: item.quantity,
        selectedOptions: item.selectedOptions,
      })),
      specialRequests,
      // Send the stable cartId-keyed set so the backend comps the specific line
      // the user chose, not just the first matching menuItemId.
      redeemCartIds: Array.from(redeemedCartIds),
      sessionToken:
        restaurantId && tableNumber
          ? localStorage.getItem(`session-${restaurantId}-${tableNumber}`) || undefined
          : undefined,
    };

    if (user && user.role === 'CUSTOMER') {
      orderData.customerId = user.id;
      if (usePoints) {
        orderData.usePoints = true;
      }
    }

    try {
      setSubmitting(true);
      setError(null);

      const newOrder = await createOrder(orderData);

      if (newOrder.sessionToken && tableNumber) {
        localStorage.setItem(`session-${restaurantId}-${tableNumber}`, newOrder.sessionToken);
      }

      // Remember the name so a returning customer on this table is pre-filled.
      if (customerName.trim() && restaurantId && tableNumber) {
        localStorage.setItem(`customerName-${restaurantId}-${tableNumber}`, customerName.trim());
      }

      orderPlaced.current = true;
      clearCart();
      setShowResetCartAction(false);

      navigate("/order-confirmation", {
        state: {
          orderNumber: newOrder.id,
          orderId: newOrder.id,
          orderTrackToken: newOrder.orderTrackToken,
          restaurantId: newOrder.restaurantId,
          tableNumber,
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
        setError(
          backendMessage ||
            t("checkout.itemNotFound", {
              defaultValue:
                "One or more items in your cart were not found. Please clear your cart and try again.",
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

  // ── Session bill view (POS Payment QR) ──────────────────────────────────
  if (isSessionFlow) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-24" style={{ paddingBottom: 'max(6rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))' }}>
        <h1 className="text-4xl font-extrabold text-foreground mb-8 tracking-tight">
          {t("checkout.yourBill", "Your Bill")}
        </h1>

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
                    <span className="text-xs text-muted-foreground">
                      {t("checkout.orderN", { n: oi + 1 })}
                      {order.customerName ? ` · ${order.customerName}` : ""}
                    </span>
                  </div>
                  {(order.items ?? []).map((oi: any, ii: number) => (
                    <div key={ii} className="flex justify-between text-sm py-1.5 border-b border-border/20 last:border-b-0">
                      <span className="text-foreground">
                        {oi.name}
                        {oi.quantity > 1 && <span className="text-muted-foreground"> ×{oi.quantity}</span>}
                      </span>
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatEuro((oi.unitPrice ?? 0) * (oi.quantity ?? 1))}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
                <span className="text-lg font-bold text-foreground">{t("checkout.total", "Total")}</span>
                <span className="text-2xl font-display font-bold text-foreground tabular-nums">
                  {formatEuro(sessionBill.subtotal)}
                </span>
              </div>
            </div>

            {sessionBill.paymentProviders && sessionBill.paymentProviders.length > 0 && (
              <button
                type="button"
                onClick={openPayment}
                className="w-full py-4 rounded-xl bg-brand-cta text-white font-bold text-lg min-h-[52px]"
              >
                {t("checkout.payNow", "Pay Now")} · {formatEuro(sessionBill.subtotal)}
              </button>
            )}
          </>
        )}

        {paymentModalOpen && sessionToken && (
          <PaymentModal
            sessionToken={sessionToken}
            onClose={() => setPaymentModalOpen(false)}
            onSuccess={() => {
              setPaymentModalOpen(false);
              window.location.reload();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-24" style={{ paddingBottom: 'max(6rem, calc(env(safe-area-inset-bottom, 0px) + 4rem))' }}>
      <button
        onClick={() => navigate(-1)}
        className="mb-8 text-muted-foreground hover:text-foreground font-semibold flex items-center gap-2 transition-colors"
      >
        {t("checkout.back")}
      </button>

      <h1 className="text-4xl font-extrabold text-foreground mb-8 tracking-tight">
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
              className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            >
              {t("checkout.clearCartAndReturn", {
                defaultValue: "Clear cart and return to menu",
              })}
            </button>
          )}
        </div>
      )}

      <div className="glass-panel p-5 md:p-8 rounded-[2rem] shadow-xl mb-8 border border-white/20">
        <h2 className="text-2xl font-bold mb-6 text-foreground">
          {t("checkout.orderSummary")}
        </h2>
        <ul className="space-y-4">
          {items.map((item) => (
            <li
              key={item.cartId}
              className="flex justify-between items-start pb-4 border-b border-border/40 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-bold text-foreground text-lg">
                  {item.name}{" "}
                  <span className="text-muted-foreground ml-2">
                    x{item.quantity}
                  </span>
                </p>
                {item.selectedOptions && item.selectedOptions.length > 0 && (
                  <ul className="text-sm text-muted-foreground mt-1 space-y-1">
                    {item.selectedOptions.map((opt) => (
                      <li
                        key={opt.choiceName}
                        className="flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50 block"></span>
                        {opt.choiceName}{" "}
                        <span className="text-primary/80 font-semibold">
                          (+{formatInlineDual(opt.priceModifier ?? 0, 'EUR')})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {(item as any).rewardPointsPrice && user && (
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
                          (item as any).rewardPointsPrice * item.quantity
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
                      className={`mt-2 text-xs font-bold px-2 py-1 rounded-md transition-colors ${
                        redeemedCartIds.has(item.cartId)
                          ? "bg-primary text-white"
                          : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                      }`}
                    >
                      {redeemedCartIds.has(item.cartId)
                        ? t('checkout.redeemedFree')
                        : t('checkout.redeemForPts', { pts: (item as any).rewardPointsPrice * item.quantity })}
                    </button>
                    {notEnoughPointsItemId === item.cartId && (
                      <p className="text-red-500 text-xs mt-1">{t('checkout.notEnoughPoints')}</p>
                    )}
                  </>
                )}
              </div>
              <p className="font-bold text-lg">
                {redeemedCartIds.has(item.cartId)
                  ? t('checkout.free')
                  : formatInlineDual(item.price * item.quantity, 'EUR')}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-6 border-t border-border flex justify-between font-extrabold text-2xl text-foreground">
          <span>{t("cart.total")}:</span>
          <div className="text-right">
            <div>{formatEuro(getTotal(redeemedCartIds))}</div>
            <span className="text-xs text-muted-foreground">{formatBgn(getTotal(redeemedCartIds))}</span>
          </div>
        </div>

        {user && restaurantId && loyaltyLoadFailed && (
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
            {t('checkout.loyaltyLoadFailed', {
              defaultValue: "Couldn't load your loyalty points right now — you can still place your order.",
            })}
          </div>
        )}

        {user &&
          restaurantId &&
          restaurantConfig?.isLoyaltyEnabled && (
            <div className="mt-6 pt-6 border-t border-border space-y-4">
              <div className="flex justify-between items-center p-4 bg-primary/10 border border-primary/20 rounded-xl">
                <div>
                  <p className="font-bold text-primary">{t('checkout.loyaltyPoints')}</p>
                  <p className="text-sm text-primary/80">
                    {t('checkout.pointsAvailable', {
                      count: getAvailableLoyaltyPoints(),
                      value: getAvailableRewardValue().toFixed(2)
                    })}
                  </p>
                </div>
                {loyaltyPoints - getItemsPointsCost() > 0 &&
                  getTotal(redeemedCartIds) > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-foreground">
                        {t('checkout.redeemForDiscount')}
                      </span>
                      <Toggle
                        checked={usePoints}
                        onChange={setUsePoints}
                        label={t('checkout.redeemForDiscount')}
                        size="sm"
                      />
                    </div>
                  )}
              </div>

              {loyaltyData?.expiringSoonPoints > 0 && (
                <div className="rounded-xl border border-yellow-500/25 bg-yellow-500/10 p-3 text-sm">
                  <p className="font-bold text-yellow-600 dark:text-yellow-400">
                    {t('checkout.expiringSoon', { value: loyaltyData.expiringSoonValue.toFixed(2) })}
                  </p>
                  <p className="text-muted-foreground">
                    {t('checkout.pointsExpire', {
                      points: loyaltyData.expiringSoonPoints,
                      date: loyaltyData.nextExpirationAt
                        ? new Date(loyaltyData.nextExpirationAt).toLocaleDateString()
                        : '',
                    })}
                  </p>
                </div>
              )}

              {usePoints && loyaltyPoints - getItemsPointsCost() > 0 && (
                <div className="flex justify-between font-bold text-lg text-green-600">
                  <span>{t('checkout.discountApplied')}</span>
                  <span>
                    -{formatEuro(getEstimatedPointsDiscount())}
                  </span>
                </div>
              )}

              <div className="flex justify-between font-extrabold text-3xl text-foreground">
                <span>{t('checkout.finalTotal')}</span>
                <div className="text-right">
                  <div>{formatEuro(getTotal(redeemedCartIds) - getEstimatedPointsDiscount())}</div>
                  <span className="text-xs text-muted-foreground">{formatBgn(getTotal(redeemedCartIds) - getEstimatedPointsDiscount())}</span>
                </div>
              </div>

              {isHappyHourActive(restaurantConfig) && (
                <div className="flex items-center gap-2 text-yellow-500 font-bold bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg justify-end">
                  <Zap className="mr-1 h-3.5 w-3.5" />{t('checkout.happyHourBonus', { multiplier: hhMultiplier })}
                </div>
              )}

              <p className="text-sm text-muted-foreground text-right font-medium">
                {t('checkout.willEarn', {
                  pts: Math.floor(
                    (getTotal(redeemedCartIds) - getEstimatedPointsDiscount()) * exchangeRate * finalMultiplier
                  )
                })}
                {finalMultiplier > 1 && (
                  <span className="ml-1 text-xs text-primary/70">
                    ({finalMultiplier}{t('auto.x', 'x)')}</span>
                )}
              </p>
            </div>
          )}

        {!user && restaurantConfig?.isLoyaltyEnabled && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-5 bg-primary/5 border border-primary/10 rounded-xl">
              <div>
                <p className="font-bold text-foreground">
                  {t('checkout.earnFreeFood')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('checkout.signInToEarn')}
                </p>
              </div>
              <Button
                onClick={() => setIsLoginModalOpen(true)}
                variant="outline"
                className="shrink-0 rounded-xl border-primary text-primary hover:bg-primary/10"
              >
                {t('checkout.signIn')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="glass-panel p-5 md:p-8 rounded-[2rem] shadow-xl space-y-6 border border-white/20"
      >
        <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl mb-8">
          <p className="font-bold text-primary text-lg flex items-center gap-2">
            <span className="bg-primary text-white px-2 py-0.5 rounded-md text-sm">
              {t("checkout.table")}
            </span>
            {tableNumber || t("checkout.notSpecified")}
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-bold text-foreground">
            {t("checkout.name")}{" "}
            <span className="text-muted-foreground font-normal ml-1">({t("checkout.nameOptional", "optional")})</span>
          </label>
          <Input
            id="name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-bold text-foreground">
            {t("checkout.phone")}{" "}
            <span className="text-muted-foreground font-normal ml-1">
              ({t("checkout.phoneOptional")})
            </span>
          </label>
          <Input
            id="phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="requests"
            className="text-sm font-bold text-foreground"
          >
            {t("checkout.specialRequests")}
          </label>
          <Textarea
            id="requests"
            value={specialRequests}
            onChange={(e) => setSpecialRequests(e.target.value)}
            placeholder={t("checkout.specialPlaceholder")}
            className="rounded-xl min-h-[100px] resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-foreground hover:bg-foreground/90 text-background font-bold py-4 px-6 rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
        >
          {submitting ? t("checkout.submitting") : t("checkout.placeOrder")}
        </button>
      </form>

      {customersAuthEnabled && (
        <CustomerLoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          returnTo={location.pathname + location.search}
        />
      )}
    </div>
  );
};

export default CheckoutPage;
