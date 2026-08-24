import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
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
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Modal } from "../../../components/ui/modal";
import StaffCreatedModal from "../../../components/staff/StaffCreatedModal";
import {
  createDeviceEnrollment,
  createStaff,
  listDeviceEnrollments,
  listPinSecurityAlerts,
  listStaff,
  removeStaff,
  resetStaffPin,
  revokeDeviceEnrollment,
  updateRestaurant,
  updateStaff,
  type StaffMember,
} from "../../../lib/api";
import { useRestaurantContext } from "../../../context/RestaurantContext";
import { useFeature, useTier } from "../../../hooks/useFeature";
import { useMinuteTicker } from "../../../hooks/useMinuteTicker";
import { getApiError } from "../../../lib/apiError";

const inputCls =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all";

type DeviceEnrollment = {
  id: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  deviceTrustExpiresAt: string | null;
  createdBy: { id: string; name: string | null; email: string };
  staffBindings?: Array<{
    firstSeenAt: string;
    lastSeenAt: string;
    user: { id: string; name: string | null; email: string; role: string };
  }>;
};

interface Restaurant {
  id: string;
  name: string;
  timezone?: string | null;
  sharedDeviceModeEnabled?: boolean;
}

interface StaffSettingsTabProps {
  activeRestaurant: Restaurant;
}

// Device/floor roles authenticate by PIN at a shared POS/KDS tablet. Dashboard
// roles (STAFF/MANAGER/OWNER) authenticate by email + password and are not PIN
// candidates. Mirror of backend apps/backend/src/users/staff-roles.ts.
const PIN_ROLES = ["WAITER", "KITCHEN"];
const isPinRole = (role: string): boolean => PIN_ROLES.includes(role);

const roleBadgeClasses: Record<string, string> = {
  OWNER: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  STAFF: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  MANAGER: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  WAITER: "bg-green-500/10 text-green-600 dark:text-green-400",
  KITCHEN: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400",
};

// i18n key + English fallback per permission, resolved with t() at render.
const rolePermissions: Record<string, { key: string; label: string }[]> = {
  STAFF: [
    { key: "staff.perm.orderManagement", label: "Order management" },
    { key: "staff.perm.callWaiterAlerts", label: "Call Waiter alerts" },
    { key: "staff.perm.tableStatus", label: "Table status" },
  ],
  MANAGER: [
    { key: "staff.perm.settingsAccess", label: "Settings access" },
    { key: "staff.perm.staffDevices", label: "Staff devices" },
    { key: "staff.perm.menuOperations", label: "Menu operations" },
  ],
  WAITER: [
    { key: "staff.perm.tablePos", label: "Table POS" },
    { key: "staff.perm.orderEntry", label: "Order entry" },
    { key: "staff.perm.paymentNotifications", label: "Payment notifications" },
  ],
  KITCHEN: [
    { key: "staff.perm.kitchenDisplay", label: "Kitchen display" },
    { key: "staff.perm.ticketProgress", label: "Ticket progress" },
    { key: "staff.perm.orderAlerts", label: "Order alerts" },
  ],
};

const formatDateTime = (value?: string | null, timeZone?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  };
  try {
    return date.toLocaleString([], options);
  } catch {
    const { timeZone: _timeZone, ...fallbackOptions } = options;
    return date.toLocaleString([], fallbackOptions);
  }
};

const displayEmail = (email: string) => {
  const domain = email?.split("@")[1] ?? "";
  return domain.endsWith(".local") ? "-" : email;
};

import { deviceTrustState, pinAlertSeverity } from "../credentialState";
import type { PinSecurityAlert } from "../../../lib/api";

type DeviceEnrollmentStatus = "pending" | "used" | "expired" | "revoked";

const getEnrollmentStatus = (
  enrollment: DeviceEnrollment,
  now: number,
): DeviceEnrollmentStatus => {
  if (enrollment.revokedAt) return "revoked";
  if (enrollment.usedAt) return "used";
  if (new Date(enrollment.expiresAt).getTime() <= now) return "expired";
  return "pending";
};

const enrollmentStatusClasses: Record<DeviceEnrollmentStatus, string> = {
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  used: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expired: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  revoked: "bg-destructive/10 text-destructive",
};

const StaffSettingsTab: React.FC<StaffSettingsTabProps> = ({
  activeRestaurant,
}) => {
  const { t } = useTranslation();
  const now = useMinuteTicker();
  const { fetchRestaurants } = useRestaurantContext();
  const canPos = useFeature("pos");
  const { staffLimit, allowedStaffRoles } = useTier();

  const allowedRoles = useMemo(
    () =>
      allowedStaffRoles.map((role) => ({
        value: role,
        label:
          role === "STAFF"
            ? t("staff.roleStaff", "Staff")
            : role === "MANAGER"
              ? t("staff.roleManager", "Manager")
              : role === "WAITER"
                ? t("staff.roleWaiter", "Waiter")
                : role === "KITCHEN"
                  ? t("staff.roleKitchen", "Kitchen")
                  : role,
      })),
    [allowedStaffRoles, t],
  );

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState(
    () => allowedRoles[0]?.value ?? "MANAGER",
  );
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [busyStaffId, setBusyStaffId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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
  const [sharedDeviceUpdating, setSharedDeviceUpdating] = useState(false);
  const [sharedDeviceOverride, setSharedDeviceOverride] = useState<
    boolean | null
  >(null);

  const [deviceEnrollmentUrl, setDeviceEnrollmentUrl] = useState("");
  const [deviceEnrollmentExpiresAt, setDeviceEnrollmentExpiresAt] =
    useState("");
  const [deviceEnrollmentLoading, setDeviceEnrollmentLoading] = useState(false);
  const [deviceEnrollmentError, setDeviceEnrollmentError] = useState("");
  const [deviceEnrollmentCopied, setDeviceEnrollmentCopied] = useState(false);
  const [deviceEnrollments, setDeviceEnrollments] = useState<
    DeviceEnrollment[]
  >([]);
  const [pinAlerts, setPinAlerts] = useState<PinSecurityAlert[]>([]);
  const [deviceEnrollmentsLoading, setDeviceEnrollmentsLoading] =
    useState(false);
  const [revokingEnrollmentId, setRevokingEnrollmentId] = useState<
    string | null
  >(null);

  const [staffCreatedModal, setStaffCreatedModal] = useState<{
    open: boolean;
    staffName: string;
    staffEmail: string;
    rawPin: string;
    tempPassword?: string;
    enrollmentUrl: string;
    expiresAt: string;
    enrollmentError: string;
  }>({
    open: false,
    staffName: "",
    staffEmail: "",
    rawPin: "",
    enrollmentUrl: "",
    expiresAt: "",
    enrollmentError: "",
  });

  useEffect(() => {
    setSharedDeviceOverride(null);
  }, [activeRestaurant?.id, activeRestaurant?.sharedDeviceModeEnabled]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "sharedDevice") return;
      try {
        setSharedDeviceConfig(
          event.newValue ? JSON.parse(event.newValue) : null,
        );
      } catch {
        localStorage.removeItem("sharedDevice");
        setSharedDeviceConfig(null);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const sharedDeviceEnabled =
    sharedDeviceOverride ?? activeRestaurant?.sharedDeviceModeEnabled === true;
  const thisDeviceBonded =
    !!activeRestaurant &&
    sharedDeviceConfig?.restaurantId === activeRestaurant.id;
  const sharedDeviceModeOffMessage = t(
    "staff.sharedDeviceModeOffEnrollment",
    "Shared Device Mode is off. Enable it before generating staff device QR links or staff PIN login.",
  );
  const inviteRequiresSharedDeviceMode = canPos && isPinRole(inviteRole);
  const inviteBlockedBySharedDeviceMode =
    inviteRequiresSharedDeviceMode && !sharedDeviceEnabled;

  const staffOnlyMembers = useMemo(
    () => staffMembers.filter((member) => member.role !== "OWNER"),
    [staffMembers],
  );
  const activeCount = staffOnlyMembers.filter(
    (member) => member.isActive !== false,
  ).length;
  const inactiveCount = staffOnlyMembers.length - activeCount;
  const limitReached =
    staffLimit !== Infinity && staffOnlyMembers.length >= staffLimit;
  const filteredStaff = staffOnlyMembers.filter((member) => {
    if (roleFilter === "ALL") return true;
    if (roleFilter === "ACTIVE") return member.isActive !== false;
    if (roleFilter === "INACTIVE") return member.isActive === false;
    return member.role === roleFilter;
  });

  useEffect(() => {
    if (!allowedRoles.some((role) => role.value === inviteRole)) {
      setInviteRole(allowedRoles[0]?.value ?? "MANAGER");
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
      if (!(e.target as Element).closest("[data-kebab]")) {
        setOpenActionId(null);
        setActionMenuPosition(null);
        setConfirmRemoveId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openActionId]);

  useEffect(() => {
    if (!openActionId) return;
    const closeMenu = () => {
      setOpenActionId(null);
      setActionMenuPosition(null);
      setConfirmRemoveId(null);
    };
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openActionId]);

  const toggleActionMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    memberId: string,
  ) => {
    if (openActionId === memberId) {
      setOpenActionId(null);
      setActionMenuPosition(null);
      setConfirmRemoveId(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 208;
    const menuHeight = canPos ? 232 : 188;
    const gap = 6;
    const viewportPadding = 12;
    const left = Math.min(
      Math.max(viewportPadding, rect.right - menuWidth),
      window.innerWidth - menuWidth - viewportPadding,
    );
    const opensUp =
      rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding;
    const top = opensUp
      ? Math.max(viewportPadding, rect.top - menuHeight - gap)
      : rect.bottom + gap;

    setActionMenuPosition({ top, left });
    setOpenActionId(memberId);
    setConfirmRemoveId(null);
  };

  const fetchStaff = async () => {
    if (!activeRestaurant) return;
    setStaffLoading(true);
    setStaffError("");
    try {
      const data = await listStaff(activeRestaurant.id);
      setStaffMembers(data);
    } catch (err: any) {
      setStaffError(t(getApiError(err)));
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

    // Detection is advisory, so a failure here must leave the rest of the tab
    // working rather than blanking the device list.
    try {
      setPinAlerts(await listPinSecurityAlerts(activeRestaurant.id));
    } catch {
      setPinAlerts([]);
    }
  };

  const handleInviteStaff = async () => {
    if (!activeRestaurant || !inviteName.trim() || allowedRoles.length === 0)
      return;
    if (inviteBlockedBySharedDeviceMode) {
      setStaffError(sharedDeviceModeOffMessage);
      return;
    }
    setStaffError("");
    try {
      const result = await createStaff(activeRestaurant.id, {
        name: inviteName.trim(),
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
      });

      let enrollmentUrl = "";
      let expiresAt = "";
      let enrollmentError = "";
      // Device-enrollment QR is only meaningful for PIN/device roles (WAITER/KITCHEN)
      // that sign in at a shared POS/KDS tablet. Dashboard roles (STAFF/MANAGER)
      // use email + password, so no enrollment link is generated for them.
      if (canPos && isPinRole(inviteRole)) {
        if (!sharedDeviceEnabled) {
          enrollmentError = sharedDeviceModeOffMessage;
        } else {
          try {
            const enrollment = await createDeviceEnrollment(
              activeRestaurant.id,
            );
            enrollmentUrl = enrollment.enrollmentUrl;
            expiresAt = enrollment.expiresAt;
          } catch (err: any) {
            enrollmentError =
              err.response?.data?.message ||
              err.message ||
              t("staff.failedGenerateQr");
          }
        }
      }

      setStaffCreatedModal({
        open: true,
        staffName: result.user.name || inviteName.trim(),
        staffEmail: result.user.email,
        rawPin: isPinRole(inviteRole) ? result.rawPin : "",
        tempPassword: isPinRole(inviteRole) ? undefined : result.tempPassword,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });

      setInviteOpen(false);
      setInviteName("");
      setInviteEmail("");
      setInviteRole(allowedRoles[0]?.value ?? "MANAGER");
      await Promise.all([
        fetchStaff(),
        ...(canPos ? [fetchDeviceEnrollments()] : []),
      ]);
    } catch (err: any) {
      setStaffError(t(getApiError(err)));
    }
  };

  const handleRoleChange = async (member: StaffMember, nextRole: string) => {
    if (!activeRestaurant || member.role === nextRole) return;
    setBusyStaffId(member.id);
    setStaffError("");
    try {
      const updated = await updateStaff(activeRestaurant.id, member.id, {
        role: nextRole,
      });
      setStaffMembers((prev) =>
        prev.map((item) =>
          item.id === member.id ? { ...item, ...updated } : item,
        ),
      );
      let enrollmentUrl = "";
      let expiresAt = "";
      let enrollmentError = "";
      if (updated.rawPin && canPos && isPinRole(nextRole)) {
        if (!sharedDeviceEnabled) {
          enrollmentError = sharedDeviceModeOffMessage;
        } else {
          try {
            const enrollment = await createDeviceEnrollment(
              activeRestaurant.id,
            );
            enrollmentUrl = enrollment.enrollmentUrl;
            expiresAt = enrollment.expiresAt;
          } catch (err: any) {
            enrollmentError =
              err.response?.data?.message ||
              err.message ||
              t("staff.failedGenerateQr");
          }
        }
      }
      // Changing to a device role (WAITER/KITCHEN) mints a new PIN — surface it.
      if (updated.rawPin) {
        setStaffCreatedModal({
          open: true,
          staffName: updated.name || member.name || "Staff",
          staffEmail: updated.email || member.email || "",
          rawPin: updated.rawPin,
          enrollmentUrl,
          expiresAt,
          enrollmentError,
        });
      }
      if (canPos) await fetchDeviceEnrollments();
    } catch (err: any) {
      setStaffError(t(getApiError(err)));
      await fetchStaff();
    } finally {
      setBusyStaffId(null);
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    const nextActive = member.isActive === false;
    setBusyStaffId(member.id);
    setStaffError("");
    try {
      const updated = await updateStaff(activeRestaurant.id, member.id, {
        isActive: nextActive,
      });
      setStaffMembers((prev) =>
        prev.map((item) =>
          item.id === member.id ? { ...item, ...updated } : item,
        ),
      );
    } catch (err: any) {
      setStaffError(t(getApiError(err)));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
    }
  };

  const handleResetPin = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    setBusyStaffId(member.id);
    setStaffError("");
    try {
      const result = await resetStaffPin(activeRestaurant.id, member.id);
      let enrollmentUrl = "";
      let expiresAt = "";
      let enrollmentError = "";
      if (canPos && isPinRole(member.role)) {
        if (!sharedDeviceEnabled) {
          enrollmentError = sharedDeviceModeOffMessage;
        } else {
          try {
            const enrollment = await createDeviceEnrollment(
              activeRestaurant.id,
            );
            enrollmentUrl = enrollment.enrollmentUrl;
            expiresAt = enrollment.expiresAt;
          } catch (err: any) {
            enrollmentError =
              err.response?.data?.message ||
              err.message ||
              t("staff.failedGenerateQr");
          }
        }
      }
      setStaffCreatedModal({
        open: true,
        staffName: result.user.name || member.name || "Staff",
        staffEmail: result.user.email,
        rawPin: result.rawPin,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });
      await Promise.all([
        fetchStaff(),
        ...(canPos ? [fetchDeviceEnrollments()] : []),
      ]);
    } catch (err: any) {
      setStaffError(t(getApiError(err)));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
    }
  };

  const handleRemoveStaff = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    setBusyStaffId(member.id);
    setStaffError("");
    try {
      await removeStaff(activeRestaurant.id, member.id, { hard: true });
      setStaffMembers((prev) => prev.filter((item) => item.id !== member.id));
    } catch (err: any) {
      setStaffError(t(getApiError(err)));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
      setConfirmRemoveId(null);
    }
  };

  const handleRebondStaff = async (member: StaffMember) => {
    if (!activeRestaurant) return;
    if (!sharedDeviceEnabled) {
      setDeviceEnrollmentError(sharedDeviceModeOffMessage);
      setOpenActionId(null);
      return;
    }
    setBusyStaffId(member.id);
    setDeviceEnrollmentError("");
    try {
      const reset = await resetStaffPin(activeRestaurant.id, member.id);
      let enrollmentUrl = "";
      let expiresAt = "";
      let enrollmentError = "";
      try {
        const enrollment = await createDeviceEnrollment(activeRestaurant.id);
        enrollmentUrl = enrollment.enrollmentUrl;
        expiresAt = enrollment.expiresAt;
      } catch (enrollmentFailure: any) {
        enrollmentError =
          enrollmentFailure.response?.data?.message ||
          enrollmentFailure.message ||
          t("staff.failedGenerateQr");
      }
      setStaffCreatedModal({
        open: true,
        staffName: reset.user.name || member.name || t("roles.staff", "Staff"),
        staffEmail: reset.user.email || member.email,
        rawPin: reset.rawPin,
        enrollmentUrl,
        expiresAt,
        enrollmentError,
      });
      await Promise.all([fetchStaff(), fetchDeviceEnrollments()]);
    } catch (err: any) {
      setDeviceEnrollmentError(t(getApiError(err)));
    } finally {
      setBusyStaffId(null);
      setOpenActionId(null);
    }
  };

  const handleGenerateDeviceEnrollment = async () => {
    if (!activeRestaurant) return;
    if (!sharedDeviceEnabled) {
      setDeviceEnrollmentError(sharedDeviceModeOffMessage);
      setDeviceEnrollmentUrl("");
      setDeviceEnrollmentExpiresAt("");
      return;
    }
    setDeviceEnrollmentLoading(true);
    setDeviceEnrollmentError("");
    setDeviceEnrollmentUrl("");
    setDeviceEnrollmentExpiresAt("");
    try {
      const result = await createDeviceEnrollment(activeRestaurant.id);
      setDeviceEnrollmentUrl(result.enrollmentUrl);
      setDeviceEnrollmentExpiresAt(result.expiresAt);
      setDeviceEnrollmentCopied(false);
      await fetchDeviceEnrollments();
    } catch (err: any) {
      setDeviceEnrollmentError(t(getApiError(err)));
    } finally {
      setDeviceEnrollmentLoading(false);
    }
  };

  const handleRevokeDeviceEnrollment = async (enrollment: DeviceEnrollment) => {
    if (!activeRestaurant || enrollment.revokedAt) return;
    setRevokingEnrollmentId(enrollment.id);
    setDeviceEnrollmentError("");
    try {
      await revokeDeviceEnrollment(activeRestaurant.id, enrollment.id);
      await fetchDeviceEnrollments();
    } catch (err: any) {
      setDeviceEnrollmentError(
        err.response?.data?.message ||
          t("staff.failedRevokeDevice", "Failed to revoke device session."),
      );
    } finally {
      setRevokingEnrollmentId(null);
    }
  };

  const handleSharedDeviceToggle = async () => {
    if (!activeRestaurant || sharedDeviceUpdating) return;

    const nextEnabled = !sharedDeviceEnabled;
    setSharedDeviceUpdating(true);
    setDeviceEnrollmentError("");
    try {
      await updateRestaurant(activeRestaurant.id, {
        sharedDeviceModeEnabled: nextEnabled,
      });
      setSharedDeviceOverride(nextEnabled);

      if (nextEnabled) {
        setSharedDeviceMessage(
          t(
            "staff.sharedDeviceModeEnabledMessage",
            "Shared Device Mode is on. Generate a fresh Staff Device QR to enroll a phone.",
          ),
        );
      } else {
        setSharedDeviceMessage(
          t(
            "staff.sharedDeviceModeDisabledMessage",
            "Shared Device Mode is off. Staff PIN login is paused until it is enabled again.",
          ),
        );
        setDeviceEnrollmentUrl("");
        setDeviceEnrollmentExpiresAt("");
      }

      await Promise.all([
        fetchRestaurants(),
        ...(canPos ? [fetchDeviceEnrollments()] : []),
      ]);
    } catch (err: any) {
      setDeviceEnrollmentError(
        err.response?.data?.message ||
          err.message ||
          t(
            "staff.failedUpdateSharedDeviceMode",
            "Failed to update Shared Device Mode.",
          ),
      );
    } finally {
      setSharedDeviceUpdating(false);
    }
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
            <h3 className="text-lg font-semibold text-foreground">
              {t("staff.staffMembers")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("staff.staffMembersDesc")}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => setInviteOpen(true)}
            disabled={limitReached || allowedRoles.length === 0}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t("staff.createStaffAccount")}
          </Button>
        </div>

        {staffError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {staffError}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">
              {t("staff.statsLabelStaff")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {staffOnlyMembers.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {staffLimit >= 999999
                ? t("staff.statsSeatsUnlimited")
                : t("staff.statsSeatsCount", {
                    current: staffOnlyMembers.length,
                    limit: staffLimit,
                  })}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">
              {t("staff.statsLabelActive")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {activeCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("staff.statsInactive", { count: inactiveCount })}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-bold uppercase text-muted-foreground">
              {t("staff.statsLabelSharedDevice")}
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {sharedDeviceEnabled
                ? t("staff.statsSharedEnabled")
                : t("staff.statsSharedDisabled", "Disabled")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("staff.statsSharedPinSupport")}
            </p>
          </div>
          {canPos && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-xs font-bold uppercase text-muted-foreground">
                {t("staff.statsLabelDeviceLinks")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {deviceEnrollments.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("staff.statsEnrollmentSessions")}
              </p>
            </div>
          )}
        </div>

        {limitReached && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {t("staff.limitReachedTitle")}
              </p>
              <p className="text-muted-foreground">
                {t("staff.limitReachedDesc")}
              </p>
            </div>
            <a
              href="/pricing"
              className="text-xs font-bold uppercase text-primary hover:underline"
            >
              {t("tierLocked.upgrade", "Upgrade")}
            </a>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-border bg-background">
            <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("staff.teamConsoleTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("staff.teamConsoleDesc")}
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Filter className="h-4 w-4" />
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium normal-case text-foreground"
                >
                  <option value="ALL">{t("staff.filterAll")}</option>
                  <option value="ACTIVE">{t("staff.filterActive")}</option>
                  <option value="INACTIVE">{t("staff.filterInactive")}</option>
                  {allowedRoles.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {staffLoading ? (
              <div className="p-4 text-sm text-muted-foreground sm:p-6">
                {t("staff.loading")}
              </div>
            ) : staffOnlyMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 p-4 text-center sm:p-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {t("staff.noStaffYet")}
                  </p>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    {t("staff.noStaffFirstAccount")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  disabled={allowedRoles.length === 0}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t("staff.createStaffAccount")}
                </Button>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground sm:p-6">
                {t("staff.noStaffMatchFilter")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        {t("staff.nameColumn")}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        {t("staff.emailColumn")}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        {t("staff.roleColumn")}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        {t("staff.colStatus")}
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        {t("staff.colLastUpdate")}
                      </th>
                      <th className="w-14 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStaff.map((member) => {
                      const isInactive = member.isActive === false;
                      const isBusy = busyStaffId === member.id;
                      const roleOptions = allowedRoles.some(
                        (role) => role.value === member.role,
                      )
                        ? allowedRoles
                        : [
                            ...allowedRoles,
                            { value: member.role, label: member.role },
                          ].filter((role) => role.value !== "OWNER");
                      return (
                        <tr key={member.id} className="border-t border-border">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">
                              {member.name || t("staff.unnamedStaff")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("staff.createdAt", {
                                date: formatDateTime(
                                  member.createdAt,
                                  activeRestaurant.timezone,
                                ),
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {displayEmail(member.email)}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={member.role}
                              disabled={isBusy}
                              onChange={(event) =>
                                handleRoleChange(member, event.target.value)
                              }
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
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {isInactive ? "Inactive" : "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDateTime(
                              member.updatedAt,
                              activeRestaurant.timezone,
                            )}
                          </td>
                          <td className="relative px-4 py-3 text-right">
                            <button
                              type="button"
                              data-kebab
                              onClick={(event) =>
                                toggleActionMenu(event, member.id)
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              aria-label="Open staff actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openActionId === member.id &&
                              actionMenuPosition && (
                                <div
                                  data-kebab
                                  className="fixed z-50 w-52 rounded-lg border border-border bg-background p-1 text-left shadow-xl"
                                  style={{
                                    top: actionMenuPosition.top,
                                    left: actionMenuPosition.left,
                                  }}
                                >
                                  {isPinRole(member.role) && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetPin(member)}
                                      disabled={isBusy}
                                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                      <KeyRound className="h-4 w-4" />
                                      {t("staff.actionResetPin")}
                                    </button>
                                  )}
                                  {canPos && isPinRole(member.role) && (
                                    <button
                                      type="button"
                                      onClick={() => handleRebondStaff(member)}
                                      disabled={isBusy || !sharedDeviceEnabled}
                                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                      <QrCode className="h-4 w-4" />
                                      {t("staff.rebondTitle")}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(member)}
                                    disabled={isBusy}
                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
                                  >
                                    {isInactive ? (
                                      <UserCheck className="h-4 w-4" />
                                    ) : (
                                      <UserX className="h-4 w-4" />
                                    )}
                                    {isInactive
                                      ? t("staff.actionReactivate")
                                      : t("staff.actionDeactivate")}
                                  </button>
                                  {confirmRemoveId === member.id ? (
                                    <div className="flex items-center gap-1 px-3 py-2">
                                      <span className="flex-1 text-xs font-semibold text-destructive">
                                        {t("staff.actionRemoveConfirm")}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveStaff(member)
                                        }
                                        disabled={isBusy}
                                        className="rounded-md px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                      >
                                        {t("staff.actionRemoveYes")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmRemoveId(null)}
                                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                                      >
                                        {t("staff.actionRemoveCancel")}
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmRemoveId(member.id)
                                      }
                                      disabled={isBusy}
                                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                    >
                                      <UserX className="h-4 w-4" />
                                      {t("staff.actionRemovePermanently")}
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
            {/* Shared-device bonding is a POS/KDS concept — gate by canPos (#15) */}
            {canPos && (
              <section className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t("staff.sharedDeviceMode")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("staff.sharedDeviceOffWarning")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSharedDeviceToggle}
                    disabled={sharedDeviceUpdating}
                  >
                    <Smartphone className="mr-2 h-4 w-4" />
                    {sharedDeviceUpdating
                      ? t("common.saving", "Saving")
                      : sharedDeviceEnabled
                        ? t("common.disable", "Disable")
                        : t("common.enable", "Enable")}
                  </Button>
                </div>
                <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  {sharedDeviceMessage ||
                    (sharedDeviceEnabled
                      ? thisDeviceBonded
                        ? t("staff.sharedDeviceBonded", {
                            name: activeRestaurant?.name,
                          })
                        : t(
                            "staff.sharedDeviceModeEnabledMessage",
                            "Shared Device Mode is on. Generate a fresh Staff Device QR to enroll a phone.",
                          )
                      : t(
                          "staff.sharedDeviceModeDisabledMessage",
                          "Shared Device Mode is off. Staff PIN login is paused until it is enabled again.",
                        ))}
                </p>
              </section>
            )}

            {canPos && (
              <section className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t("staff.bondDevice")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("staff.bondDeviceDesc")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateDeviceEnrollment}
                    disabled={
                      deviceEnrollmentLoading ||
                      !activeRestaurant ||
                      !sharedDeviceEnabled
                    }
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {deviceEnrollmentLoading ? t("staff.generating") : "New"}
                  </Button>
                </div>

                {deviceEnrollmentError && (
                  <p className="mt-3 text-sm text-destructive">
                    {deviceEnrollmentError}
                  </p>
                )}

                {deviceEnrollmentUrl && (
                  <div className="mt-4 flex gap-3">
                    <div className="rounded-lg bg-white p-2">
                      <QRCodeSVG value={deviceEnrollmentUrl} size={112} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground">
                        {t("staff.scanQrInstruction")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("staff.expiresAt", {
                          time: new Date(
                            deviceEnrollmentExpiresAt,
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          }),
                        })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={copyEnrollmentLink}
                      >
                        {deviceEnrollmentCopied ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        {deviceEnrollmentCopied
                          ? t("staff.copied")
                          : t("staff.copyLink")}
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {canPos && (
              <section className="rounded-lg border border-border bg-background p-4">
                <p className="text-sm font-semibold text-foreground">
                  {t("staff.deviceSessionsTitle")}
                </p>
                {pinAlerts.length > 0 && (
                  <div className="mt-3 space-y-2" data-testid="pin-alerts">
                    {pinAlerts.map((alert) => {
                      const severity = pinAlertSeverity(alert.kind);
                      return (
                        <div
                          key={alert.id}
                          data-testid={`pin-alert-${alert.kind}`}
                          data-severity={severity}
                          className={`rounded-lg px-3 py-2 text-xs font-medium ${
                            severity === "urgent"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {t(`staff.pinAlert.${alert.kind}`, {
                            ...(alert.detail ?? {}),
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {deviceEnrollmentsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      {t("staff.loading")}
                    </p>
                  ) : deviceEnrollments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("staff.deviceSessionsEmpty")}
                    </p>
                  ) : (
                    deviceEnrollments.slice(0, 5).map((enrollment) => {
                      const status = getEnrollmentStatus(enrollment, now);
                      const lastStaffBinding = enrollment.staffBindings?.[0];
                      const lastStaffName =
                        lastStaffBinding?.user.name ||
                        (lastStaffBinding
                          ? displayEmail(lastStaffBinding.user.email)
                          : "");
                      const otherStaffBindings =
                        enrollment.staffBindings?.slice(1) ?? [];
                      const otherStaffNames = otherStaffBindings
                        .map(
                          (binding) =>
                            binding.user.name ||
                            displayEmail(binding.user.email),
                        )
                        .filter(Boolean)
                        .slice(0, 2);
                      const statusLabel =
                        status === "revoked"
                          ? t("staff.deviceStatusRevoked", "Revoked")
                          : status === "expired"
                            ? t("staff.deviceStatusExpired", "Expired")
                            : status === "used"
                              ? t("staff.deviceStatusUsed")
                              : t("staff.deviceStatusPending");
                      return (
                        <div
                          key={enrollment.id}
                          className="rounded-lg bg-muted/40 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${enrollmentStatusClasses[status]}`}
                            >
                              {statusLabel}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(
                                enrollment.revokedAt ||
                                  enrollment.usedAt ||
                                  enrollment.createdAt,
                                activeRestaurant.timezone,
                              )}
                            </p>
                          </div>
                          {status === "used" &&
                            (() => {
                              // Only an enrolled device has trust to lose; a
                              // pending or revoked row has nothing to warn about.
                              const trust = deviceTrustState(
                                enrollment.deviceTrustExpiresAt,
                                new Date(now),
                              );
                              if (trust.level === "ok") return null;
                              return (
                                <p
                                  data-testid={`device-trust-${enrollment.id}`}
                                  data-level={trust.level}
                                  className={`mt-2 text-xs font-medium ${
                                    trust.level === "expired" ||
                                    trust.level === "urgent"
                                      ? "text-destructive"
                                      : "text-amber-700 dark:text-amber-300"
                                  }`}
                                >
                                  {trust.level === "expired"
                                    ? t("staff.deviceTrustExpired")
                                    : trust.level === "unknown"
                                      ? t("staff.deviceTrustUnknown")
                                      : t("staff.deviceTrustExpiring", {
                                          days: trust.daysRemaining,
                                        })}
                                </p>
                              );
                            })()}
                          <p className="mt-2 truncate text-xs text-muted-foreground">
                            {t("staff.deviceSessionCreatedBy", {
                              name:
                                enrollment.createdBy.name ||
                                displayEmail(enrollment.createdBy.email),
                              defaultValue: "QR created by {{name}}",
                            })}
                          </p>
                          {lastStaffBinding ? (
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              <p className="truncate text-foreground">
                                {t("staff.deviceSessionLastUsedBy", {
                                  name: lastStaffName,
                                  role: lastStaffBinding.user.role,
                                  defaultValue:
                                    "Last used by {{name}} ({{role}})",
                                })}
                              </p>
                              <p>
                                {t("staff.deviceSessionLastSeen", {
                                  time: formatDateTime(
                                    lastStaffBinding.lastSeenAt,
                                    activeRestaurant.timezone,
                                  ),
                                  defaultValue: "Last PIN login {{time}}",
                                })}
                              </p>
                              {otherStaffNames.length > 0 && (
                                <p className="truncate">
                                  {t("staff.deviceSessionAlsoUsedBy", {
                                    names: otherStaffNames.join(", "),
                                    count: otherStaffBindings.length,
                                    defaultValue: "Also used by {{names}}",
                                  })}
                                </p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t(
                                "staff.deviceSessionNoStaffLogin",
                                "No staff PIN login recorded yet",
                              )}
                            </p>
                          )}
                          {!enrollment.revokedAt && (
                            <button
                              type="button"
                              onClick={() =>
                                handleRevokeDeviceEnrollment(enrollment)
                              }
                              disabled={revokingEnrollmentId === enrollment.id}
                              className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                            >
                              <UserX className="h-3.5 w-3.5" />
                              {revokingEnrollmentId === enrollment.id
                                ? t("common.saving", "Saving")
                                : t("staff.actionRevokeDevice", "Revoke")}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-border bg-background p-4">
              <p className="text-sm font-semibold text-foreground">
                {t("staff.rolePreviewTitle")}
              </p>
              <div className="mt-3 space-y-3">
                {allowedRoles.length === 0 ? (
                  <div className="flex gap-3 rounded-lg border border-dashed border-border p-3">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {t("staff.noRolesAvailable", "Staff roles locked")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "staff.noRolesDesc",
                          "Upgrade to unlock staff roles.",
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  allowedRoles.map((role) => (
                    <div
                      key={role.value}
                      className="rounded-lg bg-muted/40 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            roleBadgeClasses[role.value] ||
                            "bg-muted text-muted-foreground"
                          }`}
                        >
                          {role.label}
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {(rolePermissions[role.value] || []).map(
                          (permission) => (
                            <li key={permission.key}>
                              {t(permission.key, permission.label)}
                            </li>
                          ),
                        )}
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
        dashboardUi
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title={t("staff.inviteNewStaff")}
        description={t(
          "staff.inviteNewStaffDesc",
          "Create a staff account. Waiter and kitchen roles get a PIN; manager and staff roles get a temporary password.",
        )}
      >
        <div className="space-y-4">
          <div className="space-y-3">
            <input
              type="text"
              value={inviteName}
              onChange={(event) => setInviteName(event.target.value)}
              placeholder={t("staff.displayName")}
              className={inputCls}
              required
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={t("staff.emailOptional")}
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

          {inviteBlockedBySharedDeviceMode && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-100">
                    {t(
                      "staff.enableSharedDeviceBeforePinStaff",
                      "Enable Staff PIN Login first",
                    )}
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                    {t(
                      "staff.enableSharedDeviceBeforePinStaffDesc",
                      "Waiter and kitchen accounts need Staff Device Mode so the PIN and QR can be issued together.",
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={handleSharedDeviceToggle}
                    disabled={sharedDeviceUpdating}
                  >
                    <Smartphone className="mr-2 h-4 w-4" />
                    {sharedDeviceUpdating
                      ? t("common.saving", "Saving")
                      : t(
                          "staff.enableStaffPinLogin",
                          "Enable Staff PIN Login",
                        )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                {isPinRole(inviteRole)
                  ? t(
                      "staff.inviteHintPin",
                      "The account is created now with a one-time PIN. Sending a direct email invitation can be added in v2.",
                    )
                  : t(
                      "staff.inviteHintPassword",
                      "The account is created now with a temporary password. Sending a direct email invitation can be added in v2.",
                    )}
              </p>
            </div>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={handleInviteStaff}
            disabled={
              !inviteName.trim() ||
              allowedRoles.length === 0 ||
              limitReached ||
              inviteBlockedBySharedDeviceMode
            }
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {t("staff.createStaffAccount")}
          </Button>
        </div>
      </Modal>

      <StaffCreatedModal
        open={staffCreatedModal.open}
        onClose={() =>
          setStaffCreatedModal((prev) => ({ ...prev, open: false }))
        }
        staffName={staffCreatedModal.staffName}
        staffEmail={staffCreatedModal.staffEmail}
        rawPin={staffCreatedModal.rawPin}
        tempPassword={staffCreatedModal.tempPassword}
        enrollmentUrl={staffCreatedModal.enrollmentUrl}
        expiresAt={staffCreatedModal.expiresAt}
        enrollmentError={staffCreatedModal.enrollmentError}
      />
    </>
  );
};

export default StaffSettingsTab;
