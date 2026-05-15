import React, { useContext, useState, useEffect, useRef } from "react";
import RestaurantContext from "../../context/RestaurantContext";
import { updateRestaurant, triggerTranslation, generateStripeConnectLink, getStripeStatus, disconnectStripe, listStaff, createStaff, removeStaff, createDeviceEnrollment } from "../../lib/api";
import BillingView from "../../components/subscription/BillingView";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faMedal, faTrash, faCopy, faCheck, faQrcode } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { BrandingEditor } from "../../components/ui/BrandingEditor";
import { Button } from "../../components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import StaffCreatedModal from "../../components/staff/StaffCreatedModal";

const AVAILABLE_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "bg", name: "Bulgarian" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "it", name: "Italian" },
  { code: "ro", name: "Romanian" },
  { code: "zh", name: "Chinese" },
  { code: "el", name: "Greek" },
  { code: "ja", name: "Japanese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
];

const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Lisbon", label: "Lisbon (WET/WEST)" },
  { value: "Europe/Paris", label: "Paris / Berlin / Rome (CET/CEST)" },
  { value: "Europe/Helsinki", label: "Helsinki / Athens (EET/EEST)" },
  { value: "Europe/Sofia", label: "Sofia (EET/EEST)" },
  { value: "Europe/Moscow", label: "Moscow (MSK)" },
  { value: "America/New_York", label: "New York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "America/Denver", label: "Denver (MT)" },
  { value: "America/Los_Angeles", label: "Los Angeles (PT)" },
  { value: "America/Sao_Paulo", label: "São Paulo (BRT)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Bangkok", label: "Bangkok (ICT)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AET)" },
];

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all";

const SettingsView = () => {
  const { activeRestaurant, fetchRestaurants } = useContext(
    RestaurantContext,
  ) as any;
  const [address, setAddress] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("UTC");

  // Loyalty core
  const [isLoyaltyEnabled, setIsLoyaltyEnabled] = useState(true);
  const [loyaltySignupBonus, setLoyaltySignupBonus] = useState(50);
  const [loyaltyExchangeRate, setLoyaltyExchangeRate] = useState(10);
  const [loyaltyRedeemRate, setLoyaltyRedeemRate] = useState(150);
  const [loyaltyPointExpiryDays, setLoyaltyPointExpiryDays] = useState(90);
  const [loyaltyExpiryReminderDays, setLoyaltyExpiryReminderDays] = useState(15);

  // VIP tier thresholds
  const [loyaltySilverThreshold, setLoyaltySilverThreshold] = useState(500);
  const [loyaltyGoldThreshold, setLoyaltyGoldThreshold] = useState(2000);
  const [loyaltySilverMultiplier, setLoyaltySilverMultiplier] = useState(1.2);
  const [loyaltyGoldMultiplier, setLoyaltyGoldMultiplier] = useState(1.5);

  // Happy Hour
  const [happyHourEnable, setHappyHourEnable] = useState(false);
  const [happyHourStartTime, setHappyHourStartTime] = useState("");
  const [happyHourEndTime, setHappyHourEndTime] = useState("");
  const [happyHourMultiplier, setHappyHourMultiplier] = useState(2.0);
  const [notifyAllStaffOnPayment, setNotifyAllStaffOnPayment] = useState(true);

  // Payments
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [tipOptions, setTipOptions] = useState<number[]>([2, 4, 5]);
  const [newTipOption, setNewTipOption] = useState('');
  const [stripeOnboarded, setStripeOnboarded] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const stripeCheckedRef = useRef(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'loyalty' | 'payments' | 'staff' | 'subscription'>('general');

  // Staff management
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; email: string; name: string | null; role: string }>>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("WAITER");
  const [pinCopied, setPinCopied] = useState(false);
  const [sharedDeviceConfig, setSharedDeviceConfig] = useState<{
    restaurantId: string;
    restaurantName?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem("sharedDevice");
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem("sharedDevice");
      return null;
    }
  });
  const [sharedDeviceMessage, setSharedDeviceMessage] = useState("");
  const [deviceEnrollmentUrl, setDeviceEnrollmentUrl] = useState("");
  const [deviceEnrollmentExpiresAt, setDeviceEnrollmentExpiresAt] = useState("");
  const [deviceEnrollmentLoading, setDeviceEnrollmentLoading] = useState(false);
  const [deviceEnrollmentError, setDeviceEnrollmentError] = useState("");
  const [deviceEnrollmentCopied, setDeviceEnrollmentCopied] = useState(false);
  const [staffCreatedModal, setStaffCreatedModal] = useState<{
    open: boolean;
    staffName: string;
    rawPin: string;
    enrollmentUrl: string;
    expiresAt: string;
    enrollmentError: string;
  }>({ open: false, staffName: "", rawPin: "", enrollmentUrl: "", expiresAt: "", enrollmentError: "" });

  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const [translating, setTranslating] = useState(false);
  const { t } = useTranslation();
  const paymentsEnabledLocal = activeRestaurant?.paymentsEnabled ?? false;

  useEffect(() => {
    if (activeRestaurant) {
      setAddress(activeRestaurant.address || "");
      setContactInfo(activeRestaurant.contactInfo || "");
      setTargetLanguages(activeRestaurant.targetLanguages || []);
      setTimezone(activeRestaurant.timezone || "UTC");

      setIsLoyaltyEnabled(activeRestaurant.isLoyaltyEnabled ?? true);
      setLoyaltySignupBonus(activeRestaurant.loyaltySignupBonus ?? 50);
      setLoyaltyExchangeRate(activeRestaurant.loyaltyExchangeRate ?? 10);
      setLoyaltyRedeemRate(activeRestaurant.loyaltyRedeemRate ?? 150);
      setLoyaltyPointExpiryDays(activeRestaurant.loyaltyPointExpiryDays ?? 90);
      setLoyaltyExpiryReminderDays(activeRestaurant.loyaltyExpiryReminderDays ?? 15);

      setLoyaltySilverThreshold(activeRestaurant.loyaltySilverThreshold ?? 500);
      setLoyaltyGoldThreshold(activeRestaurant.loyaltyGoldThreshold ?? 2000);
      setLoyaltySilverMultiplier(activeRestaurant.loyaltySilverMultiplier ?? 1.2);
      setLoyaltyGoldMultiplier(activeRestaurant.loyaltyGoldMultiplier ?? 1.5);

      setHappyHourEnable(activeRestaurant.happyHourEnable ?? false);
      setHappyHourStartTime(activeRestaurant.happyHourStartTime || "");
      setHappyHourEndTime(activeRestaurant.happyHourEndTime || "");
      setHappyHourMultiplier(activeRestaurant.happyHourMultiplier ?? 2.0);
      setNotifyAllStaffOnPayment(activeRestaurant.notifyAllStaffOnPayment ?? true);

      setPaymentsEnabled(activeRestaurant.paymentsEnabled ?? false);
      setTipsEnabled(activeRestaurant.tipsEnabled ?? false);
      setTipOptions(activeRestaurant.tipOptions ?? [2, 4, 5]);
      setStripeOnboarded(activeRestaurant.stripeOnboarded ?? false);

      const params = new URLSearchParams(window.location.search);
      if (params.get('stripe') === 'success' && activeRestaurant?.id && !stripeCheckedRef.current) {
        stripeCheckedRef.current = true;
        getStripeStatus(activeRestaurant.id).then((s) => setStripeOnboarded(s.stripeOnboarded));
      }
    }
  }, [activeRestaurant]);

  useEffect(() => {
    if (activeSettingsTab === 'staff' && activeRestaurant) {
      fetchStaff();
    }
  }, [activeSettingsTab, activeRestaurant]);

  const fetchStaff = async () => {
    if (!activeRestaurant) return;
    setStaffLoading(true);
    setStaffError("");
    try {
      const data = await listStaff(activeRestaurant.id);
      setStaffMembers(data);
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t("staff.failedLoad"));
    } finally {
      setStaffLoading(false);
    }
  };

  const handleInviteStaff = async () => {
    if (!activeRestaurant || !inviteName.trim()) return;
    setStaffError("");
    try {
      const result = await createStaff(activeRestaurant.id, {
        name: inviteName.trim(),
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      });

      const staffName = result.user.name || inviteName.trim();
      const rawPin = result.rawPin;

      let enrollmentUrl = "";
      let expiresAt = "";
      let enrollmentError = "";
      try {
        const enrollment = await createDeviceEnrollment(activeRestaurant.id);
        enrollmentUrl = enrollment.enrollmentUrl;
        expiresAt = enrollment.expiresAt;
      } catch (err: any) {
        enrollmentError = err.response?.data?.message || err.message || t("staff.failedGenerateQr");
      }

      setStaffCreatedModal({
        open: true,
        staffName,
        rawPin,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });

      setInviteName("");
      setInviteEmail("");
      setInviteRole("WAITER");
      await fetchStaff();
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t("staff.failedCreate"));
    }
  };

  const handleRemoveStaff = async (userId: string) => {
    if (!activeRestaurant) return;
    if (!window.confirm(t("staff.removeConfirm"))) return;
    setStaffError("");
    try {
      await removeStaff(activeRestaurant.id, userId);
      setStaffMembers((prev) => prev.filter((s) => s.id !== userId));
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t("staff.failedRemove"));
    }
  };

  const handleRebondStaff = async (staffName: string) => {
    if (!activeRestaurant) return;
    setDeviceEnrollmentError("");
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setStaffCreatedModal({
        open: true,
        staffName,
        rawPin: "",
        enrollmentUrl: result.enrollmentUrl,
        expiresAt: result.expiresAt,
        enrollmentError: "",
      });
    } catch (err: any) {
      setDeviceEnrollmentError(
        err.response?.data?.message || t("staff.failedRebond"),
      );
    }
  };

  const handleGenerateDeviceEnrollment = async () => {
    if (!activeRestaurant) return;
    setDeviceEnrollmentLoading(true);
    setDeviceEnrollmentError("");
    setDeviceEnrollmentUrl("");
    setDeviceEnrollmentExpiresAt("");
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setDeviceEnrollmentUrl(result.enrollmentUrl);
      setDeviceEnrollmentExpiresAt(result.expiresAt);
      setDeviceEnrollmentCopied(false);
    } catch (err: any) {
      setDeviceEnrollmentError(
        err.response?.data?.message || t("staff.failedGenerateQr"),
      );
    } finally {
      setDeviceEnrollmentLoading(false);
    }
  };

  const handleLanguageToggle = (code: string) => {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const sharedDeviceEnabled =
    !!activeRestaurant && sharedDeviceConfig?.restaurantId === activeRestaurant.id;

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRestaurant) return;

    if (loyaltySilverThreshold >= loyaltyGoldThreshold) {
      setStatus({ loading: false, error: t('loyaltySettings.silverMustBeLower'), success: "" });
      return;
    }

    setStatus({ loading: true, error: "", success: "" });

    try {
      await updateRestaurant(activeRestaurant.id, {
        address,
        contactInfo,
        targetLanguages,
        timezone,
        isLoyaltyEnabled,
        loyaltySignupBonus: Number(loyaltySignupBonus),
        loyaltyExchangeRate: Number(loyaltyExchangeRate),
        loyaltyRedeemRate: Number(loyaltyRedeemRate),
        loyaltyPointExpiryDays: Number(loyaltyPointExpiryDays),
        loyaltyExpiryReminderDays: Number(loyaltyExpiryReminderDays),
        loyaltySilverThreshold: Number(loyaltySilverThreshold),
        loyaltyGoldThreshold: Number(loyaltyGoldThreshold),
        loyaltySilverMultiplier: Number(loyaltySilverMultiplier),
        loyaltyGoldMultiplier: Number(loyaltyGoldMultiplier),
        happyHourEnable,
        happyHourStartTime: happyHourStartTime || undefined,
        happyHourEndTime: happyHourEndTime || undefined,
        happyHourMultiplier: Number(happyHourMultiplier),
        notifyAllStaffOnPayment,
        paymentsEnabled,
        tipsEnabled,
        tipOptions,
      });

      await fetchRestaurants();
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

  const handleForceTranslate = async () => {
    if (!activeRestaurant) return;

    setTranslating(true);
    setStatus({ loading: false, error: "", success: "" });

    try {
      // Persist current language selection before translating (UI state may not be saved yet)
      const savedLangs = activeRestaurant.targetLanguages || [];
      const langsChanged =
        targetLanguages.length !== savedLangs.length ||
        targetLanguages.some((l) => !savedLangs.includes(l));
      if (langsChanged) {
        await updateRestaurant(activeRestaurant.id, { targetLanguages });
        await fetchRestaurants();
      }

      const res = await triggerTranslation(activeRestaurant.id);
      if (res.success) {
        setStatus({ loading: false, error: "", success: res.message });
      } else {
        setStatus({ loading: false, error: res.message, success: "" });
      }
    } catch (err: any) {
      setStatus({
        loading: false,
        error: err.response?.data?.message || t("settings.failedInitiate"),
        success: "",
      });
    } finally {
      setTranslating(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("settings.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.desc")}</p>
      </div>

      {status.error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
          {status.error}
        </div>
      )}
      {status.success && (
        <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-3 rounded-lg text-sm">
          {status.success}
        </div>
      )}

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden text-left">
        {/* Tab nav */}
        <div className="flex gap-1 border-b border-border px-6 pt-4">
          {(['general', 'loyalty', 'payments', 'staff', 'subscription'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveSettingsTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeSettingsTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(`settings.tabs.${tab}`)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6">

          {activeSettingsTab === 'general' && (<>
          {/* ── Location & Contact ── */}
          <div className="border-b border-border pb-6">
            <h3 className="text-lg font-medium text-foreground mb-4">
              {t("settings.locationContact")}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t("settings.address")}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, NY"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t("settings.contactInfo")}
                </label>
                <input
                  type="text"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="(555) 555-5555"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* ── Timezone ── */}
          <div className="border-b border-border pb-6">
            <h3 className="text-lg font-medium text-foreground mb-1">{t("settings.timezone")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("settings.timezoneDesc")}
            </p>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className={inputCls}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {/* ── Localization ── */}
          <div className="border-b border-border pb-6">
            <h3 className="text-lg font-medium text-foreground mb-4">
              {t("settings.localization")}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t("settings.localizationDesc")}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  {t("settings.targetLanguages")}
                </label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleLanguageToggle(lang.code)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                        targetLanguages.includes(lang.code)
                          ? "bg-accent/15 text-accent border-accent/30"
                          : "bg-secondary text-foreground border-border hover:bg-secondary/80"
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("settings.translationPoweredBy")}</p>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-4 items-center p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <div className="flex-1">
                <h4 className="text-sm font-bold text-yellow-700 dark:text-yellow-400">
                  {t("settings.processExisting")}
                </h4>
                <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
                  {t("settings.processExistingDesc")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleForceTranslate}
                disabled={translating || targetLanguages.length === 0}
                className="whitespace-nowrap px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"
              >
                {translating ? t("settings.translating") : t("settings.translateAllNow")}
              </button>
            </div>
          </div>

          </>)}

          {activeSettingsTab === 'loyalty' && (<>
          {/* ── Loyalty & Rewards ── */}
          <div className="border-b border-border pb-6">
            <h3 className="text-lg font-medium text-foreground mb-4">
              {t('loyaltySettings.sectionTitle')}
            </h3>

            <div className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-accent">{t('loyaltySettings.enableLoyalty')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('loyaltySettings.enableLoyaltyDesc')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isLoyaltyEnabled}
                  onChange={(e) => setIsLoyaltyEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {isLoyaltyEnabled && (
              <div className="space-y-6">
                {/* Points economy */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.signupBonus')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={loyaltySignupBonus}
                      onChange={(e) => setLoyaltySignupBonus(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('loyaltySettings.signupBonusDesc')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.earnRate')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={loyaltyExchangeRate}
                      onChange={(e) => setLoyaltyExchangeRate(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('loyaltySettings.earnRateDesc')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.redeemRate')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={loyaltyRedeemRate}
                      onChange={(e) => setLoyaltyRedeemRate(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('loyaltySettings.redeemRateDesc')}
                    </p>
                  </div>
                </div>

                {/* Live cashback preview */}
                <div className="text-xs text-muted-foreground bg-accent/5 border border-accent/10 rounded-lg px-3 py-2">
                  <span className={`font-semibold ${(loyaltyExchangeRate / loyaltyRedeemRate) > 0.15 ? "text-yellow-500" : "text-accent"}`}>
                    {t('loyaltySettings.cashbackInfo', { pct: ((loyaltyExchangeRate / loyaltyRedeemRate) * 100).toFixed(1) })}
                  </span>
                  {(loyaltyExchangeRate / loyaltyRedeemRate) > 0.15 && (
                    <span className="ml-2 text-yellow-500"><FontAwesomeIcon icon={faTriangleExclamation} className="mr-1" />{t('loyaltySettings.cashbackWarning')}</span>
                  )}
                </div>

                {/* Expiry */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.expiryDays')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={loyaltyPointExpiryDays}
                      onChange={(e) => setLoyaltyPointExpiryDays(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('loyaltySettings.expiryDaysDesc')}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      {t('loyaltySettings.reminderDays')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={loyaltyExpiryReminderDays}
                      onChange={(e) => setLoyaltyExpiryReminderDays(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {t('loyaltySettings.reminderDaysDesc')}
                    </p>
                  </div>
                </div>

                {/* VIP Tiers */}
                <div className="pt-4 border-t border-white/5">
                  <p className="font-bold text-foreground mb-1">{t('loyaltySettings.vipTiers')}</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    {t('loyaltySettings.vipTiersDesc')}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1">
                        <FontAwesomeIcon icon={faMedal} className="mr-1 text-slate-400" />{t('loyaltySettings.silverThreshold')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={loyaltySilverThreshold}
                        onChange={(e) => setLoyaltySilverThreshold(Number(e.target.value))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1">
                        <FontAwesomeIcon icon={faMedal} className="mr-1 text-amber-400" />{t('loyaltySettings.goldThreshold')}
                      </label>
                      <input
                        type="number"
                        min={2}
                        value={loyaltyGoldThreshold}
                        onChange={(e) => setLoyaltyGoldThreshold(Number(e.target.value))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1">
                        <FontAwesomeIcon icon={faMedal} className="mr-1 text-slate-400" />{t('loyaltySettings.silverMultiplier')}
                      </label>
                      <input
                        type="number"
                        min={1.0}
                        max={5.0}
                        step={0.1}
                        value={loyaltySilverMultiplier}
                        onChange={(e) => setLoyaltySilverMultiplier(Number(e.target.value))}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1">
                        <FontAwesomeIcon icon={faMedal} className="mr-1 text-amber-400" />{t('loyaltySettings.goldMultiplier')}
                      </label>
                      <input
                        type="number"
                        min={1.0}
                        max={5.0}
                        step={0.1}
                        value={loyaltyGoldMultiplier}
                        onChange={(e) => setLoyaltyGoldMultiplier(Number(e.target.value))}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  {loyaltySilverThreshold >= loyaltyGoldThreshold && (
                    <p className="text-xs text-red-500 mt-2">
                      {t('loyaltySettings.silverMustBeLower')}
                    </p>
                  )}
                </div>

                {/* Happy Hour */}
                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-bold text-foreground">{t('loyaltySettings.happyHour')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('loyaltySettings.happyHourDesc')}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={happyHourEnable}
                        onChange={(e) => setHappyHourEnable(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                    </label>
                  </div>

                  {happyHourEnable && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-1">
                          {t('loyaltySettings.happyHourStart')}
                        </label>
                        <input
                          type="time"
                          value={happyHourStartTime}
                          onChange={(e) => setHappyHourStartTime(e.target.value)}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-1">
                          {t('loyaltySettings.happyHourEnd')}
                        </label>
                        <input
                          type="time"
                          value={happyHourEndTime}
                          onChange={(e) => setHappyHourEndTime(e.target.value)}
                          className={inputCls}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {t('loyaltySettings.happyHourEndDesc')}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-1">
                          {t('loyaltySettings.happyHourMultiplier')}
                        </label>
                        <input
                          type="number"
                          min={1.0}
                          max={10.0}
                          step={0.1}
                          value={happyHourMultiplier}
                          onChange={(e) => setHappyHourMultiplier(Number(e.target.value))}
                          className={inputCls}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {paymentsEnabledLocal && (
              <div className="pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-foreground">
                      Payment Notifications
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, all staff see payment notifications. When disabled, only the owner sees them.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={notifyAllStaffOnPayment}
                      onChange={(e) => setNotifyAllStaffOnPayment(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                  </label>
                </div>
              </div>
            )}
          </div>

          </>)}

          {activeSettingsTab === 'staff' && (<>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-foreground mb-1">{t("staff.staffMembers")}</h3>
              <p className="text-sm text-muted-foreground">{t("staff.staffMembersDesc")}</p>
            </div>

            {/* ── Shared Device Mode ── */}
            <div className="p-4 border border-border rounded-lg space-y-3">
              <p className="font-medium text-sm">{t("staff.sharedDeviceMode")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (sharedDeviceEnabled) {
                    localStorage.removeItem("sharedDevice");
                    setSharedDeviceConfig(null);
                    setSharedDeviceMessage("");
                    setDeviceEnrollmentUrl("");
                    setDeviceEnrollmentExpiresAt("");
                  } else if (activeRestaurant) {
                    const cfg = {
                      restaurantId: activeRestaurant.id,
                      restaurantName: activeRestaurant.name,
                    };
                    localStorage.setItem("sharedDevice", JSON.stringify(cfg));
                    setSharedDeviceConfig(cfg);
                    setSharedDeviceMessage(t("staff.sharedDeviceBonded", { name: activeRestaurant.name }));
                  }
                }}
              >
                {sharedDeviceEnabled ? t("staff.disableSharedDevice") : t("staff.enableSharedDevice")}
              </Button>
              {!sharedDeviceEnabled && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  {t("staff.sharedDeviceOffWarning")}
                </p>
              )}
            </div>

            {/* Bond a Device (standalone) */}
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-sm text-foreground">{t("staff.bondDevice")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("staff.bondDeviceDesc")}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDeviceEnrollment}
                  disabled={deviceEnrollmentLoading || !activeRestaurant}
                >
                  {deviceEnrollmentLoading ? t("staff.generating") : t("staff.generateDeviceQr")}
                </Button>
              </div>

              {deviceEnrollmentError && (
                <p className="mt-3 text-sm text-destructive">{deviceEnrollmentError}</p>
              )}

              {deviceEnrollmentUrl && (
                <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="rounded-lg bg-white p-3 w-fit">
                    <QRCodeSVG value={deviceEnrollmentUrl} size={160} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{t("staff.scanQrInstruction")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("staff.expiresAt", { time: new Date(deviceEnrollmentExpiresAt).toLocaleTimeString() })}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(deviceEnrollmentUrl);
                          setDeviceEnrollmentCopied(true);
                          setTimeout(() => setDeviceEnrollmentCopied(false), 2000);
                        }}
                      >
                        <FontAwesomeIcon
                          icon={deviceEnrollmentCopied ? faCheck : faCopy}
                          className="mr-1"
                        />
                        {deviceEnrollmentCopied ? t("staff.copied") : t("staff.copyLink")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {staffError && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">{staffError}</div>
            )}

            {/* Invite form */}
            <div className="p-4 border border-border rounded-lg space-y-3">
              <p className="font-medium text-sm">{t("staff.inviteNewStaff")}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder={t("staff.displayName")}
                  className={inputCls}
                  required
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("staff.emailOptional")}
                  className={inputCls}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className={inputCls}
                >
                  <option value="MANAGER">{t("staff.roleManager")}</option>
                  <option value="WAITER">{t("staff.roleWaiter")}</option>
                  <option value="KITCHEN">{t("staff.roleKitchen")}</option>
                </select>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleInviteStaff}>
                {t("staff.createStaffAccount")}
              </Button>
            </div>


            {/* Staff list */}
            <div className="border border-border rounded-lg overflow-hidden">
              {staffLoading ? (
                <div className="p-4 text-sm text-muted-foreground">{t("staff.loading")}</div>
              ) : staffMembers.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">{t("staff.noStaffYet")}</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">{t("staff.nameColumn")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("staff.emailColumn")}</th>
                      <th className="text-left px-4 py-2 font-medium">{t("staff.roleColumn")}</th>
                      <th className="w-16 px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {staffMembers.map((s) => (
                      <tr key={s.id} className="border-t border-border">
                        <td className="px-4 py-2">{s.name || "—"}</td>
                        <td className="px-4 py-2 text-muted-foreground">{s.email?.endsWith(".local") ? "—" : s.email}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.role === 'OWNER' ? 'bg-amber-500/10 text-amber-500' :
                            s.role === 'MANAGER' ? 'bg-blue-500/10 text-blue-500' :
                            s.role === 'WAITER' ? 'bg-green-500/10 text-green-500' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {s.role}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            {s.role !== 'OWNER' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleRebondStaff(s.name || "Staff")}
                                  className="text-muted-foreground hover:text-accent transition-colors"
                                  title={t("staff.rebondTitle")}
                                >
                                  <FontAwesomeIcon icon={faQrcode} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStaff(s.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title={t("staff.removeTitle")}
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          </>)}

          {activeSettingsTab === 'payments' && (
            <div className="space-y-6">
              {/* Enable payments toggle */}
              <div className="p-4 border border-border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('payment.settings.acceptPayments')}</p>
                    <p className="text-sm text-muted-foreground">{t('payment.settings.acceptPaymentsDesc')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentsEnabled(!paymentsEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${paymentsEnabled ? 'bg-accent' : 'bg-muted'}`}
                    role="switch"
                    aria-checked={paymentsEnabled}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${paymentsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
                {paymentsEnabled && !stripeOnboarded && (
                  <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 p-2 rounded">
                    {t('payment.settings.connectStripeWarning')}
                  </p>
                )}
              </div>

              {/* Stripe Connect — only shown when payments are enabled */}
              {paymentsEnabled && <div className="p-4 border border-border rounded-lg space-y-3">
                <p className="font-medium">{t('payment.settings.stripeConnect')}</p>
                {stripeOnboarded ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 font-medium">✓ {t('payment.settings.stripeConnected')}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!activeRestaurant?.id) return;
                        if (!window.confirm(t('payment.settings.disconnectConfirm'))) return;
                        await disconnectStripe(activeRestaurant.id);
                        setStripeOnboarded(false);
                      }}
                      className="text-sm text-red-500 hover:underline"
                    >
                      {t('payment.settings.disconnect')}
                    </button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    type="button"
                    disabled={stripeLoading}
                    onClick={async () => {
                      if (!activeRestaurant?.id) return;
                      setStripeLoading(true);
                      try {
                        const { url } = await generateStripeConnectLink(activeRestaurant.id);
                        window.location.href = url;
                      } catch {
                        setStripeLoading(false);
                      }
                    }}
                  >
                    {stripeLoading ? t('payment.settings.connecting') : t('payment.settings.connectStripe')}
                  </Button>
                )}
              </div>}

              {/* Tips */}
              {paymentsEnabled && (
                <div className="p-4 border border-border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{t('payment.settings.tips')}</p>
                    <button
                      type="button"
                      onClick={() => setTipsEnabled(!tipsEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${tipsEnabled ? 'bg-accent' : 'bg-muted'}`}
                      role="switch"
                      aria-checked={tipsEnabled}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${tipsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {tipsEnabled && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">{t('payment.settings.quickTipOptions')}</p>
                      <div className="flex flex-wrap gap-2">
                        {tipOptions.map((pct) => (
                          <span key={pct} className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm">
                            {pct}%
                            <button
                              type="button"
                              onClick={() => setTipOptions(tipOptions.filter((o) => o !== pct))}
                              className="text-muted-foreground hover:text-red-500 ml-1"
                              aria-label={`Remove ${pct}%`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={newTipOption}
                          onChange={(e) => setNewTipOption(e.target.value)}
                          placeholder="e.g. 15"
                          className="w-24 px-2 py-1 border border-border rounded text-sm bg-background"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => {
                            const v = parseInt(newTipOption);
                            if (v > 0 && v <= 100 && !tipOptions.includes(v)) {
                              setTipOptions([...tipOptions, v].sort((a, b) => a - b));
                              setNewTipOption('');
                            }
                          }}
                        >
                          {t('payment.settings.addTipOption')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <Button type="button" onClick={() => handleSave()} disabled={status.loading}>
                {status.loading ? t('settings.saving') : t('settings.saveSettings')}
              </Button>
            </div>
          )}

          {activeSettingsTab === 'subscription' && (
            <BillingView />
          )}

          {activeSettingsTab !== 'payments' && activeSettingsTab !== 'subscription' && (
            <div className="flex justify-end pt-4 border-t border-border">
              <button
                type="submit"
                disabled={status.loading}
                className="bg-accent text-accent-foreground px-6 py-2 rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {status.loading ? t("settings.saving") : t("settings.saveSettings")}
              </button>
            </div>
          )}
        </form>
      </div>

      <div className="pt-8 mt-8 border-t border-border/40">
        <BrandingEditor
          restaurant={activeRestaurant}
          onUpdate={() => fetchRestaurants()}
        />
      </div>

      <StaffCreatedModal
        open={staffCreatedModal.open}
        onClose={() => setStaffCreatedModal((prev) => ({ ...prev, open: false }))}
        staffName={staffCreatedModal.staffName}
        rawPin={staffCreatedModal.rawPin}
        enrollmentUrl={staffCreatedModal.enrollmentUrl}
        expiresAt={staffCreatedModal.expiresAt}
        enrollmentError={staffCreatedModal.enrollmentError}
      />
    </div>
  );
};

export default SettingsView;
