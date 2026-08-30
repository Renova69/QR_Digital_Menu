import { describe, expect, it } from "vitest";

import { getTwentyFourHourWindow } from "./twentyFourHourTime";

describe("getTwentyFourHourWindow", () => {
  it("identifies an end-before-start range as an overnight window", () => {
    expect(getTwentyFourHourWindow("15:36", "15:34")).toEqual({
      crossesMidnight: true,
      durationMinutes: 23 * 60 + 58,
    });
  });

  it("keeps a normal same-day window on the same day", () => {
    expect(getTwentyFourHourWindow("15:00", "16:00")).toEqual({
      crossesMidnight: false,
      durationMinutes: 60,
    });
  });
});
