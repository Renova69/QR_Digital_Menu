import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// i18next interpolation variable names are case-sensitive and must match the
// English source exactly. A translated/renamed placeholder (e.g. {{start}} →
// {{début}}, or {{feature}} → {{Feature}}) makes i18next find no matching
// value at runtime and render the raw `{{var}}` template to the user.
const LOCALES = [
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
const LOCALES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../locales",
);

type FlatMap = Record<string, string>;

function flatten(value: unknown, prefix = "", out: FlatMap = {}): FlatMap {
  if (typeof value === "string") {
    out[prefix] = value;
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      flatten(entry, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function interpolationVars(text: string): string[] {
  const matches = text.match(/{{\s*[^}]+?\s*}}/g) ?? [];
  const names = matches.map((token) =>
    token.replace(/[{}]/g, "").split(",")[0].trim(),
  );
  return [...new Set(names)].sort();
}

function readLocale(language: string): FlatMap {
  return flatten(
    JSON.parse(
      readFileSync(resolve(LOCALES_DIR, language, "translation.json"), "utf8"),
    ),
  );
}

const english = readLocale("en");

describe("i18n interpolation variable parity", () => {
  it.each(LOCALES)(
    "%s keeps English {{variable}} names for every shared key",
    (language) => {
      const localized = readLocale(language);
      const drift: string[] = [];

      for (const [key, englishText] of Object.entries(english)) {
        const localizedText = localized[key];
        if (localizedText === undefined) continue; // missing key — separate concern
        const expected = interpolationVars(englishText);
        const actual = interpolationVars(localizedText);
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          drift.push(
            `${key}: EN[${expected.join(",")}] vs ${language.toUpperCase()}[${actual.join(",")}]`,
          );
        }
      }

      expect(drift).toEqual([]);
    },
  );
});
