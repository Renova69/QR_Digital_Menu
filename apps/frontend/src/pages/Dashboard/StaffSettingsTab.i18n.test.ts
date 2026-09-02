import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import bgTranslation from "../../locales/bg/translation.json";
import enTranslation from "../../locales/en/translation.json";
import roTranslation from "../../locales/ro/translation.json";

type Locale = Record<string, unknown>;

const source = readFileSync(
  resolve(process.cwd(), "src/pages/Dashboard/settings/StaffSettingsTab.tsx"),
  "utf8",
);
const referencedStaffKeys = [
  ...new Set(
    [...source.matchAll(/["'](staff\.[A-Za-z0-9_.]+)["']/g)].map(
      (match) => match[1],
    ),
  ),
].sort();

const readTranslation = (locale: Locale, key: string): unknown =>
  key
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      locale,
    );

describe("Staff settings translations", () => {
  it.each([
    ["en", enTranslation],
    ["bg", bgTranslation],
    ["ro", roTranslation],
  ] as const)("%s defines every staff key used by the screen", (_, locale) => {
    expect(
      referencedStaffKeys.filter(
        (key) => readTranslation(locale as Locale, key) === undefined,
      ),
    ).toEqual([]);
  });

  it("provides Bulgarian copy for the labels that previously leaked English", () => {
    const keys = [
      "staff.statusActive",
      "staff.statusInactive",
      "staff.openActions",
      "staff.newDeviceEnrollment",
      "staff.sharedDeviceModeEnabledMessage",
      "staff.deviceStatusRevoked",
      "staff.deviceSessionCreatedBy",
      "staff.deviceSessionLastUsedBy",
      "staff.deviceSessionLastSeen",
      "staff.deviceSessionNoStaffLogin",
      "staff.actionRevokeDevice",
      "staff.perm.orderManagement",
      "staff.perm.callWaiterAlerts",
      "staff.perm.tableStatus",
      "staff.perm.settingsAccess",
      "staff.perm.staffDevices",
      "staff.perm.menuOperations",
      "staff.perm.tablePos",
      "staff.perm.orderEntry",
      "staff.perm.paymentNotifications",
      "staff.perm.kitchenDisplay",
      "staff.perm.ticketProgress",
      "staff.perm.orderAlerts",
    ];

    expect(
      keys.filter(
        (key) =>
          readTranslation(bgTranslation as Locale, key) ===
          readTranslation(enTranslation as Locale, key),
      ),
    ).toEqual([]);

    expect(bgTranslation.apiErrors.stepUpRequired).not.toBe(
      enTranslation.apiErrors.stepUpRequired,
    );
  });
});
