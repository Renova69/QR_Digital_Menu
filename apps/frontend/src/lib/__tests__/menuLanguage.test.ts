import { describe, expect, it } from "vitest";
import { resolveInitialLanguage } from "../menuLanguage";

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
