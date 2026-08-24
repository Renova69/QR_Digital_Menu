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

/**
 * Days until a stale token becomes eligible for quarantine, or null when that
 * cannot be known. Derived from the backend's own timestamp so the number an
 * owner sees matches the date the sweep will actually act on.
 */
export function daysUntilEnforcement(
  stalenessEnforcedAt: string | null,
  now: Date = new Date(),
): number | null {
  if (!stalenessEnforcedAt) return null;
  const at = new Date(stalenessEnforcedAt).getTime();
  if (Number.isNaN(at)) return null;
  const ms = at - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}
