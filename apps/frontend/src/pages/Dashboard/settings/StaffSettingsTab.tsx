import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  Filter,
  KeyRound,
  Lock,
  Mail,
  MoreVertical,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import StaffCreatedModal from '../../../components/staff/StaffCreatedModal';
import {
  createDeviceEnrollment,
  createStaff,
  listDeviceEnrollments,
  listStaff,
  removeStaff,
  resetStaffPin,
  updateStaff,
  type StaffMember,
} from '../../../lib/api';
import { useFeature, useTier } from '../../../hooks/useFeature';

const inputCls =
  'w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all';

type DeviceEnrollment = {
  id: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  createdBy: { id: string; name: string | null; email: string };
};

interface Restaurant {
  id: string;
  name: string;
}

interface StaffSettingsTabProps {
  activeRestaurant: Restaurant;
}

const roleBadgeClasses: Record<string, string> = {
  OWNER: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  MANAGER: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  WAITER: 'bg-green-500/10 text-green-600 dark:text-green-400',
  KITCHEN: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
};

const rolePermissions: Record<string, string[]> = {
  MANAGER: ['Settings access', 'Staff devices', 'Menu operations'],
  WAITER: ['Table POS', 'Order entry', 'Payment notifications'],
  KITCHEN: ['Kitchen display', 'Ticket progress', 'Order alerts'],
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const displayEmail = (email: string) => (email?.endsWith('.local') ? '-' : email);

const StaffSettingsTab: React.FC<StaffSettingsTabProps> = ({ activeRestaurant }) => {
  const { t } = useTranslation();
  const canRbac = useFeature('rbac');
  const canPos = useFeature('pos');
  const canKds = useFeature('kds');
  const { staffLimit } = useTier();

  const allowedRoles = useMemo(
    () => [
      ...(canRbac ? [{ value: 'MANAGER', label: t('staff.roleManager', 'Manager') }] : []),
      ...(canPos ? [{ value: 'WAITER', label: t('staff.roleWaiter', 'Waiter') }] : []),
      ...(canKds ? [{ value: 'KITCHEN', label: t('staff.roleKitchen', 'Kitchen') }] : []),
    ],
    [canKds, canPos, canRbac, t],
  );

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(() => allowedRoles[0]?.value ?? 'MANAGER');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const [sharedDeviceConfig, setSharedDeviceConfig] = useState<{
    restaurantId: string;
    restaurantName?: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem('sharedDevice');
      return raw ? JSON.parse(raw) : null;
    } catch {
      localStorage.removeItem('sharedDevice');
      return null;
    }
  });
  const [sharedDeviceMessage, setSharedDeviceMessage] = useState('');

  const [deviceEnrollmentUrl, setDeviceEnrollmentUrl] = useState('');
  const [deviceEnrollmentExpiresAt, setDeviceEnrollmentExpiresAt] = useState('');
  const [deviceEnrollmentLoading, setDeviceEnrollmentLoading] = useState(false);
  const [deviceEnrollmentError, setDeviceEnrollmentError] = useState('');
  const [deviceEnrollmentCopied, setDeviceEnrollmentCopied] = useState(false);
  const [deviceEnrollments, setDeviceEnrollments] = useState<DeviceEnrollment[]>([]);
  const [deviceEnrollmentsLoading, setDeviceEnrollmentsLoading] = useState(false);

  const [staffCreatedModal, setStaffCreatedModal] = useState<{
    open: boolean;
    staffName: string;
    rawPin: string;
    enrollmentUrl: string;
    expiresAt: string;
    enrollmentError: string;
  }>({ open: false, staffName: '', rawPin: '', enrollmentUrl: '', expiresAt: '', enrollmentError: '' });

  const sharedDeviceEnabled =
    !!activeRestaurant && sharedDeviceConfig?.restaurantId === activeRestaurant.id;

  const staffOnlyMembers = useMemo(
    () => staffMembers.filter((member) => member.role !== 'OWNER'),
    [staffMembers],
  );
  const activeCount = staffOnlyMembers.filter((member) => member.isActive !== false).length;
  const inactiveCount = staffOnlyMembers.length - activeCount;
  const limitReached =
    staffLimit !== Infinity && staffOnlyMembers.length >= staffLimit;
  const filteredStaff = staffOnlyMembers.filter((member) => {
    if (roleFilter === 'ALL') return true;
    if (roleFilter === 'ACTIVE') return member.isActive !== false;
    if (roleFilter === 'INACTIVE') return member.isActive === false;
    return member.role === roleFilter;
  });

  useEffect(() => {
    if (!allowedRoles.some((role) => role.value === inviteRole)) {
      setInviteRole(allowedRoles[0]?.value ?? 'MANAGER');
    }
  }, [allowedRoles, inviteRole]);

  useEffect(() => {
    if (!activeRestaurant) return;
    fetchStaff();
    if (canPos) fetchDeviceEnrollments();
  }, [activeRestaurant, canPos]);

  useEffect(() => {
    if (!openActionId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-kebab]')) {
        setOpenActionId(null);
        setConfirmRemoveId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openActionId]);

  const fetchStaff = async () => {
    if (!activeRestaurant) return;
    setStaffLoading(true);
    setStaffError('');
    try {
      const data = await listStaff(activeRestaurant.id);
      setStaffMembers(data);
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t('staff.failedLoad'));
    } finally {
      setStaffLoading(false);
    }
  };

  const fetchDeviceEnrollments = async () => {
    if (!activeRestaurant) return;
    setDeviceEnrollmentsLoading(true);
    try {
      const data = await listDeviceEnrollments(activeRestaurant.id);
      setDeviceEnrollments(data);
    } catch {
      setDeviceEnrollments([]);
    } finally {
      setDeviceEnrollmentsLoading(false);
    }
  };

  const handleInviteStaff = async () => {
    if (!activeRestaurant || !inviteName.trim() || allowedRoles.length === 0) return;
    setStaffError('');
    try {
      const result = await createStaff(activeRestaurant.id, {
        name: inviteName.trim(),
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      });

      let enrollmentUrl = '';
      let expiresAt = '';
      let enrollmentError = '';
      try {
        const enrollment = await createDeviceEnrollment(activeRestaurant.id);
        enrollmentUrl = enrollment.enrollmentUrl;
        expiresAt = enrollment.expiresAt;
      } catch (err: any) {
        enrollmentError = err.response?.data?.message || err.message || t('staff.failedGenerateQr');
      }

      setStaffCreatedModal({
        open: true,
        staffName: result.user.name || inviteName.trim(),
        rawPin: result.rawPin,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });

      setInviteOpen(false);
      setInviteName('');
      setInviteEmail('');
      setInviteRole(allowedRoles[0]?.value ?? 'MANAGER');
      await Promise.all([fetchStaff(), fetchDeviceEnrollments()]);
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t('staff.failedCreate'));
    }
  };

  const handleRoleChange = async (member: StaffMember, nextRole: string) => {
    if (!activeRestaurant || member.role === nextRole) return;
    setBusyStaffId(member.id);
    setStaffError('');
    try {
      const updated = await updateStaff(activeRestaurant.id, member.id, { role: nextRole });
      setStaffMembers((prev) =>
        prev.map((item) => (item.id === member.id ? { ...item, ...updated } : item)),
      );
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t('staff.failedUpdate'));
      await fetchStaff();
    } finally {
      setBusyStaffId(null);
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    const nextActive = member.isActive === false;
    setBusyStaffId(member.id);
    setStaffError('');
    try {
      const updated = await updateStaff(activeRestaurant.id, member.id, { isActive: nextActive });
      setStaffMembers((prev) =>
        prev.map((item) => (item.id === member.id ? { ...item, ...updated } : item)),
      );
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t('staff.failedRemove'));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
    }
  };

  const handleResetPin = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    setBusyStaffId(member.id);
    setStaffError('');
    try {
      const result = await resetStaffPin(activeRestaurant.id, member.id);
      let enrollmentUrl = '';
      let expiresAt = '';
      let enrollmentError = '';
      try {
        const enrollment = await createDeviceEnrollment(activeRestaurant.id);
        enrollmentUrl = enrollment.enrollmentUrl;
        expiresAt = enrollment.expiresAt;
      } catch (err: any) {
        enrollmentError = err.response?.data?.message || err.message || t('staff.failedGenerateQr');
      }
      setStaffCreatedModal({
        open: true,
        staffName: result.user.name || member.name || 'Staff',
        rawPin: result.rawPin,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });
      await Promise.all([fetchStaff(), fetchDeviceEnrollments()]);
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t('staff.failedResetPin'));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
    }
  };

  const handleRemoveStaff = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    setBusyStaffId(member.id);
    setStaffError('');
    try {
      await removeStaff(activeRestaurant.id, member.id);
      setStaffMembers((prev) => prev.filter((item) => item.id !== member.id));
    } catch (err: any) {
      setStaffError(err.response?.data?.message || t('staff.failedRemove'));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
      setConfirmRemoveId(null);
    }
  };

  const handleRebondStaff = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    setBusyStaffId(member.id);
    setDeviceEnrollmentError('');
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setStaffCreatedModal({
        open: true,
        staffName: member.name || 'Staff',
        rawPin: '',
        enrollmentUrl: result.enrollmentUrl,
        expiresAt: result.expiresAt,
        enrollmentError: '',
      });
      await fetchDeviceEnrollments();
    } catch (err: any) {
      setDeviceEnrollmentError(err.response?.data?.message || t('staff.failedRebond'));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
    }
  };

  const handleGenerateDeviceEnrollment = async () => {
    if (!activeRestaurant) return;
    setDeviceEnrollmentLoading(true);
    setDeviceEnrollmentError('');
    setDeviceEnrollmentUrl('');
    setDeviceEnrollmentExpiresAt('');
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setDeviceEnrollmentUrl(result.enrollmentUrl);
      setDeviceEnrollmentExpiresAt(result.expiresAt);
      setDeviceEnrollmentCopied(false);
      await fetchDeviceEnrollments();
    } catch (err: any) {
      setDeviceEnrollmentError(err.response?.data?.message || t('staff.failedGenerateQr'));
    } finally {
      setDeviceEnrollmentLoading(false);
    }
  };

  const handleSharedDeviceToggle = () => {
    if (sharedDeviceEnabled) {
      localStorage.removeItem('sharedDevice');
      setSharedDeviceConfig(null);
      setSharedDeviceMessage('');
      setDeviceEnrollmentUrl('');
      setDeviceEnrollmentExpiresAt('');
      return;
    }

    if (!activeRestaurant) return;
    const config = {
      restaurantId: activeRestaurant.id,
      restaurantName: activeRestaurant.name,
    };
    localStorage.setItem('sharedDevice', JSON.stringify(config));
    setSharedDeviceConfig(config);
    setSharedDeviceMessage(t('staff.sharedDeviceBonded', { name: activeRestaurant.name }));
  };

  const copyEnrollmentLink = async () => {
    if (!deviceEnrollmentUrl) return;
    await navigator.clipboard.writeText(deviceEnrollmentUrl);
    setDeviceEnrollmentCopied(true);
    setTimeout(() => setDeviceEnrollmentCopied(false), 2000);
  };

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">{t('staff.staffMembers')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('staff.staffMembersDesc')}</p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setInviteOpen(true)}
            disabled={limitReached || allowedRoles.length === 0}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t('staff.createStaffAccount')}
          </Button>
        </div>

        {staffError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {staffError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Staff</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{staffOnlyMembers.length}</p>
            <p className="text-xs text-muted-foreground">
              {staffLimit === Infinity ? 'Unlimited seats' : `${staffOnlyMembers.length}/${staffLimit} seats`}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Active</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{activeCount}</p>
            <p className="text-xs text-muted-foreground">{inactiveCount} inactive</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">Shared device</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {sharedDeviceEnabled ? 'Enabled here' : 'Not bonded'}
            </p>
            <p className="text-xs text-muted-foreground">PIN login support</p>
          </div>
          {canPos && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">Device links</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{deviceEnrollments.length}</p>
              <p className="text-xs text-muted-foreground">Recent enrollment sessions</p>
            </div>
          )}
        </div>

        {limitReached && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-foreground">Staff limit reached</p>
              <p className="text-muted-foreground">Upgrade to add more team members without replacing seats.</p>
            </div>
            <a href="/pricing" className="text-xs font-bold uppercase text-primary hover:underline">
              {t('tierLocked.upgrade', 'Upgrade')}
            </a>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-border bg-background">
            <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Team console</p>
                <p className="text-xs text-muted-foreground">Inline roles, status, PIN reset, and device actions.</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Filter className="h-4 w-4" />
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium normal-case text-foreground"
                >
                  <option value="ALL">All staff</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  {allowedRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {staffLoading ? (
              <div className="p-6 text-sm text-muted-foreground">{t('staff.loading')}</div>
            ) : staffOnlyMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('staff.noStaffYet')}</p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Create the first staff account to unlock POS, KDS, and shared device workflows.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  disabled={allowedRoles.length === 0}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t('staff.createStaffAccount')}
                </Button>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No staff match this filter.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">{t('staff.nameColumn')}</th>
                      <th className="px-4 py-3 text-left font-semibold">{t('staff.emailColumn')}</th>
                      <th className="px-4 py-3 text-left font-semibold">{t('staff.roleColumn')}</th>
                      <th className="px-4 py-3 text-left font-semibold">Status</th>
                      <th className="px-4 py-3 text-left font-semibold">Last update</th>
                      <th className="w-14 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((member) => {
                      const isInactive = member.isActive === false;
                      const isBusy = busyStaffId === member.id;
                      const roleOptions = allowedRoles.some((role) => role.value === member.role)
                        ? allowedRoles
                        : [
                            ...allowedRoles,
                            { value: member.role, label: member.role },
                          ].filter((role) => role.value !== 'OWNER');
                      return (
                        <tr key={member.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{member.name || 'Unnamed staff'}</p>
                            <p className="text-xs text-muted-foreground">Created {formatDateTime(member.createdAt)}</p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{displayEmail(member.email)}</td>
                          <td className="px-4 py-3">
                            <select
                              value={member.role}
                              disabled={isBusy}
                              onChange={(event) => handleRoleChange(member, event.target.value)}
                              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground disabled:opacity-60"
                            >
                              {roleOptions.map((role) => (
                                <option key={role.value} value={role.value}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                isInactive
                                  ? 'bg-muted text-muted-foreground'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {isInactive ? 'Inactive' : 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{formatDateTime(member.updatedAt)}</td>
                          <td className="relative px-4 py-3 text-right">
                            <button
                              type="button"
                              data-kebab
                              onClick={() => {
                                setOpenActionId(openActionId === member.id ? null : member.id);
                                setConfirmRemoveId(null);
                              }}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="Open staff actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openActionId === member.id && (
                              <div data-kebab className="absolute right-4 top-11 z-20 w-52 rounded-lg border border-border bg-background p-1 text-left shadow-xl">
                                <button
                                  type="button"
                                  onClick={() => handleResetPin(member)}
                                  disabled={isBusy}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  <KeyRound className="h-4 w-4" />
                                  Reset PIN
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRebondStaff(member)}
                                  disabled={isBusy}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  <QrCode className="h-4 w-4" />
                                  Re-bond device
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(member)}
                                  disabled={isBusy}
                                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                >
                                  {isInactive ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                                  {isInactive ? 'Reactivate' : 'Deactivate'}
                                </button>
                                {confirmRemoveId === member.id ? (
                                  <div className="flex items-center gap-1 px-3 py-2">
                                    <span className="flex-1 text-xs font-semibold text-destructive">Remove?</span>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStaff(member)}
                                      disabled={isBusy}
                                      className="rounded-md px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmRemoveId(null)}
                                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRemoveId(member.id)}
                                    disabled={isBusy}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                  >
                                    <UserX className="h-4 w-4" />
                                    Remove permanently
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('staff.sharedDeviceMode')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('staff.sharedDeviceOffWarning')}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={handleSharedDeviceToggle}>
                  <Smartphone className="mr-2 h-4 w-4" />
                  {sharedDeviceEnabled ? 'Disable' : 'Enable'}
                </Button>
              </div>
              {(sharedDeviceMessage || sharedDeviceEnabled) && (
                <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  {sharedDeviceMessage || t('staff.sharedDeviceBonded', { name: activeRestaurant?.name })}
                </p>
              )}
            </section>

            {canPos && <section className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('staff.bondDevice')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t('staff.bondDeviceDesc')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateDeviceEnrollment}
                  disabled={deviceEnrollmentLoading || !activeRestaurant}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {deviceEnrollmentLoading ? t('staff.generating') : 'New'}
                </Button>
              </div>

              {deviceEnrollmentError && (
                <p className="mt-3 text-sm text-destructive">{deviceEnrollmentError}</p>
              )}

              {deviceEnrollmentUrl && (
                <div className="mt-4 flex gap-3">
                  <div className="rounded-lg bg-white p-2">
                    <QRCodeSVG value={deviceEnrollmentUrl} size={112} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">{t('staff.scanQrInstruction')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('staff.expiresAt', {
                        time: new Date(deviceEnrollmentExpiresAt).toLocaleTimeString(),
                      })}
                    </p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copyEnrollmentLink}>
                      {deviceEnrollmentCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                      {deviceEnrollmentCopied ? t('staff.copied') : t('staff.copyLink')}
                    </Button>
                  </div>
                </div>
              )}
            </section>}

            {canPos && <section className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Device sessions</p>
              <div className="mt-3 space-y-2">
                {deviceEnrollmentsLoading ? (
                  <p className="text-sm text-muted-foreground">{t('staff.loading')}</p>
                ) : deviceEnrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent device enrollment links.</p>
                ) : (
                  deviceEnrollments.slice(0, 5).map((enrollment) => (
                    <div key={enrollment.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold text-foreground">
                          {enrollment.usedAt ? 'Used' : 'Pending'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(enrollment.usedAt || enrollment.createdAt)}
                        </p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        By {enrollment.createdBy.name || displayEmail(enrollment.createdBy.email)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </section>}

            <section className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">Role preview</p>
              <div className="mt-3 space-y-3">
                {allowedRoles.length === 0 ? (
                  <div className="flex gap-3 rounded-lg border border-dashed border-border p-3">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t('staff.noRolesAvailable', 'Staff roles locked')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('staff.noRolesDesc', 'Upgrade to unlock staff roles.')}
                      </p>
                    </div>
                  </div>
                ) : (
                  allowedRoles.map((role) => (
                    <div key={role.value} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            roleBadgeClasses[role.value] || 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {role.label}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {(rolePermissions[role.value] || []).map((permission) => (
                          <li key={permission}>{permission}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <Modal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={t('staff.inviteNewStaff')}
        description="Create a PIN based staff account. Email invite links are planned for v2."
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <input
              type="text"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              placeholder={t('staff.displayName')}
              className={inputCls}
              required
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={t('staff.emailOptional')}
              className={inputCls}
            />
            <select
              value={inviteRole}
              onChange={(event) => setInviteRole(event.target.value)}
              className={inputCls}
              disabled={allowedRoles.length === 0}
            >
              {allowedRoles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                The account is created now with a one-time PIN. Sending a direct email invitation can be added in v2.
              </p>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleInviteStaff}
            disabled={!inviteName.trim() || allowedRoles.length === 0 || limitReached}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t('staff.createStaffAccount')}
          </Button>
        </div>
      </Modal>

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
