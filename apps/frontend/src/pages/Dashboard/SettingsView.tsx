import React, { useContext, useState, useEffect } from "react";
import RestaurantContext from "../../context/RestaurantContext";
import { updateRestaurant, triggerTranslation } from "../../lib/api";
import { useTranslation } from "react-i18next";
import { BrandingEditor } from "../../components/ui/BrandingEditor";

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

  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const [translating, setTranslating] = useState(false);
  const { t } = useTranslation();

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
    }
  }, [activeRestaurant]);

  const handleLanguageToggle = (code: string) => {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRestaurant) return;

    if (loyaltySilverThreshold >= loyaltyGoldThreshold) {
      setStatus({ loading: false, error: "Silver threshold must be lower than Gold threshold.", success: "" });
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
        <form onSubmit={handleSave} className="p-6 space-y-6">

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

          {/* ── Loyalty & Rewards ── */}
          <div className="border-b border-border pb-6">
            <h3 className="text-lg font-medium text-foreground mb-4">
              Loyalty & Rewards Program
            </h3>

            <div className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-bold text-accent">Enable Loyalty Program</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Allow customers to earn and spend points on orders.
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
                      Sign-up Bonus Points
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={loyaltySignupBonus}
                      onChange={(e) => setLoyaltySignupBonus(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Awarded on first order. Capped at 75 pts server-side.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      Earn Rate (pts per €1)
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
                      Points earned per €1 spent. e.g. 10 pts/€ on a €10 order = 100 pts.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      Redeem Rate (pts to earn €1)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={loyaltyRedeemRate}
                      onChange={(e) => setLoyaltyRedeemRate(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Points needed for €1 discount. Higher = less generous for customers.
                    </p>
                  </div>
                </div>

                {/* Live cashback preview */}
                <div className="text-xs text-muted-foreground bg-accent/5 border border-accent/10 rounded-lg px-3 py-2">
                  Effective cashback rate:{" "}
                  <span className={`font-semibold ${(loyaltyExchangeRate / loyaltyRedeemRate) > 0.15 ? "text-yellow-500" : "text-accent"}`}>
                    {((loyaltyExchangeRate / loyaltyRedeemRate) * 100).toFixed(1)}%
                  </span>
                  {(loyaltyExchangeRate / loyaltyRedeemRate) > 0.15 && (
                    <span className="ml-2 text-yellow-500">⚠ High — check earn rate is pts/€, not €/pt</span>
                  )}
                </div>

                {/* Expiry */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      Point Expiry (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={loyaltyPointExpiryDays}
                      onChange={(e) => setLoyaltyPointExpiryDays(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Default 90 days. Keeps liability manageable.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground/80 mb-1">
                      Expiry Reminder Lead Time (days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={loyaltyExpiryReminderDays}
                      onChange={(e) => setLoyaltyExpiryReminderDays(Number(e.target.value))}
                      className={inputCls}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Default 15 days before expiry. Triggers daily reminder job.
                    </p>
                  </div>
                </div>

                {/* VIP Tiers */}
                <div className="pt-4 border-t border-white/5">
                  <p className="font-bold text-foreground mb-1">VIP Tiers</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Based on lifetime points spent. Higher tiers earn points faster.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground/80 mb-1">
                        🥈 Silver threshold (pts)
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
                        🥇 Gold threshold (pts)
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
                        🥈 Silver multiplier
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
                        🥇 Gold multiplier
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
                      Silver threshold must be lower than Gold threshold.
                    </p>
                  )}
                </div>

                {/* Happy Hour */}
                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-bold text-foreground">Happy Hour (Gamification)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Fires at the restaurant's local time (set timezone above).
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
                          Start Time
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
                          End Time
                        </label>
                        <input
                          type="time"
                          value={happyHourEndTime}
                          onChange={(e) => setHappyHourEndTime(e.target.value)}
                          className={inputCls}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          End before start = overnight range (e.g. 22:00–02:00).
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground/80 mb-1">
                          Points Multiplier
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
          </div>

          <div className="flex justify-end pt-4 border-t border-border">
            <button
              type="submit"
              disabled={status.loading}
              className="bg-accent text-accent-foreground px-6 py-2 rounded-lg font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {status.loading ? t("settings.saving") : t("settings.saveSettings")}
            </button>
          </div>
        </form>
      </div>

      <div className="pt-8 mt-8 border-t border-border/40">
        <BrandingEditor
          restaurant={activeRestaurant}
          onUpdate={() => fetchRestaurants()}
        />
      </div>
    </div>
  );
};

export default SettingsView;
