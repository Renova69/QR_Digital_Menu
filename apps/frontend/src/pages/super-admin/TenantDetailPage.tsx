import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSuperAdminTenant, updateTenantTier, updateTenantStatus, resetTenantOwnerPassword, updateTenantPayments } from "../../lib/api";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft } from "lucide-react";

const TIERS = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [resetPwDialogOpen, setResetPwDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paymentsDialogOpen, setPaymentsDialogOpen] = useState(false);

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: ["super-admin", "tenant", id],
    queryFn: () => getSuperAdminTenant(id!),
    enabled: !!id,
  });

  const tierMutation = useMutation({
    mutationFn: (forceTier: string | null) => updateTenantTier(id!, forceTier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      setTierDialogOpen(false);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (isActive: boolean) => updateTenantStatus(id!, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenant", id] });
      queryClient.invalidateQueries({ queryKey: ["super-admin", "tenants"] });
      setSuspendDialogOpen(false);
    },
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
        <button
          onClick={() => navigate("/super-admin/tenants")}
          className="mt-4 text-accent text-sm hover:underline"
        >
          Back to Tenants
        </button>
      </div>
    );
  }

  const effectiveTier = tenant.forceTier ?? tenant.tier;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate("/super-admin/tenants")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Tenants
      </button>

      <h2 className="text-2xl font-bold">{tenant.name}</h2>

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
            {tenant.forceTier && (
              <span className="ml-1 text-xs text-amber-500">(overridden)</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Stripe</p>
          <p className={`text-sm font-medium ${tenant.stripeOnboarded ? 'text-green-500' : 'text-muted-foreground'}`}>
            {tenant.stripeOnboarded ? 'Connected' : 'Not Connected'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <p className={`text-sm font-medium ${tenant.isActive ? 'text-green-500' : 'text-red-500'}`}>
            {tenant.isActive ? 'Active' : 'Suspended'}
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

      {/* Tier Management */}
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
                  This overrides the Stripe-driven tier. The restaurant will get features of the selected tier regardless of their Stripe subscription.
                </Dialog.Description>
                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm mb-4"
                >
                  <option value="">Select tier...</option>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div className="flex justify-end gap-3">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 rounded-lg text-sm border border-border">
                      Cancel
                    </button>
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

      {/* Danger Zone */}
      <div className="glass-panel rounded-xl p-6 border border-red-500/20">
        <h3 className="text-lg font-semibold text-red-500 mb-4">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {tenant.isActive
            ? "Suspending will freeze all access — public menu, ordering, and dashboard will be disabled."
            : "This restaurant is currently suspended. Reactivate to restore access."}
        </p>

        <Dialog.Root open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
          <Dialog.Trigger asChild>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                tenant.isActive
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
              }`}
            >
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
                  ? 'All menu access, ordering, and dashboard will be frozen. This action is reversible.'
                  : 'The restaurant will regain full access. Owners and staff will be able to log in again.'}
              </Dialog.Description>
              <div className="flex justify-end gap-3">
                <Dialog.Close asChild>
                  <button className="px-4 py-2 rounded-lg text-sm border border-border">
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  onClick={() => statusMutation.mutate(!tenant.isActive)}
                  disabled={statusMutation.isPending}
                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50 ${
                    tenant.isActive ? 'bg-red-500' : 'bg-green-500'
                  }`}
                >
                  {statusMutation.isPending
                    ? 'Processing...'
                    : tenant.isActive
                      ? 'Yes, Suspend'
                      : 'Yes, Reactivate'}
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

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
      </div>
    </div>
  );
}
