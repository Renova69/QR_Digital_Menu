import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  CircleX,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import {
  getPaymentReconciliationIssues,
  resolvePaymentReconciliationIssue,
  type PaymentReconciliationIssue,
  type PaymentReconciliationStatus,
} from "../../lib/api";
import { useSocket } from "../../context/SocketContext";
import { cn } from "../../lib/utils";
import {
  formatDateTime,
  formatMoney,
  methodStyles,
  shortId,
} from "./paymentsShared";

type ReconciliationDecision = Exclude<PaymentReconciliationStatus, "OPEN">;

interface PaymentReconciliationQueueProps {
  restaurantId?: string | null;
}

function reconciliationQueryKey(restaurantId?: string | null) {
  return ["paymentReconciliation", restaurantId, "OPEN"] as const;
}

export function PaymentReconciliationQueue({
  restaurantId,
}: PaymentReconciliationQueueProps) {
  const { t, i18n } = useTranslation();
  const { socket } = useSocket();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => reconciliationQueryKey(restaurantId),
    [restaurantId],
  );
  const [decision, setDecision] = useState<{
    issueId: string;
    status: ReconciliationDecision;
  } | null>(null);
  const [note, setNote] = useState("");

  const {
    data: issues = [],
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => getPaymentReconciliationIssues(restaurantId!, "OPEN"),
    enabled: !!restaurantId,
  });

  useEffect(() => {
    setDecision(null);
    setNote("");
  }, [restaurantId]);

  useEffect(() => {
    if (!socket || !restaurantId) return;

    const refreshQueue = () => {
      void queryClient.invalidateQueries({ queryKey });
    };

    socket.on("payment:reconciliationRequired", refreshQueue);
    return () => {
      socket.off("payment:reconciliationRequired", refreshQueue);
    };
  }, [queryClient, queryKey, restaurantId, socket]);

  const resolveMutation = useMutation({
    mutationFn: ({
      issueId,
      status,
      note: resolutionNote,
    }: {
      issueId: string;
      status: ReconciliationDecision;
      note?: string;
    }) =>
      resolvePaymentReconciliationIssue(issueId, {
        status,
        ...(resolutionNote ? { note: resolutionNote } : {}),
      }),
    onSuccess: (resolvedIssue) => {
      queryClient.setQueryData<PaymentReconciliationIssue[]>(
        queryKey,
        (current = []) =>
          current.filter((issue) => issue.id !== resolvedIssue.id),
      );
      setDecision(null);
      setNote("");
    },
  });

  if (!restaurantId) return null;

  if (isLoading) {
    return (
      <div
        className="mb-5 flex min-h-12 items-center gap-2 border-y border-border/70 px-1 py-3 text-sm font-medium text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {t("payments.reconciliation.loading")}
      </div>
    );
  }

  if (isError && issues.length === 0) {
    return (
      <div
        className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-red-300 bg-red-50 px-4 py-3 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100"
        role="alert"
      >
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-bold">
            {t("payments.reconciliation.loadError")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex h-9 items-center gap-2 rounded-md border border-red-300 bg-background px-3 text-sm font-bold text-red-800 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-400/30 dark:text-red-100 dark:hover:bg-red-400/10"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          {t("payments.reconciliation.retry")}
        </button>
      </div>
    );
  }

  if (issues.length === 0) return null;

  const startDecision = (issueId: string, status: ReconciliationDecision) => {
    resolveMutation.reset();
    setDecision({ issueId, status });
    setNote("");
  };

  return (
    <section
      className="mb-5 overflow-hidden rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-400/30 dark:bg-amber-400/10"
      aria-labelledby="payment-reconciliation-title"
    >
      <div className="flex items-start gap-3 border-b border-amber-200 px-4 py-3 dark:border-amber-400/20">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-200" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2
              id="payment-reconciliation-title"
              className="text-base font-black text-amber-950 dark:text-amber-50"
            >
              {t("payments.reconciliation.title")}
            </h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-black text-amber-900 dark:bg-amber-300/20 dark:text-amber-100">
              {t("payments.reconciliation.count", { count: issues.length })}
            </span>
          </div>
          <p className="mt-0.5 text-sm font-medium text-amber-800 dark:text-amber-100/80">
            {t("payments.reconciliation.description")}
          </p>
          {isError && (
            <p className="mt-1 text-sm font-bold text-red-700 dark:text-red-200">
              {t("payments.reconciliation.refreshError")}
            </p>
          )}
        </div>
      </div>

      <div className="divide-y divide-amber-200 dark:divide-amber-400/20">
        {issues.map((issue) => {
          const isDeciding = decision?.issueId === issue.id;
          const isMutating = isDeciding && resolveMutation.isPending;
          const providerStyle = methodStyles[issue.provider];
          const ProviderIcon = providerStyle.Icon;
          const tableName =
            issue.tableSession?.table.name ??
            t("payments.reconciliation.noTable");
          const sessionStatus = issue.tableSession?.status
            ? t(
                `payments.reconciliation.sessionStatus.${issue.tableSession.status}`,
                { defaultValue: issue.tableSession.status },
              )
            : t("payments.reconciliation.noSession");

          return (
            <article key={issue.id} className="bg-background/60 px-4 py-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-black",
                        providerStyle.tone,
                      )}
                    >
                      <ProviderIcon className="h-3.5 w-3.5" />
                      {providerStyle.label}
                    </span>
                    <span className="text-base font-black text-foreground">
                      {formatMoney(issue.amount, issue.currency)}
                    </span>
                  </div>

                  <p className="mt-2 max-w-3xl text-sm font-bold leading-5 text-foreground">
                    {t(`payments.reconciliation.reason.${issue.reason}`)}
                  </p>

                  <dl className="mt-3 grid gap-x-5 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <ReconciliationDetail
                      label={t("payments.reconciliation.table")}
                      value={tableName}
                    />
                    <ReconciliationDetail
                      label={t("payments.reconciliation.session")}
                      value={sessionStatus}
                    />
                    <ReconciliationDetail
                      label={t("payments.reconciliation.payment")}
                      value={shortId(issue.paymentId)}
                    />
                    <ReconciliationDetail
                      label={t("payments.reconciliation.created")}
                      value={formatDateTime(issue.createdAt, i18n.language)}
                    />
                  </dl>
                </div>

                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button
                    type="button"
                    onClick={() => startDecision(issue.id, "RESOLVED")}
                    disabled={resolveMutation.isPending}
                    className="flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {t("payments.reconciliation.resolve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => startDecision(issue.id, "DISMISSED")}
                    disabled={resolveMutation.isPending}
                    className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-bold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CircleX className="h-4 w-4" />
                    {t("payments.reconciliation.dismiss")}
                  </button>
                </div>
              </div>

              {isDeciding && (
                <form
                  className="mt-4 border-t border-amber-200 pt-4 dark:border-amber-400/20"
                  onSubmit={(event) => {
                    event.preventDefault();
                    resolveMutation.mutate({
                      issueId: issue.id,
                      status: decision.status,
                      note: note.trim() || undefined,
                    });
                  }}
                >
                  <label
                    htmlFor={`reconciliation-note-${issue.id}`}
                    className="text-sm font-bold text-foreground"
                  >
                    {t("payments.reconciliation.note")}
                  </label>
                  <textarea
                    id={`reconciliation-note-${issue.id}`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={500}
                    rows={2}
                    disabled={isMutating}
                    placeholder={t("payments.reconciliation.notePlaceholder")}
                    className="mt-2 block w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
                  />
                  {resolveMutation.isError && (
                    <p
                      className="mt-2 text-sm font-bold text-red-700 dark:text-red-200"
                      role="alert"
                    >
                      {t("payments.reconciliation.mutationError")}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={isMutating}
                      className={cn(
                        "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50",
                        decision.status === "RESOLVED"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "bg-red-600 hover:bg-red-700",
                      )}
                    >
                      {isMutating ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : decision.status === "RESOLVED" ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <CircleX className="h-4 w-4" />
                      )}
                      {decision.status === "RESOLVED"
                        ? t("payments.reconciliation.confirmResolve")
                        : t("payments.reconciliation.confirmDismiss")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resolveMutation.reset();
                        setDecision(null);
                        setNote("");
                      }}
                      disabled={isMutating}
                      className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      {t("payments.reconciliation.cancel")}
                    </button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReconciliationDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-bold text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}
