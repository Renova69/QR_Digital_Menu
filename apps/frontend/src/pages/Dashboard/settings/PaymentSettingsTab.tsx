import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, X, AlertTriangle } from "lucide-react";
import { useRestaurantContext } from "../../../context/RestaurantContext";
import { updateRestaurant, generateStripeConnectLink, getStripeStatus, disconnectStripe } from "../../../lib/api";
import { useFeature } from "../../../hooks/useFeature";
import ToggleSwitch from "../../../components/ui/ToggleSwitch";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

const sectionHeading = "text-sm font-semibold text-foreground uppercase tracking-wide";

const DEFAULT_TIP_OPTIONS = [5, 10, 15, 20];

const PaymentSettingsTab: React.FC = () => {
  const { activeRestaurant, fetchRestaurants } = useRestaurantContext();
  const { t } = useTranslation();
  const isStripeFeature = useFeature("payments:stripe");
  const isEpayFeature = useFeature("payments:epay");
  const isBoricaFeature = useFeature("payments:borica");
  const isMyposFeature = useFeature("payments:mypos");

  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [tipOptions, setTipOptions] = useState<number[]>(DEFAULT_TIP_OPTIONS);
  const [stripeOnboarded, setStripeOnboarded] = useState(false);
  const [epayEnabled, setEpayEnabled] = useState(false);
  const [epayMode, setEpayMode] = useState<"DEMO" | "LIVE">("DEMO");
  const [epayClientId, setEpayClientId] = useState("");
  const [epayMerchantEmail, setEpayMerchantEmail] = useState("");
  const [epaySecret, setEpaySecret] = useState("");
  const [epaySecretConfigured, setEpaySecretConfigured] = useState(false);
  const [epayPage, setEpayPage] = useState<"credit_paydirect" | "paylogin">("credit_paydirect");
  const [boricaEnabled, setBoricaEnabled] = useState(false);
  const [boricaMode, setBoricaMode] = useState<"DEMO" | "LIVE">("DEMO");
  const [boricaTerminalId, setBoricaTerminalId] = useState("");
  const [boricaMerchantId, setBoricaMerchantId] = useState("");
  const [boricaMerchantName, setBoricaMerchantName] = useState("");
  const [boricaPrivateKey, setBoricaPrivateKey] = useState("");
  const [boricaPrivateKeyConfigured, setBoricaPrivateKeyConfigured] = useState(false);
  const [boricaPublicCert, setBoricaPublicCert] = useState("");
  const [boricaCurrency, setBoricaCurrency] = useState<"EUR" | "BGN">("EUR");
  const [myposEnabled, setMyposEnabled] = useState(false);
  const [myposMode, setMyposMode] = useState<"DEMO" | "LIVE">("DEMO");
  const [myposClientNumber, setMyposClientNumber] = useState("");
  const [myposStoreId, setMyposStoreId] = useState("");
  const [myposKeyIndex, setMyposKeyIndex] = useState("");
  const [myposPrivateKey, setMyposPrivateKey] = useState("");
  const [myposPrivateKeyConfigured, setMyposPrivateKeyConfigured] = useState(false);
  const [myposPublicCert, setMyposPublicCert] = useState("");
  const [myposCurrency, setMyposCurrency] = useState<"EUR">("EUR");
  const [notifyAllStaffOnPayment, setNotifyAllStaffOnPayment] = useState(true);
  const [newTipOption, setNewTipOption] = useState("");
  const [tipError, setTipError] = useState("");
  const [disconnectConfirming, setDisconnectConfirming] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const initializedRestaurantId = useRef<string | null>(null);
  const stripeCheckedRef = useRef(false);

  useEffect(() => {
    if (activeRestaurant && initializedRestaurantId.current !== activeRestaurant.id) {
      initializedRestaurantId.current = activeRestaurant.id;
      setPaymentsEnabled(activeRestaurant.paymentsEnabled ?? false);
      setTipsEnabled(activeRestaurant.tipsEnabled ?? false);
      setTipOptions(activeRestaurant.tipOptions ?? DEFAULT_TIP_OPTIONS);
      setStripeOnboarded(activeRestaurant.stripeOnboarded ?? false);
      setEpayEnabled(activeRestaurant.epayEnabled ?? false);
      setEpayMode(activeRestaurant.epayMode ?? "DEMO");
      setEpayClientId(activeRestaurant.epayClientId ?? "");
      setEpayMerchantEmail(activeRestaurant.epayMerchantEmail ?? "");
      setEpaySecret("");
      setEpaySecretConfigured(activeRestaurant.epaySecretConfigured ?? false);
      setEpayPage(activeRestaurant.epayPage ?? "credit_paydirect");
      setBoricaEnabled(activeRestaurant.boricaEnabled ?? false);
      setBoricaMode((activeRestaurant.boricaMode ?? "DEMO") as "DEMO" | "LIVE");
      setBoricaTerminalId(activeRestaurant.boricaTerminalId ?? "");
      setBoricaMerchantId(activeRestaurant.boricaMerchantId ?? "");
      setBoricaMerchantName(activeRestaurant.boricaMerchantName ?? "");
      setBoricaPrivateKey("");
      setBoricaPrivateKeyConfigured(activeRestaurant.boricaPrivateKeyConfigured ?? false);
      setBoricaPublicCert(activeRestaurant.boricaPublicCert ?? "");
      setBoricaCurrency(((activeRestaurant.boricaCurrency) ?? "EUR") as "EUR" | "BGN");
      setMyposEnabled(activeRestaurant.myposEnabled ?? false);
      setMyposMode((activeRestaurant.myposMode ?? "DEMO") as "DEMO" | "LIVE");
      setMyposClientNumber(activeRestaurant.myposClientNumber ?? "");
      setMyposStoreId(activeRestaurant.myposStoreId ?? "");
      setMyposKeyIndex(activeRestaurant.myposKeyIndex ?? "");
      setMyposPrivateKey("");
      setMyposPrivateKeyConfigured(activeRestaurant.myposPrivateKeyConfigured ?? false);
      setMyposPublicCert(activeRestaurant.myposPublicCert ?? "");
      setMyposCurrency(((activeRestaurant.myposCurrency) ?? "EUR") as "EUR");
      setNotifyAllStaffOnPayment(activeRestaurant.notifyAllStaffOnPayment ?? true);
      setDisconnectConfirming(false);
      setStripeError("");
      setTipError("");
      setStatus({ loading: false, error: "", success: "" });
      stripeCheckedRef.current = false;
    }
  }, [activeRestaurant]);

  // Handle ?stripe=success redirect back from Stripe Connect
  useEffect(() => {
    if (!activeRestaurant?.id || stripeCheckedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe") === "success") {
      stripeCheckedRef.current = true;
      getStripeStatus(activeRestaurant.id).then((s) => setStripeOnboarded(s.stripeOnboarded));
    }
  }, [activeRestaurant]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRestaurant) return;
    setStatus({ loading: true, error: "", success: "" });
    try {
      const trimmedSecret = epaySecret.trim();
      const trimmedBoricaKey = boricaPrivateKey.trim();
      const trimmedMyposKey = myposPrivateKey.trim();
      await updateRestaurant(activeRestaurant.id, {
        paymentsEnabled,
        tipsEnabled,
        tipOptions,
        notifyAllStaffOnPayment,
        epayEnabled,
        epayMode,
        epayClientId: epayClientId.trim() || null,
        epayMerchantEmail: epayMerchantEmail.trim() || null,
        epayPage,
        ...(trimmedSecret ? { epaySecret: trimmedSecret } : {}),
        boricaEnabled,
        boricaMode,
        boricaTerminalId: boricaTerminalId.trim() || null,
        boricaMerchantId: boricaMerchantId.trim() || null,
        boricaMerchantName: boricaMerchantName.trim() || null,
        boricaPublicCert: boricaPublicCert.trim() || null,
        boricaCurrency,
        ...(trimmedBoricaKey ? { boricaPrivateKey: trimmedBoricaKey } : {}),
        myposEnabled,
        myposMode,
        myposClientNumber: myposClientNumber.trim() || null,
        myposStoreId: myposStoreId.trim() || null,
        myposKeyIndex: myposKeyIndex.trim() || null,
        myposPublicCert: myposPublicCert.trim() || null,
        myposCurrency,
        ...(trimmedMyposKey ? { myposPrivateKey: trimmedMyposKey } : {}),
      } as any);
      await fetchRestaurants();
      if (trimmedSecret) {
        setEpaySecretConfigured(true);
        setEpaySecret("");
      }
      if (trimmedBoricaKey) {
        setBoricaPrivateKeyConfigured(true);
        setBoricaPrivateKey("");
      }
      if (trimmedMyposKey) {
        setMyposPrivateKeyConfigured(true);
        setMyposPrivateKey("");
      }
      setStatus({ loading: false, error: "", success: t("settings.updatedSuccess") });
      setTimeout(() => setStatus((s) => ({ ...s, success: "" })), 3000);
    } catch (err: any) {
      setStatus({
        loading: false,
        error: err.response?.data?.message || t("settings.failedSave"),
        success: "",
      });
    }
  };

  const handleAddTip = () => {
    const v = parseInt(newTipOption, 10);
    if (!newTipOption || isNaN(v) || v < 1 || v > 100) {
      setTipError(t("payment.settings.tipValidationError", { defaultValue: "Enter a value between 1 and 100." }));
      return;
    }
    if (tipOptions.includes(v)) {
      setTipError(t("payment.settings.tipDuplicateError", { defaultValue: "That % is already added." }));
      return;
    }
    setTipError("");
    setTipOptions([...tipOptions, v].sort((a, b) => a - b));
    setNewTipOption("");
  };

  const handleRemoveTip = (pct: number) => {
    setTipOptions(tipOptions.filter((o) => o !== pct));
  };

  const handleResetTips = () => {
    setTipOptions(DEFAULT_TIP_OPTIONS);
    setTipError("");
  };

  const handleStripeConnect = async () => {
    if (!activeRestaurant?.id) return;
    setStripeLoading(true);
    setStripeError("");
    try {
      const { url } = await generateStripeConnectLink(activeRestaurant.id);
      window.location.href = url;
    } catch {
      setStripeError(t("payment.settings.connectError", { defaultValue: "Failed to connect Stripe. Try again." }));
      setStripeLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!activeRestaurant?.id) return;
    setDisconnecting(true);
    try {
      await disconnectStripe(activeRestaurant.id);
      setStripeOnboarded(false);
      setDisconnectConfirming(false);
    } catch (err: any) {
      setStatus({ loading: false, error: err.response?.data?.message || t("settings.failedSave"), success: "" });
    } finally {
      setDisconnecting(false);
    }
  };

  const epayConfigured = !!(
    epayEnabled &&
    epayClientId.trim() &&
    epayMerchantEmail.trim() &&
    (epaySecretConfigured || epaySecret.trim())
  );

  const boricaConfigured = !!(
    boricaEnabled &&
    (boricaMode === 'DEMO' ||
      (boricaTerminalId.trim() &&
       boricaMerchantId.trim() &&
       boricaMerchantName.trim() &&
       (boricaPrivateKeyConfigured || boricaPrivateKey.trim()) &&
       boricaPublicCert.trim()))
  );

  const myposConfigured = !!(
    myposEnabled &&
    (myposMode === "DEMO" ||
      (myposClientNumber.trim() &&
       myposStoreId.trim() &&
       myposKeyIndex.trim() &&
       (myposPrivateKeyConfigured || myposPrivateKey.trim()) &&
       myposPublicCert.trim()))
  );

  // Status summary pills
  const pills = [
    {
      label: paymentsEnabled
        ? t("payment.settings.statusPaymentsOn", { defaultValue: "Payments ON" })
        : t("payment.settings.statusPaymentsOff", { defaultValue: "Payments OFF" }),
      active: paymentsEnabled,
    },
    ...(paymentsEnabled
      ? [
          {
            label: stripeOnboarded
              ? t("payment.settings.statusStripeConnected", { defaultValue: "Stripe connected" })
              : t("payment.settings.statusStripeNotConnected", { defaultValue: "Stripe not connected" }),
            active: stripeOnboarded,
          },
          {
            label: epayConfigured
              ? t("payment.settings.statusEpayConfigured", { defaultValue: "ePay.bg configured" })
              : t("payment.settings.statusEpayNotConfigured", { defaultValue: "ePay.bg not configured" }),
            active: epayConfigured,
          },
          {
            label: boricaConfigured
              ? t("payment.settings.statusBoricaConfigured", { defaultValue: "BORICA configured" })
              : t("payment.settings.statusBoricaNotConfigured", { defaultValue: "BORICA not configured" }),
            active: boricaConfigured,
          },
          {
            label: myposConfigured
              ? t("payment.settings.statusMyposConfigured", { defaultValue: "myPOS configured" })
              : t("payment.settings.statusMyposNotConfigured", { defaultValue: "myPOS not configured" }),
            active: myposConfigured,
          },
          {
            label: tipsEnabled
              ? t("payment.settings.statusTipsOn", { defaultValue: "Tips ON" })
              : t("payment.settings.statusTipsOff", { defaultValue: "Tips OFF" }),
            active: tipsEnabled,
          },
        ]
      : []),
  ];

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {status.error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">{status.error}</div>
      )}
      {status.success && (
        <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm">
          {status.success}
        </div>
      )}

      {/* Summary pills */}
      <div className="flex flex-wrap gap-2 pb-5 border-b border-border">
        {pills.map((p) => (
          <span
            key={p.label}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
              p.active
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {p.active && <CheckCircle2 className="w-3 h-3" />}
            {p.label}
          </span>
        ))}
      </div>

      {/* ── Accept Payments ── */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={sectionHeading}>{t("payment.settings.acceptPayments")}</h3>
            <p className="text-sm text-muted-foreground mt-1">{t("payment.settings.acceptPaymentsDesc")}</p>
          </div>
          <ToggleSwitch
            checked={paymentsEnabled}
            onChange={setPaymentsEnabled}
            aria-label={t("payment.settings.acceptPayments")}
          />
        </div>
        {paymentsEnabled && !stripeOnboarded && !epayConfigured && !boricaConfigured && !myposConfigured && (
          <p className="mt-3 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 px-3 py-2 rounded-lg flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {t("payment.settings.configureProviderWarning", { defaultValue: "Connect Stripe or configure ePay.bg/BORICA/myPOS before accepting online payments." })}
          </p>
        )}
      </div>

      {/* ── Stripe Connect ── */}
      {paymentsEnabled && isEpayFeature && (
        <div className="border-b border-border pb-6">
          <h3 className={`${sectionHeading} mb-4`}>{t("payment.settings.stripeConnect")}</h3>
          {stripeOnboarded ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {t("payment.settings.stripeConnected")}
                </span>
                {!disconnectConfirming ? (
                  <button
                    type="button"
                    onClick={() => setDisconnectConfirming(true)}
                    className="text-sm text-red-500 hover:underline"
                  >
                    {t("payment.settings.disconnect")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t("payment.settings.disconnectAreYouSure", { defaultValue: "Disconnect Stripe?" })}
                    </span>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="text-sm text-red-600 font-medium hover:underline disabled:opacity-50"
                    >
                      {disconnecting
                        ? "..."
                        : t("payment.settings.disconnectConfirmBtn", { defaultValue: "Yes, disconnect" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisconnectConfirming(false)}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled={stripeLoading}
                onClick={handleStripeConnect}
                className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                {stripeLoading ? t("payment.settings.connecting") : t("payment.settings.connectStripe")}
              </button>
              {stripeError && (
                <p className="text-xs text-red-500">{stripeError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ePay.bg ── */}
      {paymentsEnabled && isBoricaFeature && (
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className={sectionHeading}>{t('auto.ePayBg', 'ePay.bg')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("payment.settings.epayDesc", { defaultValue: "Hosted checkout credentials for Bulgarian card payments." })}
              </p>
            </div>
            <ToggleSwitch
              checked={epayEnabled}
              onChange={setEpayEnabled}
              aria-label="ePay.bg"
            />
          </div>
          {epayEnabled && (
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium mb-3 ${epayConfigured ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <CheckCircle2 className="w-4 h-4" />
              {epayConfigured
                ? t("payment.settings.epayConfigured", { defaultValue: "ePay.bg Configured" })
                : t("payment.settings.epayIncomplete", { defaultValue: "ePay.bg — credentials incomplete" })}
            </span>
          )}

          {epayEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.epayMode", { defaultValue: "Mode" })}
                </span>
                <select
                  value={epayMode}
                  onChange={(e) => setEpayMode(e.target.value as "DEMO" | "LIVE")}
                  className={inputCls}
                >
                  <option value="DEMO">{t("payment.settings.epayDemo", { defaultValue: "Demo" })}</option>
                  <option value="LIVE">{t("payment.settings.epayLive", { defaultValue: "Live" })}</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.epayPage", { defaultValue: "Payment page" })}
                </span>
                <select
                  value={epayPage}
                  onChange={(e) => setEpayPage(e.target.value as "credit_paydirect" | "paylogin")}
                  className={inputCls}
                >
                  <option value="credit_paydirect">
                    {t("payment.settings.epayDirectCard", { defaultValue: "Direct card" })}
                  </option>
                  <option value="paylogin">
                    {t("payment.settings.epayLogin", { defaultValue: "ePay.bg account" })}
                  </option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.epayClientId", { defaultValue: "Merchant CIN/MIN" })}
                </span>
                <input
                  value={epayClientId}
                  onChange={(e) => setEpayClientId(e.target.value.trim())}
                  className={inputCls}
                  placeholder={t('auto.eGD123456789', 'e.g. D123456789')}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.epayEmail", { defaultValue: "Merchant email" })}
                </span>
                <input
                  type="email"
                  value={epayMerchantEmail}
                  onChange={(e) => setEpayMerchantEmail(e.target.value)}
                  className={inputCls}
                  placeholder={t('auto.merchantExampleCom', 'merchant@example.com')}
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.epaySecret", { defaultValue: "Secret word" })}
                </span>
                <input
                  type="password"
                  value={epaySecret}
                  onChange={(e) => setEpaySecret(e.target.value)}
                  className={inputCls}
                  placeholder={epaySecretConfigured ? "••••••••" : ""}
                  autoComplete="new-password"
                />
                {epaySecretConfigured && (
                  <p className="text-xs text-muted-foreground">
                    {t("payment.settings.epaySecretConfigured", { defaultValue: "Secret saved. Leave blank to keep it unchanged." })}
                  </p>
                )}
              </label>
            </div>
          )}
        </div>
      )}

      {/* ── BORICA ── */}
      {paymentsEnabled && isStripeFeature && (
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className={sectionHeading}>{t('auto.bORICA', 'BORICA')}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("payment.settings.boricaDesc", { defaultValue: "Direct card payments via BORICA EMV 3DS. Use DEMO mode with the public sandbox for testing — no company account required." })}
              </p>
            </div>
            <ToggleSwitch
              checked={boricaEnabled}
              onChange={setBoricaEnabled}
              aria-label="BORICA"
            />
          </div>
          {boricaEnabled && (
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium mb-3 ${boricaConfigured ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <CheckCircle2 className="w-4 h-4" />
              {boricaConfigured
                ? t("payment.settings.boricaConfigured", { defaultValue: "BORICA Configured" })
                : t("payment.settings.boricaIncomplete", { defaultValue: "BORICA — credentials incomplete" })}
            </span>
          )}

          {boricaEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.boricaMode", { defaultValue: "Mode" })}
                </span>
                <select
                  value={boricaMode}
                  onChange={(e) => setBoricaMode(e.target.value as "DEMO" | "LIVE")}
                  className={inputCls}
                >
                  <option value="DEMO">{t("payment.settings.boricaDemo", { defaultValue: "Demo (sandbox)" })}</option>
                  <option value="LIVE">{t("payment.settings.boricaLive", { defaultValue: "Live" })}</option>
                </select>
              </label>

              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.boricaCurrency", { defaultValue: "Currency" })}
                </span>
                <p className="text-sm text-foreground px-3 py-2 border border-border rounded-lg bg-muted/40">
                  {t('auto.eUR', 'EUR')}{t("payment.settings.boricaCurrencyNote", { defaultValue: "(only EUR is supported)" })}
                </p>
              </div>

              {boricaMode === "LIVE" && (
                <>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.boricaTerminalId", { defaultValue: "Terminal ID" })}
                    </span>
                    <input
                      value={boricaTerminalId}
                      onChange={(e) => setBoricaTerminalId(e.target.value.trim())}
                      className={inputCls}
                      placeholder={t('auto.eGV1800001', 'e.g. V1800001')}
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.boricaMerchantId", { defaultValue: "Merchant ID" })}
                    </span>
                    <input
                      value={boricaMerchantId}
                      onChange={(e) => setBoricaMerchantId(e.target.value.trim())}
                      className={inputCls}
                      placeholder={t('auto.eG1600000001', 'e.g. 1600000001')}
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.boricaMerchantName", { defaultValue: "Merchant name (shown on BORICA page)" })}
                    </span>
                    <input
                      value={boricaMerchantName}
                      onChange={(e) => setBoricaMerchantName(e.target.value)}
                      className={inputCls}
                      placeholder={t('auto.eGMyRestaurant', 'e.g. My Restaurant')}
                      maxLength={25}
                    />
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.boricaPrivateKey", { defaultValue: "Merchant private key (PEM)" })}
                    </span>
                    <textarea
                      value={boricaPrivateKey}
                      onChange={(e) => setBoricaPrivateKey(e.target.value)}
                      className={inputCls + " min-h-[80px] font-mono text-xs"}
                      placeholder={boricaPrivateKeyConfigured ? "••••••••" : "-----BEGIN PRIVATE KEY-----\n..."}
                      autoComplete="off"
                    />
                    {boricaPrivateKeyConfigured && (
                      <p className="text-xs text-muted-foreground">
                        {t("payment.settings.boricaKeyConfigured", { defaultValue: "Key saved. Leave blank to keep it unchanged." })}
                      </p>
                    )}
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.boricaPublicCert", { defaultValue: "BORICA public certificate (PEM)" })}
                    </span>
                    <textarea
                      value={boricaPublicCert}
                      onChange={(e) => setBoricaPublicCert(e.target.value)}
                      className={inputCls + " min-h-[80px] font-mono text-xs"}
                      placeholder={t('auto.BEGINCERTIFICATEN', '-----BEGIN CERTIFICATE-----\n...')}
                      autoComplete="off"
                    />
                  </label>
                </>
              )}

              {boricaMode === "DEMO" && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {t("payment.settings.boricaDemoNote", { defaultValue: "DEMO mode uses the platform's public sandbox terminal. No keys required. Test with cards 5100770000000022 (Mastercard) or 4341792000000044 (Visa)." })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* -- myPOS -- */}
      {paymentsEnabled && isMyposFeature && (
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className={sectionHeading}>myPOS</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("payment.settings.myposDesc", { defaultValue: "Hosted card payments via myPOS Checkout. Demo uses sandbox credentials; Live requires a verified myPOS merchant account and Checkout store keys." })}
              </p>
            </div>
            <ToggleSwitch checked={myposEnabled} onChange={setMyposEnabled} aria-label="myPOS" />
          </div>
          {myposEnabled && (
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium mb-3 ${myposConfigured ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              <CheckCircle2 className="w-4 h-4" />
              {myposConfigured
                ? t("payment.settings.myposConfigured", { defaultValue: "myPOS Configured" })
                : t("payment.settings.myposIncomplete", { defaultValue: "myPOS credentials incomplete" })}
            </span>
          )}

          {myposEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.myposMode", { defaultValue: "Mode" })}
                </span>
                <select
                  value={myposMode}
                  onChange={(e) => setMyposMode(e.target.value as "DEMO" | "LIVE")}
                  className={inputCls}
                >
                  <option value="DEMO">{t("payment.settings.myposDemo", { defaultValue: "Demo (sandbox)" })}</option>
                  <option value="LIVE">{t("payment.settings.myposLive", { defaultValue: "Live" })}</option>
                </select>
              </label>

              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("payment.settings.myposCurrency", { defaultValue: "Currency" })}
                </span>
                <p className="text-sm text-foreground px-3 py-2 border border-border rounded-lg bg-muted/40">
                  {t('auto.eUR', 'EUR')}{t("payment.settings.myposCurrencyNote", { defaultValue: "(only EUR is supported)" })}
                </p>
              </div>

              {myposMode === "LIVE" && (
                <>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.myposClientNumber", { defaultValue: "Client number / Wallet number" })}
                    </span>
                    <input value={myposClientNumber} onChange={(e) => setMyposClientNumber(e.target.value.trim())} className={inputCls} placeholder={t('auto.eG61938166610', 'e.g. 61938166610')} />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.myposStoreId", { defaultValue: "Store ID" })}
                    </span>
                    <input value={myposStoreId} onChange={(e) => setMyposStoreId(e.target.value.trim())} className={inputCls} placeholder={t('auto.eG000000000000010', 'e.g. 000000000000010')} />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.myposKeyIndex", { defaultValue: "Key index" })}
                    </span>
                    <input value={myposKeyIndex} onChange={(e) => setMyposKeyIndex(e.target.value.trim())} className={inputCls} placeholder="1" />
                  </label>

                  <div className="space-y-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.myposNotifyUrl", { defaultValue: "Notify URL" })}
                    </span>
                    <p className="text-xs text-muted-foreground px-3 py-2 border border-border rounded-lg bg-muted/40">
                      {t("payment.settings.myposNotifyNote", { defaultValue: "Uses BACKEND_URL + /api/v1/payments/mypos/notify. For Live, myPOS requires HTTPS without a custom port." })}
                    </p>
                  </div>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.myposPrivateKey", { defaultValue: "Merchant private key (PEM)" })}
                    </span>
                    <textarea
                      value={myposPrivateKey}
                      onChange={(e) => setMyposPrivateKey(e.target.value)}
                      className={inputCls + " min-h-[80px] font-mono text-xs"}
                      placeholder={myposPrivateKeyConfigured ? "••••••••" : "-----BEGIN RSA PRIVATE KEY-----\n..."}
                      autoComplete="off"
                    />
                    {myposPrivateKeyConfigured && (
                      <p className="text-xs text-muted-foreground">
                        {t("payment.settings.myposKeyConfigured", { defaultValue: "Key saved. Leave blank to keep it unchanged." })}
                      </p>
                    )}
                  </label>

                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("payment.settings.myposPublicCert", { defaultValue: "myPOS public certificate (PEM)" })}
                    </span>
                    <textarea
                      value={myposPublicCert}
                      onChange={(e) => setMyposPublicCert(e.target.value)}
                      className={inputCls + " min-h-[80px] font-mono text-xs"}
                      placeholder={t('auto.BEGINCERTIFICATEN', '-----BEGIN CERTIFICATE-----\n...')}
                      autoComplete="off"
                    />
                  </label>
                </>
              )}

              {myposMode === "DEMO" && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  {t("payment.settings.myposDemoNote", { defaultValue: "DEMO mode uses the official myPOS sandbox data. No myPOS merchant account or registered company is required for sandbox testing, but the notify URL still needs to be reachable by myPOS." })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tips ── */}
      {paymentsEnabled && (
        <div className="border-b border-border pb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={sectionHeading}>{t("payment.settings.tips")}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("payment.settings.quickTipOptions")}
              </p>
            </div>
            <ToggleSwitch
              checked={tipsEnabled}
              onChange={setTipsEnabled}
              aria-label={t("payment.settings.tips")}
            />
          </div>

          {tipsEnabled && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {tipOptions.map((pct) => (
                  <span
                    key={pct}
                    className="flex items-center gap-1 px-2.5 py-1 bg-muted rounded-full text-sm font-medium"
                  >
                    {pct}%
                    <button
                      type="button"
                      onClick={() => handleRemoveTip(pct)}
                      className="ml-1 text-muted-foreground hover:text-red-500 transition-colors"
                      aria-label={`Remove ${pct}%`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={newTipOption}
                  onChange={(e) => { setNewTipOption(e.target.value); setTipError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTip())}
                  placeholder={t('auto.eG15', 'e.g. 15')}
                  className="w-24 px-2 py-1.5 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <button
                  type="button"
                  onClick={handleAddTip}
                  className="px-3 py-1.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
                >
                  {t("payment.settings.addTipOption")}
                </button>
                <button
                  type="button"
                  onClick={handleResetTips}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                >
                  {t("payment.settings.resetTips", { defaultValue: "Reset to defaults" })}
                </button>
              </div>
              {tipError && <p className="text-xs text-red-500">{tipError}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Notifications ── */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className={sectionHeading}>
              {t("payment.settings.notifyStaff", { defaultValue: "Payment Notifications" })}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t("payment.settings.notifyStaffDesc", { defaultValue: "When enabled, all staff see payment notifications. When disabled, only the owner sees them." })}
            </p>
          </div>
          <ToggleSwitch
            checked={notifyAllStaffOnPayment}
            onChange={setNotifyAllStaffOnPayment}
            aria-label={t("payment.settings.notifyStaff", { defaultValue: "Payment Notifications" })}
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={status.loading}
          className="brand-cta text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {status.loading ? t("settings.saving") : t("settings.saveSettings")}
        </button>
      </div>
    </form>
  );
};

export default PaymentSettingsTab;
