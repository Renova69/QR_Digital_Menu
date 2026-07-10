import { createPortal } from "react-dom";
import { useCart } from "../../context/CartContext";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import React, { useState, useEffect } from "react";
import { Category } from "../../types";
import { formatInlineDual, BGN_RATE } from "../../lib/currency";
import {
  resolveCartChoiceName,
  resolveCartItemName,
} from "../../lib/cartTranslation";
import { X, ShoppingCart } from "lucide-react";

const CartDrawer = ({
  isOpen,
  onClose,
  categories,
  restaurantId,
  selectedLang,
  tier,
  features,
  paymentsEnabled,
  themeVars,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories?: Category[];
  restaurantId?: string;
  selectedLang?: string;
  tier?: string;
  features?: string[];
  paymentsEnabled?: boolean;
  themeVars?: React.CSSProperties;
}) => {
  const { items, getTotal, clearCart, removeItem, addItem } = useCart();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [showDrinkUpsell, setShowDrinkUpsell] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowDrinkUpsell(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCheckout = () => {
    if (categories && categories.length > 0) {
      const hasDrinks = items.some((cartItem) => {
        const cat = categories.find((c: Category) =>
          c.items?.some((item) => item.id === cartItem.id),
        );
        return cat?.isDrinkCategory;
      });

      const drinkCategory = categories.find((c: Category) => c.isDrinkCategory);

      if (!hasDrinks && drinkCategory && drinkCategory.items?.length > 0) {
        setShowDrinkUpsell(true);
        return;
      }
    }
    finishCheckout();
  };

  const finishCheckout = () => {
    setShowDrinkUpsell(false);
    onClose();
    navigate("/checkout", {
      state: {
        restaurantId,
        tier,
        features,
        paymentsEnabled,
        themeVars,
        selectedLang,
      },
    });
  };

  return createPortal(
    <div
      dir={i18n.dir(selectedLang || i18n.resolvedLanguage)}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] transition-opacity"
      onClick={onClose}
    >
      <div
        className={[
          "fixed bottom-0 left-0 right-0 flex flex-col",
          "h-[88vh] rounded-t-[2.5rem]",
          "md:top-0 md:right-0 md:bottom-auto md:left-auto",
          "md:h-full md:w-full md:max-w-sm md:rounded-l-[2.5rem] md:rounded-tr-none",
          "backdrop-blur-[10px] transition-all duration-200 bg-card shadow-2xl z-[10000]",
          "border border-border",
          "cart-panel-enter",
        ].join(" ")}
        style={themeVars}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
        </div>

        <div className="flex justify-between items-center px-6 py-5 md:p-8 border-b border-border flex-shrink-0">
          <h2 className="text-2xl md:text-3xl font-display font-black text-foreground tracking-tighter">
            {showDrinkUpsell
              ? t("publicMenu.drinkUpsell.title")
              : t("cart.yourOrder")}
          </h2>
          <button
            onClick={onClose}
            className="p-2.5 bg-muted hover:bg-muted/60 rounded-full text-muted-foreground transition-all hover:text-foreground"
            aria-label={t("common.close", "Close")}
          >
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-5 md:p-6 hide-scrollbar">
          {showDrinkUpsell ? (
            <div className="space-y-5">
              <div className="text-center p-5 bg-primary/10 border border-primary/20 rounded-2xl mb-6">
                <span className="text-4xl block mb-3">🥤</span>
                <h3 className="text-lg font-bold text-foreground leading-tight mb-2">
                  {t("publicMenu.drinkUpsell.question")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("publicMenu.drinkUpsell.subtitle")}
                </p>
              </div>
              <ul className="space-y-3">
                {categories
                  ?.find((c) => c.isDrinkCategory)
                  ?.items?.slice(0, 4)
                  .map((drink) => (
                    <li
                      key={`upsell-${drink.id}`}
                      className="flex justify-between items-center p-4 bg-muted rounded-[1.5rem] border border-border"
                    >
                      <div className="font-bold text-foreground text-[15px]">
                        {resolveCartItemName(
                          { id: drink.id, name: drink.name },
                          categories || [],
                          selectedLang || "",
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-primary">
                          {formatInlineDual(
                            drink.price ?? 0,
                            drink.currency ?? "EUR",
                          )}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            addItem({
                              id: drink.id,
                              name: drink.originalName ?? drink.name,
                              originalName: drink.originalName ?? drink.name,
                              // F-FE-1/F-FE-3: normalize to EUR — same rule
                              // as buildMainCartItem/pairing upsell.
                              price:
                                drink.currency === "BGN"
                                  ? drink.price / BGN_RATE
                                  : drink.price,
                              quantity: 1,
                              selectedOptions: [],
                              itemTranslations: drink.translations ?? null,
                              cartId: `${drink.id}-${Date.now()}`,
                            });
                          }}
                          className="h-9 min-w-[60px] rounded-full border-primary text-primary px-4 py-0"
                        >
                          {t("publicMenu.drinkUpsell.add")}
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground font-medium flex flex-col items-center justify-center h-full opacity-40">
              <ShoppingCart size={64} strokeWidth={1} className="mb-6" />
              <span className="text-sm font-bold uppercase tracking-widest">
                {t("cart.empty")}
              </span>
            </div>
          ) : (
            <ul className="space-y-5">
              {items.map((item) => (
                <li key={item.cartId} className="flex gap-3">
                  <div className="w-11 h-11 bg-muted rounded-2xl flex items-center justify-center text-primary font-display font-black text-base shrink-0 border border-border">
                    {item.quantity}×
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="font-bold text-foreground text-base leading-tight tracking-tight">
                      {resolveCartItemName(
                        item,
                        categories || [],
                        selectedLang || "",
                      )}
                    </p>
                    {item.selectedOptions &&
                      item.selectedOptions.length > 0 && (
                        <ul className="text-xs text-muted-foreground mt-1.5 space-y-1">
                          {item.selectedOptions.map((opt, idx) => (
                            <li
                              key={`${item.cartId}-opt-${idx}`}
                              className="flex items-center gap-1.5"
                            >
                              <span className="w-1 h-1 rounded-full bg-primary/50 block flex-shrink-0" />
                              {resolveCartChoiceName(
                                item.id,
                                opt,
                                categories || [],
                                selectedLang || "",
                              )}{" "}
                              <span className="text-primary/70 font-semibold">
                                (+
                                {formatInlineDual(
                                  opt.priceModifier || 0,
                                  "EUR",
                                )}
                                )
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                  <div className="text-right flex flex-col justify-between shrink-0">
                    <p className="font-bold text-base text-foreground">
                      {formatInlineDual(item.price * item.quantity, "EUR")}
                    </p>
                    <button
                      onClick={() => removeItem(item.cartId)}
                      className="text-xs font-semibold text-red-500 hover:text-red-400 transition-colors mt-2"
                    >
                      {t("cart.remove")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div
            className="px-5 pt-5 pb-5 md:p-8 border-t border-border bg-muted/50 flex-shrink-0 rounded-t-none rounded-b-none md:rounded-bl-[2.5rem]"
            style={{
              paddingBottom:
                "max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
            }}
          >
            <div className="flex justify-between items-baseline mb-6">
              <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">
                {t("cart.total")}
              </span>
              <span className="text-3xl font-display font-black text-primary tracking-tighter">
                {formatInlineDual(getTotal(), "EUR")}
              </span>
            </div>
            {showDrinkUpsell ? (
              <div className="space-y-3">
                <button
                  onClick={finishCheckout}
                  className="w-full brand-cta text-white font-black uppercase tracking-widest py-4 px-6 rounded-2xl shadow-2xl transition-all active:scale-95 text-xs"
                >
                  {t("cart.proceedCheckout")}
                </button>
                <button
                  onClick={finishCheckout}
                  className="w-full bg-transparent border border-border hover:bg-muted text-muted-foreground font-bold py-3 px-6 rounded-2xl transition-all text-[11px] uppercase tracking-widest"
                >
                  {t("publicMenu.drinkUpsell.noThanks")}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleCheckout}
                  className="w-full brand-cta text-white font-black uppercase tracking-widest py-4 px-6 rounded-2xl shadow-2xl transition-all active:scale-95 text-[11px]"
                >
                  {t("cart.proceedCheckout")}
                </button>
                <button
                  onClick={clearCart}
                  className="w-full bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground font-bold py-3 px-6 rounded-2xl transition-all text-[10px] uppercase tracking-widest"
                >
                  {t("cart.clearCart")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CartDrawer;
