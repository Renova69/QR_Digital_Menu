import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Award, Calculator } from "lucide-react";
import { useRestaurantContext } from "../../../context/RestaurantContext";
import { updateRestaurant } from "../../../lib/api";
import { useFeature } from "../../../hooks/useFeature";
import ToggleSwitch from "../../../components/ui/ToggleSwitch";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

const sectionHeading = "text-sm font-semibold text-foreground uppercase tracking-wide";
const MAX_RECOMMENDED_CASHBACK_RATE = 0.15;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

const parseTimeParts = (time: string | undefined, fallback: [number, number]) => {
  const [hour, minute] = (time ?? "").split(":").map(Number);
  return [
    Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback[0],
    Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : fallback[1],
  ] as const;
};

const LoyaltySettingsTab: React.FC = () => {
  const { activeRestaurant, fetchRestaurants } = useRestaurantContext();
  const { t } = useTranslation();
  const isLoyaltyFeature = useFeature("loyalty");

  const [isLoyaltyEnabled, setIsLoyaltyEnabled] = useState(false);
  const [loyaltySignupBonus, setLoyaltySignupBonus] = useState(0);
  const [loyaltyExchangeRate, setLoyaltyExchangeRate] = useState(10);
  const [loyaltyRedeemRate, setLoyaltyRedeemRate] = useState(150);
  const [loyaltyPointExpiryDays, setLoyaltyPointExpiryDays] = useState(90);
  const [loyaltyExpiryReminderDays, setLoyaltyExpiryReminderDays] = useState(15);
  const [loyaltySilverThreshold, setLoyaltySilverThreshold] = useState(500);
  const [loyaltyGoldThreshold, setLoyaltyGoldThreshold] = useState(2000);
  const [loyaltySilverMultiplier, setLoyaltySilverMultiplier] = useState(1.2);
  const [loyaltyGoldMultiplier, setLoyaltyGoldMultiplier] = useState(1.5);
  const [happyHourEnable, setHappyHourEnable] = useState(false);
  const [happyHourDays, setHappyHourDays] = useState<number[]>([1,2,3,4,5,6,7]);
  const [happyHourStartH, setHappyHourStartH] = useState(18);
  const [happyHourStartM, setHappyHourStartM] = useState(0);
  const [happyHourEndH, setHappyHourEndH] = useState(20);
  const [happyHourEndM, setHappyHourEndM] = useState(0);
  const [happyHourMultiplier, setHappyHourMultiplier] = useState(2.0);
  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const initializedRestaurantId = useRef<string | null>(null);

  useEffect(() => {
    if (activeRestaurant && initializedRestaurantId.current !== activeRestaurant.id) {
      initializedRestaurantId.current = activeRestaurant.id;
      setIsLoyaltyEnabled(activeRestaurant.isLoyaltyEnabled ?? false);
      setLoyaltySignupBonus(activeRestaurant.loyaltySignupBonus ?? 0);
      setLoyaltyExchangeRate(activeRestaurant.loyaltyExchangeRate ?? 10);
      setLoyaltyRedeemRate(activeRestaurant.loyaltyRedeemRate ?? 150);
      setLoyaltyPointExpiryDays(activeRestaurant.loyaltyPointExpiryDays ?? 90);
      setLoyaltyExpiryReminderDays(activeRestaurant.loyaltyExpiryReminderDays ?? 15);
      setLoyaltySilverThreshold(activeRestaurant.loyaltySilverThreshold ?? 500);
      setLoyaltyGoldThreshold(activeRestaurant.loyaltyGoldThreshold ?? 2000);
      setLoyaltySilverMultiplier(activeRestaurant.loyaltySilverMultiplier ?? 1.2);
      setLoyaltyGoldMultiplier(activeRestaurant.loyaltyGoldMultiplier ?? 1.5);
      setHappyHourEnable(activeRestaurant.happyHourEnable ?? false);
      setHappyHourDays(activeRestaurant.happyHourDays ?? [1,2,3,4,5,6,7]);
      const [sh, sm] = parseTimeParts(activeRestaurant.happyHourStartTime, [18, 0]);
      const [eh, em] = parseTimeParts(activeRestaurant.happyHourEndTime, [20, 0]);
      setHappyHourStartH(sh);
      setHappyHourStartM(sm);
      setHappyHourEndH(eh);
      setHappyHourEndM(em);
      setHappyHourMultiplier(activeRestaurant.happyHourMultiplier ?? 2.0);
      setStatus({ loading: false, error: "", success: "" });
    }
  }, [activeRestaurant]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRestaurant) return;
    setStatus({ loading: true, error: "", success: "" });
    try {
      await updateRestaurant(activeRestaurant.id, {
        isLoyaltyEnabled,
        loyaltySignupBonus,
        loyaltyExchangeRate,
        loyaltyRedeemRate,
        loyaltyPointExpiryDays,
        loyaltyExpiryReminderDays,
        loyaltySilverThreshold,
        loyaltyGoldThreshold,
        loyaltySilverMultiplier,
        loyaltyGoldMultiplier,
        happyHourEnable,
        happyHourDays,
        happyHourStartTime: `${String(happyHourStartH).padStart(2,"0")}:${String(happyHourStartM).padStart(2,"0")}`,
        happyHourEndTime: `${String(happyHourEndH).padStart(2,"0")}:${String(happyHourEndM).padStart(2,"0")}`,
        happyHourMultiplier,
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

  const cashbackPct = loyaltyExchangeRate / loyaltyRedeemRate;
  const cashbackHigh = cashbackPct > MAX_RECOMMENDED_CASHBACK_RATE;
  const reminderTooHigh = loyaltyExpiryReminderDays >= loyaltyPointExpiryDays;
  const silverAboveGold = loyaltySilverThreshold >= loyaltyGoldThreshold;

  // Live calculator (€25 example)
  const calcAmount = 25;
  const earnedPts = Math.floor(calcAmount * loyaltyExchangeRate);
  const rewardValue = (earnedPts / loyaltyRedeemRate).toFixed(2);

  const sectionDisabled = !isLoyaltyEnabled;

  if (!isLoyaltyFeature) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        {t("settings.featureNotAvailable", { defaultValue: "Loyalty is not available on your plan." })}
      </div>
    );
  }

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

      {/* ── Enable toggle ── */}
      <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between">
        <div>
          <p className="font-bold text-primary">{t("loyaltySettings.enableLoyalty")}</p>
          <p className="text-xs text-muted-foreground mt-1">{t("loyaltySettings.enableLoyaltyDesc")}</p>
        </div>
        <ToggleSwitch
          checked={isLoyaltyEnabled}
          onChange={setIsLoyaltyEnabled}
          aria-label={t("loyaltySettings.enableLoyalty")}
        />
      </div>

      {/* Everything below dims when loyalty is off */}
      <div className={sectionDisabled ? "opacity-40 pointer-events-none select-none" : ""}>

        {/* ── Points Economy ── */}
        <div className="border-b border-border pb-6 space-y-4">
          <h3 className={`${sectionHeading} mb-4`}>{t("loyaltySettings.pointsEconomy", { defaultValue: "Points Economy" })}</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                {t("loyaltySettings.signupBonus")}
              </label>
              <input
                type="number"
                min={0}
                value={loyaltySignupBonus}
                onChange={(e) => setLoyaltySignupBonus(Number(e.target.value))}
                className={inputCls}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t("loyaltySettings.signupBonusDesc")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                {t("loyaltySettings.earnRate")}
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={loyaltyExchangeRate}
                onChange={(e) => setLoyaltyExchangeRate(Number(e.target.value))}
                className={inputCls}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t("loyaltySettings.earnRateDesc")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                {t("loyaltySettings.redeemRate")}
              </label>
              <input
                type="number"
                min={1}
                value={loyaltyRedeemRate}
                onChange={(e) => setLoyaltyRedeemRate(Number(e.target.value))}
                className={inputCls}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t("loyaltySettings.redeemRateDesc")}</p>
            </div>
          </div>

          {/* Cashback info bar */}
          <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${cashbackHigh ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-primary/5 border border-primary/10"}`}>
            <span className={`font-semibold ${cashbackHigh ? "text-yellow-500" : "text-primary"}`}>
              {t("loyaltySettings.cashbackInfo", { pct: (cashbackPct * 100).toFixed(1) })}
            </span>
            {cashbackHigh && (
              <span className="flex items-center gap-1 text-yellow-500">
                <AlertTriangle className="w-3 h-3" />
                {t("loyaltySettings.cashbackWarning")}
              </span>
            )}
          </div>

          {/* Live points calculator */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5" />
              {t("loyaltySettings.liveCalcTitle", { defaultValue: "Live Example — €{{amount}} order", amount: calcAmount })}
            </p>
            <div className="flex flex-wrap gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{earnedPts}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("loyaltySettings.earnRate")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-500">€{rewardValue}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{t("loyaltySettings.redeemRate")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Expiry ── */}
        <div className="border-b border-border py-6 space-y-4">
          <h3 className={`${sectionHeading} mb-4`}>{t("loyaltySettings.expirySection", { defaultValue: "Point Expiry" })}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                {t("loyaltySettings.expiryDays")}
              </label>
              <input
                type="number"
                min={1}
                value={loyaltyPointExpiryDays}
                onChange={(e) => setLoyaltyPointExpiryDays(Number(e.target.value))}
                className={inputCls}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t("loyaltySettings.expiryDaysDesc")}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80 mb-1">
                {t("loyaltySettings.reminderDays")}
              </label>
              <input
                type="number"
                min={1}
                value={loyaltyExpiryReminderDays}
                onChange={(e) => setLoyaltyExpiryReminderDays(Number(e.target.value))}
                className={inputCls}
              />
              <p className="text-[10px] text-muted-foreground mt-1">{t("loyaltySettings.reminderDaysDesc")}</p>
            </div>
          </div>
          {reminderTooHigh && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t("loyaltySettings.reminderMustBeLower", { defaultValue: "Reminder days must be less than expiry days." })}
            </p>
          )}
        </div>

        {/* ── VIP Tiers ── */}
        <div className="border-b border-border py-6 space-y-4">
          <div>
            <h3 className={`${sectionHeading} mb-1`}>{t("loyaltySettings.vipTiers")}</h3>
            <p className="text-sm text-muted-foreground">{t("loyaltySettings.vipTiersDesc")}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Silver card */}
            <div className="rounded-xl border border-slate-300/40 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                  {t("loyaltySettings.silver", { defaultValue: "Silver" })}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">
                  {t("loyaltySettings.silverThreshold")}
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
                <label className="block text-xs font-medium text-foreground/70 mb-1">
                  {t("loyaltySettings.silverMultiplier")}
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
            </div>

            {/* Gold card */}
            <div className="rounded-xl border border-amber-300/40 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span className="font-semibold text-sm text-amber-700 dark:text-amber-400">
                  {t("loyaltySettings.gold", { defaultValue: "Gold" })}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/70 mb-1">
                  {t("loyaltySettings.goldThreshold")}
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
                <label className="block text-xs font-medium text-foreground/70 mb-1">
                  {t("loyaltySettings.goldMultiplier")}
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
          </div>

          {silverAboveGold && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {t("loyaltySettings.silverMustBeLower")}
            </p>
          )}
        </div>

        {/* ── Happy Hour ── */}
        <div className="py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className={sectionHeading}>{t("loyaltySettings.happyHour")}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{t("loyaltySettings.happyHourDesc")}</p>
            </div>
            <ToggleSwitch
              checked={happyHourEnable}
              onChange={setHappyHourEnable}
              aria-label={t("loyaltySettings.happyHour")}
            />
          </div>

          {happyHourEnable && (
            <div className="space-y-4">
              {/* Day-of-week picker */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  {t("loyaltySettings.happyHourDays", { defaultValue: "Active days" })}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { n: 1, short: t("loyaltySettings.dayMon", { defaultValue: "Mon" }) },
                    { n: 2, short: t("loyaltySettings.dayTue", { defaultValue: "Tue" }) },
                    { n: 3, short: t("loyaltySettings.dayWed", { defaultValue: "Wed" }) },
                    { n: 4, short: t("loyaltySettings.dayThu", { defaultValue: "Thu" }) },
                    { n: 5, short: t("loyaltySettings.dayFri", { defaultValue: "Fri" }) },
                    { n: 6, short: t("loyaltySettings.daySat", { defaultValue: "Sat" }) },
                    { n: 7, short: t("loyaltySettings.daySun", { defaultValue: "Sun" }) },
                  ] as const).map(({ n, short }) => {
                    const active = happyHourDays.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setHappyHourDays((prev) =>
                            active ? prev.filter((d) => d !== n) : [...prev, n].sort()
                          )
                        }
                        className={`w-12 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          active
                            ? "bg-primary/15 text-primary border-primary/30"
                            : "bg-secondary text-foreground border-border hover:bg-secondary/80"
                        }`}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time + multiplier row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Start time */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    {t("loyaltySettings.happyHourStart")}
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={happyHourStartH}
                      onChange={(e) => setHappyHourStartH(Number(e.target.value))}
                      className="w-16 px-2 py-2 border border-border rounded-lg bg-background text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2,"0")}</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground font-bold">:</span>
                    <select
                      value={happyHourStartM}
                      onChange={(e) => setHappyHourStartM(Number(e.target.value))}
                      className="w-16 px-2 py-2 border border-border rounded-lg bg-background text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {MINUTE_OPTIONS.map((m) => (
                        <option key={m} value={m}>{String(m).padStart(2,"0")}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* End time */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    {t("loyaltySettings.happyHourEnd")}
                  </label>
                  <div className="flex items-center gap-1">
                    <select
                      value={happyHourEndH}
                      onChange={(e) => setHappyHourEndH(Number(e.target.value))}
                      className="w-16 px-2 py-2 border border-border rounded-lg bg-background text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>{String(h).padStart(2,"0")}</option>
                      ))}
                    </select>
                    <span className="text-muted-foreground font-bold">:</span>
                    <select
                      value={happyHourEndM}
                      onChange={(e) => setHappyHourEndM(Number(e.target.value))}
                      className="w-16 px-2 py-2 border border-border rounded-lg bg-background text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {MINUTE_OPTIONS.map((m) => (
                        <option key={m} value={m}>{String(m).padStart(2,"0")}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{t("loyaltySettings.happyHourEndDesc")}</p>
                </div>

                {/* Multiplier */}
                <div>
                  <label className="block text-sm font-medium text-foreground/80 mb-1">
                    {t("loyaltySettings.happyHourMultiplier")}
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
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end pt-2 border-t border-border">
        <button
          type="submit"
          disabled={status.loading || silverAboveGold || reminderTooHigh}
          className="brand-cta text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          {status.loading ? t("settings.saving") : t("settings.saveSettings")}
        </button>
      </div>
    </form>
  );
};

export default LoyaltySettingsTab;
