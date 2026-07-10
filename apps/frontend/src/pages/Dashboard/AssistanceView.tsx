import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BellRing,
  Ban,
  Check,
  Clock,
  History,
  Menu,
  ReceiptText,
  RotateCcw,
  Search,
  Sparkles,
  Timer,
  Volume2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAssistance } from "../../context/AssistanceContext";
import { useAuth } from "../../context/AuthContext";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { useSocket } from "../../context/SocketContext";
import {
  cancelCashPaymentRequest,
  confirmCashPaymentRequest,
  getCashPaymentRequests,
  type CashPaymentRequest,
} from "../../lib/api";
import { formatEuro } from "../../lib/currency";
import { cn } from "../../lib/utils";

type AssistanceContextValue = ReturnType<typeof useAssistance>;
type AssistanceRequest = AssistanceContextValue["requests"][number];
type RequestFilter = "active" | "resolved" | "all";

function formatRequestTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getElapsedMinutes(value: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
}

function getElapsedLabel(value: string, t: TFunction) {
  const minutes = getElapsedMinutes(value);
  if (minutes < 1) return t("assistance.justNow", "just now");
  if (minutes < 60)
    return t("assistance.minutesShort", "{{count}} min", { count: minutes });
  const hours = Math.floor(minutes / 60);
  return t("assistance.hoursShort", "{{count}} h", { count: hours });
}

function getUrgencyStyle(request: AssistanceRequest) {
  if (request.isResolved) {
    return {
      card: "before:bg-emerald-500",
      badge:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
      ring: "border-border",
    };
  }

  if (request.type === "CASH_PAYMENT") {
    return {
      card: "before:bg-emerald-500",
      badge:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200",
      ring: "border-emerald-300 shadow-[0_0_0_3px_rgba(16,185,129,0.08)] dark:border-emerald-500/40",
    };
  }

  const minutes = getElapsedMinutes(request.createdAt);
  if (minutes >= 10) {
    return {
      card: "before:bg-red-500",
      badge: "bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-200",
      ring: "border-red-300 shadow-[0_0_0_3px_rgba(239,68,68,0.08)] dark:border-red-500/40",
    };
  }

  if (minutes >= 5) {
    return {
      card: "before:bg-orange-500",
      badge:
        "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-200",
      ring: "border-orange-300 shadow-[0_0_0_3px_rgba(249,115,22,0.08)] dark:border-orange-500/40",
    };
  }

  return {
    card: "before:bg-primary",
    badge: "bg-primary/10 text-primary",
    ring: "border-border",
  };
}

function getRequestTitle(request: AssistanceRequest, t: TFunction) {
  if (request.type === "CASH_PAYMENT") {
    return t("assistance.cashPaymentRequested", "Cash payment requested");
  }
  return request.isResolved
    ? t("assistance.requestCompleted")
    : t("assistance.guestNeedsStaff");
}

function getCashRequestScopeLabel(request: CashPaymentRequest, t: TFunction) {
  return request.scope === "ORDER_ITEMS"
    ? t("assistance.cashScopeMyOrders", "My orders")
    : t("assistance.cashScopeFullTable", "Full table");
}

function getCashRequestStatusLabel(request: CashPaymentRequest, t: TFunction) {
  if (request.status === "PAID") return t("payments.paid", "Paid");
  if (request.status === "CANCELLED") return t("common.cancelled", "Cancelled");
  return t("assistance.waiting", "Waiting");
}

const AssistanceView = () => {
  const { requests, markAsResolved, markAsUnresolved } = useAssistance();
  const { activeRestaurant } = useRestaurantContext();
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<RequestFilter>("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [cashRequests, setCashRequests] = useState<CashPaymentRequest[]>([]);
  const [cashActionId, setCashActionId] = useState<string | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  const userRole = user?.role?.toUpperCase();
  const canManageCashPayments =
    !!userRole &&
    ["OWNER", "MANAGER", "WAITER", "STAFF", "SUPER_ADMIN"].includes(userRole);

  const refreshCashRequests = useCallback(async () => {
    if (!activeRestaurant?.id) {
      setCashRequests([]);
      return;
    }

    try {
      const data = await getCashPaymentRequests(activeRestaurant.id);
      setCashRequests(data);
    } catch (error) {
      console.error("Failed to fetch cash payment requests:", error);
    }
  }, [activeRestaurant?.id]);

  useEffect(() => {
    void refreshCashRequests();
  }, [refreshCashRequests]);

  useEffect(() => {
    if (!socket || !isConnected || !activeRestaurant?.id) return;

    const handleCashRequestChanged = () => {
      void refreshCashRequests();
    };

    socket.on("cashPaymentRequest:created", handleCashRequestChanged);
    socket.on("cashPaymentRequest:updated", handleCashRequestChanged);

    return () => {
      socket.off("cashPaymentRequest:created", handleCashRequestChanged);
      socket.off("cashPaymentRequest:updated", handleCashRequestChanged);
    };
  }, [activeRestaurant?.id, isConnected, refreshCashRequests, socket]);

  const activeRequests = useMemo(
    () =>
      requests
        .filter((request) => !request.isResolved)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [requests],
  );

  const resolvedRequests = useMemo(
    () =>
      requests
        .filter((request) => request.isResolved)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [requests],
  );

  const visibleRequests = useMemo(() => {
    const source =
      filter === "active"
        ? activeRequests
        : filter === "resolved"
          ? resolvedRequests
          : requests;
    const query = searchTerm.trim().toLowerCase();

    return source
      .filter((request) => {
        if (!query) return true;
        return String(request.tableId ?? "")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        if (filter === "resolved") {
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        }
        if (filter === "all" && a.isResolved !== b.isResolved) {
          return Number(a.isResolved) - Number(b.isResolved);
        }
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
  }, [activeRequests, filter, requests, resolvedRequests, searchTerm]);

  const activeCashRequests = useMemo(
    () =>
      cashRequests
        .filter((request) => request.status === "PENDING")
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
    [cashRequests],
  );

  const resolvedCashRequests = useMemo(
    () =>
      cashRequests
        .filter((request) => request.status !== "PENDING")
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ),
    [cashRequests],
  );

  const visibleCashRequests = useMemo(() => {
    const source =
      filter === "active"
        ? activeCashRequests
        : filter === "resolved"
          ? resolvedCashRequests
          : cashRequests;
    const query = searchTerm.trim().toLowerCase();

    return source
      .filter((request) => {
        if (!query) return true;
        return (
          String(request.tableName ?? request.tableId ?? "")
            .toLowerCase()
            .includes(query) ||
          String(request.tableId ?? "")
            .toLowerCase()
            .includes(query)
        );
      })
      .sort((a, b) => {
        if (filter === "resolved") {
          return (
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        }
        if (filter === "all" && a.status !== b.status) {
          return a.status === "PENDING" ? -1 : 1;
        }
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
  }, [
    activeCashRequests,
    cashRequests,
    filter,
    resolvedCashRequests,
    searchTerm,
  ]);

  const handleResolve = async (requestId: string) => {
    try {
      await markAsResolved(requestId);
    } catch (error) {
      console.error("Failed to resolve request:", error);
    }
  };

  const handleReopen = async (requestId: string) => {
    try {
      await markAsUnresolved(requestId);
    } catch (error) {
      console.error("Failed to reopen request:", error);
    }
  };

  const handleConfirmCash = async (requestId: string) => {
    setCashActionId(requestId);
    setCashError(null);
    try {
      await confirmCashPaymentRequest(requestId);
      await refreshCashRequests();
    } catch (error: any) {
      setCashError(
        error?.response?.data?.message ||
          t("assistance.cashConfirmFailed", "Could not confirm cash payment."),
      );
    } finally {
      setCashActionId(null);
    }
  };

  const handleCancelCash = async (requestId: string) => {
    setCashActionId(requestId);
    setCashError(null);
    try {
      await cancelCashPaymentRequest(requestId);
      await refreshCashRequests();
    } catch (error: any) {
      setCashError(
        error?.response?.data?.message ||
          t("assistance.cashCancelFailed", "Could not cancel cash request."),
      );
    } finally {
      setCashActionId(null);
    }
  };

  const handleSoundPreview = () => {
    new Audio("/notification.mp3").play().catch(() => {});
  };

  const filters: Array<{
    id: RequestFilter;
    label: string;
    count: number;
    Icon: typeof BellRing;
  }> = [
    {
      id: "active",
      label: t("assistance.active", "Active"),
      count: activeRequests.length + activeCashRequests.length,
      Icon: BellRing,
    },
    {
      id: "resolved",
      label: t("assistance.resolved", "Resolved"),
      count: resolvedRequests.length + resolvedCashRequests.length,
      Icon: Check,
    },
    {
      id: "all",
      label: t("tables.allTables", "All"),
      count: requests.length + cashRequests.length,
      Icon: History,
    },
  ];

  return (
    <section className="min-h-full bg-background text-foreground">
      <div className="mb-6 flex flex-col gap-5 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm transition hover:bg-muted"
            aria-label={t("common.menu", "Menu")}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-black leading-tight text-foreground">
              {t("assistance.title", "Assistance Requests")}
            </h1>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {t(
                "assistance.subtitle",
                "See which tables need staff and clear requests fast.",
              )}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:justify-end">
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t(
                "assistance.searchPlaceholder",
                "Search by table...",
              )}
              className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <button
            type="button"
            onClick={handleSoundPreview}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary transition hover:bg-primary/15"
            aria-label={t("orders.previewSound", "Preview request sound")}
          >
            <Volume2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 shadow-sm sm:flex sm:flex-wrap sm:items-center">
            {filters.map(({ id, label, count, Icon }) => {
              const isActive = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={cn(
                    "flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold transition active:scale-[0.98] sm:h-9 sm:px-4",
                    isActive
                      ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  <span
                    className={cn(
                      "flex h-5 min-w-6 items-center justify-center rounded-full px-2 text-[11px] font-black",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center">
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/20 dark:bg-red-500/10">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600 dark:text-red-300">
              {t("assistance.waiting")}
            </p>
            <p className="mt-0.5 text-xl font-black text-red-700 dark:text-red-200">
              {activeRequests.length + activeCashRequests.length}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              {t("assistance.cleared")}
            </p>
            <p className="mt-0.5 text-xl font-black text-foreground">
              {resolvedRequests.length + resolvedCashRequests.length}
            </p>
          </div>
        </div>
      </div>

      {cashError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
          {cashError}
        </div>
      )}

      {visibleCashRequests.length > 0 && (
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em] text-foreground">
                <Banknote className="h-4 w-4 text-emerald-600" />
                {t("assistance.cashCollection", "Cash collection")}
              </h2>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                {t(
                  "assistance.cashCollectionHint",
                  "Confirm only after staff has physically collected the cash.",
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleCashRequests.map((request) => {
              const isPending = request.status === "PENDING";
              const isBusy = cashActionId === request.id;
              const elapsedSource = isPending
                ? request.createdAt
                : request.updatedAt;
              return (
                <article
                  key={request.id}
                  className={cn(
                    "relative flex min-h-[220px] flex-col overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition",
                    "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1",
                    isPending
                      ? "before:bg-emerald-500 border-emerald-300 dark:border-emerald-500/40"
                      : "before:bg-muted-foreground/40 border-border",
                  )}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-6 items-center rounded-full px-2 text-[10px] font-black uppercase",
                            isPending
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {getCashRequestStatusLabel(request, t)}
                        </span>
                        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-primary/10 px-2 text-[10px] font-black uppercase text-primary">
                          <ReceiptText className="h-3 w-3" />
                          {getCashRequestScopeLabel(request, t)}
                        </span>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        {t("orders.table", { id: "" }).trim() || "Table"}
                      </p>
                      <h3 className="mt-1 truncate text-4xl font-black tracking-tight text-foreground">
                        {request.tableName ?? request.tableId}
                      </h3>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                        {isPending
                          ? t("assistance.waiting")
                          : t("assistance.cleared")}
                      </p>
                      <p className="mt-1 flex items-center justify-end gap-1.5 text-sm font-black text-foreground">
                        <Timer className="h-3.5 w-3.5 text-primary" />
                        {getElapsedLabel(elapsedSource, t)}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4 rounded-lg border border-border bg-muted/35 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {t("payments.amount", "Amount")}
                    </p>
                    <p className="mt-1 text-2xl font-black text-foreground">
                      {formatEuro(request.requestedAmount)}
                    </p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {isPending
                        ? t("assistance.requested", {
                            time: formatRequestTime(request.createdAt),
                          })
                        : t("assistance.resolvedAt", {
                            time: formatRequestTime(request.updatedAt),
                          })}
                    </p>
                  </div>

                  {isPending ? (
                    <div className="mt-auto grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmCash(request.id)}
                        disabled={isBusy || !canManageCashPayments}
                        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-black text-white shadow-[0_10px_20px_-12px_rgba(5,150,105,0.9)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {isBusy
                          ? t("common.saving", "Saving...")
                          : t(
                              "assistance.confirmCashCollected",
                              "Confirm cash collected",
                            )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancelCash(request.id)}
                        disabled={isBusy || !canManageCashPayments}
                        className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-black text-foreground transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98]"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {t("common.cancel", "Cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-auto rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs font-bold text-muted-foreground">
                      {request.status === "PAID"
                        ? t("assistance.cashRecorded", "Cash payment recorded")
                        : t(
                            "assistance.cashCancelled",
                            "Cash request cancelled",
                          )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {visibleRequests.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleRequests.map((request) => {
            const urgency = getUrgencyStyle(request);
            const elapsedSource = request.isResolved
              ? request.updatedAt
              : request.createdAt;
            return (
              <article
                key={request.id}
                className={cn(
                  "relative flex aspect-[1.08/1] flex-col overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition",
                  "before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1",
                  urgency.card,
                  urgency.ring,
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex h-6 items-center rounded-full px-2 text-[10px] font-black uppercase",
                          urgency.badge,
                        )}
                      >
                        {request.isResolved
                          ? t("assistance.resolved", "Resolved")
                          : t("assistance.active", "Active")}
                      </span>
                      {request.type === "URGENT" && !request.isResolved && (
                        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-red-500 px-2 text-[10px] font-black uppercase text-white shadow-sm">
                          <AlertTriangle className="h-3 w-3" />
                          {t("assistance.urgent", "Urgent")}
                        </span>
                      )}
                      {request.type === "CASH_PAYMENT" && (
                        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-emerald-500 px-2 text-[10px] font-black uppercase text-white shadow-sm">
                          <Banknote className="h-3 w-3" />
                          {t("assistance.cash", "Cash")}
                        </span>
                      )}
                      {!request.isResolved && (
                        <span className="flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.12)]" />
                      )}
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {t("orders.table", { id: "" }).trim() || "Table"}
                    </p>
                    <h2 className="mt-1 truncate text-4xl font-black tracking-tight text-foreground">
                      {request.tableId}
                    </h2>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                      {request.isResolved
                        ? t("assistance.cleared")
                        : t("assistance.waiting")}
                    </p>
                    <p className="mt-1 flex items-center justify-end gap-1.5 text-sm font-black text-foreground">
                      <Timer className="h-3.5 w-3.5 text-primary" />
                      {getElapsedLabel(elapsedSource, t)}
                    </p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 rounded-lg border border-border bg-muted/35 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {request.isResolved
                        ? t("assistance.resolvedAt", {
                            time: formatRequestTime(request.updatedAt),
                          })
                        : t("assistance.requested", {
                            time: formatRequestTime(request.createdAt),
                          })}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        request.isResolved
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {request.isResolved ? (
                        <Check className="h-4 w-4" />
                      ) : request.type === "CASH_PAYMENT" ? (
                        <Banknote className="h-4 w-4" />
                      ) : (
                        <BellRing className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-foreground">
                        {getRequestTitle(request, t)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-auto border-t border-border pt-3">
                  {request.isResolved ? (
                    <button
                      type="button"
                      onClick={() => handleReopen(request.id)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 text-xs font-black text-foreground transition hover:bg-secondary active:scale-[0.98]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("assistance.reopen")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleResolve(request.id)}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-black text-white shadow-[0_10px_20px_-12px_rgba(110,86,248,0.9)] transition hover:bg-accent active:scale-[0.98]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {t("assistance.markResolved")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : visibleCashRequests.length === 0 ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="text-lg font-black text-foreground">
              {filter === "active"
                ? t("assistance.noActive")
                : searchTerm
                  ? t("assistance.noMatchingRequests")
                  : t("assistance.noRequestsHere")}
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {filter === "active"
                ? t("assistance.allGuestsAssisted")
                : t("assistance.tryAnotherFilter")}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default AssistanceView;
