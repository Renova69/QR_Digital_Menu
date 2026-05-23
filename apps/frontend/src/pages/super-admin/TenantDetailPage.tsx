import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSuperAdminTenant,
  updateTenantTier,
  updateTenantStatus,
  deleteTenant,
  restoreTenant,
  deleteTenantStaff,
  importMenuForTenant,
  resetTenantOwnerPassword,
  updateTenantPayments,
} from "../../lib/api";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, Trash2, Upload, RotateCcw, Users, CreditCard, ShoppingBag, LayoutGrid, Table2, Crown, AlertTriangle, CheckCircle2 } from "lucide-react";

const TIERS = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

const TIER_STYLES: Record<string, string> = {
  ENTERPRISE: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  PROFESSIONAL: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  STARTER: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  FREE: "bg-slate-700/30 text-slate-400 border-slate-700/40",
};

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2.5">
        <Icon className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DialogShell({ children }: { children: React.ReactNode }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm" />
      <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-2xl w-[420px] max-w-[90vw]">
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function ConfirmationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-xs font-medium text-slate-400">
        Type <span className="font-bold text-slate-200">CONFIRM</span> to continue
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="CONFIRM"
        className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 transition-colors focus:border-slate-600 focus:outline-none"
      />
    </label>
  );
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; email: string } | null>(null);

  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paymentsDialogOpen, setPaymentsDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "tenant", id],
    queryFn: () => getSuperAdminTenant(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
    queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
  };

  const onMutationError = (err: unknown) => {
    const e = err as { response?: { data?: { message?: unknown } }; message?: string };
    const msg = e?.response?.data?.message ?? e?.message ?? "Request failed";
    setMutationError(typeof msg === "string" ? msg : JSON.stringify(msg));
  };

  const tierMutation = useMutation({
    mutationFn: (forceTier: string | null) => updateTenantTier(id!, forceTier),
    onSuccess: () => { invalidate(); setTierDialogOpen(false); setMutationError(null); },
    onError: onMutationError,
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => updateTenantStatus(id!, isActive),
    onSuccess: () => { invalidate(); setSuspendDialogOpen(false); setMutationError(null); },
    onError: onMutationError,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTenant(id!),
    onSuccess: () => { invalidate(); setDeleteDialogOpen(false); setMutationError(null); },
    onError: onMutationError,
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreTenant(id!),
    onSuccess: () => { invalidate(); setRestoreDialogOpen(false); setMutationError(null); },
    onError: onMutationError,
  });

  const deleteStaffMutation = useMutation({
    mutationFn: (staffId: string) => deleteTenantStaff(id!, staffId),
    onSuccess: () => { invalidate(); setStaffToDelete(null); },
    onError: onMutationError,
  });

  const importMutation = useMutation({
    mutationFn: (dto: object) => importMenuForTenant(id!, dto),
    onSuccess: () => { invalidate(); setImportJson(""); setImportError(null); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: unknown } }; message?: string };
      const msg = e?.response?.data?.message ?? e?.message ?? "Import failed";
      setImportError(typeof msg === "string" ? msg : JSON.stringify(msg));
    },
  });

  const resetPwMutation = useMutation({
    mutationFn: (password: string) => resetTenantOwnerPassword(id!, password),
    onSuccess: () => {
      setResetPwDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      setMutationError(null);
    },
    onError: onMutationError,
  });

  const paymentsMutation = useMutation({
    mutationFn: (enabled: boolean) => updateTenantPayments(id!, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      setPaymentsDialogOpen(false);
    },
    onError: onMutationError,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportJson(ev.target?.result as string);
      setImportError(null);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    setImportError(null);
    let parsed: object;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError("Invalid JSON — check the format and try again.");
      return;
    }
    importMutation.mutate(parsed);
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="h-5 w-28 rounded-lg bg-slate-800 animate-pulse" />
        <div className="h-8 w-52 rounded-lg bg-slate-800 animate-pulse" />
        <div className="h-48 rounded-xl bg-slate-900 border border-slate-800 animate-pulse" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertTriangle className="w-10 h-10 text-slate-700" />
        <p className="text-slate-400 font-medium">Tenant not found</p>
        <button
          onClick={() => navigate("/super-admin/tenants")}
          className="mt-1 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Back to Tenants
        </button>
      </div>
    );
  }

  const effectiveTier = tenant.forceTier ?? tenant.tier;
  const isDeleted = !!tenant.deletedAt;
  const confirmed = confirmationText === "CONFIRM";

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/super-admin/tenants")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Tenants
      </button>

      {/* Mutation error */}
      {mutationError && (
        <div className="bg-red-500/10 border border-red-500/25 text-red-400 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-4">
          <span>{mutationError}</span>
          <button onClick={() => setMutationError(null)} className="shrink-0 text-xs text-red-400/70 hover:text-red-400 transition-colors underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Title */}
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-white tracking-tight">{tenant.name}</h2>
        {isDeleted && (
          <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-bold border bg-red-500/10 text-red-400 border-red-500/20">
            Deleted
          </span>
        )}
        {!isDeleted && (
          <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold border ${TIER_STYLES[effectiveTier] ?? ""}`}>
            {effectiveTier}
          </span>
        )}
      </div>

      {/* Info grid */}
      <SectionCard title="Restaurant Overview" icon={LayoutGrid}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-5">
          {[
            { label: "Owner", value: tenant.owner.email },
            { label: "Stripe Tier", value: tenant.tier },
            {
              label: "Effective Tier",
              value: effectiveTier,
              extra: tenant.forceTier ? <span className="ml-1.5 text-[10px] text-amber-400 font-semibold uppercase tracking-wide">overridden</span> : null,
            },
            {
              label: "Status",
              value: isDeleted ? "Deleted" : tenant.isActive ? "Active" : "Suspended",
              valueClass: isDeleted ? "text-red-400" : tenant.isActive ? "text-emerald-400" : "text-amber-400",
            },
            { label: "Total Orders", value: String(tenant.orderCount) },
            { label: "Payments Processed", value: String(tenant.paymentSummary.totalPayments) },
            { label: "Payment Volume", value: `€${tenant.paymentSummary.totalAmount.toFixed(2)}` },
            { label: "Menu Categories", value: String(tenant.menuCategoryCount) },
            { label: "Tables", value: String(tenant.tableCount) },
          ].map(({ label, value, extra, valueClass }) => (
            <div key={label}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-sm font-semibold text-slate-200 ${valueClass ?? ""}`}>
                {value}
                {extra}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Payments toggle */}
      <SectionCard title="Payments" icon={CreditCard}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-200">
              {tenant.paymentsEnabled ? "Payments enabled" : "Payments disabled"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Controls whether this restaurant can accept payments via Stripe.
            </p>
          </div>
          <Dialog.Root open={paymentsDialogOpen} onOpenChange={(open) => { setPaymentsDialogOpen(open); setConfirmationText(""); }}>
            <Dialog.Trigger asChild>
              <button
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  tenant.paymentsEnabled
                    ? "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                }`}
              >
                {tenant.paymentsEnabled ? "Disable Payments" : "Enable Payments"}
              </button>
            </Dialog.Trigger>
            <DialogShell>
              <Dialog.Title className="text-base font-bold text-white mb-1">
                {tenant.paymentsEnabled ? "Disable Payments?" : "Enable Payments?"}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-slate-400 mb-5">
                {tenant.paymentsEnabled
                  ? "This restaurant will no longer accept new payments. Ongoing sessions will still complete."
                  : "This restaurant will be able to accept payments via Stripe."}
              </Dialog.Description>
              <ConfirmationField value={confirmationText} onChange={setConfirmationText} />
              <div className="flex justify-end gap-2.5">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => paymentsMutation.mutate(!tenant.paymentsEnabled)}
                  disabled={paymentsMutation.isPending || !confirmed}
                  className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-colors ${
                    tenant.paymentsEnabled ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"
                  }`}
                >
                  {paymentsMutation.isPending ? "Processing…" : tenant.paymentsEnabled ? "Yes, Disable" : "Yes, Enable"}
                </button>
              </div>
            </DialogShell>
          </Dialog.Root>
        </div>
      </SectionCard>

      {/* Tier management */}
      {!isDeleted && (
        <SectionCard title="Tier Management" icon={Crown}>
          <div className="flex flex-wrap items-center gap-5">
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Stripe Tier</p>
              <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold border ${TIER_STYLES[tenant.tier] ?? ""}`}>
                {tenant.tier}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Force Override</p>
              {tenant.forceTier ? (
                <span className="inline-flex px-2.5 py-1 rounded-md text-xs font-bold border bg-amber-500/10 text-amber-400 border-amber-500/20">
                  {tenant.forceTier}
                </span>
              ) : (
                <span className="text-sm text-slate-600">None</span>
              )}
            </div>

            <Dialog.Root open={tierDialogOpen} onOpenChange={(open) => { setTierDialogOpen(open); setConfirmationText(""); }}>
              <Dialog.Trigger asChild>
                <button className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-semibold hover:bg-emerald-500/20 transition-colors">
                  {tenant.forceTier ? "Change Override" : "Override Tier"}
                </button>
              </Dialog.Trigger>
              <DialogShell>
                <Dialog.Title className="text-base font-bold text-white mb-1">Override Tier</Dialog.Title>
                <Dialog.Description className="text-sm text-slate-400 mb-4">
                  Bypasses the Stripe-driven tier. The restaurant gets features of the selected tier regardless of subscription.
                </Dialog.Description>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm mb-4 focus:outline-none focus:border-slate-600"
                >
                  <option value="">Select tier…</option>
                  {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <ConfirmationField value={confirmationText} onChange={setConfirmationText} />
                <div className="flex justify-end gap-2.5">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={() => selectedTier && tierMutation.mutate(selectedTier)}
                    disabled={!selectedTier || tierMutation.isPending || !confirmed}
                    className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-emerald-600 transition-colors"
                  >
                    {tierMutation.isPending ? "Applying…" : "Apply Override"}
                  </button>
                </div>
                {tenant.forceTier && (
                  <button
                    onClick={() => tierMutation.mutate(null)}
                    disabled={tierMutation.isPending || !confirmed}
                    className="mt-3 w-full px-4 py-2 rounded-lg text-sm border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-colors"
                  >
                    Clear Override (restore Stripe-driven tier)
                  </button>
                )}
              </DialogShell>
            </Dialog.Root>
          </div>
        </SectionCard>
      )}

      {/* Staff members */}
      {tenant.staffMembers.length > 0 && (
        <SectionCard title={`Staff Members (${tenant.staffMembers.length})`} icon={Users}>
          <div className="space-y-1">
            {tenant.staffMembers.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-800/60 group transition-colors">
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {s.email.endsWith(".local") ? s.name ?? s.email : s.email}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.role}</p>
                </div>
                <button
                  onClick={() => setStaffToDelete({ id: s.id, email: s.email })}
                  className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Menu import */}
      {!isDeleted && (
        <SectionCard title="Import Menu" icon={Upload}>
          <p className="text-xs text-slate-500 mb-4">
            Paste JSON or upload a file. Existing categories/items are upserted by name.
          </p>
          <div className="space-y-3">
            <textarea
              value={importJson}
              onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
              placeholder='{"categories": [{"name": "Starters", "items": [...]}]}'
              rows={5}
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm font-mono resize-y focus:outline-none focus:border-slate-600 placeholder-slate-600 transition-colors"
            />
            {importError && <p className="text-sm text-red-400">{importError}</p>}
            {importMutation.isSuccess && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                Import complete — {(importMutation.data as { created?: number })?.created ?? 0} created, {(importMutation.data as { updated?: number })?.updated ?? 0} updated.
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Load from file
              </button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileUpload} />
              <button
                onClick={handleImport}
                disabled={!importJson.trim() || importMutation.isPending}
                className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-semibold hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {importMutation.isPending ? "Importing…" : "Import Menu"}
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Danger zone */}
      <div className="bg-slate-900 border border-red-500/15 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-red-500/15 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
        </div>
        <div className="p-5 space-y-5">
          {isDeleted ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">
                Deleted on {new Date(tenant.deletedAt!).toLocaleDateString()}. Restoring will set it back to active.
              </p>
              <Dialog.Root open={restoreDialogOpen} onOpenChange={(open) => { setRestoreDialogOpen(open); setConfirmationText(""); }}>
                <Dialog.Trigger asChild>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-sm font-semibold transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore Restaurant
                  </button>
                </Dialog.Trigger>
                <DialogShell>
                  <Dialog.Title className="text-base font-bold text-white mb-1">Restore Restaurant?</Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-400 mb-5">
                    <strong className="text-slate-200">{tenant.name}</strong> will be restored and set to active. Owners and staff will regain access.
                  </Dialog.Description>
                  <ConfirmationField value={confirmationText} onChange={setConfirmationText} />
                  <div className="flex justify-end gap-2.5">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => restoreMutation.mutate()}
                      disabled={restoreMutation.isPending || !confirmed}
                      className="px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-emerald-600 transition-colors"
                    >
                      {restoreMutation.isPending ? "Restoring…" : "Yes, Restore"}
                    </button>
                  </div>
                </DialogShell>
              </Dialog.Root>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {/* Suspend / Reactivate */}
              <Dialog.Root open={suspendDialogOpen} onOpenChange={(open) => { setSuspendDialogOpen(open); setConfirmationText(""); }}>
                <Dialog.Trigger asChild>
                  <button className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    tenant.isActive
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                  }`}>
                    {tenant.isActive ? "Suspend Restaurant" : "Reactivate Restaurant"}
                  </button>
                </Dialog.Trigger>
                <DialogShell>
                  <Dialog.Title className="text-base font-bold text-white mb-1">
                    {tenant.isActive ? "Suspend Restaurant?" : "Reactivate Restaurant?"}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-400 mb-5">
                    {tenant.isActive
                      ? "All menu access, ordering, and dashboard will be frozen. Reversible."
                      : "The restaurant will regain full access."}
                  </Dialog.Description>
                  <ConfirmationField value={confirmationText} onChange={setConfirmationText} />
                  <div className="flex justify-end gap-2.5">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => statusMutation.mutate(!tenant.isActive)}
                      disabled={statusMutation.isPending || !confirmed}
                      className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-colors ${tenant.isActive ? "bg-amber-500 hover:bg-amber-600" : "bg-emerald-500 hover:bg-emerald-600"}`}
                    >
                      {statusMutation.isPending ? "Processing…" : tenant.isActive ? "Yes, Suspend" : "Yes, Reactivate"}
                    </button>
                  </div>
                </DialogShell>
              </Dialog.Root>

              {/* Delete */}
              <Dialog.Root open={deleteDialogOpen} onOpenChange={(open) => { setDeleteDialogOpen(open); setConfirmationText(""); }}>
                <Dialog.Trigger asChild>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-sm font-semibold transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Restaurant
                  </button>
                </Dialog.Trigger>
                <DialogShell>
                  <Dialog.Title className="text-base font-bold text-white mb-1">Delete Restaurant?</Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-400 mb-5">
                    <strong className="text-slate-200">{tenant.name}</strong> will be soft-deleted — all data is preserved and can be restored. Owner and staff will immediately lose access.
                  </Dialog.Description>
                  <ConfirmationField value={confirmationText} onChange={setConfirmationText} />
                  <div className="flex justify-end gap-2.5">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending || !confirmed}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600 transition-colors"
                    >
                      {deleteMutation.isPending ? "Deleting…" : "Yes, Delete"}
                    </button>
                  </div>
                </DialogShell>
              </Dialog.Root>
            </div>
          )}

          {/* Reset password */}
          {!isDeleted && (
            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 mb-3">
                Reset password for <span className="text-slate-300 font-medium">{tenant.owner.email}</span>. The owner will be logged out immediately.
              </p>
              <Dialog.Root open={resetPwDialogOpen} onOpenChange={(open) => { setResetPwDialogOpen(open); setConfirmationText(""); }}>
                <Dialog.Trigger asChild>
                  <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                    Reset Owner Password
                  </button>
                </Dialog.Trigger>
                <DialogShell>
                  <Dialog.Title className="text-base font-bold text-white mb-1">Reset Owner Password</Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-400 mb-4">
                    New password for <strong className="text-slate-200">{tenant.owner.email}</strong>. The owner will be logged out and must sign in with this password.
                  </Dialog.Description>
                  <div className="space-y-3 mb-4">
                    <input
                      type="password"
                      placeholder="New password (min 8 characters)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-slate-600 placeholder-slate-600 transition-colors"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:outline-none focus:border-slate-600 placeholder-slate-600 transition-colors"
                    />
                  </div>
                  {newPassword && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword) && (
                    <p className="text-xs text-red-400 mb-3">Min 8 chars with uppercase, lowercase, and a number</p>
                  )}
                  {newPassword && /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword) && confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-red-400 mb-3">Passwords do not match</p>
                  )}
                  <ConfirmationField value={confirmationText} onChange={setConfirmationText} />
                  <div className="flex justify-end gap-2.5">
                    <Dialog.Close asChild>
                      <button
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
                        onClick={() => { setNewPassword(""); setConfirmPassword(""); }}
                      >
                        Cancel
                      </button>
                    </Dialog.Close>
                    <button
                      onClick={() => resetPwMutation.mutate(newPassword)}
                      disabled={
                        resetPwMutation.isPending ||
                        !newPassword ||
                        !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword) ||
                        newPassword !== confirmPassword ||
                        !confirmed
                      }
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-600 transition-colors"
                    >
                      {resetPwMutation.isPending ? "Resetting…" : "Reset Password"}
                    </button>
                  </div>
                </DialogShell>
              </Dialog.Root>
            </div>
          )}
        </div>
      </div>

      {/* Staff delete dialog */}
      <Dialog.Root open={!!staffToDelete} onOpenChange={(open) => !open && setStaffToDelete(null)}>
        <DialogShell>
          <Dialog.Title className="text-base font-bold text-white mb-1">Delete Staff Member?</Dialog.Title>
          <Dialog.Description className="text-sm text-slate-400 mb-5">
            <strong className="text-slate-200">{staffToDelete?.email}</strong> will be permanently deleted. This cannot be undone.
          </Dialog.Description>
          <div className="flex justify-end gap-2.5">
            <button
              onClick={() => setStaffToDelete(null)}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => staffToDelete && deleteStaffMutation.mutate(staffToDelete.id)}
              disabled={deleteStaffMutation.isPending}
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600 transition-colors"
            >
              {deleteStaffMutation.isPending ? "Deleting…" : "Yes, Delete"}
            </button>
          </div>
        </DialogShell>
      </Dialog.Root>
    </div>
  );
}
