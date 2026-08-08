import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAdminLegalSettings, updateAdminLegalSettings } from "../../lib/api";
import * as Switch from "@radix-ui/react-switch";
import {
  ShieldCheck,
  ToggleLeft,
  Clock,
  FileText,
  User,
  CheckCircle2,
  AlertCircle,
  Megaphone,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type LocaleKey = "en" | "bg" | "ro";
const LOCALES: { key: LocaleKey; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "bg", label: "BG" },
  { key: "ro", label: "RO" },
];

function SectionCard({
  title,
  icon: Icon,
  children,
  faded,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  faded?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-opacity ${faded ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function LocaleTextEditor({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Record<string, string> | null | undefined;
  onChange: (val: Record<string, string>) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [activeLocale, setActiveLocale] = useState<LocaleKey>("en");
  const current = value ?? {};

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex gap-1">
        {LOCALES.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setActiveLocale(l.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              activeLocale === l.key
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                : "bg-slate-800 text-slate-500 border border-transparent hover:text-slate-300"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <textarea
        disabled={disabled}
        rows={6}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm p-3 resize-y focus:outline-none focus:border-slate-600 disabled:opacity-40 placeholder-slate-600 font-mono transition-colors"
        placeholder={`${label} — ${activeLocale.toUpperCase()} locale`}
        value={current[activeLocale] ?? ""}
        onChange={(e) =>
          onChange({ ...current, [activeLocale]: e.target.value })
        }
      />
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-800/60 last:border-0 gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0 w-11 h-6 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-700 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
      >
        <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-1" />
      </Switch.Root>
    </div>
  );
}

export default function LegalSettingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["super-admin", "platform-settings"],
    queryFn: getAdminLegalSettings,
    staleTime: 30_000,
  });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const merged = { ...(data ?? {}), ...form } as Record<string, unknown>;

  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: updateAdminLegalSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["super-admin", "platform-settings"],
      });
      queryClient.invalidateQueries({ queryKey: ["public-legal-settings"] });
      setForm({});
      setSuccessMsg("Settings saved successfully.");
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: () => {
      setErrorMsg("Failed to save settings. Please try again.");
      setSuccessMsg(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const gdprOn = !!merged.gdprEnabled;
  const hasChanges = Object.keys(form).length > 0;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <div className="h-7 w-40 rounded-lg bg-slate-800 animate-pulse mb-2" />
          <div className="h-4 w-72 rounded bg-slate-800/60 animate-pulse" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-slate-900 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">
          {t("auto.legalGDPR", "Legal & GDPR")}
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          {t(
            "auto.controlGDPRFeaturesAndManageAllLeg",
            "Control GDPR features and manage all legal copy — no redeployment needed.",
          )}
        </p>
      </div>

      {/* Master switch */}
      <div className="bg-slate-900 border border-emerald-500/15 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            {t("auto.masterSwitch", "Master Switch")}
          </h3>
          {gdprOn && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {t("auto.active", "Active")}
            </span>
          )}
        </div>
        <div className="px-5 pb-3">
          <p className="text-[11px] text-slate-600">
            {t("auto.policyVersion", "Policy version")}:{" "}
            {(merged.policyVersion as number) ?? 1}
          </p>
        </div>
        <div className="px-5 pt-1 pb-1">
          <ToggleRow
            label={t("auto.gDPREnabled", "GDPR Enabled")}
            description={t(
              "auto.masterKillSwitchDisablingThisHides",
              "Master kill-switch. Disabling this hides all GDPR features from users.",
            )}
            checked={!!merged.gdprEnabled}
            onChange={(v) => set("gdprEnabled", v)}
          />
        </div>
      </div>

      {/* Feature toggles */}
      <SectionCard
        title={t("auto.featureToggles", "Feature Toggles")}
        icon={ToggleLeft}
        faded={!gdprOn}
      >
        <ToggleRow
          label={t("auto.cookieBanner", "Cookie Banner")}
          description={t(
            "auto.showsTheCookieConsentNoticeToVisit",
            "Shows the cookie consent notice to visitors.",
          )}
          checked={!!merged.cookieBannerEnabled}
          onChange={(v) => set("cookieBannerEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t("auto.platformAnalyticsCookie", "Platform Analytics Cookie")}
          description={t(
            "auto.platformAnalyticsCookieDesc",
            "Offers the Analytics category in the cookie banner. Enable only once an actual cookie-based analytics tool is wired in.",
          )}
          checked={!!merged.analyticsCookieEnabled}
          onChange={(v) => set("analyticsCookieEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t(
            "auto.privacyPolicyPagePrivacy",
            "Privacy Policy page (/privacy)",
          )}
          checked={!!merged.privacyPolicyEnabled}
          onChange={(v) => set("privacyPolicyEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t(
            "auto.termsOfServicePageTerms",
            "Terms of Service page (/terms)",
          )}
          checked={!!merged.termsEnabled}
          onChange={(v) => set("termsEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Data Processing Agreement (/dpa)"
          checked={!!merged.dpaEnabled}
          onChange={(v) => set("dpaEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Refund Policy (/refund-policy)"
          checked={!!merged.refundPolicyEnabled}
          onChange={(v) => set("refundPolicyEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Master Service Agreement (/msa)"
          checked={!!merged.msaEnabled}
          onChange={(v) => set("msaEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t(
            "auto.cookiePolicyPageCookies",
            "Cookie Policy page (/cookies)",
          )}
          checked={!!merged.cookiePolicyEnabled}
          onChange={(v) => set("cookiePolicyEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t(
            "auto.accountDeletionEndpointArt17",
            "Account Deletion endpoint (Art. 17)",
          )}
          description={t(
            "auto.letsUsersPermanentlyDeleteTheirAcco",
            "Lets users permanently delete their account and data.",
          )}
          checked={!!merged.erasureEndpointEnabled}
          onChange={(v) => set("erasureEndpointEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t(
            "auto.dataExportEndpointArt20",
            "Data Export endpoint (Art. 20)",
          )}
          description={t(
            "auto.letsUsersDownloadAllTheirPersonalD",
            "Lets users download all their personal data as JSON.",
          )}
          checked={!!merged.dataExportEndpointEnabled}
          onChange={(v) => set("dataExportEndpointEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label={t(
            "auto.automatedRetentionCleanup",
            "Automated Retention Cleanup",
          )}
          description={t(
            "auto.dailyCronThatAnonymisesExpiredPIIB",
            "Daily cron that anonymises expired PII based on retention windows below.",
          )}
          checked={!!merged.retentionCronEnabled}
          onChange={(v) => set("retentionCronEnabled", v)}
          disabled={!gdprOn}
        />
      </SectionCard>

      {/* Retention windows */}
      <SectionCard
        title={t("auto.retentionWindows", "Retention Windows")}
        icon={Clock}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              {t(
                "auto.orderPIIRetentionYears050",
                "Order PII retention (years, 0–50)",
              )}
            </label>
            <input
              type="number"
              min={0}
              max={50}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 transition-colors"
              value={(merged.orderPiiRetentionYears as number) ?? 7}
              onChange={(e) =>
                set("orderPiiRetentionYears", Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              {t(
                "auto.verificationTokenTTLDays1365",
                "Verification token TTL (days, 1–365)",
              )}
            </label>
            <input
              type="number"
              min={1}
              max={365}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 transition-colors"
              value={(merged.verificationTokenTtlDays as number) ?? 7}
              onChange={(e) =>
                set("verificationTokenTtlDays", Number(e.target.value))
              }
            />
          </div>
        </div>
      </SectionCard>

      {/* Localised content */}
      <SectionCard
        title={t("auto.localisedContent", "Localised Content")}
        icon={FileText}
        faded={!gdprOn}
      >
        <p className="text-xs text-slate-500 mb-5">
          {t(
            "auto.plainTextOrMarkdownPublicPagesRen",
            "Plain text or Markdown. Public pages render Markdown. Tabs switch between EN / BG / RO locales.",
          )}
        </p>
        <div className="space-y-6">
          <LocaleTextEditor
            label={t("auto.cookieBannerText", "Cookie Banner Text")}
            value={merged.cookieBannerText as Record<string, string>}
            onChange={(v) => set("cookieBannerText", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label={t("auto.privacyPolicyContent", "Privacy Policy Content")}
            value={merged.privacyPolicyContent as Record<string, string>}
            onChange={(v) => set("privacyPolicyContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label={t("auto.termsOfServiceContent", "Terms of Service Content")}
            value={merged.termsContent as Record<string, string>}
            onChange={(v) => set("termsContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label="Data Processing Agreement (DPA) Content [EDIT BEFORE LIVE]"
            value={merged.dpaContent as Record<string, string>}
            onChange={(v) => set("dpaContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label="Refund Policy Content [EDIT BEFORE LIVE]"
            value={merged.refundPolicyContent as Record<string, string>}
            onChange={(v) => set("refundPolicyContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label="Master Service Agreement (MSA) Content [EDIT BEFORE LIVE]"
            value={merged.msaContent as Record<string, string>}
            onChange={(v) => set("msaContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label={t("auto.cookiePolicyContent", "Cookie Policy Content")}
            value={merged.cookiePolicyContent as Record<string, string>}
            onChange={(v) => set("cookiePolicyContent", v)}
            disabled={!gdprOn}
          />
        </div>
      </SectionCard>

      {/* Data controller */}
      <SectionCard
        title={t("auto.dataController", "Data Controller")}
        icon={User}
      >
        <div className="space-y-4">
          {(
            [
              ["dataControllerName", "Controller Name", "text"],
              ["dataControllerEmail", "Controller Email", "email"],
              ["dataControllerAddress", "Controller Address / Postal", "text"],
            ] as const
          ).map(([key, label, type]) => (
            <div key={key}>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                {label}
              </label>
              <input
                type={type}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 placeholder-slate-600 transition-colors"
                value={(merged[key] as string) ?? ""}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Announcement Banner */}
      <SectionCard title="Announcement Banner" icon={Megaphone}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-300">
                Enable Banner
              </p>
              <p className="text-xs text-slate-500">
                Shows at the top of the dashboard for all users.
              </p>
            </div>
            <Switch.Root
              checked={!!merged.announcementBannerEnabled}
              onCheckedChange={(v) => set("announcementBannerEnabled", v)}
              className="relative inline-flex h-6 w-11 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-700"
            >
              <Switch.Thumb className="block h-4 w-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5" />
            </Switch.Root>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Message
            </label>
            <input
              type="text"
              maxLength={500}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 placeholder-slate-600 transition-colors"
              placeholder="e.g. Scheduled maintenance tonight at 23:00 UTC"
              value={(merged.announcementBannerText as string) ?? ""}
              onChange={(e) => set("announcementBannerText", e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Type
            </label>
            <select
              className="rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 transition-colors"
              value={(merged.announcementBannerType as string) ?? "info"}
              onChange={(e) => set("announcementBannerType", e.target.value)}
            >
              <option value="info">Info (blue)</option>
              <option value="warning">Warning (amber)</option>
              <option value="maintenance">Maintenance (dark)</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Save bar */}
      <div className="sticky bottom-4 bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl px-5 py-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={mutation.isPending || !hasChanges}
          className="px-5 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? "Saving…" : "Save Settings"}
        </button>

        {!hasChanges && !successMsg && !errorMsg && (
          <span className="text-xs text-slate-600">
            {t("auto.noUnsavedChanges", "No unsaved changes")}
          </span>
        )}

        {successMsg && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            {successMsg}
          </span>
        )}
        {errorMsg && (
          <span className="flex items-center gap-1.5 text-sm text-red-400 font-medium">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
          </span>
        )}
      </div>
    </form>
  );
}
