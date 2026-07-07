import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ENGLISH_LOCALE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../locales/en/translation.json",
);

describe("reservation preference terminology", () => {
  it("describes intolerances without promising allergen-free food", () => {
    const locale = JSON.parse(readFileSync(ENGLISH_LOCALE, "utf8"));

    expect(locale.reservations.preferences.GLUTEN_INTOLERANT).toBe(
      "Gluten Intolerant",
    );
    expect(locale.reservations.preferences.LACTOSE_INTOLERANT).toBe(
      "Lactose Intolerant",
    );
  });
});
