import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

describe("public reservation iconography", () => {
  it("uses component icons instead of emoji glyphs", () => {
    for (const file of ["BookingPage.tsx", "BookingConfirmationPage.tsx"]) {
      const source = readFileSync(
        resolve(process.cwd(), "src/pages", file),
        "utf8",
      );

      expect(source, file).not.toMatch(EMOJI_PATTERN);
    }
  });
});
