import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAdminLegalSettings, updateAdminLegalSettings } from "../../lib/api";
import * as Switch from "@radix-ui/react-switch";
import { ShieldCheck, ToggleLeft, Clock, FileText, User, CheckCircle2, AlertCircle } from "lucide-react";

type LocaleKey = "en" | "bg" | "ro";
const LOCALES: { key: LocaleKey; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "bg", label: "BG" },
  { key: "ro", label: "RO" },
];

function SectionCard({ title, icon: Icon, children, faded }: { title: string; icon: React.ElementType; children: React.ReactNode; faded?: boolean }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden transition-opacity ${faded ? "opacity-50 pointer-events-none" : ""}`}>
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
  const [activeLocale, setActiveLocale] = useState<LocaleKey>("en");
  const current = value ?? {};

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</label>
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
        onChange={(e) => onChange({ ...current, [activeLocale]: e.target.value })}
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
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-slate-800/60 last:border-0 gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200 truncate">{label}</p>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
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

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: updateAdminLegalSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "platform-settings"] });
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

  const gdprOn = !!(merged.gdprEnabled);
  const hasChanges = Object.keys(form).length > 0;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <div className="h-7 w-40 rounded-lg bg-slate-800 animate-pulse mb-2" />
          <div className="h-4 w-72 rounded bg-slate-800/60 animate-pulse" />
        </div>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-36 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {/* Page header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Legal & GDPR</h2>
        <p className="text-slate-500 text-sm mt-1">
          Control GDPR features and manage all legal copy — no redeployment needed.
        </p>
      </div>

      {/* Master switch */}
      <div className="bg-slate-900 border border-emerald-500/15 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Master Switch</h3>
          {gdprOn && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Active
            </span>
          )}
        </div>
        <div className="px-5 pt-1 pb-1">
          <ToggleRow
            label="GDPR Enabled"
            description="Master kill-switch. Disabling this hides all GDPR features from users."
            checked={!!merged.gdprEnabled}
            onChange={(v) => set("gdprEnabled", v)}
          />
        </div>
      </div>

      {/* Feature toggles */}
      <SectionCard title="Feature Toggles" icon={ToggleLeft} faded={!gdprOn}>
        <ToggleRow
          label="Cookie Banner"
          description="Shows the cookie consent notice to visitors."
          checked={!!merged.cookieBannerEnabled}
          onChange={(v) => set("cookieBannerEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Privacy Policy page (/privacy)"
          checked={!!merged.privacyPolicyEnabled}
          onChange={(v) => set("privacyPolicyEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Terms of Service page (/terms)"
          checked={!!merged.termsEnabled}
          onChange={(v) => set("termsEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Cookie Policy page (/cookies)"
          checked={!!merged.cookiePolicyEnabled}
          onChange={(v) => set("cookiePolicyEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Account Deletion endpoint (Art. 17)"
          description="Lets users permanently delete their account and data."
          checked={!!merged.erasureEndpointEnabled}
          onChange={(v) => set("erasureEndpointEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Data Export endpoint (Art. 20)"
          description="Lets users download all their personal data as JSON."
          checked={!!merged.dataExportEndpointEnabled}
          onChange={(v) => set("dataExportEndpointEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Automated Retention Cleanup"
          description="Daily cron that anonymises expired PII based on retention windows below."
          checked={!!merged.retentionCronEnabled}
          onChange={(v) => set("retentionCronEnabled", v)}
          disabled={!gdprOn}
        />
      </SectionCard>

      {/* Retention windows */}
      <SectionCard title="Retention Windows" icon={Clock}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Order PII retention (years, 0–50)
            </label>
            <input
              type="number"
              min={0}
              max={50}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 transition-colors"
              value={(merged.orderPiiRetentionYears as number) ?? 7}
              onChange={(e) => set("orderPiiRetentionYears", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Verification token TTL (days, 1–365)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 focus:outline-none focus:border-slate-600 transition-colors"
              value={(merged.verificationTokenTtlDays as number) ?? 7}
              onChange={(e) => set("verificationTokenTtlDays", Number(e.target.value))}
            />
          </div>
        </div>
      </SectionCard>

      {/* Localised content */}
      <SectionCard title="Localised Content" icon={FileText} faded={!gdprOn}>
        <p className="text-xs text-slate-500 mb-5">
          Plain text or Markdown. Public pages render Markdown. Tabs switch between EN / BG / RO locales.
        </p>
        <div className="space-y-6">
          <LocaleTextEditor
            label="Cookie Banner Text"
            value={merged.cookieBannerText as Record<string, string>}
            onChange={(v) => set("cookieBannerText", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label="Privacy Policy Content"
            value={merged.privacyPolicyContent as Record<string, string>}
            onChange={(v) => set("privacyPolicyContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label="Terms of Service Content"
            value={merged.termsContent as Record<string, string>}
            onChange={(v) => set("termsContent", v)}
            disabled={!gdprOn}
          />
          <LocaleTextEditor
            label="Cookie Policy Content"
            value={merged.cookiePolicyContent as Record<string, string>}
            onChange={(v) => set("cookiePolicyContent", v)}
            disabled={!gdprOn}
          />
        </div>
      </SectionCard>

      {/* Data controller */}
      <SectionCard title="Data Controller" icon={User}>
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
          <span className="text-xs text-slate-600">No unsaved changes</span>
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
