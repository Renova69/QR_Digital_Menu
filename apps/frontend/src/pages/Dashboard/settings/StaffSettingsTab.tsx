import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QrCode, Trash2, Copy, Check, Lock } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { QRCodeSVG } from "qrcode.react";
import { listStaff, createStaff, removeStaff, createDeviceEnrollment } from "../../../lib/api";
import StaffCreatedModal from "../../../components/staff/StaffCreatedModal";
import { useFeature, useTier } from "../../../hooks/useFeature";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all";

interface StaffSettingsTabProps {
  activeRestaurant: any;
}

const StaffSettingsTab: React.FC<StaffSettingsTabProps> = ({ activeRestaurant }) => {
  const { t } = useTranslation();
  const canRbac = useFeature('rbac');
  const canPos = useFeature('pos');
  const canKds = useFeature('kds');
  const { staffLimit } = useTier();

  const allowedRoles = [
    ...(canRbac ? [{ value: 'MANAGER', label: t('staff.roleManager', 'Manager') }] : []),
    ...(canPos ? [{ value: 'WAITER', label: t('staff.roleWaiter', 'Waiter') }] : []),
    ...(canKds ? [{ value: 'KITCHEN', label: t('staff.roleKitchen', 'Kitchen') }] : []),
  ];

  // Staff management state
  const [staffMembers, setStaffMembers] = useState<Array<{ id: string; email: string; name: string | null; role: string }>>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(() => allowedRoles[0]?.value ?? "MANAGER");

  // Shared device state
  const [sharedDeviceConfig, setSharedDeviceConfig] = useState<{
    restaurantId: string;
    restaurantName?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem("sharedDevice");
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem("sharedDevice");
      return null;
    }
  });
  const [sharedDeviceMessage, setSharedDeviceMessage] = useState("");

  // Device enrollment state
  const [deviceEnrollmentUrl, setDeviceEnrollmentUrl] = useState("");
  const [deviceEnrollmentExpiresAt, setDeviceEnrollmentExpiresAt] = useState("");
  const [deviceEnrollmentLoading, setDeviceEnrollmentLoading] = useState(false);
  const [deviceEnrollmentError, setDeviceEnrollmentError] = useState("");
  const [deviceEnrollmentCopied, setDeviceEnrollmentCopied] = useState(false);

  // Staff created modal
  const [staffCreatedModal, setStaffCreatedModal] = useState<{
    open: boolean;
    staffName: string;
    rawPin: string;
    enrollmentUrl: string;
    expiresAt: string;
    enrollmentError: string;
  }>({ open: false, staffName: "", rawPin: "", enrollmentUrl: "", expiresAt: "", enrollmentError: "" });

  const sharedDeviceEnabled =
    !!activeRestaurant && sharedDeviceConfig?.restaurantId === activeRestaurant.id;

  useEffect(() => {
    if (activeRestaurant) {
      fetchStaff();
    }
  }, [activeRestaurant]);

  const fetchStaff = async () => {
    if (!activeRestaurant) return;
    setStaffLoading(true);
    setStaffError("");
    try {
      const data = await listStaff(activeRestaurant.id);
      setStaffMembers(data);
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t("staff.failedLoad"));
    } finally {
      setStaffLoading(false);
    }
  };

  const handleInviteStaff = async () => {
    if (!activeRestaurant || !inviteName.trim()) return;
    setStaffError("");
    try {
      const result = await createStaff(activeRestaurant.id, {
        name: inviteName.trim(),
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      });

      const staffName = result.user.name || inviteName.trim();
      const rawPin = result.rawPin;

      let enrollmentUrl = "";
      let expiresAt = "";
      let enrollmentError = "";
      try {
        const enrollment = await createDeviceEnrollment(activeRestaurant.id);
        enrollmentUrl = enrollment.enrollmentUrl;
        expiresAt = enrollment.expiresAt;
      } catch (err: any) {
        enrollmentError = err.response?.data?.message || err.message || t("staff.failedGenerateQr");
      }

      setStaffCreatedModal({
        open: true,
        staffName,
        rawPin,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });

      setInviteName("");
      setInviteEmail("");
      setInviteRole("WAITER");
      await fetchStaff();
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t("staff.failedCreate"));
    }
  };

  const handleRemoveStaff = async (userId: string) => {
    if (!activeRestaurant) return;
    if (!window.confirm(t("staff.removeConfirm"))) return;
    setStaffError("");
    try {
      await removeStaff(activeRestaurant.id, userId);
      setStaffMembers((prev) => prev.filter((s) => s.id !== userId));
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t("staff.failedRemove"));
    }
  };

  const handleRebondStaff = async (staffName: string) => {
    if (!activeRestaurant) return;
    setDeviceEnrollmentError("");
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setStaffCreatedModal({
        open: true,
        staffName,
        rawPin: "",
        enrollmentUrl: result.enrollmentUrl,
        expiresAt: result.expiresAt,
        enrollmentError: "",
      });
    } catch (err: any) {
      setDeviceEnrollmentError(
        err.response?.data?.message || t("staff.failedRebond"),
      );
    }
  };

  const handleGenerateDeviceEnrollment = async () => {
    if (!activeRestaurant) return;
    setDeviceEnrollmentLoading(true);
    setDeviceEnrollmentError("");
    setDeviceEnrollmentUrl("");
    setDeviceEnrollmentExpiresAt("");
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setDeviceEnrollmentUrl(result.enrollmentUrl);
      setDeviceEnrollmentExpiresAt(result.expiresAt);
      setDeviceEnrollmentCopied(false);
    } catch (err: any) {
      setDeviceEnrollmentError(
        err.response?.data?.message || t("staff.failedGenerateQr"),
      );
    } finally {
      setDeviceEnrollmentLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-medium text-foreground mb-1">{t("staff.staffMembers")}</h3>
          <p className="text-sm text-muted-foreground">{t("staff.staffMembersDesc")}</p>
        </div>

        {/* ── Shared Device Mode ── */}
        <div className="p-4 border border-border rounded-lg space-y-3">
          <p className="font-medium text-sm">{t("staff.sharedDeviceMode")}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (sharedDeviceEnabled) {
                localStorage.removeItem("sharedDevice");
                setSharedDeviceConfig(null);
                setSharedDeviceMessage("");
                setDeviceEnrollmentUrl("");
                setDeviceEnrollmentExpiresAt("");
              } else if (activeRestaurant) {
                const cfg = {
                  restaurantId: activeRestaurant.id,
                  restaurantName: activeRestaurant.name,
                };
                localStorage.setItem("sharedDevice", JSON.stringify(cfg));
                setSharedDeviceConfig(cfg);
                setSharedDeviceMessage(t("staff.sharedDeviceBonded", { name: activeRestaurant.name }));
              }
            }}
          >
            {sharedDeviceEnabled ? t("staff.disableSharedDevice") : t("staff.enableSharedDevice")}
          </Button>
          {!sharedDeviceEnabled && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              {t("staff.sharedDeviceOffWarning")}
            </p>
          )}
        </div>

        {/* Bond a Device (standalone) */}
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-medium text-sm text-foreground">{t("staff.bondDevice")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("staff.bondDeviceDesc")}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleGenerateDeviceEnrollment}
              disabled={deviceEnrollmentLoading || !activeRestaurant}
            >
              {deviceEnrollmentLoading ? t("staff.generating") : t("staff.generateDeviceQr")}
            </Button>
          </div>

          {deviceEnrollmentError && (
            <p className="mt-3 text-sm text-destructive">{deviceEnrollmentError}</p>
          )}

          {deviceEnrollmentUrl && (
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
              <div className="rounded-lg bg-white p-3 w-fit">
                <QRCodeSVG value={deviceEnrollmentUrl} size={160} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{t("staff.scanQrInstruction")}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("staff.expiresAt", { time: new Date(deviceEnrollmentExpiresAt).toLocaleTimeString() })}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(deviceEnrollmentUrl);
                      setDeviceEnrollmentCopied(true);
                      setTimeout(() => setDeviceEnrollmentCopied(false), 2000);
                    }}
                  >
                    {deviceEnrollmentCopied ? (
                      <Check className="w-3.5 h-3.5 mr-1" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 mr-1" />
                    )}
                    {deviceEnrollmentCopied ? t("staff.copied") : t("staff.copyLink")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {staffError && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">{staffError}</div>
        )}

        {/* Staff limit display */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('staff.staffCount', 'Staff members')}: <strong className="text-foreground">{staffMembers.filter(s => s.role !== 'OWNER').length}</strong> / {staffLimit === Infinity ? '∞' : staffLimit}</span>
          {staffMembers.filter(s => s.role !== 'OWNER').length >= staffLimit && staffLimit !== Infinity && (
            <a href="/pricing" className="text-accent text-xs font-medium hover:underline">{t('tierLocked.upgrade', 'Upgrade for more')}</a>
          )}
        </div>

        {/* Invite form */}
        <div className="p-4 border border-border rounded-lg space-y-3">
          <p className="font-medium text-sm">{t("staff.inviteNewStaff")}</p>
          {allowedRoles.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border border-dashed border-border">
              <Lock className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{t('staff.noRolesAvailable', 'Staff roles locked')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('staff.noRolesDesc', 'Upgrade to Professional to invite managers, or Enterprise for waiters and kitchen staff.')}</p>
                <a href="/pricing" className="text-xs text-accent font-medium hover:underline mt-1 inline-block">{t('tierLocked.upgrade', 'View plans')}</a>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder={t("staff.displayName")}
                  className={inputCls}
                  required
                />
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("staff.emailOptional")}
                  className={inputCls}
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className={inputCls}
                >
                  {allowedRoles.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleInviteStaff}
                disabled={staffMembers.filter(s => s.role !== 'OWNER').length >= staffLimit && staffLimit !== Infinity}
              >
                {t("staff.createStaffAccount")}
              </Button>
            </>
          )}
        </div>

        {/* Staff list */}
        <div className="border border-border rounded-lg overflow-hidden">
          {staffLoading ? (
            <div className="p-4 text-sm text-muted-foreground">{t("staff.loading")}</div>
          ) : staffMembers.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">{t("staff.noStaffYet")}</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("staff.nameColumn")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("staff.emailColumn")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("staff.roleColumn")}</th>
                  <th className="w-16 px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {staffMembers.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-2">{s.name || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{s.email?.endsWith(".local") ? "—" : s.email}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.role === 'OWNER' ? 'bg-amber-500/10 text-amber-500' :
                        s.role === 'MANAGER' ? 'bg-blue-500/10 text-blue-500' :
                        s.role === 'WAITER' ? 'bg-green-500/10 text-green-500' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {s.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {s.role !== 'OWNER' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRebondStaff(s.name || "Staff")}
                              className="text-muted-foreground hover:text-accent transition-colors"
                              title={t("staff.rebondTitle")}
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveStaff(s.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title={t("staff.removeTitle")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <StaffCreatedModal
        open={staffCreatedModal.open}
        onClose={() => setStaffCreatedModal((prev) => ({ ...prev, open: false }))}
        staffName={staffCreatedModal.staffName}
        rawPin={staffCreatedModal.rawPin}
        enrollmentUrl={staffCreatedModal.enrollmentUrl}
        expiresAt={staffCreatedModal.expiresAt}
        enrollmentError={staffCreatedModal.enrollmentError}
      />
    </>
  );
};

export default StaffSettingsTab;
