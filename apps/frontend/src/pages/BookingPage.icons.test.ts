import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
// Regional-indicator letters compose country flags (e.g. the phone-prefix
// picker). Flags have no Lucide equivalent, so they're allowed — strip them out
// before asserting no *decorative* emoji glyphs remain.
const FLAG_PATTERN = /[\u{1F1E6}-\u{1F1FF}]/gu;

describe("public reservation iconography", () => {
  it("uses component icons instead of decorative emoji glyphs", () => {
    for (const file of ["BookingPage.tsx", "BookingConfirmationPage.tsx"]) {
      const source = readFileSync(
        resolve(process.cwd(), "src/pages", file),
        "utf8",
      ).replace(FLAG_PATTERN, "");

      expect(source, file).not.toMatch(EMOJI_PATTERN);
    }
  });
});
