import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Globe,
  Plus,
  X,
  Star,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useRestaurantContext } from "../../../context/RestaurantContext";
import { useSocket } from "../../../context/SocketContext";
import {
  updateRestaurant,
  triggerTranslation,
  getTranslationStatus,
  type TranslationStatus,
} from "../../../lib/api";
import { useFeature } from "../../../hooks/useFeature";
import { getApiError } from "../../../lib/apiError";

// Poll fallback cadence while a translate-all run is active — the socket
// carries live done/total updates, but its terminal phases are per-batch,
// not per-run, so it alone can't tell us when ALL queued work is finished.
// The poll checks the authoritative "is there still STALE/PENDING work"
// signal instead. Also caps how long the UI keeps polling so a run that
// somehow never finishes doesn't spin the button forever.
const TRANSLATION_POLL_INTERVAL_MS = 8_000;
const TRANSLATION_POLL_MAX_MS = 10 * 60 * 1000;

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

const sectionHeading =
  "text-sm font-semibold text-foreground uppercase tracking-wide";

const GeneralSettingsTab: React.FC = () => {
  const { activeRestaurant, fetchRestaurants } = useRestaurantContext();
  const canLanguages = useFeature("languages:multi");
  const { t } = useTranslation();

  const [restaurantName, setRestaurantName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Bulgaria");
  const [address, setAddress] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [addedSocialFields, setAddedSocialFields] = useState<string[]>([]);
  const [timezone, setTimezone] = useState("Europe/Sofia");
  const [targetLanguages, setTargetLanguages] = useState<string[]>([]);
  const [status, setStatus] = useState({
    loading: false,
    error: "",
    success: "",
  });
  const [translating, setTranslating] = useState(false);
  const [translateProgress, setTranslateProgress] = useState<{
    phase: string;
    done: number;
    total: number;
    status?: string;
  } | null>(null);
  const [translatePhaseStatus, setTranslatePhaseStatus] = useState<
    string | null
  >(null);
  const [translateSuccess, setTranslateSuccess] = useState(false);
  const [translateTimedOut, setTranslateTimedOut] = useState(false);
  const [translationStatus, setTranslationStatus] =
    useState<TranslationStatus | null>(null);
  const initializedRestaurantId = useRef<string | null>(null);
  const { socket, isConnected } = useSocket();
  // Guards setState calls that could otherwise land after unmount (poll
  // interval, in-flight status fetch) — React only warns for this, but the
  // guard keeps the interval logic below honest either way.
  const mountedRef = useRef(true);
  // Baseline FAILED count at the moment Translate All was clicked — used so
  // stale FAILED rows from a prior run don't cause the current run's poll to
  // incorrectly report PARTIAL (issue #5).
  const baselineFailedRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshTranslationStatus = useCallback(async (restaurantId: string) => {
    try {
      const result = await getTranslationStatus(restaurantId);
      if (mountedRef.current) setTranslationStatus(result);
      return result;
    } catch {
      // Badge/poll data is best-effort — never surface this as a page error.
      return null;
    }
  }, []);

  useEffect(() => {
    if (
      activeRestaurant &&
      initializedRestaurantId.current !== activeRestaurant.id
    ) {
      initializedRestaurantId.current = activeRestaurant.id;
      setRestaurantName(activeRestaurant.name || "");
      setCity(activeRestaurant.city || "");
      setCountry(activeRestaurant.country || "Bulgaria");
      setAddress(activeRestaurant.address || "");
      setContactInfo(activeRestaurant.contactInfo || "");
      setWebsiteUrl(activeRestaurant.websiteUrl || "");
      setFacebookUrl(activeRestaurant.facebookUrl || "");
      setInstagramUrl(activeRestaurant.instagramUrl || "");
      setTiktokUrl(activeRestaurant.tiktokUrl || "");
      setYoutubeUrl(activeRestaurant.youtubeUrl || "");
      setGoogleReviewUrl(activeRestaurant.googleReviewUrl || "");
      setTimezone(activeRestaurant.timezone || "Europe/Sofia");
      setTargetLanguages(activeRestaurant.targetLanguages || []);
      setStatus({ loading: false, error: "", success: "" });
      if (canLanguages) {
        void refreshTranslationStatus(activeRestaurant.id).then((result) => {
          if (result?.active) setTranslating(true);
        });
      }
    }
  }, [activeRestaurant, canLanguages, refreshTranslationStatus]);

  // Socket carries live done/total updates per worker batch. A "completed"
  // status means the worker's current claimed batch is done — it does NOT
  // necessarily mean every queued unit is finished. The poll below decides
  // when the run as a whole is done.
  //
  // Exception: when the socket reports COMPLETED *and* done ≥ total, the
  // worker has processed everything it knows about — show the green bar
  // immediately instead of waiting up to 8 s for the next poll tick (#3).
  useEffect(() => {
    if (!socket || !isConnected || !activeRestaurant?.id) return;

    const handleProgress = (payload: {
      phase: string;
      done: number;
      total: number;
      status?: string;
    }) => {
      if (!mountedRef.current) return; // #7 — guard post-unmount socket event
      setTranslateProgress(payload);

      // #3 — immediate COMPLETED when done ≥ total (last batch finished)
      if (
        payload.status === "COMPLETED" &&
        payload.total > 0 &&
        payload.done >= payload.total
      ) {
        setTranslatePhaseStatus("COMPLETED");
        setTranslateSuccess(true);
        setTranslateProgress((prev) =>
          prev ? { ...prev, done: prev.total, status: "COMPLETED" } : null,
        );
        return;
      }

      // Non-COMPLETED terminal statuses (PARTIAL, QUOTA_BLOCKED, etc.)
      if (payload.status && payload.status !== "COMPLETED") {
        setTranslatePhaseStatus(payload.status);
      }

      if (payload.status === "PARTIAL") {
        setTranslateSuccess(false);
      }
    };

    socket.on("translate:progress", handleProgress);
    return () => {
      socket.off("translate:progress", handleProgress);
    };
  }, [socket, isConnected, activeRestaurant?.id]);

  // Poll fallback: the authoritative "is there still queued work" signal.
  // Runs only while translating, capped at TRANSLATION_POLL_MAX_MS so a
  // stuck/never-finishing run doesn't spin the button forever — the owner
  // can always re-check via the outdated/failed badge afterward.
  useEffect(() => {
    if (!translating || !activeRestaurant?.id) return;
    const restaurantId = activeRestaurant.id;
    const startedAt = Date.now();
    const baselineFailed = baselineFailedRef.current; // #5 — snapshot at poll start

    const poll = async () => {
      const result = await refreshTranslationStatus(restaurantId);
      if (!mountedRef.current) return;
      const timedOut = Date.now() - startedAt > TRANSLATION_POLL_MAX_MS;
      if (!result || !result.active || timedOut) {
        setTranslating(false);
        // Do NOT clear translateProgress here, so the status bar stays visible
        // for the user to read the final success/error state.

        if (timedOut && !result) {
          // #8 — explicit timeout state so the user knows the run may still
          // be active but the UI stopped polling.
          setTranslateTimedOut(true);
          setTranslateProgress((prev) =>
            prev ? { ...prev, status: "TIMED_OUT" } : null,
          );
          return;
        }

        // #5 — only count FAILED rows that appeared AFTER this run started.
        // Stale FAILED rows from a previous run would otherwise cause a false
        // PARTIAL error on a cleanly-completed current run.
        const freshFailed =
          result && result.failed > baselineFailed
            ? result.failed - baselineFailed
            : 0;
        if (freshFailed > 0) {
          setTranslatePhaseStatus("PARTIAL");
          setTranslateSuccess(false);
          setStatus((s) => ({
            ...s,
            success: "",
            error: t("settings.translateSomeFailedNotice", {
              count: freshFailed,
              defaultValue:
                "Translation finished — {{count}} item(s) failed and will retry automatically.",
            }),
          }));
        } else if (result && !result.active) {
          setTranslatePhaseStatus("COMPLETED");
          setTranslateSuccess(true);
          // Force progress to 100% in case the final socket event was missed
          setTranslateProgress((prev) =>
            prev ? { ...prev, done: prev.total, status: "COMPLETED" } : null,
          );
        }
      }
    };

    const interval = setInterval(poll, TRANSLATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [translating, activeRestaurant?.id, refreshTranslationStatus, t]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRestaurant) return;
    setStatus({ loading: true, error: "", success: "" });
    try {
      await updateRestaurant(activeRestaurant.id, {
        name: restaurantName.trim() || undefined,
        city: city.trim() || null,
        country: country.trim() || "Bulgaria",
        address,
        contactInfo,
        websiteUrl: websiteUrl || null,
        facebookUrl: facebookUrl || null,
        instagramUrl: instagramUrl || null,
        tiktokUrl: tiktokUrl || null,
        youtubeUrl: youtubeUrl || null,
        googleReviewUrl: googleReviewUrl.trim() || null,
        timezone,
        targetLanguages,
      });
      await fetchRestaurants();
      setStatus({
        loading: false,
        error: "",
        success: t("settings.updatedSuccess"),
      });
      setTimeout(() => setStatus((s) => ({ ...s, success: "" })), 3000);
    } catch (err: any) {
      setStatus({
        loading: false,
        error: t(getApiError(err)),
        success: "",
      });
    }
  };

  const handleForceTranslate = async () => {
    if (!activeRestaurant) return;
    setTranslating(true);
    setTranslateProgress(null);
    setTranslatePhaseStatus(null);
    setTranslateSuccess(false);
    setTranslateTimedOut(false);
    setStatus({ loading: false, error: "", success: "" });
    // #5 — snapshot current FAILED count so poll doesn't blame this run for
    // stale failures left over from a prior run.
    baselineFailedRef.current = translationStatus?.failed ?? 0;
    try {
      const savedLangs = activeRestaurant.targetLanguages || [];
      const langsChanged =
        targetLanguages.length !== savedLangs.length ||
        targetLanguages.some((l: string) => !savedLangs.includes(l));
      if (langsChanged) {
        await updateRestaurant(activeRestaurant.id, { targetLanguages });
        await fetchRestaurants();
      }
      // translate-all now enqueues and returns immediately (202) — the
      // actual translation happens asynchronously. `translating` stays true
      // until the poll effect above confirms no work is left queued, not
      // when this call resolves.
      const res = await triggerTranslation(activeRestaurant.id);
      if (!res.success) {
        setStatus({ loading: false, error: res.message, success: "" });
        setTranslating(false);
      }
    } catch (err: any) {
      setStatus({
        loading: false,
        error: t(getApiError(err)),
        success: "",
      });
      setTranslating(false);
    }
  };

  const handleLanguageToggle = (code: string) => {
    setTargetLanguages((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const tzLabel =
    TIMEZONES.find((tz) => tz.value === timezone)?.label ?? timezone;
  const langCount = targetLanguages.length;

  const socialFields = [
    {
      key: "websiteUrl",
      labelKey: "settings.websiteUrl",
      value: websiteUrl,
      setter: setWebsiteUrl,
      placeholder: "https://yourrestaurant.com",
    },
    {
      key: "facebookUrl",
      labelKey: "settings.facebookUrl",
      value: facebookUrl,
      setter: setFacebookUrl,
      placeholder: "https://facebook.com/yourpage",
    },
    {
      key: "instagramUrl",
      labelKey: "settings.instagramUrl",
      value: instagramUrl,
      setter: setInstagramUrl,
      placeholder: "https://instagram.com/yourhandle",
    },
    {
      key: "tiktokUrl",
      labelKey: "settings.tiktokUrl",
      value: tiktokUrl,
      setter: setTiktokUrl,
      placeholder: "https://tiktok.com/@yourhandle",
    },
    {
      key: "youtubeUrl",
      labelKey: "settings.youtubeUrl",
      value: youtubeUrl,
      setter: setYoutubeUrl,
      placeholder: "https://youtube.com/@yourchannel",
    },
  ];

  const visibleSocialFields = socialFields.filter(
    (f) => f.value || addedSocialFields.includes(f.key),
  );
  const availableToAdd = socialFields.filter(
    (f) => !f.value && !addedSocialFields.includes(f.key),
  );

  return (
    <form onSubmit={handleSave} className="space-y-6">
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

      {/* Summary row */}
      <div className="flex flex-wrap gap-2 pb-5 border-b border-border">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 truncate max-w-[200px]">
          {restaurantName || t("settings.restaurantNamePlaceholder")}
        </span>
        <div
          className="relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border hover:bg-muted/80 transition-colors cursor-pointer"
          title={t("settings.timezoneDesc")}
        >
          <Globe size={11} />
          <span>{tzLabel}</span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
        {langCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium border border-border">
            {t("settings.summaryLanguages", {
              count: langCount,
              defaultValue: "{{count}} language(s) active",
            })}
          </span>
        )}
      </div>

      {/* ── Basic Info (Name & Contact) ── */}
      <div className="border-b border-border pb-6">
        <h3 className={`${sectionHeading} mb-4`}>
          {t("settings.restaurantName")} & {t("settings.locationContact")}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Restaurant Name */}
          <div>
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.restaurantName")}
            </label>
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder={t("settings.restaurantNamePlaceholder")}
              className={inputCls}
              required
            />
          </div>

          {/* City */}
          <div>
            <label
              htmlFor="restaurant-city"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              {t("settings.city", "City")}
            </label>
            <input
              id="restaurant-city"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("settings.cityPlaceholder", "Sofia")}
              autoComplete="address-level2"
              className={inputCls}
            />
          </div>

          {/* Country */}
          <div>
            <label
              htmlFor="restaurant-country"
              className="block text-sm font-medium text-foreground/80 mb-1"
            >
              {t("settings.country", "Country")}
            </label>
            <input
              id="restaurant-country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t("settings.countryPlaceholder", "Bulgaria")}
              autoComplete="country-name"
              className={inputCls}
              required
            />
          </div>

          {/* Address */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-foreground/80 mb-1">
              {t("settings.address")}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t(
                "settings.addressPlaceholder",
                "123 Main St, New York",
              )}
              className={inputCls}
            />
          </div>

          {/* Contact */}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-1">
          <h3 className={sectionHeading}>{t("settings.socialMedia")}</h3>

          {availableToAdd.length > 0 && (
            <div className="relative inline-flex">
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 transition-colors bg-primary/5 px-2 py-1 rounded-md"
              >
                <Plus size={12} />
                {t("common.add", "Add")}
              </button>
              <select
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                value=""
                onChange={(e) => {
                  setAddedSocialFields((prev) => [...prev, e.target.value]);
                }}
              >
                <option value="" disabled>
                  {t("common.selectToAdd", "Select link to add...")}
                </option>
                {availableToAdd.map((f) => (
                  <option key={f.key} value={f.key}>
                    {t(f.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          {t("settings.socialMediaDesc")}
        </p>

        {visibleSocialFields.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visibleSocialFields.map((f) => (
              <div key={f.key} className="relative group">
                <label className="block text-sm font-medium text-foreground/80 mb-1">
                  {t(f.labelKey)}
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={f.value}
                    onChange={(e) => f.setter(e.target.value)}
                    placeholder={f.placeholder}
                    className={`${inputCls} pr-8`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      f.setter("");
                      setAddedSocialFields((prev) =>
                        prev.filter((key) => key !== f.key),
                      );
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    title={t("common.remove", "Remove")}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic bg-muted/30 py-4 px-5 rounded-xl border border-dashed border-border/60">
            {t(
              "settings.noSocialMedia",
              "No social media links added yet. Click 'Add' to add them.",
            )}
          </div>
        )}
      </div>

      {/* ── Google Review CTA ── */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-2 mb-1">
          <Star size={14} className="text-muted-foreground" />
          <h3 className={sectionHeading}>
            {t("settings.googleReview", "Google Review CTA")}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4 ml-[22px]">
          {t(
            "settings.googleReviewDesc",
            "After checkout, customers with 4- or 5-star ratings are redirected to your Google review page.",
          )}
        </p>
        <div className="max-w-sm ml-[22px]">
          <label className="block text-sm font-medium text-foreground/80 mb-1">
            {t("settings.googleReviewUrl", "Google Review URL")}
          </label>
          <input
            type="url"
            value={googleReviewUrl}
            onChange={(e) => setGoogleReviewUrl(e.target.value)}
            placeholder={t(
              "settings.googleReviewPlaceholder",
              "https://g.page/r/YOUR_REVIEW_LINK",
            )}
            className={inputCls}
          />
          {googleReviewUrl && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 flex items-center gap-1">
              <CheckCircle2 size={12} className="flex-shrink-0" />
              {t(
                "settings.googleReviewActive",
                "Redirect active — customers will be sent to Google after checkout",
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── Localization & Translation ── */}
      {canLanguages && (
        <div className="border-b border-border pb-6">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className={sectionHeading}>{t("settings.localization")}</h3>
            {!translating &&
              translationStatus &&
              translationStatus.pending + translationStatus.failed > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 text-[11px] font-medium border border-yellow-500/30"
                  title={t(
                    "settings.translationOutdatedBadgeTitle",
                    "Some menu translations are outdated or failed — click Translate All Now to refresh them.",
                  )}
                >
                  <AlertTriangle size={11} />
                  {t("settings.translationOutdatedBadge", {
                    count: translationStatus.pending + translationStatus.failed,
                    defaultValue: "{{count}} outdated",
                  })}
                </span>
              )}
          </div>
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
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-secondary text-foreground border-border hover:bg-secondary/80"
                    }`}
                  >
                    {t(`language.${lang.code}`, lang.name)}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.translationPoweredBy")}
            </p>
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
                      defaultValue:
                        "{{count}} language(s) selected — click to translate your menu",
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
              {translating
                ? t("settings.translating")
                : t("settings.translateAllNow")}
            </button>
          </div>
          {(translating || translateProgress !== null) && (
            <div className="mt-3 space-y-2">
              {/* Phase-aware label row */}
              {translateProgress && translateProgress.total > 0 ? (
                <>
                  <div className="flex justify-between text-xs mb-1">
                    <span
                      className={
                        translatePhaseStatus === "PARTIAL"
                          ? "text-destructive font-medium"
                          : translatePhaseStatus === "COMPLETED"
                            ? "text-green-600 dark:text-green-400 font-medium"
                            : translateTimedOut
                              ? "text-muted-foreground font-medium"
                              : "text-muted-foreground"
                      }
                    >
                      {translatePhaseStatus === "PARTIAL"
                        ? t("settings.translateSomeFailedNotice", {
                            count:
                              translateProgress.total - translateProgress.done,
                            defaultValue:
                              "Translation finished — {{count}} item(s) failed and will retry automatically.",
                          })
                        : translatePhaseStatus === "COMPLETED" &&
                            translateSuccess
                          ? t(
                              "settings.translateSuccess",
                              "✓ Translation complete!",
                            )
                          : translateTimedOut
                            ? t(
                                "settings.translateTimedOut",
                                "Translation is taking longer than expected — you can check back later.",
                              )
                            : t(
                                "settings.translatingInProgress",
                                "Translating menu…",
                              )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {t("settings.translateProgressCount", {
                        done: translateProgress.done,
                        total: translateProgress.total,
                        remaining: Math.max(
                          0,
                          translateProgress.total - translateProgress.done,
                        ),
                        defaultValue: "{{done}}/{{total}} · {{remaining}} left",
                      })}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ease-out ${
                        translatePhaseStatus === "PARTIAL"
                          ? "bg-destructive"
                          : translatePhaseStatus === "COMPLETED"
                            ? "bg-green-500"
                            : translateTimedOut
                              ? "bg-muted-foreground/50"
                              : "bg-yellow-600"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (translateProgress.done / translateProgress.total) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {t(
                    "settings.translateQueued",
                    "Queued — translation is running in the background…",
                  )}
                </p>
              )}
            </div>
          )}
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
