import {
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertCircle,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  getPaymentDetail,
  getPaymentHistory,
  getPaymentOverview,
  getPaymentPayouts,
  getPaymentSettings,
  getPaymentsExport,
  refundPayment,
} from "../../lib/api";
import { downloadPaymentsExport } from "../../lib/paymentsExport";
import RestaurantContext from "../../context/RestaurantContext";
import { useSocket } from "../../context/SocketContext";
import { cn } from "../../lib/utils";
import {
  type PaymentDetail,
  type PaymentMethod,
  type PaymentRecord,
  type PaymentStatus,
  exportPaymentsCsv,
  formatDateTime,
  formatMoney,
  methodStyles,
  shortId,
  statusStyles,
} from "./paymentsShared";
import { PaymentDrawer } from "./PaymentDrawer";
import { PaymentReconciliationQueue } from "./PaymentReconciliationQueue";

type PaymentTab = "transactions" | "payouts" | "refunds" | "settings";

function openStripeAccount(accountId?: string | null) {
  if (!accountId) return;
  window.open(
    `https://dashboard.stripe.com/connect/accounts/${accountId}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function getMethodLabel(
  method: string,
  t: (key: string, options?: any) => string,
) {
  if (method === "STRIPE") return t("payments.stripeMethod");
  if (method === "EPAY") return "ePay.bg";
  if (method === "BORICA") return "BORICA";
  if (method === "MYPOS") return "myPOS";
  if (method === "CASH") return t("payments.cashMethod");
  return method;
}

const PaymentsView = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState<PaymentTab>("transactions");
  const [statusFilter, setStatusFilter] = useState<"" | PaymentStatus>("");
  const [methodFilter, setMethodFilter] = useState<"" | PaymentMethod>("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(
    null,
  );
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [exportError, setExportError] = useState(false);
  const limit = 20;

  // Invalidate payment queries when a refund is processed so the dashboard
  // reflects the change without a manual refresh (#socket-C2).
  useEffect(() => {
    if (!socket || !activeRestaurant?.id) return;
    const onRefund = () => {
      queryClient.invalidateQueries({
        queryKey: ["paymentHistory", activeRestaurant.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["paymentOverview", activeRestaurant.id],
      });
    };
    socket.on("payment:refunded", onRefund);
    return () => {
      socket.off("payment:refunded", onRefund);
    };
  }, [socket, activeRestaurant?.id, queryClient]);

  const effectiveStatus =
    activeTab === "refunds" ? "REFUNDED" : statusFilter || undefined;

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "paymentHistory",
      activeRestaurant?.id,
      effectiveStatus,
      methodFilter,
      deferredSearch,
      page,
    ],
    queryFn: () =>
      getPaymentHistory(activeRestaurant.id, {
        status: effectiveStatus,
        provider: methodFilter || undefined,
        search: deferredSearch || undefined,
        page,
        limit,
      }),
    enabled: !!activeRestaurant?.id,
  });

  const { data: overview } = useQuery({
    queryKey: ["paymentOverview", activeRestaurant?.id],
    queryFn: () => getPaymentOverview(activeRestaurant.id),
    enabled: !!activeRestaurant?.id,
  });

  const { data: payouts } = useQuery({
    queryKey: ["paymentPayouts", activeRestaurant?.id],
    queryFn: () => getPaymentPayouts(activeRestaurant.id),
    enabled: !!activeRestaurant?.id && activeTab === "payouts",
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ["paymentSettings", activeRestaurant?.id],
    queryFn: () => getPaymentSettings(activeRestaurant.id),
    enabled: !!activeRestaurant?.id && activeTab === "settings",
  });

  const { data: selectedPaymentDetail, isLoading: isDetailLoading } = useQuery({
    queryKey: ["paymentDetail", selectedPayment?.id],
    queryFn: () => getPaymentDetail(selectedPayment!.id),
    enabled: !!selectedPayment?.id,
  });

  const refundMutation = useMutation({
    mutationFn: (paymentId: string) => refundPayment(paymentId, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["paymentHistory", activeRestaurant?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["paymentOverview", activeRestaurant?.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["paymentPayouts", activeRestaurant?.id],
      });
      if (selectedPayment?.id) {
        queryClient.invalidateQueries({
          queryKey: ["paymentDetail", selectedPayment.id],
        });
      }
    },
  });

  const payments = (data?.data ?? []) as PaymentRecord[];
  const meta = data?.meta ?? { total: 0, page: 1, limit };

  const filteredPayments = payments;

  const metrics = useMemo(() => {
    const successful = payments.filter(
      (payment) => payment.status === "SUCCEEDED",
    );
    const refunds = payments.filter((payment) => payment.status === "REFUNDED");
    const totalCollected =
      overview?.metrics.totalCollected ??
      successful.reduce((sum, payment) => sum + payment.amount, 0);
    const tipsCollected =
      overview?.metrics.tipsCollected ??
      successful.reduce((sum, payment) => sum + payment.tipAmount, 0);
    const fees =
      overview?.metrics.platformFees ??
      successful.reduce((sum, payment) => sum + payment.platformFeeAmount, 0);
    const average = successful.length ? totalCollected / successful.length : 0;
    const refundAmount =
      overview?.metrics.refundsIssued ??
      refunds.reduce((sum, payment) => sum + payment.amount, 0);
    return {
      totalCollected,
      tipsCollected,
      fees,
      average: overview?.metrics.averageTransaction ?? average,
      refundAmount,
      successfulCount:
        overview?.metrics.successfulTransactions ?? successful.length,
      refundCount: overview?.metrics.refundsCount ?? refunds.length,
      netCollected: overview?.metrics.netCollected ?? totalCollected - fees,
    };
  }, [overview, payments]);

  const methodTotals = useMemo(() => {
    const source = overview?.methodTotals?.length
      ? overview.methodTotals
      : Object.entries(
          payments
            .filter((payment) => payment.status === "SUCCEEDED")
            .reduce<Record<string, number>>((acc, payment) => {
              acc[payment.provider] =
                (acc[payment.provider] ?? 0) + payment.amount;
              return acc;
            }, {}),
        ).map(([method, amount]) => ({ method, amount, fees: 0, count: 0 }));
    return source;
  }, [overview, payments]);

  const account = overview?.account ?? activeRestaurant;

  const exportFilters = {
    status: effectiveStatus,
    provider: methodFilter || undefined,
    search: deferredSearch || undefined,
  };

  const handleExportCsv = async () => {
    if (!activeRestaurant?.id || isExportingCsv) return;
    setIsExportingCsv(true);
    setExportError(false);
    try {
      const allPayments = (await getPaymentsExport(
        activeRestaurant.id,
        exportFilters,
      )) as PaymentRecord[];
      exportPaymentsCsv(allPayments);
    } catch (error) {
      console.error("Failed to export payments as CSV:", error);
      setExportError(true);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!activeRestaurant?.id || isExportingXlsx) return;
    setIsExportingXlsx(true);
    setExportError(false);
    try {
      const allPayments = await getPaymentsExport(
        activeRestaurant.id,
        exportFilters,
      );
      await downloadPaymentsExport(
        allPayments,
        { restaurantName: activeRestaurant.name ?? activeRestaurant.id },
        t,
      );
    } catch (error) {
      console.error("Failed to export payments as XLSX:", error);
      setExportError(true);
    } finally {
      setIsExportingXlsx(false);
    }
  };
  const epayReady = !!(
    account?.epayEnabled &&
    account?.epayClientId &&
    account?.epayMerchantEmail &&
    account?.epaySecretConfigured
  );
  const boricaReady = !!(
    account?.boricaEnabled &&
    (account?.boricaMode === "DEMO" ||
      (account?.boricaTerminalId &&
        account?.boricaMerchantId &&
        account?.boricaPrivateKeyConfigured))
  );
  const myposReady = !!(
    account?.myposEnabled &&
    (account?.myposMode === "DEMO" ||
      (account?.myposClientNumber &&
        account?.myposStoreId &&
        account?.myposKeyIndex &&
        account?.myposPrivateKeyConfigured &&
        account?.myposPublicCert))
  );
  const hostedProviderMissing =
    account?.paymentsEnabled &&
    !account?.stripeOnboarded &&
    !epayReady &&
    !boricaReady &&
    !myposReady;
  const feePercent = Number(account?.platformFeePercent ?? 0);

  const statusOptions: Array<{ value: "" | PaymentStatus; label: string }> = [
    { value: "", label: t("payments.allStatuses") },
    { value: "SUCCEEDED", label: t("payments.succeeded") },
    { value: "PENDING", label: t("payments.pending") },
    { value: "FAILED", label: t("payments.failed") },
    { value: "REFUNDED", label: t("payments.refunded") },
  ];

  const methodOptions: Array<{ value: "" | PaymentMethod; label: string }> = [
    { value: "", label: t("payments.allMethods") },
    { value: "STRIPE", label: t("payments.stripeMethod") },
    { value: "EPAY", label: "ePay.bg" },
    { value: "BORICA", label: "BORICA" },
    { value: "MYPOS", label: "myPOS" },
    { value: "CASH", label: t("payments.cashMethod") },
  ];

  const tabs: Array<{ id: PaymentTab; label: string }> = [
    { id: "transactions", label: t("payments.transactions") },
    { id: "payouts", label: t("payments.payouts") },
    { id: "refunds", label: t("payments.refunds") },
    { id: "settings", label: t("payments.settings") },
  ];

  return (
    <section className="min-h-full bg-background text-foreground">
      <div className="mb-5 flex flex-col gap-3 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-black leading-tight text-foreground">
            {t("payments.title")}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {t("payments.description")}
          </p>
        </div>
      </div>

      <PaymentReconciliationQueue restaurantId={activeRestaurant?.id} />

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {/* Stripe */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-primary/5 p-4 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-[0_12px_24px_-14px_rgba(110,86,248,0.9)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-primary">
                  {t("payments.stripe")}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-black",
                    account?.stripeOnboarded
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200",
                  )}
                >
                  {account?.stripeOnboarded
                    ? t("payments.connected")
                    : t("payments.needsSetup")}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {account?.stripeAccountId ?? t("payments.notConnected")}
              </p>
              {feePercent > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("payments.platformFee")}{" "}
                  <span className="font-bold text-foreground">
                    {feePercent}%
                  </span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openStripeAccount(account?.stripeAccountId)}
              disabled={!account?.stripeAccountId}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("payments.viewOnStripe")}
              <ExternalLink className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("payouts")}
              className="flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
            >
              {t("payments.managePayouts")}
            </button>
          </div>
        </div>

        {/* ePay.bg */}
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-4 shadow-sm",
            epayReady
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10"
              : account?.epayEnabled
                ? "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10"
                : "border-border bg-card",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                epayReady
                  ? "bg-emerald-600"
                  : account?.epayEnabled
                    ? "bg-amber-500"
                    : "bg-muted",
              )}
            >
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-black",
                    epayReady
                      ? "text-emerald-700 dark:text-emerald-300"
                      : account?.epayEnabled
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-foreground",
                  )}
                >
                  ePay.bg
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-black",
                    epayReady
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                      : account?.epayEnabled
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {epayReady
                    ? t("payments.connected")
                    : account?.epayEnabled
                      ? t("payments.needsSetup")
                      : t("payments.disabled", "Disabled")}
                </span>
              </div>
              {account?.epayEnabled && (
                <>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {account?.epayMerchantEmail ?? ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("payments.mode", "Mode")}:{" "}
                    <span className="font-bold text-foreground">
                      {account?.epayMode ?? "DEMO"}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("?tab=settings&settingsTab=payments")}
            className="mt-auto flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
          >
            {t("payments.configure", "Configure")}
          </button>
        </div>

        {/* BORICA */}
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-4 shadow-sm",
            boricaReady
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10"
              : account?.boricaEnabled
                ? "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10"
                : "border-border bg-card",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                boricaReady
                  ? "bg-emerald-600"
                  : account?.boricaEnabled
                    ? "bg-amber-500"
                    : "bg-muted",
              )}
            >
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-black",
                    boricaReady
                      ? "text-emerald-700 dark:text-emerald-300"
                      : account?.boricaEnabled
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-foreground",
                  )}
                >
                  BORICA
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-black",
                    boricaReady
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                      : account?.boricaEnabled
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {boricaReady
                    ? t("payments.connected")
                    : account?.boricaEnabled
                      ? t("payments.needsSetup")
                      : t("payments.disabled", "Disabled")}
                </span>
              </div>
              {account?.boricaEnabled && (
                <>
                  {account?.boricaMerchantId && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t("payments.merchantId", "Merchant")}:{" "}
                      {account.boricaMerchantId}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("payments.mode", "Mode")}:{" "}
                    <span className="font-bold text-foreground">
                      {account?.boricaMode ?? "DEMO"}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("?tab=settings&settingsTab=payments")}
            className="mt-auto flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
          >
            {t("payments.configure", "Configure")}
          </button>
        </div>

        {/* myPOS */}
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-4 shadow-sm",
            myposReady
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10"
              : account?.myposEnabled
                ? "border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10"
                : "border-border bg-card",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                myposReady
                  ? "bg-emerald-600"
                  : account?.myposEnabled
                    ? "bg-amber-500"
                    : "bg-muted",
              )}
            >
              <CreditCard className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-black",
                    myposReady
                      ? "text-emerald-700 dark:text-emerald-300"
                      : account?.myposEnabled
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-foreground",
                  )}
                >
                  myPOS
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-black",
                    myposReady
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                      : account?.myposEnabled
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {myposReady
                    ? t("payments.connected")
                    : account?.myposEnabled
                      ? t("payments.needsSetup")
                      : t("payments.disabled", "Disabled")}
                </span>
              </div>
              {account?.myposEnabled && (
                <>
                  {account?.myposStoreId && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {t("payments.storeId", "Store")}: {account.myposStoreId}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("payments.mode", "Mode")}:{" "}
                    <span className="font-bold text-foreground">
                      {account?.myposMode ?? "DEMO"}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("?tab=settings&settingsTab=payments")}
            className="mt-auto flex h-8 items-center rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground shadow-sm transition hover:bg-muted"
          >
            {t("payments.configure", "Configure")}
          </button>
        </div>
      </div>

      {hostedProviderMissing && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-200" />
          <div>
            <p className="text-sm font-black text-amber-800 dark:text-amber-100">
              {t("payments.stripeNotConnectedTitle")}
            </p>
            <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-200">
              {t("payments.stripeNotConnected")}
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label={t("payments.totalCollected")}
          value={formatMoney(metrics.totalCollected)}
          detail={t("payments.successfulTransactions", {
            count: metrics.successfulCount,
          })}
          trend={t("payments.trendLive")}
          tone="text-emerald-600"
        />
        <MetricCard
          label={t("payments.avgTransaction")}
          value={formatMoney(metrics.average)}
          detail={t("payments.currentPageAverage")}
          trend={t("payments.trendGross")}
          tone="text-emerald-600"
        />
        <MetricCard
          label={t("payments.tipsCollected")}
          value={formatMoney(metrics.tipsCollected)}
          detail={t("payments.includedInTotal")}
          trend={t("payments.trendTips")}
          tone="text-emerald-600"
        />
        <MetricCard
          label={t("payments.platformFees")}
          value={formatMoney(metrics.fees)}
          detail={
            feePercent
              ? t("payments.feePercentConfigured", { percent: feePercent })
              : t("payments.feeNotConfigured")
          }
        />
        <MetricCard
          label={t("payments.refundsIssued")}
          value={formatMoney(metrics.refundAmount)}
          detail={t("payments.refundsOnPage", { count: metrics.refundCount })}
          trend={
            metrics.refundAmount
              ? t("payments.trendReview")
              : t("payments.trendClear")
          }
          tone={metrics.refundAmount ? "text-red-600" : "text-emerald-600"}
        />
      </div>

      <div className="mb-5">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-card p-1 shadow-sm sm:flex sm:flex-wrap sm:items-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
                setSelectedPayment(null);
              }}
              className={cn(
                "flex h-10 items-center justify-center rounded-md px-3 text-sm font-black transition active:scale-[0.98] sm:h-9 sm:px-5",
                activeTab === tab.id
                  ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgba(110,86,248,0.8)]"
                  : "text-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "transactions" || activeTab === "refunds" ? (
        <>
          <div className="mb-5 flex flex-col gap-3 lg:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={t("payments.searchPlaceholder")}
                className="h-11 w-full rounded-lg border border-border bg-card pl-10 pr-3 text-sm font-medium text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            {activeTab === "transactions" && (
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as "" | PaymentStatus);
                  setPage(1);
                }}
                className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/15"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <select
              value={methodFilter}
              onChange={(event) => {
                setMethodFilter(event.target.value as "" | PaymentMethod);
                setPage(1);
              }}
              className="h-11 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground shadow-sm outline-none focus:ring-2 focus:ring-primary/15"
            >
              {methodOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void handleExportCsv()}
              disabled={
                meta.total === 0 ||
                isExportingCsv ||
                search.trim() !== deferredSearch
              }
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-sm font-black text-foreground shadow-sm transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isExportingCsv
                ? t("payments.exporting", "Exporting...")
                : t("payments.exportCsv")}
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={
                isExportingXlsx ||
                meta.total === 0 ||
                search.trim() !== deferredSearch
              }
              className="flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-muted px-4 text-sm font-black text-foreground shadow-sm transition hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {isExportingXlsx
                ? t("payments.exporting", "Exporting…")
                : t("payments.exportXlsx", "Export XLSX")}
            </button>
          </div>

          {exportError && (
            <p className="mb-4 text-sm font-medium text-red-600" role="alert">
              {t(
                "payments.exportFailed",
                "The export could not be created. Please try again.",
              )}
            </p>
          )}

          <PaymentTable
            payments={filteredPayments}
            loading={isLoading}
            error={isError}
            emptyLabel={
              activeTab === "refunds"
                ? t("payments.noRefunds")
                : t("payments.noPayments")
            }
            onSelect={setSelectedPayment}
          />

          {meta.total > limit && (
            <div className="mt-5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                {t("payments.previous")}
              </button>
              <span className="text-sm font-bold text-muted-foreground">
                {t("payments.pageOf", {
                  page,
                  total: Math.ceil(meta.total / limit),
                })}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={page >= Math.ceil(meta.total / limit)}
                className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted disabled:opacity-40"
              >
                {t("payments.next")}
              </button>
            </div>
          )}
        </>
      ) : activeTab === "payouts" ? (
        <PayoutsPanel
          methodTotals={payouts?.methodTotals ?? methodTotals}
          total={payouts?.estimatedBalance ?? metrics.netCollected}
        />
      ) : (
        <SettingsPanel
          restaurant={paymentSettings ?? account}
          feePercent={feePercent}
        />
      )}

      <PaymentDrawer
        payment={
          (selectedPaymentDetail as PaymentDetail | undefined) ??
          selectedPayment
        }
        loading={isDetailLoading}
        refunding={refundMutation.isPending}
        onRefund={(payment) => refundMutation.mutate(payment.id)}
        onClose={() => setSelectedPayment(null)}
      />
    </section>
  );
};

function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = "text-muted-foreground",
}: {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-black tracking-tight text-foreground">
          {value}
        </p>
        {trend && (
          <span className={cn("text-xs font-black", tone)}>{trend}</span>
        )}
      </div>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{detail}</p>
    </div>
  );
}

function PaymentTable({
  payments,
  loading,
  error,
  emptyLabel,
  onSelect,
}: {
  payments: PaymentRecord[];
  loading: boolean;
  error: boolean;
  emptyLabel: string;
  onSelect: (payment: PaymentRecord) => void;
}) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {[...Array(7)].map((_, index) => (
          <div
            key={index}
            className="h-[60px] animate-pulse border-b border-border last:border-b-0 bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-border bg-card text-sm font-bold text-muted-foreground">
        {t("payments.failedLoad")}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <CreditCard className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-black text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead className="bg-muted/45">
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.transaction")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.customer")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.method")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.amount")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.tip")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.fee")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.net")}
              </th>
              <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {t("payments.status")}
              </th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((payment) => {
              const method =
                methodStyles[payment.provider] ?? methodStyles.STRIPE;
              const methodLabel = getMethodLabel(payment.provider, t);
              const net = payment.amount - payment.platformFeeAmount;
              return (
                <tr
                  key={payment.id}
                  onClick={() => onSelect(payment)}
                  className="cursor-pointer transition hover:bg-muted/35"
                >
                  <td className="px-4 py-4">
                    <p className="font-mono text-sm font-black text-foreground">
                      {shortId(
                        payment.stripePaymentIntentId ??
                          payment.providerReference ??
                          payment.id,
                      )}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {payment.tableNumber ?? t("payments.noTable")} .{" "}
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-foreground">
                    {payment.customerName ?? t("dashboard.walkIn")}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg",
                          method.tone,
                        )}
                      >
                        <method.Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-black text-foreground">
                        {methodLabel}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-black text-foreground">
                    {formatMoney(payment.amount, payment.currency)}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-muted-foreground">
                    {payment.tipAmount > 0
                      ? formatMoney(payment.tipAmount, payment.currency)
                      : "-"}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-muted-foreground">
                    -{formatMoney(payment.platformFeeAmount, payment.currency)}
                  </td>
                  <td className="px-4 py-4 text-sm font-black text-foreground">
                    {formatMoney(net, payment.currency)}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-1 text-xs font-black",
                        statusStyles[payment.status],
                      )}
                    >
                      {t(`payments.${payment.status.toLowerCase()}` as any)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PayoutsPanel({
  methodTotals,
  total,
}: {
  methodTotals: Array<{
    method: string;
    amount: number;
    fees?: number;
    count?: number;
  }>;
  total: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
          {t("payments.payoutBalance")}
        </p>
        <p className="mt-3 text-4xl font-black tracking-tight text-foreground">
          {formatMoney(Math.max(total, 0))}
        </p>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {t("payments.payoutEstimate")}
        </p>
        <div className="mt-5 space-y-3">
          {methodTotals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm font-bold text-muted-foreground">
              {t("payments.noSettledTotals")}
            </p>
          ) : (
            methodTotals.map((item) => (
              <div
                key={item.method}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/25 p-3"
              >
                <div>
                  <span className="text-sm font-black text-foreground">
                    {getMethodLabel(item.method, t)}
                  </span>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                    {item.count ?? 0} {t("payments.txLabel")}
                    {item.fees
                      ? ` . ${formatMoney(item.fees)} ${t("payments.feesLabel")}`
                      : ""}
                  </p>
                </div>
                <span className="text-sm font-black text-foreground">
                  {formatMoney(item.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">
          {t("payments.schedule")}
        </p>
        <div className="mt-4 space-y-3 text-sm font-medium text-muted-foreground">
          <p>{t("payments.payoutScheduleNote")}</p>
          <p>{t("payments.payoutScheduleDetail")}</p>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({
  restaurant,
  feePercent,
}: {
  restaurant: any;
  feePercent: number;
}) {
  const { t } = useTranslation();
  const epayReady = !!(
    restaurant?.epayEnabled &&
    restaurant?.epayClientId &&
    restaurant?.epayMerchantEmail &&
    restaurant?.epaySecretConfigured
  );
  const boricaReady = !!(
    restaurant?.boricaEnabled &&
    (restaurant?.boricaMode === "DEMO" ||
      (restaurant?.boricaTerminalId &&
        restaurant?.boricaMerchantId &&
        restaurant?.boricaPrivateKeyConfigured))
  );
  const myposReady = !!(
    restaurant?.myposEnabled &&
    (restaurant?.myposMode === "DEMO" ||
      (restaurant?.myposClientNumber &&
        restaurant?.myposStoreId &&
        restaurant?.myposKeyIndex &&
        restaurant?.myposPrivateKeyConfigured &&
        restaurant?.myposPublicCert))
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
      <SettingCard
        label={t("payments.paymentCollection")}
        value={
          restaurant?.paymentsEnabled
            ? t("payments.enabled")
            : t("payments.disabled")
        }
        detail={t("payments.paymentCollectionDetail")}
        active={restaurant?.paymentsEnabled}
      />
      <SettingCard
        label={t("payments.stripeConnect")}
        value={
          restaurant?.stripeOnboarded
            ? t("payments.connected")
            : t("payments.incomplete")
        }
        detail={restaurant?.stripeAccountId ?? t("payments.noStripeAccount")}
        active={restaurant?.stripeOnboarded}
      />
      <SettingCard
        label={t("auto.ePayBg", "ePay.bg")}
        value={
          epayReady
            ? t("payments.configured", "Configured")
            : t("payments.incomplete")
        }
        detail={
          restaurant?.epayClientId ??
          t("payments.notConfigured", "Not configured")
        }
        active={epayReady}
      />
      <SettingCard
        label="BORICA"
        value={
          boricaReady
            ? t("payments.configured", "Configured")
            : restaurant?.boricaEnabled
              ? t("payments.incomplete")
              : t("payments.disabled", "Disabled")
        }
        detail={
          restaurant?.boricaEnabled
            ? `${restaurant?.boricaMode ?? "DEMO"}${restaurant?.boricaMerchantId ? ` · ${restaurant.boricaMerchantId}` : ""}`
            : t("payments.notConfigured", "Not configured")
        }
        active={boricaReady}
      />
      <SettingCard
        label="myPOS"
        value={
          myposReady
            ? t("payments.configured", "Configured")
            : restaurant?.myposEnabled
              ? t("payments.incomplete")
              : t("payments.disabled", "Disabled")
        }
        detail={
          restaurant?.myposEnabled
            ? `${restaurant?.myposMode ?? "DEMO"}${restaurant?.myposStoreId ? ` - ${restaurant.myposStoreId}` : ""}`
            : t("payments.notConfigured", "Not configured")
        }
        active={myposReady}
      />
      <SettingCard
        label={t("payments.platformFee")}
        value={feePercent ? `${feePercent}%` : t("payments.notSet")}
        detail={t("payments.platformFeeDetail")}
        active={feePercent > 0}
      />
    </div>
  );
}

function SettingCard({
  label,
  value,
  detail,
  active,
}: {
  label: string;
  value: string;
  detail: string;
  active: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full shrink-0",
            active ? "bg-emerald-500" : "bg-red-500",
          )}
        />
        <p
          className={cn(
            "text-xl font-black",
            active
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-500 dark:text-red-400",
          )}
        >
          {value}
        </p>
      </div>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{detail}</p>
    </div>
  );
}

export default PaymentsView;
