import { useState, useContext } from "react";
import { usePos } from "../../context/PosContext";
import { createOrder, closeSession } from "../../lib/api";
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
    clearSession,
    buildSpecialRequests,
  } = usePos();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [closing, setClosing] = useState(false);

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

  const handleForceClose = async () => {
    if (!session?.sessionToken || !activeRestaurant) return;
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSession(session.sessionToken, activeRestaurant.id);
      clearSession();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? "Failed to close session. Try again."
      );
    } finally {
      setClosing(false);
    }
  };

  const startEditingNote = (cartId: string, currentNote: string) => {
    setEditingNoteId(cartId);
    setNoteDraft(currentNote);
  };

  const saveNote = (cartId: string) => {
    updateNote(cartId, noteDraft.trim());
    setEditingNoteId(null);
    setNoteDraft("");
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setNoteDraft("");
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
                    {item.itemNote && editingNoteId !== item.cartId && (
                      <div className="text-xs text-accent italic mt-0.5">
                        Note: {item.itemNote}
                      </div>
                    )}
                    {editingNoteId === item.cartId ? (
                      <div className="flex items-center gap-1 mt-1">
                        <input
                          type="text"
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveNote(item.cartId);
                            if (e.key === "Escape") cancelEditingNote();
                          }}
                          placeholder="e.g. no salt, extra sauce..."
                          className="flex-1 px-2 py-1 rounded bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => saveNote(item.cartId)}
                          className="text-xs text-accent font-medium px-2 py-1 min-h-[32px]"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingNote}
                          className="text-xs text-muted-foreground px-1 py-1 min-h-[32px]"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditingNote(item.cartId, item.itemNote || "")}
                        className="text-xs text-muted-foreground underline mt-1 min-h-[32px]"
                      >
                        {item.itemNote ? "Edit note" : "+ Add note"}
                      </button>
                    )}
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

          <div className="p-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || items.length === 0}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? "Submitting..." : `Submit Order · €${total.toFixed(2)}`}
            </button>
            <button
              type="button"
              onClick={handleForceClose}
              disabled={closing}
              className="w-full py-3 rounded-lg bg-destructive text-destructive-foreground font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {closing ? "Closing..." : "Force Close · No Payment"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
