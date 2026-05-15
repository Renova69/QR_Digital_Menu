import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import api, { createOrder } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { CustomerLoginModal } from "../components/auth/CustomerLoginModal";
import { formatInlineDual, formatEuro, formatBgn } from "../lib/currency";
import { Toggle } from "../components/ui/Toggle";

function SplitBillSection({ total }: { total: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(2);
  const { t } = useTranslation();
  const perPerson = count > 0 ? total / count : total;

  const decrement = () => setCount((c) => Math.max(2, c - 1));
  const increment = () => setCount((c) => Math.min(20, c + 1));

  return (
    <div className="mt-4 pt-4 border-t border-border/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <span className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>▶</span>
        {t('checkout.splitBill', { defaultValue: 'Split Bill' })}
      </button>
      {open && (
        <div className="mt-3 p-4 bg-secondary/40 rounded-2xl">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground flex-shrink-0">
              {t('checkout.splitAmong', { defaultValue: 'Split among' })}
            </span>
            <button
              type="button"
              onClick={decrement}
              aria-label="Decrease split count"
              className="w-9 h-9 rounded-full bg-background border border-border flex items-center justify-center text-base hover:bg-secondary transition-colors"
            >−</button>
            <span className="text-lg font-black text-foreground w-6 text-center">{count}</span>
            <button
              type="button"
              onClick={increment}
              aria-label="Increase split count"
              className="w-9 h-9 rounded-full bg-background border border-border flex items-center justify-center text-base hover:bg-secondary transition-colors"
            >+</button>
            <div className="ml-auto text-right">
              <div className="text-base font-black text-accent">{formatEuro(perPerson)}</div>
              <div className="text-xs text-muted-foreground">{formatBgn(perPerson)}</div>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('checkout.splitNote', { defaultValue: 'per person' })}
          </p>
        </div>
      )}
    </div>
  );
}

const CheckoutPage = () => {
  const { user } = useAuth();
  const { items, tableNumber, getTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const restaurantId = location.state?.restaurantId;
  const { t } = useTranslation();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetCartAction, setShowResetCartAction] = useState(false);

  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [usePoints, setUsePoints] = useState(false);
  const [redeemedItemIds, setRedeemItemIds] = useState<string[]>([]);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [notEnoughPointsError, setNotEnoughPointsError] = useState(false);

  // Gamification helpers — config comes from enroll() or getPublicConfig() API
  const restaurantConfig = loyaltyData?.restaurantConfig || loyaltyData;
  const exchangeRate = restaurantConfig?.loyaltyExchangeRate || 10;
  const effectiveRedeemRate = restaurantConfig?.loyaltyRedeemRate || 150;
  const maxDiscountRate = 0.15;

  const isHappyHourActive = () => {
    if (
      !restaurantConfig?.happyHourEnable ||
      !restaurantConfig.happyHourStartTime ||
      !restaurantConfig.happyHourEndTime
    )
      return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [startH, startM] = restaurantConfig.happyHourStartTime
      .split(":")
      .map(Number);
    const [endH, endM] = restaurantConfig.happyHourEndTime
      .split(":")
      .map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    // Supports overnight ranges (e.g. 22:00–02:00)
    return startMinutes <= endMinutes
      ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
      : currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  };

  const hhMultiplier = isHappyHourActive()
    ? restaurantConfig?.happyHourMultiplier || 2.0
    : 1;

  // Tier multiplier comes from the API (backend is the single source of truth
  // for thresholds). Falls back to 1.0 for unauthenticated / pre-load state.
  const tierMultiplier: number = loyaltyData?.tierMultiplier ?? 1.0;
  const finalMultiplier = Math.max(hhMultiplier, tierMultiplier);

  const getItemsPointsCost = () => {
    return items.reduce((sum, item: any) => {
      if (redeemedItemIds.includes(item.id) && item.rewardPointsPrice) {
        return sum + item.rewardPointsPrice * item.quantity;
      }
      return sum;
    }, 0);
  };

  const getAvailableLoyaltyPoints = () =>
    Math.max(loyaltyPoints - getItemsPointsCost(), 0);

  const getAvailableRewardValue = () =>
    getAvailableLoyaltyPoints() / effectiveRedeemRate;

  const getCheckoutTotal = () => {
    return items.reduce((sum, item: any) => {
      if (redeemedItemIds.includes(item.id) && item.rewardPointsPrice)
        return sum; // Free!
      const selectedOptions = item.selectedOptions || [];
      const optionsTotal = selectedOptions.reduce(
        (optSum: number, opt: any) => optSum + (opt.priceModifier || 0),
        0,
      );
      return sum + (item.price + optionsTotal) * item.quantity;
    }, 0);
  };

  const getDiscountPointsToRedeem = () => {
    if (!usePoints) return 0;
    const availablePoints = getAvailableLoyaltyPoints();
    const maxDiscount = getCheckoutTotal() * maxDiscountRate;
    const maxDiscountPoints = Math.floor(maxDiscount * effectiveRedeemRate);
    return Math.min(availablePoints, maxDiscountPoints);
  };

  const getPointsDiscount = () =>
    getDiscountPointsToRedeem() / effectiveRedeemRate;

  useEffect(() => {
    if (!restaurantId) return;

    const request = user
      ? api.post(`/loyalty/${restaurantId}/enroll`)
      : api.get(`/loyalty/${restaurantId}/config`);

    request
      .then((res) => {
        setLoyaltyData(res.data);
        setLoyaltyPoints(res.data.points || 0);
      })
      .catch(console.error);
  }, [user, restaurantId]);

  // Pre-fill name if user is logged in
  useEffect(() => {
    if (user && !customerName) {
      setCustomerName(user.name || (user.email ? user.email.split("@")[0] : ""));
    }
  }, [user, customerName]);

  // Redirect if no items in cart
  useEffect(() => {
    if (items.length === 0) {
      navigate(-1); // Go back to the menu
    }
  }, [items, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tableNumber) {
      setError(t("checkout.tableRequired"));
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const orderData: any = {
        customerName,
        customerPhone,
        tableId: tableNumber,
        items: items.map((item) => ({
          menuItemId: item.id,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
        })),
        specialRequests,
        redeemItemIds: redeemedItemIds,
        sessionToken: localStorage.getItem(`session-${tableNumber}`) || undefined,
      };

      if (user) {
        orderData.customerId = user.id;
        if (usePoints && loyaltyPoints > 0) {
          orderData.redeemPoints = getDiscountPointsToRedeem();
        }
      }

      const newOrder = await createOrder(orderData);

      if (newOrder.sessionToken && tableNumber) {
        localStorage.setItem(`session-${tableNumber}`, newOrder.sessionToken);
      }

      clearCart();
      setShowResetCartAction(false);

      navigate("/order-confirmation", {
        state: {
          orderNumber: newOrder.id,
          restaurantId: newOrder.restaurantId,
          tableNumber,
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
              key={item.id}
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
                        <span className="w-1.5 h-1.5 rounded-full bg-accent/50 block"></span>
                        {opt.choiceName}{" "}
                        <span className="text-accent/80 font-semibold">
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
                        if (redeemedItemIds.includes(item.id)) {
                          setRedeemItemIds((prev) =>
                            prev.filter((id) => id !== item.id),
                          );
                        } else {
                          if (
                            loyaltyPoints - getItemsPointsCost() >=
                            (item as any).rewardPointsPrice * item.quantity
                          ) {
                            setRedeemItemIds((prev) => [...prev, item.id]);
                          } else {
                            setNotEnoughPointsError(true);
                            setTimeout(() => setNotEnoughPointsError(false), 3000);
                          }
                        }
                      }}
                      className={`mt-2 text-xs font-bold px-2 py-1 rounded-md transition-colors ${
                        redeemedItemIds.includes(item.id)
                          ? "bg-accent text-white"
                          : "bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20"
                      }`}
                    >
                      {redeemedItemIds.includes(item.id)
                        ? t('checkout.redeemedFree')
                        : t('checkout.redeemForPts', { pts: (item as any).rewardPointsPrice * item.quantity })}
                    </button>
                    {notEnoughPointsError && (
                      <p className="text-red-500 text-xs mt-1">{t('checkout.notEnoughPoints')}</p>
                    )}
                  </>
                )}
              </div>
              <p className="font-bold text-lg">
                {redeemedItemIds.includes(item.id)
                  ? t('checkout.free')
                  : formatInlineDual(item.price * item.quantity, 'EUR')}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-6 pt-6 border-t border-border flex justify-between font-extrabold text-2xl text-foreground">
          <span>{t("cart.total")}:</span>
          <div className="text-right">
            <div>{formatEuro(getCheckoutTotal())}</div>
            <span className="text-xs text-muted-foreground">{formatBgn(getCheckoutTotal())}</span>
          </div>
        </div>

        {/* Split bill calculator */}
        <SplitBillSection total={getCheckoutTotal()} />

        {user &&
          restaurantId &&
          restaurantConfig?.isLoyaltyEnabled && (
            <div className="mt-6 pt-6 border-t border-border space-y-4">
              <div className="flex justify-between items-center p-4 bg-accent/10 border border-accent/20 rounded-xl">
                <div>
                  <p className="font-bold text-accent">{t('checkout.loyaltyPoints')}</p>
                  <p className="text-sm text-accent/80">
                    {t('checkout.pointsAvailable', {
                      count: getAvailableLoyaltyPoints(),
                      value: getAvailableRewardValue().toFixed(2)
                    })}
                  </p>
                </div>
                {loyaltyPoints - getItemsPointsCost() > 0 &&
                  getCheckoutTotal() > 0 && (
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
                    -{formatEuro(getPointsDiscount())}
                  </span>
                </div>
              )}

              <div className="flex justify-between font-extrabold text-3xl text-foreground">
                <span>{t('checkout.finalTotal')}</span>
                <div className="text-right">
                  <div>{formatEuro(getCheckoutTotal() - getPointsDiscount())}</div>
                  <span className="text-xs text-muted-foreground">{formatBgn(getCheckoutTotal() - getPointsDiscount())}</span>
                </div>
              </div>

              {isHappyHourActive() && (
                <div className="flex items-center gap-2 text-yellow-500 font-bold bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-lg justify-end">
                  <FontAwesomeIcon icon={faBolt} className="mr-1" />{t('checkout.happyHourBonus', { multiplier: hhMultiplier })}
                </div>
              )}

              <p className="text-sm text-muted-foreground text-right font-medium">
                {t('checkout.willEarn', {
                  pts: Math.floor(
                    (getCheckoutTotal() - getPointsDiscount()) * exchangeRate * finalMultiplier
                  )
                })}
                {finalMultiplier > 1 && (
                  <span className="ml-1 text-xs text-accent/70">
                    ({finalMultiplier}x)
                  </span>
                )}
              </p>
            </div>
          )}

        {!user && restaurantConfig?.isLoyaltyEnabled && (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 p-5 bg-accent/5 border border-accent/10 rounded-xl">
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
                className="shrink-0 rounded-xl border-accent text-accent hover:bg-accent/10"
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
        <div className="bg-accent/10 border border-accent/20 p-5 rounded-2xl mb-8">
          <p className="font-bold text-accent text-lg flex items-center gap-2">
            <span className="bg-accent text-white px-2 py-0.5 rounded-md text-sm">
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

      <CustomerLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        returnTo={location.pathname + location.search}
      />
    </div>
  );
};

export default CheckoutPage;
