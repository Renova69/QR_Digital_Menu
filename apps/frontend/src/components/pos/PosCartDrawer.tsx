import { useState, useContext } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { usePos } from "../../context/PosContext";
import { createOrder, closeSession, closeSessionWithCard, closeSessionWithCash } from "../../lib/api";
import RestaurantContext from "../../context/RestaurantContext";
import PosSplitBill from "./PosSplitBill";
import PosQRBill from "./PosQRBill";

interface PosCartDrawerProps {
  itemCount: number;
  total: number;
}

type ConfirmAction =
  | { type: "submit"; total: number }
  | { type: "card"; total: number }
  | { type: "cash"; total: number }
  | { type: "force" }
  | null;

export default function PosCartDrawer({ itemCount, total }: PosCartDrawerProps) {
  const { t } = useTranslation();
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const {
    items,
    session,
    removeItem,
    updateQuantity,
    updateNote,
    markAsSubmitted,
    clearSession,
    getPendingTotal,
    buildSpecialRequests,
  } = usePos();
  const [expanded, setExpanded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [closing, setClosing] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const pendingItems = items.filter((i) => !i.submitted);
  const pendingTotal = getPendingTotal();
  const pendingCount = pendingItems.reduce((sum, i) => sum + i.quantity, 0);
  const hasAnyItems = items.length > 0;
  const submittedTotal = total - pendingTotal;
  const hasPending = pendingItems.length > 0;

  const handleSubmit = async () => {
    if (pendingItems.length === 0 || !session || !activeRestaurant) return;
    setConfirmAction(null);
    setSubmitting(true);
    setSubmitError(null);

    try {
      const specialRequests = buildSpecialRequests();
      await createOrder({
        customerName: customerName.trim() || t("pos.defaultGuest", "Guest"),
        source: "POS",
        tableId: session.tableName,
        restaurantId: activeRestaurant.id,
        specialRequests,
        sessionToken: session.sessionToken,
        items: pendingItems.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          selectedOptions: item.selectedOptions,
          notes: item.itemNote || undefined,
        })),
      });
      markAsSubmitted();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? t("pos.failedSubmitOrder", "Failed to submit order. Try again.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardPayment = async () => {
    if (!session?.sessionToken || !activeRestaurant) return;
    setConfirmAction(null);
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSessionWithCard(session.sessionToken, activeRestaurant.id);
      clearSession();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? t("pos.failedCloseSession", "Failed to close session. Try again.")
      );
    } finally {
      setClosing(false);
    }
  };

  const handleCashPayment = async () => {
    if (!session?.sessionToken || !activeRestaurant) return;
    setConfirmAction(null);
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSessionWithCash(session.sessionToken, activeRestaurant.id);
      clearSession();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? t("pos.failedCloseSession", "Failed to close session. Try again.")
      );
    } finally {
      setClosing(false);
    }
  };

  const handleForceClose = async () => {
    if (!session?.sessionToken || !activeRestaurant) return;
    setConfirmAction(null);
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSession(session.sessionToken, activeRestaurant.id);
      clearSession();
      setExpanded(false);
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ?? t("pos.failedCloseSession", "Failed to close session. Try again.")
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
        className="w-full flex items-center justify-between py-3 px-4 rounded-lg brand-cta text-white font-semibold min-h-[44px]"
      >
        <span>
          {itemCount} {itemCount === 1 ? t("pos.item", "item") : t("pos.items", "items")} · €{total.toFixed(2)}
        </span>
        <span>{expanded ? t("pos.closeCart", "Close") : t("pos.viewCart", "View Cart")}</span>
      </button>

      {/* Expanded cart */}
      {expanded && (
        <div className="mt-3 border border-border rounded-lg bg-card max-h-[40dvh] overflow-y-auto">
          {Object.entries(itemsBySeat).map(([seat, seatItems]) => (
            <div key={seat} className="px-4 py-2 border-b border-border last:border-b-0">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                [{seat}]
              </div>
              {seatItems.map((item) => {
                const isSubmitted = item.submitted;
                return (
                  <div
                    key={item.cartId}
                    className={`flex items-center gap-2 py-2 border-b border-border last:border-b-0 ${
                      isSubmitted ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {item.name}
                        {isSubmitted && (
                          <span className="text-xs text-green-600 dark:text-green-400 shrink-0">
                            ✓
                          </span>
                        )}
                      </div>
                      {item.selectedOptions.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {item.selectedOptions
                            .map((o) => o.choiceName)
                            .join(", ")}
                        </div>
                      )}
                      {item.itemNote && editingNoteId !== item.cartId && (
                        <div className="text-xs text-primary italic mt-0.5">
                          {t("pos.note", "Note:")} {item.itemNote}
                        </div>
                      )}
                      {!isSubmitted && editingNoteId === item.cartId ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveNote(item.cartId);
                              if (e.key === "Escape") cancelEditingNote();
                            }}
                            placeholder={t("pos.notePlaceholder", "e.g. no salt, extra sauce...")}
                            className="flex-1 px-2 py-1 rounded bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => saveNote(item.cartId)}
                            className="text-xs text-primary font-medium px-2 py-1 min-h-[32px]"
                          >
                            {t("pos.save", "Save")}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingNote}
                            className="text-xs text-muted-foreground px-1 py-1 min-h-[32px]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : !isSubmitted ? (
                        <button
                          type="button"
                          onClick={() => startEditingNote(item.cartId, item.itemNote || "")}
                          className="text-xs text-muted-foreground underline mt-1 min-h-[32px]"
                        >
                          {item.itemNote ? t("pos.editNote", "Edit note") : t("pos.addNote", "+ Add note")}
                        </button>
                      ) : null}
                    </div>
                    {!isSubmitted ? (
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
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">
                        ×{item.quantity}
                      </span>
                    )}
                  </div>
                );
              })}
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
            {/* Customer name */}
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder={t("pos.guestNamePlaceholder", "Guest name (optional)")}
              className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-sm placeholder:text-muted-foreground"
              maxLength={100}
            />

            {/* Submit Order — only pending items */}
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "submit", total: pendingTotal })}
              disabled={submitting || pendingItems.length === 0}
              className="w-full py-3 rounded-lg brand-cta text-white font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {submitting
                ? t("pos.submitting", "Submitting...")
                : pendingItems.length === 0
                  ? t("pos.noNewItems", "No new items to submit")
                  : t("pos.submitOrderTotal", { total: pendingTotal.toFixed(2) })}
            </button>

            {/* Close - Paid by Card — only shown when restaurant has payments enabled */}
            {activeRestaurant?.paymentsEnabled && (
              <button
                type="button"
                onClick={() => setConfirmAction({ type: "card", total: submittedTotal })}
                disabled={closing || !hasAnyItems || hasPending}
                title={hasPending ? t("pos.submitPendingFirst", "Submit pending items first") : undefined}
                className="w-full py-3 rounded-lg bg-amber-500 text-white font-semibold disabled:opacity-50 min-h-[44px]"
              >
                {closing ? t("pos.closing", "Closing...") : t("pos.closeCardTotal", { total: submittedTotal.toFixed(2) })}
              </button>
            )}

            {/* Close - Paid by Cash — always visible */}
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "cash", total: submittedTotal })}
              disabled={closing || !hasAnyItems || hasPending}
              title={hasPending ? t("pos.submitPendingFirst", "Submit pending items first") : undefined}
              className="w-full py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {closing ? t("pos.closing", "Closing...") : t("pos.closeCashTotal", { total: submittedTotal.toFixed(2) })}
            </button>

            {/* Force Close */}
            <button
              type="button"
              onClick={() => setConfirmAction({ type: "force" })}
              disabled={closing}
              className="w-full py-3 rounded-lg bg-destructive text-destructive-foreground font-semibold disabled:opacity-50 min-h-[44px]"
            >
              {closing ? t("pos.closing", "Closing...") : t("pos.forceCloseNoPayment", "Force Close · No Payment")}
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog.Root
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-md mx-auto rounded-xl bg-background p-6">
            <Dialog.Title className="text-lg font-semibold mb-2">
              {confirmAction?.type === "submit" && t("pos.confirmSubmitTitle", "Submit Order")}
              {confirmAction?.type === "card" && t("pos.confirmCardTitle", "Close Table — Paid by Card")}
              {confirmAction?.type === "cash" && t("pos.confirmCashTitle", "Close Table — Paid by Cash")}
              {confirmAction?.type === "force" && t("pos.confirmForceTitle", "Force Close — No Payment")}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-6">
              {confirmAction?.type === "submit" && (
                <>
                  {t("pos.confirmSubmitDesc", {
                    count: pendingCount,
                    itemText: pendingCount === 1 ? t("pos.item", "item") : t("pos.items", "items"),
                    total: confirmAction.total.toFixed(2),
                  })}
                </>
              )}
              {confirmAction?.type === "card" && (
                <>
                  {t("pos.confirmCardDesc", { total: confirmAction.total.toFixed(2) })}
                </>
              )}
              {confirmAction?.type === "cash" && (
                <>
                  {t("pos.confirmCashDesc", { total: confirmAction.total.toFixed(2) })}
                </>
              )}
              {confirmAction?.type === "force" && (
                <>
                  {t("pos.confirmForceDesc", "Close table without any payment? This cannot be undone. Use only when the customer is leaving without paying or for testing.")}
                </>
              )}
            </Dialog.Description>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-lg bg-card border border-border text-foreground font-medium min-h-[44px]"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAction?.type === "submit") handleSubmit();
                  else if (confirmAction?.type === "card") handleCardPayment();
                  else if (confirmAction?.type === "cash") handleCashPayment();
                  else if (confirmAction?.type === "force") handleForceClose();
                }}
                className={`flex-1 py-3 rounded-lg text-white font-semibold min-h-[44px] ${
                  confirmAction?.type === "force"
                    ? "bg-destructive"
                    : confirmAction?.type === "card"
                      ? "bg-amber-500"
                      : confirmAction?.type === "cash"
                        ? "bg-emerald-600"
                        : "brand-cta"
                }`}
              >
                {confirmAction?.type === "submit" && t("pos.submit", "Submit")}
                {confirmAction?.type === "card" && t("pos.confirmPaid", "Confirm Paid")}
                {confirmAction?.type === "cash" && t("pos.confirmCash", "Confirm Cash")}
                {confirmAction?.type === "force" && t("pos.forceOpen", "Force Close")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
