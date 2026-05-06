import { useState } from "react";
import { useCart } from "../../context/CartContext";
import { ShoppingCart } from "lucide-react";
import CartDrawer from "./CartDrawer";
import { Category } from "../../types";

interface CartIconProps {
  categories?: Category[];
  restaurantId?: string;
  selectedLang?: string;
}

const CartIcon = ({ categories, restaurantId, selectedLang }: CartIconProps) => {
  const { getItemCount } = useCart();
  const [isVisible, setIsVisible] = useState(false);

  const hasItems = getItemCount() > 0;

  const toggleCart = () => {
    setIsVisible(!isVisible);
  };

  return (
    <>
      <button
        onClick={toggleCart}
        className="relative p-3 rounded-2xl transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/5 group active:scale-95"
        aria-label="Open Cart"
      >
        <ShoppingCart
          size={22}
          className="text-foreground group-hover:scale-110 transition-transform"
        />
        {hasItems && (
          <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-black rounded-full h-5 w-5 flex items-center justify-center shadow-lg border-2 border-zinc-950 dark:border-white">
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
      />
    </>
  );
};

export default CartIcon;
