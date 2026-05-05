import React from "react";
import { useCart } from "../../context/CartContext";
import { Button } from "../ui/button";

export const Cart: React.FC = () => {
  const { items, removeItem, clearCart } = useCart();

  const total = items.reduce(
    (acc: number, item: any) => acc + item.price * item.quantity,
    0,
  );

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-semibold mb-4">Cart</h2>
      {items.length === 0 ? (
        <p>Your cart is empty.</p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item: any) => (
              <li key={item.id} className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.quantity} x €{item.price.toFixed(2)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(item.cartId || item.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>€{total.toFixed(2)}</span>
            </div>
            <Button
              className="w-full mt-4"
              onClick={() => alert("Checkout not implemented yet!")}
            >
              Checkout
            </Button>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={clearCart}
            >
              Clear Cart
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
