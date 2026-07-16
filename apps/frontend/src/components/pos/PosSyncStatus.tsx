import { useContext, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloudCheck,
  CloudUpload,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { usePosTheme } from "../../context/PosThemeContext";
import { usePosOfflineSync } from "../../hooks/usePosOfflineSync";
import type { QueuedPosOrder } from "../../lib/posOfflineOrders";

function queuedOrderTotal(order: QueuedPosOrder): number {
  return order.payload.items.reduce((total, item) => {
    const optionTotal = item.selectedOptions.reduce(
      (sum, option) => sum + option.priceModifier,
      0,
    );
    return total + (item.expectedUnitPrice + optionTotal) * item.quantity;
  }, 0);
}

export default function PosSyncStatus() {
  const { t } = useTranslation();
  const { theme } = usePosTheme();
  const restaurant = useContext(RestaurantContext)?.activeRestaurant ?? null;
  const [open, setOpen] = useState(false);
  const {
    orders,
    pendingCount,
    conflictCount,
    isOnline,
    isSyncing,
    storageError,
    syncNow,
    retry,
    edit,
    discard,
  } = usePosOfflineSync(restaurant?.id);

  const status = conflictCount
    ? {
        label: t("pos.syncNeedsReview", "{{count}} need review", {
          count: conflictCount,
        }),
        icon: TriangleAlert,
        className: "border-destructive/40 bg-destructive/10 text-destructive",
      }
    : !isOnline
      ? {
          label: t("pos.syncOffline", "Offline"),
          icon: WifiOff,
          className: "border-warning/50 bg-warning/10 text-warning-foreground",
        }
      : isSyncing
        ? {
            label: t("pos.syncing", "Syncing"),
            icon: RefreshCw,
            className: "border-primary/40 bg-primary/10 text-primary",
          }
        : pendingCount
          ? {
              label: t("pos.syncQueued", "{{count}} queued", {
                count: pendingCount,
              }),
              icon: CloudUpload,
              className:
                "border-warning/50 bg-warning/10 text-warning-foreground",
            }
          : {
              label: t("pos.syncReady", "Synced"),
              icon: CloudCheck,
              className: "border-success/40 bg-success/10 text-success",
            };
  const StatusIcon = status.icon;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${status.className}`}
          aria-label={status.label}
          title={status.label}
        >
          <StatusIcon
            className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
          />
          <span className="hidden xl:inline">{status.label}</span>
          {(pendingCount > 0 || conflictCount > 0) && (
            <span className="min-w-5 rounded-full bg-background/80 px-1.5 text-center text-xs font-bold tabular-nums text-foreground">
              {pendingCount + conflictCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9995] bg-black/55" />
        <Dialog.Content
          className={`${theme === "dark" ? "dark" : ""} fixed inset-x-3 top-1/2 z-[9996] mx-auto flex max-h-[86dvh] max-w-lg -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl`}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">
                {t("pos.offlineOrders", "Offline orders")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
                {isOnline
                  ? t("pos.connectionOnline", "Connection available")
                  : t("pos.connectionOffline", "No connection")}
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={!isOnline || isSyncing || pendingCount === 0}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label={t("pos.syncNow", "Sync now")}
                title={t("pos.syncNow", "Sync now")}
              >
                <RefreshCw
                  className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                />
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("common.close", "Close")}
                >
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {storageError && (
              <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {storageError}
              </div>
            )}

            {orders.length === 0 && !storageError ? (
              <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center">
                <CloudCheck className="mb-3 h-8 w-8 text-success" />
                <p className="text-sm font-medium">
                  {t("pos.noOfflineOrders", "All orders are synced")}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {orders.map((order) => {
                  const itemCount = order.payload.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  );
                  return (
                    <div key={order.clientOrderId} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {order.tableName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t(
                              "pos.queuedOrderSummary",
                              "{{count}} items · €{{total}}",
                              {
                                count: itemCount,
                                total: queuedOrderTotal(order).toFixed(2),
                              },
                            )}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                            order.status === "conflict"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-warning/10 text-warning-foreground"
                          }`}
                        >
                          {order.status === "conflict"
                            ? t("pos.review", "Review")
                            : t("pos.queued", "Queued")}
                        </span>
                      </div>

                      {(order.conflict || order.lastError) && (
                        <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2">
                          <p className="text-xs font-semibold">
                            {(order.conflict ?? order.lastError)?.code}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {(order.conflict ?? order.lastError)?.message}
                          </p>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void retry(order.clientOrderId)}
                          disabled={!isOnline || isSyncing}
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                        >
                          <RefreshCw className="h-4 w-4" />
                          {t("common.retry", "Retry")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void edit(order.clientOrderId);
                            setOpen(false);
                          }}
                          disabled={isSyncing}
                          title={
                            isSyncing
                              ? t(
                                  "pos.syncInProgress",
                                  "Sync in progress — wait for it to finish",
                                )
                              : undefined
                          }
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                        >
                          <Pencil className="h-4 w-4" />
                          {t("pos.editQueuedOrder", "Edit order")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  "pos.discardQueuedOrderConfirm",
                                  "Discard this queued order?",
                                ),
                              )
                            ) {
                              void discard(order.clientOrderId);
                            }
                          }}
                          disabled={isSyncing}
                          title={
                            isSyncing
                              ? t(
                                  "pos.syncInProgress",
                                  "Sync in progress — wait for it to finish",
                                )
                              : undefined
                          }
                          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("common.discard", "Discard")}
                        </button>
                      </div>
                    </div>
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
