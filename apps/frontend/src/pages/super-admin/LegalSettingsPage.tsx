import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAdminLegalSettings, updateAdminLegalSettings } from "../../lib/api";
import * as Switch from "@radix-ui/react-switch";

type LocaleKey = "en" | "bg" | "ro";
const LOCALES: { key: LocaleKey; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "bg", label: "BG" },
  { key: "ro", label: "RO" },
];

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
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <div className="flex gap-1 mb-1">
        {LOCALES.map((l) => (
          <button
            key={l.key}
            type="button"
            onClick={() => setActiveLocale(l.key)}
            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
              activeLocale === l.key
                ? "bg-accent text-white"
                : "bg-white/10 text-gray-400 hover:text-white"
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <textarea
        disabled={disabled}
        rows={6}
        className="w-full rounded-lg bg-white/5 border border-white/10 text-gray-100 text-sm p-3 resize-y focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-40"
        placeholder={`${label} (${activeLocale.toUpperCase()})`}
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
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="w-10 h-6 rounded-full transition-colors data-[state=checked]:bg-accent data-[state=unchecked]:bg-white/20 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <Switch.Thumb className="block w-4 h-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-1" />
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

  const merged = { ...(data ?? {}), ...form } as Record<string, any>;

  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const mutation = useMutation({
    mutationFn: updateAdminLegalSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["public-legal-settings"] });
      setForm({});
      setSuccessMsg("Legal settings saved.");
      setErrorMsg(null);
      setTimeout(() => setSuccessMsg(null), 4000);
    },
    onError: () => {
      setErrorMsg("Failed to save settings.");
      setSuccessMsg(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const gdprOn = merged.gdprEnabled ?? false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-white">Legal & GDPR</h2>
        <div className="h-96 rounded-xl bg-white/5 animate-pulse" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-white">Legal & GDPR</h2>
        <p className="text-sm text-gray-400 mt-1">
          Control which GDPR features are active and manage all legal copy from here —
          no redeployment needed.
        </p>
      </div>

      {/* Master toggle */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-1">
        <h3 className="text-base font-semibold text-white mb-3">Master Switch</h3>
        <ToggleRow
          label="GDPR Enabled"
          description="Master kill-switch. Turning this off hides all GDPR features from users."
          checked={!!merged.gdprEnabled}
          onChange={(v) => set("gdprEnabled", v)}
        />
      </div>

      {/* Feature toggles */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6">
        <h3 className="text-base font-semibold text-white mb-3">Feature Toggles</h3>
        <ToggleRow
          label="Cookie Banner"
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
          checked={!!merged.erasureEndpointEnabled}
          onChange={(v) => set("erasureEndpointEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Data Export endpoint (Art. 20)"
          checked={!!merged.dataExportEndpointEnabled}
          onChange={(v) => set("dataExportEndpointEnabled", v)}
          disabled={!gdprOn}
        />
        <ToggleRow
          label="Automated Retention Cleanup (daily cron)"
          checked={!!merged.retentionCronEnabled}
          onChange={(v) => set("retentionCronEnabled", v)}
          disabled={!gdprOn}
        />
      </div>

      {/* Retention windows */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4">
        <h3 className="text-base font-semibold text-white">Retention Windows</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-300">
              Order PII retention (years, 0–50)
            </label>
            <input
              type="number"
              min={0}
              max={50}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 text-gray-100 text-sm p-2 focus:outline-none focus:ring-1 focus:ring-accent"
              value={merged.orderPiiRetentionYears ?? 7}
              onChange={(e) => set("orderPiiRetentionYears", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="text-sm text-gray-300">
              Verification token TTL (days, 1–365)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 text-gray-100 text-sm p-2 focus:outline-none focus:ring-1 focus:ring-accent"
              value={merged.verificationTokenTtlDays ?? 7}
              onChange={(e) => set("verificationTokenTtlDays", Number(e.target.value))}
            />
          </div>
        </div>
      </div>

      {/* Localised content */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-6">
        <h3 className="text-base font-semibold text-white">Localised Content</h3>
        <p className="text-xs text-gray-500 -mt-4">
          Paste plain text or Markdown. Users see rendered Markdown on the public pages.
        </p>
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

      {/* Data controller */}
      <div className="rounded-xl bg-white/5 border border-white/10 p-6 space-y-4">
        <h3 className="text-base font-semibold text-white">Data Controller</h3>
        {(
          [
            ["dataControllerName", "Controller Name", "text"],
            ["dataControllerEmail", "Controller Email", "email"],
            ["dataControllerAddress", "Controller Address / Postal", "text"],
          ] as const
        ).map(([key, label, type]) => (
          <div key={key}>
            <label className="text-sm text-gray-300">{label}</label>
            <input
              type={type}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 text-gray-100 text-sm p-2 focus:outline-none focus:ring-1 focus:ring-accent"
              value={(merged[key] as string) ?? ""}
              onChange={(e) => set(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={mutation.isPending || Object.keys(form).length === 0}
          className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {mutation.isPending ? "Saving…" : "Save Legal Settings"}
        </button>
        {successMsg && (
          <span className="text-sm text-green-400">{successMsg}</span>
        )}
        {errorMsg && (
          <span className="text-sm text-red-400">{errorMsg}</span>
        )}
      </div>
    </form>
  );
}
