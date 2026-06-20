import { useState, useEffect, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import {
  getSessionBill,
  settlePartial,
  type SessionBill,
  type SplitProvider,
} from "../../lib/api";
import { usePosTheme } from "../../context/PosThemeContext";
import { useSocket } from "../../context/SocketContext";

interface PosSplitDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionToken: string;
  restaurantId: string;
  /** Called when the final remaining balance reaches zero. */
  onFullyPaid: () => void;
}

type Mode = "ITEM" | "EVEN" | "CUSTOM";

const eur = (n: number) => `€${n.toFixed(2)}`;

interface UnpaidUnit {
  orderItemId: string;
  name: string;
  unitPrice: number;
  remainingQuantity: number;
}

export default function PosSplitDrawer({
  open,
  onOpenChange,
  sessionToken,
  restaurantId,
  onFullyPaid,
}: PosSplitDrawerProps) {
  const { t } = useTranslation();
  const { socket } = useSocket();
  // The POS theme is a scoped `.dark` class on the layout shell; this Dialog
  // portals to <body> and would otherwise fall back to the light :root tokens.
  const { theme } = usePosTheme();
  const [bill, setBill] = useState<SessionBill | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("ITEM");
  // orderItemId -> quantity selected for this payment
  const [selection, setSelection] = useState<Record<string, number>>({});
  // Even split: how many people still have to pay. Each even payment charges
  // remaining/peopleLeft and auto-decrements this, so shares stay equal and the
  // last person clears the bill exactly. Locked after the first payment so the
  // waiter can't accidentally re-split mid-flow.
  const [peopleLeft, setPeopleLeft] = useState(2);
  const [paidThisSession, setPaidThisSession] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [tipPercent, setTipPercent] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const loadBill = useCallback(() => {
    setLoading(true);
    setError(null);
    getSessionBill(sessionToken)
      .then((b) => {
        setBill(b);
        // By-item split is unavailable on loyalty-discounted bills — fall back.
        if (!b.splitItemsAvailable) setMode((m) => (m === "ITEM" ? "CUSTOM" : m));
      })
      .catch(() =>
        setError(t("pos.split.loadError", "Could not load the bill. Try again.")),
      )
      .finally(() => setLoading(false));
    // `t` is stable across renders (i18next) and intentionally excluded — listing
    // it would refire the open-effect every render and loop the bill fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken]);

  useEffect(() => {
    if (!open) return;
    setSelection({});
    setCustomAmount("");
    setTipPercent(0);
    setPeopleLeft(2);
    setPaidThisSession(false);
    loadBill();
  }, [open, loadBill]);

  useEffect(() => {
    if (!open || !socket || !bill?.sessionId) return;

    const handleBillUpdated = (payload: { tableSessionId?: string }) => {
      if (payload?.tableSessionId !== bill.sessionId) return;
      setSelection({});
      loadBill();
    };

    socket.on("bill:updated", handleBillUpdated);
    return () => {
      socket.off("bill:updated", handleBillUpdated);
    };
  }, [open, socket, bill?.sessionId, loadBill]);

  const remaining = bill?.remaining ?? 0;

  const unpaidUnits: UnpaidUnit[] = useMemo(() => {
    if (!bill) return [];
    return bill.orders
      .flatMap((o) => o.items)
      .map((it) => ({
        orderItemId: it.orderItemId,
        name: it.name,
        unitPrice: it.unitPriceWithOptions,
        remainingQuantity: it.quantity - it.paidQuantity,
      }))
      .filter((u) => u.remainingQuantity > 0);
  }, [bill]);

  const itemSubtotal = useMemo(
    () =>
      unpaidUnits.reduce(
        (sum, u) => sum + (selection[u.orderItemId] ?? 0) * u.unitPrice,
        0,
      ),
    [unpaidUnits, selection],
  );

  // Share = remaining split across the people still to pay. peopleLeft steps down
  // after each even payment, so the final person pays exactly remaining/1 — no
  // rounding dust and no re-split of the leftover.
  const evenShare = peopleLeft > 0 ? remaining / peopleLeft : remaining;
  const parsedCustom = parseFloat(customAmount) || 0;

  const baseSubtotal =
    mode === "ITEM"
      ? itemSubtotal
      : mode === "EVEN"
        ? Math.min(evenShare, remaining)
        : Math.min(parsedCustom, remaining);

  const tipAmount = (baseSubtotal * tipPercent) / 100;
  const chargeTotal = baseSubtotal + tipAmount;

  const canSubmit =
    !submitting &&
    baseSubtotal > 0.0049 &&
    remaining > 0 &&
    (mode !== "ITEM" || Object.values(selection).some((q) => q > 0));

  const setUnitQty = (unit: UnpaidUnit, qty: number) => {
    const clamped = Math.max(0, Math.min(qty, unit.remainingQuantity));
    setSelection((prev) => ({ ...prev, [unit.orderItemId]: clamped }));
  };

  const handleSettle = async (provider: SplitProvider) => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const allocations =
        mode === "ITEM"
          ? Object.entries(selection)
              .filter(([, q]) => q > 0)
              .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
          : undefined;

      const res = await settlePartial(sessionToken, {
        restaurantId,
        mode,
        provider,
        allocations,
        amount: mode === "CUSTOM" ? parsedCustom : undefined,
        splitCount: mode === "EVEN" ? peopleLeft : undefined,
        tipPercent: tipPercent || undefined,
      });

      if (res.sessionPaid) {
        onFullyPaid();
        onOpenChange(false);
        return;
      }
      // Partial settled. Lock the even split going forward and step down the
      // people-left count so the next share is remaining / (people who still owe).
      setPaidThisSession(true);
      if (mode === "EVEN") setPeopleLeft((n) => Math.max(1, n - 1));
      setSelection({});
      setCustomAmount("");
      setTipPercent(0);
      loadBill();
    } catch (err: any) {
      setError(
        err.response?.data?.message ??
          t("pos.split.settleError", "Could not record the payment. Try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const modeTabs: Array<{ key: Mode; label: string; disabled?: boolean }> = [
    {
      key: "ITEM",
      label: t("pos.split.byItem", "By item"),
      disabled: bill ? !bill.splitItemsAvailable : false,
    },
    { key: "EVEN", label: t("pos.split.even", "Even") },
    { key: "CUSTOM", label: t("pos.split.custom", "Custom") },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className={`fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-2xl bg-background p-4 text-foreground [padding-bottom:calc(env(safe-area-inset-bottom)+1rem)] sm:inset-x-4 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-2xl sm:[padding-bottom:1rem] ${theme === "dark" ? "dark" : ""}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              {t("pos.split.title", "Split bill")}
            </Dialog.Title>
            <Dialog.Close
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label={t("common.close", "Close")}
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Balance summary */}
          <div className="mb-3 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("pos.split.total", "Bill total")}
              </span>
              <span className="text-foreground">{eur(bill?.subtotal ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {t("pos.split.paid", "Paid so far")}
              </span>
              <span className="text-foreground">{eur(bill?.paidSubtotal ?? 0)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
              <span className="text-foreground">
                {t("pos.split.remaining", "Remaining")}
              </span>
              <span className="text-primary">{eur(remaining)}</span>
            </div>
          </div>

          {loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("pos.loadingHistory", "Loading...")}
            </p>
          )}

          {!loading && bill && (
            <>
              {/* Mode tabs */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                {modeTabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    disabled={tab.disabled}
                    onClick={() => setMode(tab.key)}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors disabled:opacity-40 ${
                      mode === tab.key
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {/* By item */}
                {mode === "ITEM" && (
                  <div className="space-y-2">
                    {unpaidUnits.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        {t("pos.split.allItemsPaid", "All items are already paid.")}
                      </p>
                    ) : (
                      unpaidUnits.map((u) => {
                        const qty = selection[u.orderItemId] ?? 0;
                        const isSelected = qty > 0;
                        const atMax = qty >= u.remainingQuantity;
                        return (
                          <div
                            key={u.orderItemId}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/10"
                                : "border-border"
                            }`}
                          >
                            {/* Selected-state dot so a long list is scannable at a glance. */}
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                isSelected ? "bg-primary" : "bg-muted"
                              }`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className={`truncate text-sm font-medium ${
                                  isSelected ? "text-primary" : "text-foreground"
                                }`}
                              >
                                {u.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {eur(u.unitPrice)} ·{" "}
                                {/* Deduct what's selected for this payment so the
                                    waiter sees the line draw down as they add. */}
                                {t("pos.split.unitsLeft", "{{count}} left", {
                                  count: u.remainingQuantity - qty,
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setUnitQty(u, qty - 1)}
                                disabled={!isSelected}
                                aria-label={`Remove one ${u.name}`}
                                className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg leading-none transition-colors ${
                                  isSelected
                                    ? "border-destructive bg-destructive/10 text-destructive"
                                    : "border-border text-muted-foreground opacity-40"
                                }`}
                              >
                                −
                              </button>
                              <span
                                className={`w-6 text-center text-sm ${
                                  isSelected ? "font-bold text-primary" : "text-muted-foreground"
                                }`}
                              >
                                {qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => setUnitQty(u, qty + 1)}
                                disabled={atMax}
                                aria-label={`Add one ${u.name}`}
                                className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg leading-none transition-colors ${
                                  atMax
                                    ? "border-border text-muted-foreground opacity-40"
                                    : "border-primary bg-primary text-primary-foreground"
                                }`}
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Even split — number of people still to pay. Locked once the
                    first payment is taken so it can't be re-split by mistake; it
                    counts down automatically as each person pays. */}
                {mode === "EVEN" && (
                  <div className="py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">
                        {t("pos.split.peopleToPay", "People to pay")}
                      </span>
                      <button
                        type="button"
                        disabled={paidThisSession || peopleLeft <= 1}
                        onClick={() => setPeopleLeft(Math.max(1, peopleLeft - 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-lg font-bold text-foreground">
                        {peopleLeft}
                      </span>
                      <button
                        type="button"
                        disabled={paidThisSession || peopleLeft >= 20}
                        onClick={() => setPeopleLeft(Math.min(20, peopleLeft + 1))}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-40"
                      >
                        +
                      </button>
                      <span className="ml-auto text-sm text-muted-foreground">
                        {eur(Math.min(evenShare, remaining))} {t("pos.perPerson", "/ person")}
                      </span>
                    </div>
                    {paidThisSession && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "pos.split.evenLocked",
                          "Locked after the first payment — counts down as each person pays.",
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Custom amount */}
                {mode === "CUSTOM" && (
                  <div className="flex items-center gap-2 py-2">
                    <span className="text-sm font-medium text-foreground">
                      {t("pos.split.amount", "Amount")}
                    </span>
                    <span className="text-foreground">€</span>
                    <input
                      type="number"
                      min="0"
                      max={remaining}
                      step="0.01"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder={remaining.toFixed(2)}
                      className="w-28 rounded-lg border border-border bg-muted px-3 py-2 text-sm"
                    />
                  </div>
                )}

                {/* Optional tip */}
                {bill.tipsEnabled && bill.tipOptions.length > 0 && baseSubtotal > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {t("payment.addTip", "Add a tip")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTipPercent(0)}
                        className={`rounded-full border px-3 py-1.5 text-sm ${tipPercent === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                      >
                        {t("payment.noTip", "No tip")}
                      </button>
                      {bill.tipOptions.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setTipPercent(pct)}
                          className={`rounded-full border px-3 py-1.5 text-sm ${tipPercent === pct ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <p className="mt-2 text-sm text-destructive">{error}</p>
              )}

              {/* Charge preview + provider actions */}
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("pos.split.thisPayment", "This payment")}
                  </span>
                  <span className="text-lg font-bold text-foreground">
                    {eur(chargeTotal)}
                    {tipAmount > 0 && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({t("payment.tip", "Tip")} {eur(tipAmount)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={() => handleSettle("CASH")}
                    className="min-h-[44px] rounded-lg bg-success py-3 font-semibold text-success-foreground disabled:opacity-50"
                  >
                    {submitting
                      ? t("pos.closing", "...")
                      : t("pos.split.payCash", "Cash")}
                  </button>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    onClick={() => handleSettle("MYPOS")}
                    className="min-h-[44px] rounded-lg bg-warning py-3 font-semibold text-warning-foreground disabled:opacity-50"
                  >
                    {submitting
                      ? t("pos.closing", "...")
                      : t("pos.split.payCard", "Card")}
                  </button>
                </div>
              </div>
            </>
          )}

          {!loading && error && !bill && (
            <div className="space-y-3 py-4">
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                onClick={loadBill}
                className="w-full rounded-lg brand-cta py-3 font-semibold"
              >
                {t("common.retry", "Retry")}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
