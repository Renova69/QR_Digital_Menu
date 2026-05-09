import { useState, useContext } from "react";
import { usePos } from "../../context/PosContext";
import { createOrder } from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";
import PosSplitBill from "./PosSplitBill";
import PosQRBill from "./PosQRBill";

interface PosCartDrawerProps {
  itemCount: number;
  total: number;
}

export default function PosCartDrawer({ itemCount, total }: PosCartDrawerProps) {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const {
    items,
    session,
    removeItem,
    updateQuantity,
    updateNote,
    clearCart,
    buildSpecialRequests,
  } = usePos();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (items.length === 0 || !session || !activeRestaurant) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const specialRequests = buildSpecialRequests();
      await createOrder({
        customerName: "Staff",
        tableId: session.tableName,
        restaurantId: activeRestaurant.id,
        specialRequests,
        sessionToken: session.sessionToken,
        items: items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
        })),
      });
      clearCart();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? "Failed to submit order. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const itemsBySeat = items.reduce<Record<string, typeof items>>((acc, item) => {
    const seat = item.seatNumber || "Shared";
    if (!acc[seat]) acc[seat] = [];
    acc[seat].push(item);
    return acc;
  }, {});

  return (
    <div className="px-4 py-3">
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-3 px-4 rounded-lg bg-accent text-accent-foreground font-semibold min-h-[44px]"
      >
        <span>
          {itemCount} {itemCount === 1 ? "item" : "items"} · €{total.toFixed(2)}
        </span>
        <span>{expanded ? "Close" : "View Cart"}</span>
      </button>

      {/* Expanded cart */}
      {expanded && (
        <div className="mt-3 border border-border rounded-lg bg-card max-h-[40dvh] overflow-y-auto">
          {Object.entries(itemsBySeat).map(([seat, seatItems]) => (
            <div key={seat} className="px-4 py-2 border-b border-border last:border-b-0">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                [{seat}]
              </div>
              {seatItems.map((item) => (
                <div
                  key={item.cartId}
                  className="flex items-center gap-2 py-2 border-b border-border last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.name}
                    </div>
                    {item.selectedOptions.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {item.selectedOptions
                          .map((o) => o.choiceName)
                          .join(", ")}
                      </div>
                    )}
                    {item.itemNote && (
                      <div className="text-xs text-accent italic mt-0.5">
                        Note: {item.itemNote}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const newNote = prompt("Edit note:", item.itemNote || "");
                        if (newNote !== null) updateNote(item.cartId, newNote);
                      }}
                      className="text-xs text-muted-foreground underline mt-1"
                    >
                      {item.itemNote ? "Edit note" : "+ Add note"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.cartId, item.quantity - 1)
                      }
                      className="h-11 w-11 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-sm"
                    >
                      −
                    </button>
                    <span className="text-sm w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.cartId, item.quantity + 1)
                      }
                      className="h-11 w-11 rounded-full bg-card border border-border text-foreground flex items-center justify-center text-sm"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.cartId)}
                      className="h-11 w-11 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 flex items-center justify-center text-sm ml-2"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {submitError && (
            <div className="px-4 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400">
              {submitError}
            </div>
          )}

          <PosSplitBill total={total} />
          <PosQRBill />

          <div className="p-4">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || items.length === 0}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? "Submitting..." : `Submit Order · €${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
