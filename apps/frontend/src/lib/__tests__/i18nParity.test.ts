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
const PUBLIC_ROOTS = [
  "publicMenu",
  "cart",
  "checkout",
  "common",
  "payment",
  "orderConfirmation",
  "feedback",
  "language",
];
const NON_PUBLIC_PREFIXES = ["payment.settings"];
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
    readFileSync(
      resolve(LOCALES_DIR, language, "translation.json"),
      "utf8",
    ),
  );
}

describe("public locale bundles", () => {
  it.each(SUPPORTED_LANGUAGES)(
    "%s contains every customer-facing English key",
    (language) => {
      const englishKeys = flatten(readLocale("en")).filter((key) =>
        PUBLIC_ROOTS.some(
          (root) => key === root || key.startsWith(`${root}.`),
        ) &&
        !NON_PUBLIC_PREFIXES.some(
          (prefix) => key === prefix || key.startsWith(`${prefix}.`),
        ),
      );
      const localizedKeys = new Set(flatten(readLocale(language)));

      expect(
        englishKeys.filter((key) => !localizedKeys.has(key)),
      ).toEqual([]);
    },
  );
});
