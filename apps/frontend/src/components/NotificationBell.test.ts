import { describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";
import { formatNotificationTimeAgo } from "./NotificationBell";

const translate = vi.fn(
  (key: string, fallback: string, options?: { count?: number }) =>
    `${key}:${options?.count ?? fallback}`,
) as unknown as TFunction;

describe("formatNotificationTimeAgo", () => {
  const now = Date.UTC(2026, 6, 18, 12, 0, 0);

  it.each([
    [30_000, "auto.justNow:just now"],
    [2 * 60_000, "auto.minutesAgo:2"],
    [3 * 60 * 60_000, "auto.hoursAgo:3"],
    [4 * 24 * 60 * 60_000, "auto.daysAgo:4"],
  ])("uses translated relative time for %i milliseconds", (age, expected) => {
    expect(formatNotificationTimeAgo(translate, now - age, now)).toBe(expected);
  });

  it("clamps future timestamps to the translated just-now label", () => {
    expect(formatNotificationTimeAgo(translate, now + 10_000, now)).toBe(
      "auto.justNow:just now",
    );
  });
});
