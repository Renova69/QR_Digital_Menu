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
import { ArrowLeft, Trash2, Upload, RotateCcw, Users } from "lucide-react";

const TIERS = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

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

  // Menu import state
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paymentsDialogOpen, setPaymentsDialogOpen] = useState(false);

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

  const onMutationError = (err: any) => {
    const msg = err?.response?.data?.message ?? err?.message ?? 'Request failed';
    setMutationError(typeof msg === 'string' ? msg : JSON.stringify(msg));
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
  });

  const importMutation = useMutation({
    mutationFn: (dto: object) => importMenuForTenant(id!, dto),
    onSuccess: () => { invalidate(); setImportJson(""); setImportError(null); },
  });

  const resetPwMutation = useMutation({
    mutationFn: (password: string) => resetTenantOwnerPassword(id!, password),
    onSuccess: () => {
      setResetPwDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    },
  });

  const paymentsMutation = useMutation({
    mutationFn: (enabled: boolean) => updateTenantPayments(id!, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      setPaymentsDialogOpen(false);
    },
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
      <div className="space-y-4">
        <div className="h-8 w-32 rounded bg-muted animate-pulse" />
        <div className="h-48 rounded-xl glass-panel animate-pulse" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Tenant not found.</p>
        <button onClick={() => navigate("/super-admin/tenants")} className="mt-4 text-accent text-sm hover:underline">
          Back to Tenants
        </button>
      </div>
    );
  }

  const effectiveTier = tenant.forceTier ?? tenant.tier;
  const isDeleted = !!tenant.deletedAt;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/super-admin/tenants")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Tenants
      </button>

      {mutationError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-4">
          <span>{mutationError}</span>
          <button onClick={() => setMutationError(null)} className="shrink-0 text-xs underline">Dismiss</button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">{tenant.name}</h2>
        {isDeleted && (
          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
            Deleted
          </span>
        )}
      </div>

      {/* Info card */}
      <div className="glass-panel rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Owner</p>
          <p className="text-sm font-medium">{tenant.owner.email}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stripe Tier</p>
          <p className="text-sm font-medium">{tenant.tier}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Effective Tier</p>
          <p className="text-sm font-medium">
            {effectiveTier}
            {tenant.forceTier && <span className="ml-1 text-xs text-amber-500">(overridden)</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className={`text-sm font-medium ${isDeleted ? 'text-red-500' : tenant.isActive ? 'text-green-500' : 'text-amber-500'}`}>
            {isDeleted ? 'Deleted' : tenant.isActive ? 'Active' : 'Suspended'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Total Orders</p>
          <p className="text-sm font-medium">{tenant.orderCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payments Processed</p>
          <p className="text-sm font-medium">{tenant.paymentSummary.totalPayments}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payment Volume</p>
          <p className="text-sm font-medium">&euro;{tenant.paymentSummary.totalAmount.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Menu Categories</p>
          <p className="text-sm font-medium">{tenant.menuCategoryCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Tables</p>
          <p className="text-sm font-medium">{tenant.tableCount}</p>
        </div>
      </div>

      {/* Payments Toggle */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Payments</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">
              {tenant.paymentsEnabled ? "Payments Enabled" : "Payments Disabled"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Controls whether this restaurant can accept payments via Stripe.
            </p>
          </div>
          <Dialog.Root open={paymentsDialogOpen} onOpenChange={setPaymentsDialogOpen}>
            <Dialog.Trigger asChild>
              <button
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  tenant.paymentsEnabled
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "bg-green-500/10 text-green-500 hover:bg-green-500/20"
                }`}
              >
                {tenant.paymentsEnabled ? "Disable Payments" : "Enable Payments"}
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/50" />
              <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                <Dialog.Title className="text-lg font-semibold mb-2">
                  {tenant.paymentsEnabled ? "Disable Payments?" : "Enable Payments?"}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground mb-4">
                  {tenant.paymentsEnabled
                    ? "This restaurant will no longer be able to accept new payments. Ongoing sessions will still complete."
                    : "This restaurant will be able to accept payments via Stripe."}
                </Dialog.Description>
                <div className="flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 rounded-lg text-sm border border-border">Cancel</button>
                  </Dialog.Close>
                  <button
                    onClick={() => paymentsMutation.mutate(!tenant.paymentsEnabled)}
                    disabled={paymentsMutation.isPending}
                    className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                      tenant.paymentsEnabled ? "bg-red-500" : "bg-green-500"
                    }`}
                  >
                    {paymentsMutation.isPending ? "Processing..." : tenant.paymentsEnabled ? "Yes, Disable" : "Yes, Enable"}
                  </button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

      {/* Tier Management — only for non-deleted */}
      {!isDeleted && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Tier Management</h3>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Current Stripe Tier</p>
              <span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-accent/10 text-accent">
                {tenant.tier}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Force Override</p>
              {tenant.forceTier ? (
                <span className="inline-flex px-2 py-0.5 rounded text-sm font-medium bg-amber-500/10 text-amber-500">
                  {tenant.forceTier}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">None</span>
              )}
            </div>

            <Dialog.Root open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
              <Dialog.Trigger asChild>
                <button className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium">
                  {tenant.forceTier ? 'Change Override' : 'Override Tier'}
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                  <Dialog.Title className="text-lg font-semibold mb-2">Override Tier</Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-4">
                    Overrides the Stripe-driven tier. Restaurant gets features of the selected tier regardless of subscription.
                  </Dialog.Description>
                  <select
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-4"
                  >
                    <option value="">Select tier...</option>
                    {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="flex justify-end gap-3">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm border border-border">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => selectedTier && tierMutation.mutate(selectedTier)}
                      disabled={!selectedTier || tierMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
                    >
                      {tierMutation.isPending ? 'Applying...' : 'Apply'}
                    </button>
                  </div>
                  {tenant.forceTier && (
                    <button
                      onClick={() => tierMutation.mutate(null)}
                      disabled={tierMutation.isPending}
                      className="mt-3 w-full px-4 py-2 rounded-lg text-sm border border-border text-muted-foreground hover:text-foreground"
                    >
                      Clear Override (restore Stripe-driven tier)
                    </button>
                  )}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      )}

      {/* Staff Members */}
      {tenant.staffMembers.length > 0 && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Staff Members ({tenant.staffMembers.length})
          </h3>
          <div className="space-y-2">
            {tenant.staffMembers.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">
                    {s.email.endsWith('.local') ? s.name ?? s.email : s.email}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.role}</p>
                </div>
                <button
                  onClick={() => setStaffToDelete({ id: s.id, email: s.email })}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Menu Import — only for non-deleted */}
      {!isDeleted && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Menu
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Paste JSON or upload a file. Existing categories/items are upserted by name.
          </p>

          <div className="space-y-3">
            <textarea
              value={importJson}
              onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
              placeholder='{"categories": [{"name": "Starters", "items": [...]}]}'
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono resize-y"
            />

            {importError && (
              <p className="text-sm text-red-500">{importError}</p>
            )}

            {importMutation.isSuccess && (
              <p className="text-sm text-green-500">
                Import complete — {(importMutation.data as any)?.created ?? 0} created, {(importMutation.data as any)?.updated ?? 0} updated.
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent/5"
              >
                Load from file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                onClick={handleImport}
                disabled={!importJson.trim() || importMutation.isPending}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing...' : 'Import Menu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className="glass-panel rounded-xl p-6 border border-red-500/20">
        <h3 className="text-lg font-semibold text-red-500 mb-4">Danger Zone</h3>

        {isDeleted ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This restaurant was deleted on {new Date(tenant.deletedAt!).toLocaleDateString()}.
              Restoring will set it back to active.
            </p>
            <Dialog.Root open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
              <Dialog.Trigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 text-sm font-medium">
                  <RotateCcw className="w-4 h-4" />
                  Restore Restaurant
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                  <Dialog.Title className="text-lg font-semibold mb-2">Restore Restaurant?</Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-4">
                    {tenant.name} will be restored and set to active. Owners and staff will regain access.
                  </Dialog.Description>
                  <div className="flex justify-end gap-3">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm border border-border">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => restoreMutation.mutate()}
                      disabled={restoreMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-green-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {restoreMutation.isPending ? 'Restoring...' : 'Yes, Restore'}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {/* Suspend / Reactivate */}
            <Dialog.Root open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
              <Dialog.Trigger asChild>
                <button className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  tenant.isActive
                    ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
                    : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                }`}>
                  {tenant.isActive ? 'Suspend Restaurant' : 'Reactivate Restaurant'}
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                  <Dialog.Title className="text-lg font-semibold mb-2">
                    {tenant.isActive ? 'Suspend Restaurant?' : 'Reactivate Restaurant?'}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-4">
                    {tenant.isActive
                      ? 'All menu access, ordering, and dashboard will be frozen. Reversible.'
                      : 'The restaurant will regain full access.'}
                  </Dialog.Description>
                  <div className="flex justify-end gap-3">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm border border-border">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => statusMutation.mutate(!tenant.isActive)}
                      disabled={statusMutation.isPending}
                      className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                        tenant.isActive ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                    >
                      {statusMutation.isPending ? 'Processing...' : tenant.isActive ? 'Yes, Suspend' : 'Yes, Reactivate'}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>

            {/* Delete */}
            <Dialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <Dialog.Trigger asChild>
                <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-medium">
                  <Trash2 className="w-4 h-4" />
                  Delete Restaurant
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                  <Dialog.Title className="text-lg font-semibold mb-2">Delete Restaurant?</Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-4">
                    <strong>{tenant.name}</strong> will be soft-deleted — all data is preserved and can be restored.
                    Owner and staff will immediately lose access.
                  </Dialog.Description>
                  <div className="flex justify-end gap-3">
                    <Dialog.Close asChild>
                      <button className="px-4 py-2 rounded-lg text-sm border border-border">Cancel</button>
                    </Dialog.Close>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      disabled={deleteMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        )}

        {!isDeleted && (
          <div className="mt-6 pt-6 border-t border-border">
            <h4 className="text-sm font-medium text-red-500 mb-2">Reset Owner Password</h4>
            <p className="text-xs text-muted-foreground mb-4">
              Owner: {tenant.owner.email}. Changing the password will log the owner out immediately.
            </p>

            <Dialog.Root open={resetPwDialogOpen} onOpenChange={setResetPwDialogOpen}>
              <Dialog.Trigger asChild>
                <button className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20">
                  Reset Owner Password
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
                  <Dialog.Title className="text-lg font-semibold mb-2">Reset Owner Password</Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-4">
                    Enter a new password for <strong>{tenant.owner.email}</strong>. The owner will be logged out and must use this new password to sign in.
                  </Dialog.Description>

                  <input
                    type="password"
                    placeholder="New password (min 8 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-3"
                  />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-4"
                  />

                  {newPassword && confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-red-500 mb-3">Passwords do not match</p>
                  )}
                  {newPassword && newPassword.length < 8 && (
                    <p className="text-xs text-red-500 mb-3">Password must be at least 8 characters</p>
                  )}

                  <div className="flex justify-end gap-3">
                    <Dialog.Close asChild>
                      <button
                        className="px-4 py-2 rounded-lg text-sm border border-border"
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
                        newPassword.length < 8 ||
                        newPassword !== confirmPassword
                      }
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {resetPwMutation.isPending ? "Resetting..." : "Yes, Reset Password"}
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        )}
      </div>

      {/* Staff delete confirmation dialog */}
      <Dialog.Root open={!!staffToDelete} onOpenChange={(open) => !open && setStaffToDelete(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background rounded-xl p-6 shadow-xl w-[400px] max-w-[90vw]">
            <Dialog.Title className="text-lg font-semibold mb-2">Delete Staff Member?</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground mb-4">
              <strong>{staffToDelete?.email}</strong> will be permanently deleted. This cannot be undone.
            </Dialog.Description>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setStaffToDelete(null)}
                className="px-4 py-2 rounded-lg text-sm border border-border"
              >
                Cancel
              </button>
              <button
                onClick={() => staffToDelete && deleteStaffMutation.mutate(staffToDelete.id)}
                disabled={deleteStaffMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50"
              >
                {deleteStaffMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
