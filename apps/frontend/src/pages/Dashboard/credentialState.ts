/**
 * Credential retirement state, derived for display.
 *
 * Every deadline here comes from a persisted timestamp the backend sent. There
 * are deliberately no calendar dates in this file: a hardcoded one is correct in
 * exactly one environment, and staging, a fresh self-host or a restore all have
 * their own rollout.
 */

export type PrintAgentState = "active" | "stale" | "quarantined";

export interface PrintAgentTokenState {
  lastSeenAt: string | null;
  staleWarnedAt: string | null;
  quarantinedAt: string | null;
  stalenessEnforcedAt: string | null;
}

/**
 * Quarantine blocks; staleness only warns. Keeping that distinction visible is
 * the point of the whole design -- an owner needs to know the difference between
 * "this printer has been quiet" and "this printer has stopped working".
 */
export function printAgentState(token: PrintAgentTokenState): PrintAgentState {
  if (token.quarantinedAt) return "quarantined";
  if (token.staleWarnedAt) return "stale";
  return "active";
}

export type DeviceTrustLevel =
  | "unknown"
  | "ok"
  | "warning"
  | "urgent"
  | "expired";

export interface DeviceTrustState {
  level: DeviceTrustLevel;
  daysRemaining: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_DAYS = 30;
const URGENT_DAYS = 7;

/**
 * How close a device is to losing PIN-login trust.
 *
 * NULL is not "trusted forever": it means the row predates the backfill, so the
 * expiry is genuinely unknown. Rendering that as a comfortable blank would tell
 * an owner the opposite of the truth, so it gets its own state.
 */
export function deviceTrustState(
  deviceTrustExpiresAt: string | null | undefined,
  now: Date = new Date(),
): DeviceTrustState {
  if (!deviceTrustExpiresAt) return { level: "unknown", daysRemaining: null };

  const expiresAt = new Date(deviceTrustExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) return { level: "unknown", daysRemaining: null };

  const msRemaining = expiresAt - now.getTime();
  if (msRemaining <= 0) return { level: "expired", daysRemaining: 0 };

  // Ceil, so "0 days remaining" never shows for a device that is still valid --
  // the boundary a person reads as "already gone".
  const daysRemaining = Math.ceil(msRemaining / DAY_MS);
  if (daysRemaining <= URGENT_DAYS) return { level: "urgent", daysRemaining };
  if (daysRemaining <= WARNING_DAYS) return { level: "warning", daysRemaining };
  return { level: "ok", daysRemaining };
}

/** A persisted past lock is historical state, not a current block. */
export function isDevicePinLocked(
  pinLockedUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!pinLockedUntil) return false;
  const lockedUntil = new Date(pinLockedUntil).getTime();
  return !Number.isNaN(lockedUntil) && lockedUntil > now.getTime();
}

/**
 * Keep the compact recent-history view without hiding a credential that can
 * still authenticate. Older pending/expired links and revoked rows may remain
 * collapsed, but every used, non-revoked device must stay owner-visible for
 * trust-expiry warnings, lock badges, and manual revocation.
 */
export function deviceEnrollmentsForDashboard<
  T extends { usedAt: string | null; revokedAt: string | null },
>(enrollments: readonly T[], recentLimit = 5): T[] {
  return enrollments.filter(
    (enrollment, index) =>
      index < recentLimit ||
      (enrollment.usedAt !== null && enrollment.revokedAt === null),
  );
}

/**
 * Days until a stale token becomes eligible for quarantine, or null when that
 * cannot be known. Derived from the backend's own timestamp so the number an
 * owner sees matches the date the sweep will actually act on.
 */
export function daysUntilQuarantine(
  quarantineEligibleAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!quarantineEligibleAt) return null;
  const at = new Date(quarantineEligibleAt).getTime();
  if (Number.isNaN(at)) return null;
  const ms = at - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

export type PinAlertKind =
  | "MULTI_DEVICE_LOCKOUT"
  | "PIN_SPIKE"
  | "DEVICE_SLOW_BURN"
  | "RESTAURANT_AGGREGATE";

/**
 * How prominently a PIN abuse signal should read.
 *
 * The restaurant-wide 24h aggregate is deliberately informational: a full
 * trading day of failures across every device is noisier than the 15-minute
 * signals, and showing it as urgent would train owners to ignore the ones that
 * actually indicate an attack.
 */
export function pinAlertSeverity(kind: PinAlertKind): "urgent" | "info" {
  return kind === "RESTAURANT_AGGREGATE" ? "info" : "urgent";
}
