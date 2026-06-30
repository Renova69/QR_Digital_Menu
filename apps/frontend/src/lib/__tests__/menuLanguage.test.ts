import { describe, expect, it } from "vitest";
import {
  buildPublicMenuLanguages,
  resolveInitialLanguage,
} from "../menuLanguage";

describe("buildPublicMenuLanguages", () => {
  it.each(["bg", "ro", "en"])(
    "uses supported dashboard language %s as the public-menu default",
    (dashboardLanguage) => {
      const languages = buildPublicMenuLanguages(dashboardLanguage, [
        "fr",
        "de",
      ]);

      expect(languages[0]).toBe(dashboardLanguage);
    },
  );

  it("puts the normalized dashboard language first and deduplicates targets", () => {
    expect(buildPublicMenuLanguages("RO-ro", ["en", "ro", "bg"])).toEqual([
      "ro",
      "en",
      "bg",
    ]);
  });

  it("falls back to Bulgarian when the dashboard language is unsupported", () => {
    expect(buildPublicMenuLanguages("fr", ["fr", "en"])).toEqual([
      "bg",
      "en",
      "fr",
    ]);
  });
});

describe("resolveInitialLanguage", () => {
  it("returns the requested language when it is an enabled target language", () => {
    expect(resolveInitialLanguage(["en", "bg", "de"], "bg")).toBe("bg");
  });

  it("falls back to the first target language when no language is requested", () => {
    expect(resolveInitialLanguage(["en", "bg", "de"], null)).toBe("en");
  });

  it("ignores a requested language that is not an enabled target", () => {
    expect(resolveInitialLanguage(["en", "bg"], "fr")).toBe("en");
  });

  it("matches the requested language case-insensitively and returns the canonical code", () => {
    expect(resolveInitialLanguage(["en", "bg", "de"], "DE")).toBe("de");
  });

  it("returns undefined when there are no target languages", () => {
    expect(resolveInitialLanguage([], "bg")).toBeUndefined();
  });
});
