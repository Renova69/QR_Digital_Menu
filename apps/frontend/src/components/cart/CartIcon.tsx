import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { ShoppingCart } from "lucide-react";
import CartDrawer from "./CartDrawer";
import { Category } from "../../types";
import { useTranslation } from "react-i18next";

interface CartIconProps {
  categories?: Category[];
  restaurantId?: string;
  selectedLang?: string;
  tier?: string;
  features?: string[];
  paymentsEnabled?: boolean;
  themeVars?: React.CSSProperties;
}

const CartIcon = ({
  categories,
  restaurantId,
  selectedLang,
  tier,
  features,
  paymentsEnabled,
  themeVars,
}: CartIconProps) => {
  const { getItemCount } = useCart();
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);

  const hasItems = getItemCount() > 0;

  const toggleCart = () => {
    setIsVisible(!isVisible);
  };

  return (
    <>
      <button
        onClick={toggleCart}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2.5 transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/5 group active:scale-95"
        aria-label={t("cart.openCart", "Open cart")}
      >
        <ShoppingCart
          size={22}
          className="text-foreground group-hover:scale-110 transition-transform"
        />
        {hasItems && (
          <span
            className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-zinc-950 px-1 text-sm font-black shadow-lg dark:border-white"
            style={{
              background: "var(--gradient-brand)",
              color: "var(--brand-contrast, #fff)",
            }}
          >
            {getItemCount()}
          </span>
        )}
      </button>
      <CartDrawer
        isOpen={isVisible}
        onClose={() => setIsVisible(false)}
        categories={categories}
        restaurantId={restaurantId}
        selectedLang={selectedLang}
        tier={tier}
        features={features}
        paymentsEnabled={paymentsEnabled}
        themeVars={themeVars}
      />
    </>
  );
};

export default CartIcon;
