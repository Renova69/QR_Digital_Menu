import React, { useState, useContext, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import {
  X,
  ChevronUp,
  CheckCircle2,
  CreditCard,
  Banknote,
  Scissors,
  ChevronDown,
  CloudUpload,
  TriangleAlert,
} from "lucide-react";
import { usePos } from "../../context/PosContext";
import {
  createOrder,
  closeSession,
  closeSessionWithCard,
  closeSessionWithCash,
} from "../../lib/api";
import {
  createPosClientOrderId,
  createPosLocalSessionId,
  discardOrdersForSession,
  isPosTransportFailure,
  queuePosOrder,
  type PosOrderPayload,
  type QueuedPosOrder,
} from "../../lib/posOfflineOrders";
import RestaurantContext from "../../context/RestaurantContext";
import PosSplitDrawer from "./PosSplitDrawer";
import PosQRBill from "./PosQRBill";
import { usePosTheme } from "../../context/PosThemeContext";

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

const SEAT_LABEL_KEYS: Record<string, string> = {
  "Seat 1": "pos.seat1",
  "Seat 2": "pos.seat2",
  "Seat 3": "pos.seat3",
  Shared: "pos.seatShared",
};

export default function PosCartDrawer({
  itemCount,
  total,
}: PosCartDrawerProps) {
  const { t } = useTranslation();
  const { theme } = usePosTheme();
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const {
    items,
    session,
    setSession,
    removeItem,
    updateQuantity,
    updateNote,
    markAsSubmitted,
    markAsQueued,
    clearSession,
    getPendingTotal,
    buildSpecialRequests,
    historyLoading,
    historyError,
  } = usePos();

  // Sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);

  // Actions
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [splitOpen, setSplitOpen] = useState(false);

  // Note editing
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // UI state
  const [customerName, setCustomerName] = useState("");
  const [submittedCollapsed, setSubmittedCollapsed] = useState(false);

  // Derived
  const pendingItems = items.filter((i) => !i.submitted);
  const submittedItems = items.filter((i) => i.submitted);
  const unsyncedItems = submittedItems.filter(
    (item) => item.syncState === "queued" || item.syncState === "conflict",
  );
  const serverSubmittedItems = submittedItems.filter(
    (item) => item.syncState !== "queued" && item.syncState !== "conflict",
  );
  const pendingTotal = getPendingTotal();
  const pendingCount = pendingItems.reduce((s, i) => s + i.quantity, 0);
  const submittedCount = serverSubmittedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const unsyncedCount = unsyncedItems.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const itemTotal = (item: (typeof items)[number]) =>
    (item.price +
      item.selectedOptions.reduce(
        (sum, option) => sum + option.priceModifier,
        0,
      )) *
    item.quantity;
  const submittedTotal = serverSubmittedItems.reduce(
    (sum, item) => sum + itemTotal(item),
    0,
  );
  const lockedTotal = total - pendingTotal;
  const hasPending = pendingItems.length > 0;
  const hasUnsynced = unsyncedItems.length > 0;
  const hasServerSubmitted = serverSubmittedItems.length > 0;
  const hasAnyItems = items.length > 0;

  const pendingBySeat = pendingItems.reduce<
    Record<string, typeof pendingItems>
  >((acc, item) => {
    const seat = item.seatNumber || "Shared";
    if (!acc[seat]) acc[seat] = [];
    acc[seat].push(item);
    return acc;
  }, {});

  const seatCount = Object.keys(pendingBySeat).length;

  const getSeatLabel = (seat: string) => {
    const key = SEAT_LABEL_KEYS[seat];
    return key ? t(key, seat) : seat;
  };

  // Sheet animation: mount → next frame → transition in
  const openSheet = () => {
    setSheetOpen(true);
  };
  useEffect(() => {
    if (sheetOpen) {
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setSheetMounted(true));
        return () => cancelAnimationFrame(raf2);
      });
      return () => cancelAnimationFrame(raf1);
    }
  }, [sheetOpen]);

  const closeSheet = () => {
    setSheetMounted(false);
    setTimeout(() => setSheetOpen(false), 300);
  };

  // Handlers
  const handleSubmit = async () => {
    // Reentrancy guard (Bug 1a): a double-tap on a touch POS can fire two
    // click events before the `disabled` prop re-renders. Each call mints a
    // fresh clientOrderId, so without this the backend idempotency key can't
    // dedup — two identical orders get created.
    if (
      submitting ||
      pendingItems.length === 0 ||
      !session ||
      !activeRestaurant
    )
      return;
    setConfirmAction(null);
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);
    const clientOrderId = createPosClientOrderId();
    const localSessionId =
      session.localSessionId ?? session.sessionId ?? createPosLocalSessionId();
    const cartIds = pendingItems.map((item) => item.cartId);
    const payload: PosOrderPayload = {
      customerName: customerName.trim() || t("pos.defaultGuest", "Guest"),
      source: "POS",
      tableId: session.tableName,
      restaurantId: activeRestaurant.id,
      specialRequests: buildSpecialRequests(),
      posSubmission: {
        clientOrderId,
        restaurantId: activeRestaurant.id,
        tableId: session.tableId,
        expectedTableSessionId: session.sessionId ?? null,
      },
      items: pendingItems.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        expectedUnitPrice: item.price,
        selectedOptions: item.selectedOptions,
        notes: item.itemNote || undefined,
      })),
    };

    try {
      const result = await createOrder(payload);
      if (result.tableSessionId) {
        setSession({
          ...session,
          localSessionId,
          sessionToken: result.sessionToken ?? session.sessionToken,
          sessionId: result.tableSessionId,
        });
      }
      markAsSubmitted(cartIds);
    } catch (err: unknown) {
      if (isPosTransportFailure(err)) {
        const timestamp = new Date().toISOString();
        const queuedOrder: QueuedPosOrder = {
          clientOrderId,
          restaurantId: activeRestaurant.id,
          tableId: session.tableId,
          tableName: session.tableName,
          localSessionId,
          createdAt: timestamp,
          updatedAt: timestamp,
          attempts: 0,
          status: "pending",
          payload,
          cartItems: pendingItems.map((item) => ({
            cartId: item.cartId,
            menuItemId: item.menuItemId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            selectedOptions: item.selectedOptions,
            seatNumber: item.seatNumber,
            itemNote: item.itemNote,
          })),
        };
        try {
          await queuePosOrder(queuedOrder);
          markAsQueued(clientOrderId, cartIds);
          setSubmitNotice(
            t(
              "pos.orderQueuedOffline",
              "Order saved on this device and queued for sync.",
            ),
          );
        } catch {
          setSubmitError(
            t(
              "pos.offlineStorageFailed",
              "Could not save this order offline. Keep this screen open and try again.",
            ),
          );
        }
        return;
      }
      const response = (err as { response?: { data?: { message?: string } } })
        .response;
      setSubmitError(
        response?.data?.message ??
          t("pos.failedSubmitOrder", "Failed to submit order. Try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCardPayment = async () => {
    // Reentrancy guard (Bug 1a) — see handleSubmit.
    if (closing || !session?.sessionToken || !activeRestaurant || hasUnsynced)
      return;
    setConfirmAction(null);
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSessionWithCard(session.sessionToken, activeRestaurant.id);
      clearSession();
      closeSheet();
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ??
          t("pos.failedCloseSession", "Failed to close session. Try again."),
      );
    } finally {
      setClosing(false);
    }
  };

  const handleCashPayment = async () => {
    // Reentrancy guard (Bug 1a) — see handleSubmit.
    if (closing || !session?.sessionToken || !activeRestaurant || hasUnsynced)
      return;
    setConfirmAction(null);
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSessionWithCash(session.sessionToken, activeRestaurant.id);
      clearSession();
      closeSheet();
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ??
          t("pos.failedCloseSession", "Failed to close session. Try again."),
      );
    } finally {
      setClosing(false);
    }
  };

  const handleForceClose = async () => {
    // Reentrancy guard (Bug 1a) — see handleSubmit.
    if (closing || !activeRestaurant || hasUnsynced) return;
    setConfirmAction(null);
    if (!session?.sessionToken) {
      clearSession();
      closeSheet();
      return;
    }
    setClosing(true);
    setSubmitError(null);
    try {
      await closeSession(session.sessionToken, activeRestaurant.id);
      clearSession();
      closeSheet();
    } catch (err: any) {
      setSubmitError(
        err.response?.data?.message ??
          t("pos.failedCloseSession", "Failed to close session. Try again."),
      );
    } finally {
      setClosing(false);
    }
  };

  const saveNote = (cartId: string) => {
    updateNote(cartId, noteDraft.trim());
    setEditingNoteId(null);
    setNoteDraft("");
  };

  const cancelNote = () => {
    setEditingNoteId(null);
    setNoteDraft("");
  };

  return (
    <div className="px-4 py-3">
      {/* ── Collapsed bar ── */}
      <button
        type="button"
        onClick={openSheet}
        className="w-full flex items-center justify-between py-3.5 px-5 rounded-xl brand-cta font-semibold min-h-[52px] transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-2 text-sm">
          {hasPending ? (
            <>
              <span className="font-bold">
                {pendingCount}{" "}
                {pendingCount === 1
                  ? t("pos.item", "item")
                  : t("pos.items", "items")}
              </span>
              {submittedCount > 0 && (
                <span className="opacity-70 font-normal text-xs">
                  +{submittedCount} {t("pos.sent", "sent")}
                </span>
              )}
              {unsyncedCount > 0 && (
                <span className="opacity-80 font-normal text-xs">
                  +{unsyncedCount} {t("pos.queued", "queued")}
                </span>
              )}
            </>
          ) : hasUnsynced ? (
            <span className="font-medium opacity-90">
              {unsyncedCount} {t("pos.queued", "queued")}
            </span>
          ) : hasAnyItems ? (
            <span className="font-medium opacity-90">
              {t("pos.allSent", "All sent")} · {submittedCount}{" "}
              {submittedCount === 1
                ? t("pos.item", "item")
                : t("pos.items", "items")}
            </span>
          ) : (
            <span className="font-medium opacity-75">
              {t("pos.noItems", "No items yet")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasPending && (
            <span className="font-bold text-base">
              €{pendingTotal.toFixed(2)}
            </span>
          )}
          <ChevronUp size={17} className="opacity-80" />
        </div>
      </button>

      {/* ── Bottom sheet portal ── */}
      {sheetOpen &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className={`fixed inset-0 z-[9990] bg-black/50 transition-opacity duration-300 ${sheetMounted ? "opacity-100" : "opacity-0"}`}
              onClick={closeSheet}
            />

            {/* Sheet */}
            <div
              className={`fixed inset-x-0 bottom-0 z-[9991] flex flex-col max-h-[92dvh] rounded-t-2xl bg-background border-t border-border shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${sheetMounted ? "translate-y-0" : "translate-y-full"} ${theme === "dark" ? "dark" : ""}`}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
                <div>
                  <h2 className="text-base font-bold text-foreground leading-tight">
                    {session?.tableName
                      ? t("pos.tableLabel", "Table {{name}}", {
                          name: session.tableName,
                        })
                      : t("pos.cart", "Cart")}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {hasPending ? (
                      <>
                        <span className="text-primary font-semibold">
                          {pendingCount}{" "}
                          {pendingCount === 1
                            ? t("pos.item", "item")
                            : t("pos.items", "items")}{" "}
                          pending · €{pendingTotal.toFixed(2)}
                        </span>
                        {submittedCount > 0 && (
                          <span className="ml-1.5">
                            · {submittedCount} sent (€
                            {submittedTotal.toFixed(2)})
                          </span>
                        )}
                      </>
                    ) : submittedCount > 0 ? (
                      <>
                        {t("pos.allSent", "All sent")} · €
                        {submittedTotal.toFixed(2)}{" "}
                        {t("pos.totalLabel", "total")}
                      </>
                    ) : (
                      t("pos.emptyCart", "Cart is empty")
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="p-2 rounded-full bg-muted hover:bg-muted/60 text-muted-foreground transition-colors"
                  aria-label={t("common.close", "Close")}
                >
                  <X size={17} />
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {/* Guest name */}
                <div className="px-5 pt-4 pb-3">
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder={t(
                      "pos.guestNamePlaceholder",
                      "Guest name (optional)",
                    )}
                    className="w-full rounded-xl border border-border bg-muted px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    maxLength={100}
                  />
                </div>

                {/* ── Pending items ── */}
                {pendingItems.length > 0 && (
                  <div className="px-5 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                        {t("pos.newOrder", "New order")}
                      </span>
                      <span className="text-xs font-semibold text-primary">
                        €{pendingTotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                      {Object.entries(pendingBySeat).map(
                        ([seat, seatItems]) => (
                          <React.Fragment key={seat}>
                            {seatCount > 1 && (
                              <div className="px-3 py-1.5 bg-muted/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                {getSeatLabel(seat)}
                              </div>
                            )}
                            {seatItems.map((item) => (
                              <div
                                key={item.cartId}
                                className="px-3 py-3 bg-card"
                              >
                                {/* Item row */}
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-foreground leading-snug">
                                      {item.name}
                                    </p>
                                    {item.selectedOptions.length > 0 && (
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {item.selectedOptions
                                          .map((o) => o.choiceName)
                                          .join(", ")}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-foreground shrink-0 mt-0.5">
                                    €
                                    {(
                                      (item.price +
                                        item.selectedOptions.reduce(
                                          (s, o) => s + o.priceModifier,
                                          0,
                                        )) *
                                      item.quantity
                                    ).toFixed(2)}
                                  </span>
                                </div>

                                {/* Controls row */}
                                <div className="flex items-center justify-between mt-2">
                                  {/* Note */}
                                  {editingNoteId === item.cartId ? (
                                    <div className="flex-1 mr-2 space-y-1">
                                      <input
                                        type="text"
                                        value={noteDraft}
                                        onChange={(e) =>
                                          setNoteDraft(e.target.value)
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            saveNote(item.cartId);
                                          if (e.key === "Escape") cancelNote();
                                        }}
                                        placeholder={t(
                                          "pos.notePlaceholder",
                                          "e.g. no salt, extra sauce...",
                                        )}
                                        className="w-full px-2.5 py-1.5 rounded-lg bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary"
                                        autoFocus
                                      />
                                      <div className="flex gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => saveNote(item.cartId)}
                                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground min-h-[32px]"
                                        >
                                          {t("pos.save", "Save")}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelNote}
                                          className="text-xs text-muted-foreground px-2 py-1.5 min-h-[32px]"
                                        >
                                          {t("common.cancel", "Cancel")}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingNoteId(item.cartId);
                                        setNoteDraft(item.itemNote || "");
                                      }}
                                      className="text-xs text-primary/70 hover:text-primary min-h-[32px] pr-2 text-left"
                                    >
                                      {item.itemNote ? (
                                        <span className="italic">
                                          ✏ {item.itemNote}
                                        </span>
                                      ) : (
                                        <span>
                                          + {t("pos.addNote", "Add note")}
                                        </span>
                                      )}
                                    </button>
                                  )}

                                  {/* Qty + Remove */}
                                  {editingNoteId !== item.cartId && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateQuantity(
                                            item.cartId,
                                            item.quantity - 1,
                                          )
                                        }
                                        className="h-9 w-9 rounded-full bg-muted border border-border text-foreground flex items-center justify-center text-base font-bold"
                                      >
                                        −
                                      </button>
                                      <span className="text-sm font-bold w-6 text-center tabular-nums">
                                        {item.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateQuantity(
                                            item.cartId,
                                            item.quantity + 1,
                                          )
                                        }
                                        className="h-9 w-9 rounded-full bg-muted border border-border text-foreground flex items-center justify-center text-base font-bold"
                                      >
                                        +
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeItem(item.cartId)}
                                        className="ml-1 h-9 w-9 flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-base"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </React.Fragment>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* ── Submitted items ── */}
                {submittedItems.length > 0 && (
                  <div className="px-5 pb-3">
                    <button
                      type="button"
                      onClick={() => setSubmittedCollapsed((v) => !v)}
                      className="flex items-center justify-between w-full mb-2"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {hasUnsynced
                          ? t("pos.orderDeliveryStatus", "Order status")
                          : t("pos.sentToKitchen", "Sent to kitchen")}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span>€{lockedTotal.toFixed(2)}</span>
                        {submittedCollapsed ? (
                          <ChevronDown size={13} />
                        ) : (
                          <ChevronUp size={13} />
                        )}
                      </div>
                    </button>
                    {!submittedCollapsed && (
                      <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                        {submittedItems.map((item) => (
                          <div
                            key={item.cartId}
                            className="flex items-center gap-3 px-3 py-2.5 bg-card/60"
                          >
                            {item.syncState === "conflict" ? (
                              <TriangleAlert
                                size={14}
                                className="shrink-0 text-destructive"
                              />
                            ) : item.syncState === "queued" ? (
                              <CloudUpload
                                size={14}
                                className="shrink-0 text-warning-foreground"
                              />
                            ) : (
                              <CheckCircle2
                                size={14}
                                className="shrink-0 text-success"
                              />
                            )}
                            <span className="flex-1 text-sm text-muted-foreground">
                              {item.name}
                              {item.selectedOptions.length > 0 && (
                                <span className="text-xs ml-1 opacity-70">
                                  (
                                  {item.selectedOptions
                                    .map((o) => o.choiceName)
                                    .join(", ")}
                                  )
                                </span>
                              )}
                              {item.syncState === "queued" && (
                                <span className="ml-1 text-xs text-warning-foreground">
                                  {t("pos.queued", "Queued")}
                                </span>
                              )}
                              {item.syncState === "conflict" && (
                                <span className="ml-1 text-xs text-destructive">
                                  {t("pos.review", "Review")}
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              ×{item.quantity}
                            </span>
                            <span className="text-sm text-muted-foreground tabular-nums">
                              €
                              {(
                                (item.price +
                                  item.selectedOptions.reduce(
                                    (s, o) => s + o.priceModifier,
                                    0,
                                  )) *
                                item.quantity
                              ).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* QR Bill */}
                <div className="px-5 pb-2">
                  <PosQRBill />
                </div>

                {/* Errors */}
                {submitError && (
                  <div className="mx-5 mb-3 rounded-xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                    {submitError}
                  </div>
                )}
                {submitNotice && (
                  <div className="mx-5 mb-3 rounded-xl bg-success/10 px-4 py-2.5 text-sm text-success">
                    {submitNotice}
                  </div>
                )}
                {historyError && (
                  <div className="mx-5 mb-3 flex items-center justify-between rounded-xl bg-warning/10 px-4 py-2.5 text-sm text-warning">
                    <span>{historyError}</span>
                    <button
                      type="button"
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("pos:open-table-modal"),
                        )
                      }
                      className="underline text-xs font-medium ml-2 shrink-0 min-h-[32px]"
                    >
                      {t("pos.retryHistory", "Retry")}
                    </button>
                  </div>
                )}
                {historyLoading && (
                  <div className="mx-5 mb-3 rounded-xl bg-muted px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
                    <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    {t("pos.loadingHistory", "Loading order history...")}
                  </div>
                )}

                {/* Spacer above sticky footer */}
                <div className="h-2" />
              </div>

              {/* ── Sticky footer — action buttons ── */}
              <div
                className="flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-sm px-5 pt-4 pb-4 space-y-2"
                style={{
                  paddingBottom:
                    "max(1rem, calc(env(safe-area-inset-bottom, 0px) + 0.75rem))",
                }}
              >
                {/* Submit */}
                <button
                  type="button"
                  onClick={() =>
                    setConfirmAction({ type: "submit", total: pendingTotal })
                  }
                  disabled={
                    submitting || pendingItems.length === 0 || historyLoading
                  }
                  className="w-full py-3.5 rounded-xl brand-cta font-bold text-sm disabled:opacity-40 min-h-[48px] transition-all active:scale-[0.98]"
                >
                  {submitting
                    ? t("pos.submitting", "Submitting...")
                    : pendingItems.length === 0
                      ? t("pos.noNewItems", "No new items to submit")
                      : t("pos.submitOrderTotal", {
                          total: pendingTotal.toFixed(2),
                        })}
                </button>

                {/* Card + Cash */}
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: activeRestaurant?.paymentsEnabled
                      ? "1fr 1fr"
                      : "1fr",
                  }}
                >
                  {activeRestaurant?.paymentsEnabled && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmAction({
                          type: "card",
                          total: submittedTotal,
                        })
                      }
                      disabled={
                        closing ||
                        !hasServerSubmitted ||
                        hasPending ||
                        hasUnsynced
                      }
                      title={
                        hasUnsynced
                          ? t(
                              "pos.syncQueuedBeforePayment",
                              "Sync queued orders before taking payment",
                            )
                          : hasPending
                            ? t(
                                "pos.submitPendingFirst",
                                "Submit pending items first",
                              )
                            : undefined
                      }
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-warning text-warning-foreground font-semibold text-sm disabled:opacity-40 min-h-[48px] transition-all active:scale-[0.98]"
                    >
                      <CreditCard size={15} />
                      {closing
                        ? t("pos.closing", "Closing...")
                        : t("pos.closeCardTotal", {
                            total: submittedTotal.toFixed(2),
                          })}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({ type: "cash", total: submittedTotal })
                    }
                    disabled={
                      closing ||
                      !hasServerSubmitted ||
                      hasPending ||
                      hasUnsynced
                    }
                    title={
                      hasUnsynced
                        ? t(
                            "pos.syncQueuedBeforePayment",
                            "Sync queued orders before taking payment",
                          )
                        : hasPending
                          ? t(
                              "pos.submitPendingFirst",
                              "Submit pending items first",
                            )
                          : undefined
                    }
                    className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-success text-success-foreground font-semibold text-sm disabled:opacity-40 min-h-[48px] transition-all active:scale-[0.98]"
                  >
                    <Banknote size={15} />
                    {closing
                      ? t("pos.closing", "Closing...")
                      : t("pos.closeCashTotal", {
                          total: submittedTotal.toFixed(2),
                        })}
                  </button>
                </div>

                {/* Split bill */}
                <button
                  type="button"
                  onClick={() => setSplitOpen(true)}
                  disabled={
                    closing ||
                    !session?.sessionToken ||
                    submittedTotal <= 0 ||
                    hasPending ||
                    hasUnsynced
                  }
                  title={
                    hasUnsynced
                      ? t(
                          "pos.syncQueuedBeforePayment",
                          "Sync queued orders before taking payment",
                        )
                      : hasPending
                        ? t(
                            "pos.submitPendingFirst",
                            "Submit pending items first",
                          )
                        : undefined
                  }
                  className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-card border border-border text-foreground font-semibold text-sm disabled:opacity-40 min-h-[44px] transition-all active:scale-[0.98]"
                >
                  <Scissors size={14} />
                  {t("pos.split.splitBill", "Split bill")}
                </button>

                {/* Force close — de-emphasized */}
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: "force" })}
                  disabled={closing || hasUnsynced}
                  title={
                    hasUnsynced
                      ? t(
                          "pos.syncQueuedBeforeClosing",
                          "Resolve queued orders before closing this table",
                        )
                      : undefined
                  }
                  className="w-full py-2 text-xs text-destructive font-medium hover:underline disabled:opacity-40 min-h-[36px] transition-opacity"
                >
                  {closing
                    ? t("pos.closing", "Closing...")
                    : t("pos.forceCloseNoPayment", "Force Close · No Payment")}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* ── Confirmation dialog ── */}
      <Dialog.Root
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[9995]" />
          <Dialog.Content
            className={`fixed inset-x-4 top-1/2 -translate-y-1/2 z-[9996] max-w-md mx-auto rounded-2xl bg-background p-6 text-foreground shadow-2xl ${theme === "dark" ? "dark" : ""}`}
          >
            <Dialog.Title className="text-lg font-bold mb-2">
              {confirmAction?.type === "submit" &&
                t("pos.confirmSubmitTitle", "Submit Order")}
              {confirmAction?.type === "card" &&
                t("pos.confirmCardTitle", "Close Table — Paid by Card")}
              {confirmAction?.type === "cash" &&
                t("pos.confirmCashTitle", "Close Table — Paid by Cash")}
              {confirmAction?.type === "force" &&
                t("pos.confirmForceTitle", "Force Close — No Payment")}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-6">
              {confirmAction?.type === "submit" &&
                t("pos.confirmSubmitDesc", {
                  count: pendingItems.reduce((s, i) => s + i.quantity, 0),
                  itemText:
                    pendingItems.reduce((s, i) => s + i.quantity, 0) === 1
                      ? t("pos.item", "item")
                      : t("pos.items", "items"),
                  total: confirmAction.total.toFixed(2),
                })}
              {confirmAction?.type === "card" &&
                t("pos.confirmCardDesc", {
                  total: confirmAction.total.toFixed(2),
                })}
              {confirmAction?.type === "cash" &&
                t("pos.confirmCashDesc", {
                  total: confirmAction.total.toFixed(2),
                })}
              {confirmAction?.type === "force" &&
                t(
                  "pos.confirmForceDesc",
                  "Close table without any payment? This cannot be undone.",
                )}
            </Dialog.Description>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-xl bg-muted border border-border text-foreground font-medium min-h-[44px]"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                disabled={submitting || closing}
                onClick={() => {
                  if (confirmAction?.type === "submit") handleSubmit();
                  else if (confirmAction?.type === "card") handleCardPayment();
                  else if (confirmAction?.type === "cash") handleCashPayment();
                  else if (confirmAction?.type === "force") handleForceClose();
                }}
                className={`flex-1 py-3 rounded-xl font-semibold min-h-[44px] disabled:opacity-40 ${
                  confirmAction?.type === "force"
                    ? "bg-destructive text-destructive-foreground"
                    : confirmAction?.type === "card"
                      ? "bg-warning text-warning-foreground"
                      : confirmAction?.type === "cash"
                        ? "bg-success text-success-foreground"
                        : "brand-cta"
                }`}
              >
                {confirmAction?.type === "submit" && t("pos.submit", "Submit")}
                {confirmAction?.type === "card" &&
                  t("pos.confirmPaid", "Confirm Paid")}
                {confirmAction?.type === "cash" &&
                  t("pos.confirmCash", "Confirm Cash")}
                {confirmAction?.type === "force" &&
                  t("pos.forceClose", "Force Close")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Split drawer */}
      {session?.sessionToken && activeRestaurant && (
        <PosSplitDrawer
          open={splitOpen}
          onOpenChange={setSplitOpen}
          sessionToken={session.sessionToken}
          restaurantId={activeRestaurant.id}
          onFullyPaid={() => {
            // Bug 1c: purge any still-queued offline order for this session
            // before clearing it — clearSession() only wipes in-memory cart
            // state, not the IndexedDB outbox, so a queued order would
            // otherwise survive and flush against an already-closed session.
            if (session?.localSessionId) {
              void discardOrdersForSession(session.localSessionId);
            }
            clearSession();
            closeSheet();
          }}
        />
      )}
    </div>
  );
}
