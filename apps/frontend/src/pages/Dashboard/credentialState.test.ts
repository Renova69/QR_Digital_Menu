import { describe, it, expect } from "vitest";
import {
  printAgentState,
  deviceTrustState,
  deviceEnrollmentsForDashboard,
  isDevicePinLocked,
  daysUntilQuarantine,
  pinAlertSeverity,
} from "./credentialState";

const token = (over: Partial<Parameters<typeof printAgentState>[0]> = {}) => ({
  lastSeenAt: null,
  staleWarnedAt: null,
  quarantinedAt: null,
  stalenessEnforcedAt: null,
  ...over,
});

describe("printAgentState", () => {
  it("is active when nothing is flagged", () => {
    expect(printAgentState(token())).toBe("active");
  });

  // Staleness is advisory. Showing it as blocked would tell an owner their
  // printer has stopped when it is still printing perfectly well.
  it("is stale, not quarantined, when only warned", () => {
    expect(printAgentState(token({ staleWarnedAt: "2026-08-01" }))).toBe(
      "stale",
    );
  });

  it("is quarantined once revoked, regardless of the warning", () => {
    expect(
      printAgentState(
        token({ staleWarnedAt: "2026-08-01", quarantinedAt: "2026-09-01" }),
      ),
    ).toBe("quarantined");
  });
});

describe("deviceTrustState", () => {
  const now = new Date("2026-08-24T00:00:00Z");
  const inDays = (d: number) =>
    new Date(now.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

  it("is ok well before expiry", () => {
    expect(deviceTrustState(inDays(90), now).level).toBe("ok");
  });

  it("warns at 30 days remaining", () => {
    expect(deviceTrustState(inDays(30), now).level).toBe("warning");
  });

  it("is urgent at 7 days remaining", () => {
    expect(deviceTrustState(inDays(7), now).level).toBe("urgent");
  });

  // The boundaries are where a wrong comparison hides: 31 days must not be
  // urgent, and 8 days must not be merely a warning.
  it("does not escalate a day early", () => {
    expect(deviceTrustState(inDays(31), now).level).toBe("ok");
    expect(deviceTrustState(inDays(8), now).level).toBe("warning");
  });

  it("is expired once the moment has passed", () => {
    expect(deviceTrustState(inDays(-1), now)).toEqual({
      level: "expired",
      daysRemaining: 0,
    });
  });

  // NULL means the row predates the backfill, so the expiry is genuinely
  // unknown. Rendering it as a comfortable blank would tell an owner the
  // opposite of the truth.
  it("treats a missing expiry as unknown, never as trusted forever", () => {
    expect(deviceTrustState(null, now)).toEqual({
      level: "unknown",
      daysRemaining: null,
    });
    expect(deviceTrustState(undefined, now).level).toBe("unknown");
  });

  it("treats an unparseable value as unknown rather than expired", () => {
    expect(deviceTrustState("not-a-date", now).level).toBe("unknown");
  });

  // A device with hours left is still usable; showing "0 days" would read as
  // already gone and send someone re-enrolling a working tablet mid-service.
  it("never reports zero days for a device that is still valid", () => {
    const inSixHours = new Date(
      now.getTime() + 6 * 60 * 60 * 1000,
    ).toISOString();
    const state = deviceTrustState(inSixHours, now);

    expect(state.level).toBe("urgent");
    expect(state.daysRemaining).toBe(1);
  });
});

describe("isDevicePinLocked", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  it("shows only a lock whose expiry is still in the future", () => {
    expect(isDevicePinLocked("2026-08-24T12:01:00Z", now)).toBe(true);
    expect(isDevicePinLocked("2026-08-24T11:59:00Z", now)).toBe(false);
  });

  it("treats missing or invalid lock timestamps as inactive", () => {
    expect(isDevicePinLocked(null, now)).toBe(false);
    expect(isDevicePinLocked("not-a-date", now)).toBe(false);
  });
});

describe("deviceEnrollmentsForDashboard", () => {
  const enrollment = (
    id: string,
    usedAt: string | null = null,
    revokedAt: string | null = null,
  ) => ({ id, usedAt, revokedAt });

  it("keeps every active enrolled device visible beyond the recent-row limit", () => {
    const rows = [
      enrollment("recent-1"),
      enrollment("recent-2"),
      enrollment("recent-3"),
      enrollment("recent-4"),
      enrollment("recent-5"),
      enrollment("older-active", "2026-01-01T00:00:00Z"),
      enrollment(
        "older-revoked",
        "2026-01-01T00:00:00Z",
        "2026-02-01T00:00:00Z",
      ),
    ];

    expect(deviceEnrollmentsForDashboard(rows).map(({ id }) => id)).toEqual([
      "recent-1",
      "recent-2",
      "recent-3",
      "recent-4",
      "recent-5",
      "older-active",
    ]);
  });
});

describe("daysUntilQuarantine", () => {
  const now = new Date("2026-08-24T00:00:00Z");

  it("counts down to the backend's combined quarantine boundary", () => {
    const at = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();

    expect(daysUntilQuarantine(at, now)).toBe(10);
  });

  it("is zero once quarantine eligibility has begun", () => {
    const at = new Date(now.getTime() - 1000).toISOString();

    expect(daysUntilQuarantine(at, now)).toBe(0);
  });

  // Unknown, not "enforced". The dashboard must not invent a deadline the
  // backend never recorded.
  it("is null when the backend cannot establish an eligibility date", () => {
    expect(daysUntilQuarantine(null, now)).toBeNull();
  });
});

describe("pinAlertSeverity", () => {
  it("treats the short-window signals as urgent", () => {
    expect(pinAlertSeverity("MULTI_DEVICE_LOCKOUT")).toBe("urgent");
    expect(pinAlertSeverity("PIN_SPIKE")).toBe("urgent");
    expect(pinAlertSeverity("DEVICE_SLOW_BURN")).toBe("urgent");
  });

  // Informational by design. A trading day of failures across every device is
  // noisier than the 15-minute signals, and showing it as urgent would train
  // owners to ignore the ones that matter.
  it("treats the restaurant 24h aggregate as informational", () => {
    expect(pinAlertSeverity("RESTAURANT_AGGREGATE")).toBe("info");
  });
});
