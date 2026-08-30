import { describe, expect, it } from "vitest";
import bgTranslation from "../../locales/bg/translation.json";
import enTranslation from "../../locales/en/translation.json";

describe("PIN login hours copy", () => {
  it("describes the configured range as an allowed window", () => {
    expect(enTranslation.staff.pinLoginHoursDesc).toContain(
      "allowed only within",
    );
    expect(enTranslation.staff.restrictPinLoginHours).toBe(
      "Allow PIN login only during these hours",
    );
    expect(bgTranslation.staff.restrictPinLoginHours).toContain(
      "Разреши вход с ПИН само",
    );
    expect(enTranslation.staff.pinLoginOvernightSummary).toContain(
      "Ends next day",
    );
    expect(bgTranslation.staff.pinLoginOvernightSummary).toContain(
      "следващия ден",
    );
  });
});
