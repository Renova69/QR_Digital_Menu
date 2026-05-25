import React, { useContext, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import RestaurantContext from "../../../context/RestaurantContext";
import { updateRestaurant, triggerTranslation } from "../../../lib/api";
import { useTier } from "../../../hooks/useFeature";

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
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

const sectionHeading = "text-sm font-semibold text-foreground uppercase tracking-wide";

const GeneralSettingsTab: React.FC = () => {
  const { activeRestaurant, fetchRestaurants } = useContext(RestaurantContext) as any;
  const { tier } = useTier();
  const isFree = tier === "FREE";
  const { t } = useTranslation();

  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([]);
  const [status, setStatus] = useState({ loading: false, error: "", success: "" });
  const [translating, setTranslating] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (activeRestaurant && !initialized.current) {
      initialized.current = true;
      setRestaurantName(activeRestaurant.name || "");
      setAddress(activeRestaurant.address || "");
      setContactInfo(activeRestaurant.contactInfo || "");
      setFacebookUrl(activeRestaurant.facebookUrl || "");
      setInstagramUrl(activeRestaurant.instagramUrl || "");
      setTiktokUrl(activeRestaurant.tiktokUrl || "");
      setTimezone(activeRestaurant.timezone || "UTC");
      setTargetLanguages(activeRestaurant.targetLanguages || []);
    }
  }, [activeRestaurant]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRestaurant) return;
    setStatus({ loading: true, error: "", success: "" });
    try {
      await updateRestaurant(activeRestaurant.id, {
        name: restaurantName.trim() || undefined,
        address,
        contactInfo,
        facebookUrl: facebookUrl || null,
        instagramUrl: instagramUrl || null,
        tiktokUrl: tiktokUrl || null,
        timezone,
        targetLanguages,
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
      const savedLangs = activeRestaurant.targetLanguages || [];
      const langsChanged =
        targetLanguages.length !== savedLangs.length ||
        targetLanguages.some((l: string) => !savedLangs.includes(l));
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

  const handleLanguageToggle = (code: string) => {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const tzLabel = TIMEZONES.find((tz) => tz.value === timezone)?.label ?? timezone;
  const langCount = targetLanguages.length;

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

      {/* Summary row */}
      <div className="flex flex-wrap gap-2 pb-5 border-b border-border">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 truncate max-w-[200px]">
          {restaurantName || t("settings.restaurantNamePlaceholder")}
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border">
          <Globe size={11} />
          {tzLabel}
        </span>
        {langCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border">
            {t("settings.summaryLanguages", {
              count: langCount,
              defaultValue: "{{count}} language(s) active",
            })}
          </span>
        )}
      </div>

      {/* ── Restaurant Name ── */}
      <div className="border-b border-border pb-6">
        <h3 className={`${sectionHeading} mb-4`}>{t("settings.restaurantName")}</h3>
        <div className="max-w-md">
          <input
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder={t("settings.restaurantNamePlaceholder")}
            className={inputCls}
            required
          />
        </div>
      </div>

      {/* ── Location & Contact ── */}
      <div className="border-b border-border pb-6">
        <h3 className={`${sectionHeading} mb-4`}>{t("settings.locationContact")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.address")}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, New York"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.contactInfo")}
            </label>
            <input
              type="tel"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="+1 555 555 5555"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ── Social Media ── */}
      <div className="border-b border-border pb-6">
        <h3 className={`${sectionHeading} mb-1`}>{t("settings.socialMedia")}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t("settings.socialMediaDesc")}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.facebookUrl")}
            </label>
            <input
              type="url"
              value={facebookUrl}
              onChange={(e) => setFacebookUrl(e.target.value)}
              placeholder="https://facebook.com/yourpage"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.instagramUrl")}
            </label>
            <input
              type="url"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/yourhandle"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.tiktokUrl")}
            </label>
            <input
              type="url"
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              placeholder="https://tiktok.com/@yourhandle"
              className={inputCls}
            />
          </div>
        </div>
      </div>

      {/* ── Timezone ── */}
      <div className="border-b border-border pb-6">
        <h3 className={`${sectionHeading} mb-1`}>{t("settings.timezone")}</h3>
        <p className="text-sm text-muted-foreground mb-4">{t("settings.timezoneDesc")}</p>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className={`${inputCls} max-w-sm`}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Localization & Translation ── (non-free only) */}
      {!isFree && (
        <div className="border-b border-border pb-6">
          <h3 className={`${sectionHeading} mb-1`}>{t("settings.localization")}</h3>
          <p className="text-sm text-muted-foreground mb-4">{t("settings.localizationDesc")}</p>
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
                        ? "bg-primary/15 text-primary border-primary/30"
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
                {langCount > 0
                  ? t("settings.translationActiveCount", {
                      count: langCount,
                      defaultValue: "{{count}} language(s) selected — click to translate your menu",
                    })
                  : t("settings.processExistingDesc")}
              </p>
            </div>
            <button
              type="button"
              onClick={handleForceTranslate}
              disabled={translating || langCount === 0}
              className="whitespace-nowrap px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 disabled:opacity-50 transition-colors"
            >
              {translating ? t("settings.translating") : t("settings.translateAllNow")}
            </button>
          </div>
        </div>
      )}

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

export default GeneralSettingsTab;
