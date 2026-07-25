import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  type LucideIcon,
  Accessibility,
  Baby,
  CalendarDays,
  Check,
  Flag,
  Globe,
  Heart,
  Info,
  Leaf,
  MapPin,
  MilkOff,
  Moon,
  NutOff,
  PawPrint,
  Salad,
  Sprout,
  Sun,
  User,
  Users,
  VolumeX,
  WheatOff,
} from "lucide-react";
import {
  getReservationConfig,
  getReservationAvailability,
  createReservation,
} from "../lib/api";
import {
  AvailabilitySlot,
  ACCESSIBILITY_PREFERENCES,
  CUSTOMER_PREFERENCES,
  DIETARY_PREFERENCES,
  ReservationPublicConfig,
} from "../types/reservations";
import {
  getStoredPublicTheme,
  hexToRgba,
  LANGUAGE_LABELS,
  PublicBrandMode,
  resolvePublicPalette,
  RTL_LANGS,
  setStoredPublicTheme,
} from "../lib/publicTheme";
import { zoneLabel } from "../lib/zoneCatalog";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../lib/dateLocales";
import { getApiError } from "../lib/apiError";
import { resolveTag } from "../lib/menuTags";

function parseDateString(dateStr: string): Date {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PREF_ICON: Record<string, LucideIcon> = {
  VEGAN: Sprout,
  VEGETARIAN: Salad,
  GLUTEN_INTOLERANT: WheatOff,
  LACTOSE_INTOLERANT: MilkOff,
  NUT_ALLERGY: NutOff,
  WHEELCHAIR_ACCESS: Accessibility,
  PREGNANT: Baby,
};

function localDateISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  // Local calendar date — NOT toISOString(), which is UTC and rolls to the
  // wrong day for hours after local midnight in UTC+ timezones (e.g. Sofia).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function prefLabel(pref: string): string {
  return pref
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const COUNTRIES = [
  { code: "+359", flag: "🇧🇬", label: "BG" },
  { code: "+40", flag: "🇷🇴", label: "RO" },
  { code: "+30", flag: "🇬🇷", label: "GR" },
  { code: "+90", flag: "🇹🇷", label: "TR" },
  { code: "+49", flag: "🇩🇪", label: "DE" },
  { code: "+44", flag: "🇬🇧", label: "UK" },
  { code: "+39", flag: "🇮🇹", label: "IT" },
  { code: "+34", flag: "🇪🇸", label: "ES" },
  { code: "+33", flag: "🇫🇷", label: "FR" },
  { code: "+1", flag: "🇺🇸", label: "US" },
];

const BookingPage = () => {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [config, setConfig] = useState<ReservationPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<PublicBrandMode>("light");
  const [lang, setLang] = useState<string>("");

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [date, setDate] = useState(localDateISO());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("+359");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [prefs, setPrefs] = useState<string[]>([]);
  const [allergyNotes, setAllergyNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  // Feature 1: how the guest wants confirmations, cancellations and the 24h
  // reminder delivered. Email is the default; SMS is opt-in.
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  // Feature 3: preferred seating zone (soft hint; empty = no preference).
  const [zone, setZone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idempotencyKey = useMemo(
    () =>
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    [],
  );

  const total = adults + children;
  const dietaryChosen =
    prefs.some((p) => DIETARY_PREFERENCES.includes(p)) ||
    allergyNotes.trim().length > 0;

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    setLoading(true);
    getReservationConfig(restaurantId)
      .then((d: ReservationPublicConfig) => {
        if (cancelled) return;
        setConfig(d);
        setTheme(
          getStoredPublicTheme(
            restaurantId,
            (d?.restaurant?.defaultTheme as PublicBrandMode) || "light",
          ),
        );
        const params = new URLSearchParams(window.location.search);
        let initialLang =
          params.get("lang") ||
          localStorage.getItem("i18nextLng") ||
          d?.defaultLanguage ||
          "bg";
        if (initialLang.includes("-")) initialLang = initialLang.split("-")[0];
        if (d.languages?.length && !d.languages.includes(initialLang)) {
          initialLang = d.defaultLanguage || d.languages[0] || "bg";
        }
        setLang(initialLang);
        void i18n.changeLanguage(initialLang);
      })
      .catch(() => !cancelled && setConfig(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [restaurantId, i18n]);

  useEffect(() => {
    if (!restaurantId || !config?.enabled) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    getReservationAvailability(restaurantId, date, adults, children)
      .then((d) => !cancelled && setSlots(d.slots ?? []))
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [restaurantId, config?.enabled, date, adults, children]);

  const togglePref = (p: string) =>
    setPrefs((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const toggleTheme = () => {
    const next: PublicBrandMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setStoredPublicTheme(restaurantId, next);
  };

  const changeLang = (l: string) => {
    setLang(l);
    void i18n.changeLanguage(l);
  };

  const maxParty = config?.policy?.maxTotalGuests ?? 12;
  // Email is required only when the guest asks to be notified by email; SMS
  // relies on the phone number that is already required for a booking.
  const emailValid = /.+@.+\..+/.test(email.trim());
  const notifyOk =
    (notifyEmail || notifySms) &&
    (!notifyEmail || emailValid) &&
    (!notifySms || phone.trim().length > 0);
  const canSubmit =
    !!selectedSlot &&
    name.trim().length > 0 &&
    (!config?.policy?.requirePhone || phone.trim().length > 0) &&
    notifyOk &&
    (!dietaryChosen || consent) &&
    total >= 1 &&
    total <= maxParty &&
    !submitting;

  const submit = async () => {
    if (!restaurantId || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createReservation(restaurantId, {
        guestName: name.trim(),
        guestPhone: phone.trim()
          ? (countryCode + phone.replace(/^0+/, "").replace(/\D/g, "")).trim()
          : "",
        guestEmail: email.trim() || undefined,
        startsAt: selectedSlot,
        locale: (lang || i18n.language || "en").split(/[-_]/)[0],
        adultsCount: adults,
        childrenCount: children,
        customerNotes: notes.trim() || undefined,
        customerPreferences: prefs,
        allergyNotes: allergyNotes.trim() || undefined,
        dietaryConsent: dietaryChosen ? consent : undefined,
        marketingConsent: marketing || undefined,
        notifyByEmail: notifyEmail,
        notifyBySms: notifySms,
        preferredZone: zone || undefined,
        idempotencyKey,
      });
      // Store manage token in sessionStorage (not URL) — avoids bearer token
      // in browser history, Referer headers, and server access logs.
      if (result.manageToken) {
        sessionStorage.setItem(
          `manage_${result.referenceCode}`,
          result.manageToken,
        );
      }
      navigate(
        `/booking/confirmation?ref=${encodeURIComponent(
          result.referenceCode,
        )}&r=${encodeURIComponent(restaurantId)}`,
      );
    } catch (e: any) {
      setError(t(getApiError(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const palette = resolvePublicPalette(config?.restaurant, theme);
  const isDark = theme === "dark";
  const rootStyle = {
    "--bg": palette.bg,
    "--text": palette.text,
    "--card": palette.card,
    "--accent": palette.accent,
    "--muted": hexToRgba(palette.text, 0.6),
    "--faint": hexToRgba(palette.text, 0.42),
    "--border": hexToRgba(palette.text, isDark ? 0.16 : 0.1),
    "--input": isDark ? hexToRgba(palette.text, 0.06) : "#ffffff",
    background: "var(--bg)",
    color: "var(--text)",
  } as CSSProperties;

  const themeStyles = (
    <style>{`
      .bk-card{background:var(--card);border:1px solid var(--border);border-radius:1rem}
      .bk-muted{color:var(--muted)}
      .bk-faint{color:var(--faint)}
      .bk-accent{color:var(--accent)}
      .bk-input{width:100%;background:var(--input);border:1px solid var(--border);border-radius:.75rem;padding:.6rem .75rem;color:var(--text);outline:none}
      .bk-input::placeholder{color:var(--faint);font-size:0.9em}
      .bk-input:focus{border-color:var(--accent)}
      .bk-chip{background:var(--card);border:1px solid var(--border);color:var(--text)}
      .bk-chip:hover{border-color:var(--accent)}
      .bk-chip-active{background:var(--accent);border:1px solid var(--accent);color:#fff}
      .bk-ctrl{background:var(--card);border:1px solid var(--border);color:var(--text)}
    `}</style>
  );

  if (loading) {
    return (
      <div
        style={rootStyle}
        className="min-h-screen flex items-center justify-center"
      >
        <span className="bk-faint">{t("booking.loading", "Loading…")}</span>
      </div>
    );
  }

  if (!config || !config.enabled) {
    return (
      <div
        style={rootStyle}
        className="min-h-screen flex items-center justify-center p-6 text-center"
      >
        {themeStyles}
        <div>
          <h1 className="text-xl font-semibold mb-2">
            {config?.restaurant?.name ?? t("booking.title", "Reservations")}
          </h1>
          <p className="bk-muted">
            {t(
              "booking.notEnabled",
              "This restaurant is not accepting online reservations right now.",
            )}
          </p>
        </div>
      </div>
    );
  }

  const r = config.restaurant;
  const languages = config.languages ?? [];
  // Three display groups. Dietary + accessibility are both consent-gated
  // (special-category), but shown under separate headings; "other" is general.
  const dietaryPrefKeys = CUSTOMER_PREFERENCES.filter(
    (p) =>
      DIETARY_PREFERENCES.includes(p) && !ACCESSIBILITY_PREFERENCES.includes(p),
  );
  const accessibilityPrefKeys = CUSTOMER_PREFERENCES.filter((p) =>
    ACCESSIBILITY_PREFERENCES.includes(p),
  );
  const otherPrefKeys = CUSTOMER_PREFERENCES.filter(
    (p) => !DIETARY_PREFERENCES.includes(p),
  );
  const customPrefs = config.policy?.customPreferences ?? [];
  const lunch = slots.filter((s) => Number(s.label.slice(0, 2)) < 17);
  const dinner = slots.filter((s) => Number(s.label.slice(0, 2)) >= 17);

  return (
    <div
      style={rootStyle}
      dir={RTL_LANGS.has(lang) ? "rtl" : "ltr"}
      className="min-h-screen pb-28"
    >
      {themeStyles}
      <div className="max-w-lg mx-auto px-4">
        {/* Control bar */}
        <div className="flex items-center justify-end gap-2 pt-4">
          {languages.length > 1 && (
            <label className="bk-ctrl inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-sm">
              <Globe className="w-4 h-4 bk-muted" />
              <select
                value={lang}
                onChange={(e) => changeLang(e.target.value)}
                className="bg-transparent outline-none pr-1 text-sm cursor-pointer"
              >
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l] ?? l.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="bk-ctrl inline-flex items-center justify-center w-9 h-9 rounded-full"
          >
            {isDark ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Header */}
        <header className="text-center pt-4 pb-5">
          {r.logoUrl && (
            <img
              src={r.logoUrl}
              alt={r.name}
              className="h-28 w-28 rounded-full object-cover mx-auto mb-3 shadow-sm"
              style={{ boxShadow: `0 0 0 1px var(--border)` }}
            />
          )}
          <h1 className="text-3xl font-serif font-bold">{r.name}</h1>
          <p className="bk-accent font-medium mt-0.5">
            {t("booking.title", "Book a table")}
          </p>
        </header>

        {/* Reservation details */}
        <Card>
          <SectionTitle icon={<CalendarDays className="w-5 h-5" />}>
            {t("booking.detailsTitle", "Reservation details")}
          </SectionTitle>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <Stepper
              label={t("booking.adults", "Adults")}
              value={adults}
              min={1}
              max={maxParty}
              onChange={setAdults}
            />
            <Stepper
              label={t("booking.children", "Children")}
              value={children}
              min={0}
              max={maxParty}
              onChange={setChildren}
            />
          </div>
          <p className="flex items-center gap-1.5 text-sm bk-muted mt-3">
            <Users className="w-4 h-4" />
            {t("booking.totalGuests", "Total guests")}:{" "}
            <span className="bk-accent font-semibold">{total}</span>
          </p>

          <div className="mt-4">
            <label className="block text-sm mb-1.5">
              {t("booking.date", "Date")}
            </label>
            <div className="flex items-center bk-input px-3 py-0">
              <CalendarDays className="w-4 h-4 bk-faint shrink-0" />
              <DatePicker
                selected={parseDateString(date)}
                onChange={(d: Date | null) => d && setDate(formatDateString(d))}
                minDate={parseDateString(localDateISO())}
                maxDate={parseDateString(
                  localDateISO(config.policy?.bookingHorizonDays ?? 60),
                )}
                locale={i18n.language}
                dateFormat="P"
                className="w-full px-2 py-2.5 bg-transparent outline-none"
                wrapperClassName="w-full"
                customInput={
                  <input
                    style={{
                      color: "var(--text)",
                      colorScheme: isDark ? "dark" : "light",
                    }}
                  />
                }
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm mb-2">
              {t("booking.time", "Select a time")}
              {r.timezone && (
                <span className="text-xs bk-faint ml-1">({r.timezone})</span>
              )}
            </label>
            {slotsLoading ? (
              <p className="text-sm bk-faint">
                {t("booking.loadingSlots", "Checking availability…")}
              </p>
            ) : slots.length === 0 ? (
              <p className="text-sm bk-faint">
                {t("booking.noSlots", "No times available for this date.")}
              </p>
            ) : (
              <div className="space-y-4">
                <SlotGroup
                  title={t("booking.lunch", "Lunch")}
                  slots={lunch}
                  selected={selectedSlot}
                  onSelect={setSelectedSlot}
                />
                <SlotGroup
                  title={t("booking.dinner", "Dinner")}
                  slots={dinner}
                  selected={selectedSlot}
                  onSelect={setSelectedSlot}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Your details */}
        <Card>
          <SectionTitle icon={<User className="w-5 h-5" />}>
            {t("booking.yourDetails", "Your details")}
          </SectionTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            <Field label={t("booking.name", "Name")} required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("booking.namePlaceholder", "Your full name")}
                className="bk-input"
              />
            </Field>
            <Field
              label={t("booking.phone", "Mobile phone")}
              required={config.policy?.requirePhone}
            >
              <div
                className="flex items-stretch bk-input overflow-hidden focus-within:border-[var(--accent)] transition-colors"
                style={{ padding: 0 }}
              >
                <div
                  className="relative flex flex-col items-center justify-center shrink-0"
                  style={{
                    borderRight: "1px solid var(--border)",
                    width: "3.2rem",
                    background: "var(--card)",
                  }}
                >
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    aria-label="Country code"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none flex flex-col items-center justify-center leading-[1.1] bk-muted">
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                      {COUNTRIES.find((c) => c.code === countryCode)?.label ||
                        "BG"}
                    </span>
                    <span className="text-[10px] font-medium">
                      {countryCode}
                    </span>
                  </div>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t(
                    "booking.phonePlaceholder",
                    "Enter mobile number",
                  )}
                  className="flex-1 min-w-0 w-full bg-transparent outline-none"
                  style={{ padding: ".6rem .75rem" }}
                />
              </div>
            </Field>
          </div>

          <div className="mt-3">
            <Field
              label={
                notifyEmail
                  ? t("booking.email", "Email")
                  : `${t("booking.email", "Email")} (${t("booking.optional", "optional")})`
              }
              required={notifyEmail}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bk-input"
              />
            </Field>
          </div>

          {/* Feature 1: notification channel choice */}
          <div className="mt-3">
            <Field label={t("booking.notifyHow", "How should we update you?")}>
              <div className="flex flex-wrap gap-2">
                <ChannelToggle
                  active={notifyEmail}
                  onClick={() => setNotifyEmail((v) => !v)}
                >
                  {t("booking.notifyEmail", "Email")}
                </ChannelToggle>
                <ChannelToggle
                  active={notifySms}
                  onClick={() => setNotifySms((v) => !v)}
                >
                  {t("booking.notifySms", "SMS")}
                </ChannelToggle>
              </div>
              {!notifyEmail && !notifySms && (
                <p className="mt-1 text-xs" style={{ color: "var(--accent)" }}>
                  {t(
                    "booking.notifyNone",
                    "Pick at least one way to receive your confirmation and reminder.",
                  )}
                </p>
              )}
            </Field>
          </div>

          <div className="mt-3">
            <Field label={t("booking.notes", "Notes / special request")}>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t(
                  "booking.notesPlaceholder",
                  "e.g. birthday, near window, anniversary…",
                )}
                className="bk-input resize-none"
              />
            </Field>
          </div>

          {/* Feature 3: preferred seating zone */}
          {(config.policy?.zones?.length ?? 0) > 0 && (
            <div className="mt-4">
              <MiniTitle icon={<MapPin className="w-4 h-4" />}>
                {t("booking.seatingZone", "Preferred seating")}
              </MiniTitle>
              <div className="flex flex-wrap gap-2">
                <Chip
                  active={zone === ""}
                  onClick={() => setZone("")}
                  label={t("booking.zoneAny", "No preference")}
                />
                {config.policy!.zones.map((z) => {
                  const id = z.key ?? z.name;
                  return (
                    <Chip
                      key={id}
                      active={zone === id}
                      onClick={() => setZone(zone === id ? "" : id)}
                      label={zoneLabel(t, z)}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Preferences */}
          <div className="mt-4">
            <MiniTitle icon={<Heart className="w-4 h-4" />}>
              {t("booking.preferences", "Preferences")}
            </MiniTitle>
            <div className="flex flex-wrap gap-2">
              {otherPrefKeys.map((p) => (
                <Chip
                  key={p}
                  active={prefs.includes(p)}
                  onClick={() => togglePref(p)}
                  icon={PREF_ICON[p]}
                  label={t(`booking.pref.${p}`, prefLabel(p))}
                />
              ))}
              {customPrefs.map((p) => (
                <Chip
                  key={p}
                  active={prefs.includes(p)}
                  onClick={() => togglePref(p)}
                  label={p}
                />
              ))}
            </div>
          </div>

          {/* Dietary / allergy */}
          <div className="mt-4">
            <MiniTitle icon={<Leaf className="w-4 h-4" />}>
              {t("booking.dietary", "Dietary / allergy")}
            </MiniTitle>
            <div className="flex flex-wrap gap-2">
              {dietaryPrefKeys.map((p) => (
                <Chip
                  key={p}
                  active={prefs.includes(p)}
                  onClick={() => togglePref(p)}
                  icon={PREF_ICON[p]}
                  label={t(`booking.pref.${p}`, prefLabel(p))}
                />
              ))}
            </div>
            <div className="mt-3">
              <label className="block text-sm mb-1.5">
                {t("booking.allergyNotes", "Allergy / intolerance notes")}
              </label>
              <textarea
                value={allergyNotes}
                onChange={(e) => setAllergyNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t(
                  "booking.allergyPlaceholder",
                  "Tell us about any allergy or intolerance",
                )}
                className="bk-input resize-none"
              />
            </div>
          </div>

          {/* Accessibility & assistance (own heading; still consent-gated) */}
          {accessibilityPrefKeys.length > 0 && (
            <div className="mt-4">
              <MiniTitle icon={<Accessibility className="w-4 h-4" />}>
                {t("booking.accessibility", "Accessibility & assistance")}
              </MiniTitle>
              <div className="flex flex-wrap gap-2">
                {accessibilityPrefKeys.map((p) => (
                  <Chip
                    key={p}
                    active={prefs.includes(p)}
                    onClick={() => togglePref(p)}
                    icon={PREF_ICON[p]}
                    label={t(`booking.pref.${p}`, prefLabel(p))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Consent — covers dietary AND health/accessibility (special-category) */}
          {dietaryChosen && (
            <label className="flex items-start gap-2 mt-3 text-xs bk-muted">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                {t(
                  "booking.consent",
                  "I consent to the restaurant storing this dietary and health/accessibility information to serve me safely.",
                )}
              </span>
            </label>
          )}

          {/* Marketing opt-in (unchecked by default per GDPR) */}
          <label
            className="flex items-start gap-2 mt-4 pt-4 text-xs bk-muted"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              {t(
                "booking.marketing",
                "I'd like to receive news, offers and promotions from this restaurant.",
              )}
            </span>
          </label>
        </Card>

        {/* Allergen info */}
        {(config.allergens.allergens.length > 0 ||
          config.allergens.dietaryTags.length > 0) && (
          <div
            className="rounded-2xl p-4 mb-4"
            style={{
              background: hexToRgba("#f59e0b", isDark ? 0.12 : 0.1),
              border: `1px solid ${hexToRgba("#f59e0b", 0.4)}`,
            }}
          >
            <h2 className="flex items-center gap-2 text-[15px] font-semibold mb-1 bk-accent">
              <Info className="w-4 h-4" />
              {t(
                "booking.menuAllergens",
                "Menu allergens & dietary information",
              )}
            </h2>
            <p className="text-xs bk-muted mb-2">
              {t(
                "booking.allergenIntro",
                "This restaurant's menu contains items marked with:",
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ...config.allergens.allergens,
                ...config.allergens.dietaryTags,
              ].map((a) => {
                const preset = resolveTag(a);
                const Icon = preset?.Icon;
                const label = preset
                  ? t(preset.labelKey, a)
                  : t(`menuTags.${a.toLowerCase()}`, a);
                return (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 bk-card"
                  >
                    {Icon && <Icon className="w-3 h-3" />}
                    {label}
                  </span>
                );
              })}
            </div>
            <a
              href={`/menu/public/${restaurantId}`}
              className="inline-block mt-2 text-xs font-medium bk-accent underline"
            >
              {t("booking.viewMenu", "View full menu")}
            </a>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500 text-center mb-3">{error}</p>
        )}
      </div>

      {/* Sticky CTA */}
      <div
        className="fixed bottom-0 inset-x-0 pt-4 pb-4 px-4"
        style={{
          background: `linear-gradient(to top, var(--bg) 60%, transparent)`,
        }}
      >
        <div className="max-w-lg mx-auto">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-semibold tracking-wide shadow-lg disabled:opacity-50 disabled:shadow-none"
            style={{ background: "var(--accent)" }}
          >
            <CalendarDays className="w-5 h-5" />
            {submitting
              ? t("booking.submitting", "Submitting…")
              : t("booking.submit", "Request reservation")}
          </button>
        </div>
      </div>
    </div>
  );
};

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="bk-card shadow-sm p-4 sm:p-5 mb-4">{children}</section>
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <h2 className="flex items-center gap-2 text-lg font-semibold">
      <span className="bk-accent">{icon}</span>
      {children}
    </h2>
  );
}

function MiniTitle({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium mb-2">
      <span className="bk-accent">{icon}</span>
      {children}
    </p>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm mb-1.5">{label}</label>
      <div
        className="flex items-stretch rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <button
          type="button"
          className="px-4 text-xl bk-accent"
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <span className="flex-1 text-center py-2.5 font-semibold">{value}</span>
        <button
          type="button"
          className="px-4 text-xl bk-accent"
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function SlotGroup({
  title,
  slots,
  selected,
  onSelect,
}: {
  title: string;
  slots: AvailabilitySlot[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold bk-faint uppercase tracking-wider mb-2">
        {title}
      </p>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
        {slots.map((s) => {
          const active = selected === s.startsAt;
          return (
            <button
              key={s.startsAt}
              type="button"
              onClick={() => onSelect(s.startsAt)}
              className={`flex items-center justify-center gap-1 text-sm rounded-xl py-2 transition ${
                active ? "bk-chip-active shadow" : "bk-chip"
              }`}
            >
              {active && <Check className="w-3.5 h-3.5" />}
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: LucideIcon;
}) {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 transition ${
        active ? "bk-chip-active" : "bk-chip"
      }`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {label}
    </button>
  );
}

// Feature 1: toggle chip for a notification channel (Email / SMS). A checkmark
// makes the on-state unambiguous alongside the active fill.
function ChannelToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 transition ${
        active ? "bk-chip-active" : "bk-chip"
      }`}
    >
      {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

export default BookingPage;
