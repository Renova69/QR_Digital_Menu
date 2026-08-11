import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SUPPORTED_LANGUAGES = [
  "en",
  "bg",
  "ro",
  "de",
  "es",
  "fr",
  "it",
  "zh",
  "el",
  "ja",
  "ru",
  "ar",
];
const DASHBOARD_LANGUAGES = ["en", "bg", "ro"];
// Roots a customer can reach on the public-menu flow (browse → cart → checkout →
// pay → confirm → call-waiter → sign-in → loyalty profile). Every language must
// carry these in full; dashboard/admin roots intentionally stay BG/RO/EN only.
const PUBLIC_ROOTS = [
  "publicMenu",
  "cart",
  "checkout",
  "common",
  "payment",
  "orderConfirmation",
  "feedback",
  "language",
  "nav",
  "auth",
  "profile",
  "servicePoints",
];
// Owner-facing subtrees that live under an otherwise-public root.
const NON_PUBLIC_PREFIXES = ["payment.settings"];
const MENU_EDIT_KEYS = [
  "menuAdmin.editTranslations",
  "menuAdmin.featureItem",
  "menuAdmin.unfeatureItem",
  "menuAdmin.markOutOfStock",
  "menuAdmin.markAvailable",
  "forms.upsellContexts",
  "forms.upsellContext.MORNING",
  "forms.upsellContext.LUNCH",
  "forms.upsellContext.EVENING",
  "forms.upsellContext.LATE_NIGHT",
  "forms.upsellContext.WEEKEND",
  "forms.upsellContext.FRIDAY_NIGHT",
  "forms.upsellContext.COLD",
  "forms.upsellContext.HOT",
  "forms.upsellContext.RAINY",
  "forms.editItemDescription",
  "forms.itemUpdated",
  "forms.itemUpdateFailed",
  "forms.saving",
  "forms.saveChanges",
  "forms.loyaltyReward",
  "forms.loyaltyRewardHint",
  "forms.rewardPricingMode",
  "forms.rewardAutomatic",
  "forms.rewardCustom",
  "forms.rewardAutomaticPreview",
  "forms.rewardAutomaticFormula",
  "forms.rewardCustomPoints",
  "forms.rewardCustomHint",
];
const GENERAL_SETTINGS_KEYS = [
  "settings.city",
  "settings.cityPlaceholder",
  "settings.country",
  "settings.countryPlaceholder",
];
const DASHBOARD_UI_KEYS = [
  "dashboard.roles.owner",
  "dashboard.roles.manager",
  "dashboard.roles.staff",
  "dashboard.roles.superAdmin",
  "tables.status.open",
  "tables.status.paid",
  "tables.status.closedNoPayment",
  "reservations.openBookingLink",
  "reservations.allergenSection",
  "reservations.turnoverHelp",
  "reservations.serviceHoursHelp",
  "reservations.customPrefsHelp",
  "reservations.blackoutHelp",
  "reservations.weekdays.mon",
  "reservations.weekdays.tue",
  "reservations.weekdays.wed",
  "reservations.weekdays.thu",
  "reservations.weekdays.fri",
  "reservations.weekdays.sat",
  "reservations.weekdays.sun",
  "assistance.cashPaymentRequested",
  "assistance.cashScopeMyOrders",
  "assistance.cashScopeFullTable",
  "assistance.cashCollection",
  "assistance.cashCollectionHint",
  "assistance.confirmCashCollected",
  "assistance.cashRecorded",
  "assistance.cashCancelled",
  "assistance.cashConfirmFailed",
  "assistance.cashCancelFailed",
  "assistance.cashFetchFailed",
  "assistance.cash",
  "assistance.loadMoreResolved",
  "assistance.updateFailed",
  "assistance.cancelled",
  "assistance.saving",
  "payments.paid",
  "analytics.ofCollected",
  "analytics.paymentMethod.cash",
  "analytics.paymentMethod.mypos",
  "analytics.paymentMethod.stripe",
  "analytics.paymentMethod.borica",
  "analytics.paymentMethod.epay",
  "analytics.noCustomerData",
  "analytics.menuEngineering",
  "analytics.dayPartRangeMorning",
  "analytics.dayPartRangeLunch",
  "analytics.dayPartRangeDinner",
  "analytics.dayPartRangeLate",
  "menuCheck.title",
  "menuCheck.subtitle",
  "menuCheck.rescan",
  "menuCheck.perfectScore",
  "menuCheck.perfectScoreDesc",
  "menuCheck.critical",
  "menuCheck.warnings",
  "menuCheck.suggestions",
  "menuCheck.itemIssue",
  "menuCheck.categoryIssue",
  "menuCheck.fieldLabel",
  "menuCheck.fix",
  "menuCheck.fields.items",
  "menuCheck.fields.price",
  "menuCheck.fields.description",
  "menuCheck.fields.imageUrl",
  "menuCheck.fields.translations",
  "menuCheck.issues.emptyCategory",
  "menuCheck.issues.missingCategoryTranslation",
  "menuCheck.issues.itemPriceZero",
  "menuCheck.issues.missingItemDescription",
  "menuCheck.issues.missingItemImage",
  "menuCheck.issues.missingItemTranslation",
  "menuCheck.all",
];
const LOCALES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../locales",
);

function flatten(value: unknown, prefix = "", result: string[] = []) {
  if (typeof value === "string") {
    result.push(prefix);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      flatten(entry, `${prefix}.${index}`, result),
    );
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) =>
      flatten(entry, prefix ? `${prefix}.${key}` : key, result),
    );
  }
  return result;
}

function readLocale(language: string): unknown {
  return JSON.parse(
    readFileSync(resolve(LOCALES_DIR, language, "translation.json"), "utf8"),
  );
}

describe("public locale bundles", () => {
  it.each(SUPPORTED_LANGUAGES)(
    "%s contains every customer-facing English key",
    (language) => {
      const englishKeys = flatten(readLocale("en")).filter(
        (key) =>
          PUBLIC_ROOTS.some(
            (root) => key === root || key.startsWith(`${root}.`),
          ) &&
          !NON_PUBLIC_PREFIXES.some(
            (prefix) => key === prefix || key.startsWith(`${prefix}.`),
          ),
      );
      const localizedKeys = new Set(flatten(readLocale(language)));

      expect(englishKeys.filter((key) => !localizedKeys.has(key))).toEqual([]);
    },
  );
});

describe("menu edit locale bundles", () => {
  it.each(DASHBOARD_LANGUAGES)(
    "%s contains every menu edit key",
    (language) => {
      const localizedKeys = new Set(flatten(readLocale(language)));

      expect(MENU_EDIT_KEYS.filter((key) => !localizedKeys.has(key))).toEqual(
        [],
      );
    },
  );
});

describe("general settings locale bundles", () => {
  it.each(DASHBOARD_LANGUAGES)(
    "%s contains every restaurant location key",
    (language) => {
      const localizedKeys = new Set(flatten(readLocale(language)));

      expect(
        GENERAL_SETTINGS_KEYS.filter((key) => !localizedKeys.has(key)),
      ).toEqual([]);
    },
  );
});

describe("dashboard UI locale bundles", () => {
  it.each(DASHBOARD_LANGUAGES)(
    "%s contains every translated dashboard chrome key",
    (language) => {
      const localizedKeys = new Set(flatten(readLocale(language)));

      expect(DASHBOARD_UI_KEYS.filter((key) => !localizedKeys.has(key))).toEqual(
        [],
      );
    },
  );
});
