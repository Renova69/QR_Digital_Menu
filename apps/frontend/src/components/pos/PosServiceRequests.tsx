import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Check,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAssistance } from "../../context/AssistanceContext";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { useSocket } from "../../context/SocketContext";
import { usePosTheme } from "../../context/PosThemeContext";
import {
  cancelCashPaymentRequest,
  confirmCashPaymentRequest,
  getCashPaymentRequests,
  type CashPaymentRequest,
} from "../../lib/api";
import { formatEuro } from "../../lib/currency";

export default function PosServiceRequests() {
  const { t } = useTranslation();
  const { theme } = usePosTheme();
  const { activeRestaurant } = useRestaurantContext();
  const { socket, isConnected } = useSocket();
  const { requests, markAsResolved } = useAssistance();
  const [cashRequests, setCashRequests] = useState<CashPaymentRequest[]>([]);
  const [cashLoading, setCashLoading] = useState(false);
  const [cashError, setCashError] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const cashFetchVersion = useRef(0);

  const refreshCashRequests = useCallback(async () => {
    const version = ++cashFetchVersion.current;
    if (!activeRestaurant?.id) {
      setCashRequests([]);
      return;
    }

    setCashLoading(true);
    setCashError(false);
    try {
      const response = await getCashPaymentRequests(
        activeRestaurant.id,
        "PENDING",
      );
      if (cashFetchVersion.current !== version) return;
      setCashRequests(
        response.filter((request) => request.status === "PENDING"),
      );
    } catch (error) {
      if (cashFetchVersion.current !== version) return;
      console.error("Failed to load POS cash payment requests:", error);
      setCashError(true);
    } finally {
      if (cashFetchVersion.current === version) setCashLoading(false);
    }
  }, [activeRestaurant?.id]);

  useEffect(() => {
    void refreshCashRequests();
  }, [isConnected, refreshCashRequests]);

  useEffect(() => {
    if (!socket || !isConnected || !activeRestaurant?.id) return;

    const belongsToActiveRestaurant = (request: CashPaymentRequest) =>
      request.restaurantId === activeRestaurant.id;

    const handleCreated = (request: CashPaymentRequest) => {
      if (!belongsToActiveRestaurant(request) || request.status !== "PENDING") {
        return;
      }
      cashFetchVersion.current += 1;
      setCashLoading(false);
      setCashError(false);
      setCashRequests((current) => [
        request,
        ...current.filter((item) => item.id !== request.id),
      ]);
    };

    const handleUpdated = (request: CashPaymentRequest) => {
      if (!belongsToActiveRestaurant(request)) return;
      cashFetchVersion.current += 1;
      setCashLoading(false);
      setCashError(false);
      setCashRequests((current) =>
        request.status === "PENDING"
          ? [request, ...current.filter((item) => item.id !== request.id)]
          : current.filter((item) => item.id !== request.id),
      );
    };

    socket.on("cashPaymentRequest:created", handleCreated);
    socket.on("cashPaymentRequest:updated", handleUpdated);

    return () => {
      socket.off("cashPaymentRequest:created", handleCreated);
      socket.off("cashPaymentRequest:updated", handleUpdated);
    };
  }, [activeRestaurant?.id, isConnected, socket]);

  const activeAssistanceRequests = useMemo(
    () =>
      requests
        .filter((request) => !request.isResolved)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [requests],
  );

  const pendingCashRequests = useMemo(
    () =>
      cashRequests
        .filter((request) => request.status === "PENDING")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [cashRequests],
  );

  const pendingCount =
    activeAssistanceRequests.length + pendingCashRequests.length;
  const title = t("assistance.title", "Assistance Requests");

  const handleResolve = async (requestId: string) => {
    setActionId(requestId);
    setActionError(false);
    try {
      await markAsResolved(requestId);
    } catch (error) {
      console.error("Failed to resolve POS assistance request:", error);
      setActionError(true);
    } finally {
      setActionId(null);
    }
  };

  const handleConfirmCash = async (requestId: string) => {
    setActionId(requestId);
    setActionError(false);
    try {
      await confirmCashPaymentRequest(requestId);
      setCashRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );
    } catch (error) {
      console.error("Failed to confirm POS cash payment request:", error);
      setActionError(true);
    } finally {
      setActionId(null);
    }
  };

  const handleCancelCash = async (requestId: string) => {
    setActionId(requestId);
    setActionError(false);
    try {
      await cancelCashPaymentRequest(requestId);
      setCashRequests((current) =>
        current.filter((request) => request.id !== requestId),
      );
    } catch (error) {
      console.error("Failed to cancel POS cash payment request:", error);
      setActionError(true);
    } finally {
      setActionId(null);
    }
  };

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`relative flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg border transition ${
            pendingCount > 0
              ? "border-primary/40 bg-primary/10 text-primary shadow-[0_0_0_3px_rgba(110,86,248,0.08)]"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
          aria-label={`${title}: ${pendingCount}`}
          title={`${title}: ${pendingCount}`}
        >
          <BellRing className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-black leading-none text-destructive-foreground">
              {pendingCount > 99 ? "99+" : pendingCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9995] bg-black/55" />
        <Dialog.Content
          className={`${theme === "dark" ? "dark" : ""} fixed inset-x-3 bottom-3 z-[9996] flex max-h-[82dvh] flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-dvh sm:max-h-none sm:w-[min(420px,100vw)] sm:rounded-none`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="flex items-center gap-2 text-base font-bold">
                <BellRing className="h-5 w-5 text-primary" />
                {title}
                {pendingCount > 0 && (
                  <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-black text-destructive-foreground">
                    {pendingCount}
                  </span>
                )}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t(
                  "assistance.subtitle",
                  "See which tables need staff and clear requests fast.",
                )}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={t("common.close", "Close")}
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {(cashError || actionError) && (
            <div className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-xs font-semibold text-destructive">
              <span>
                {t(
                  actionError
                    ? "assistance.updateFailed"
                    : "assistance.cashFetchFailed",
                  "The request could not be updated. Please try again.",
                )}
              </span>
              {cashError && (
                <button
                  type="button"
                  onClick={() => void refreshCashRequests()}
                  className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-destructive/30 px-2.5 text-xs font-bold"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("common.retry", "Retry")}
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {cashLoading && pendingCount === 0 ? (
              <div className="flex min-h-44 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : pendingCount === 0 ? (
              <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
                <Check className="mb-3 h-8 w-8 text-success" />
                <p className="text-sm font-semibold">
                  {t("assistance.noActive", "No active assistance requests")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pendingCashRequests.map((request) => {
                  const isBusy = actionId === request.id;
                  return (
                    <article key={request.id} className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
                          <Banknote className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black">
                                {request.tableName ??
                                  request.tableId ??
                                  t("orders.table", { id: "—" })}
                              </p>
                              <p className="mt-0.5 text-xs font-semibold text-emerald-600">
                                {t(
                                  "assistance.cashPaymentRequested",
                                  "Cash payment requested",
                                )}
                              </p>
                            </div>
                            <p className="shrink-0 text-base font-black text-foreground">
                              {formatEuro(request.requestedAmount)}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {request.scope === "ORDER_ITEMS"
                              ? t("assistance.cashScopeMyOrders", "My orders")
                              : t(
                                  "assistance.cashScopeFullTable",
                                  "Full table",
                                )}
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleConfirmCash(request.id)}
                              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                              {t(
                                "assistance.confirmCashCollected",
                                "Confirm cash collected",
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleCancelCash(request.id)}
                              className="min-h-11 rounded-lg border border-border px-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                            >
                              {t("common.cancel", "Cancel")}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {activeAssistanceRequests.map((request) => {
                  const isBusy = actionId === request.id;
                  return (
                    <article key={request.id} className="px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                            request.type === "URGENT"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {request.type === "URGENT" ? (
                            <AlertTriangle className="h-5 w-5" />
                          ) : (
                            <BellRing className="h-5 w-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black">
                              {request.tableId}
                            </p>
                            {request.type === "URGENT" && (
                              <span className="rounded-full bg-destructive px-2 py-0.5 text-[10px] font-black uppercase text-destructive-foreground">
                                {t("assistance.urgent", "Urgent")}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs font-semibold text-primary">
                            {request.type === "CASH_PAYMENT"
                              ? t(
                                  "assistance.cashPaymentRequested",
                                  "Cash payment requested",
                                )
                              : t(
                                  "assistance.guestNeedsStaff",
                                  "Guest needs staff",
                                )}
                          </p>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleResolve(request.id)}
                            className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            {t("assistance.markResolved", "Mark as Resolved")}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
