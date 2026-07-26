import { describe, expect, it } from "vitest";
import {
  formatLoyaltyExpiryDate,
  groupExpiringPointBatches,
} from "./loyaltyExpiry";

describe("groupExpiringPointBatches", () => {
  it("shows each restaurant-local expiry date with only the points expiring that day", () => {
    const groups = groupExpiringPointBatches(
      [
        {
          points: 50,
          value: 0.33,
          expiresAt: "2026-08-07T15:30:05.725Z",
        },
        {
          points: 62,
          value: 0.41,
          expiresAt: "2026-08-08T08:51:39.745Z",
        },
        {
          points: 488,
          value: 3.25,
          expiresAt: "2026-08-08T09:10:26.471Z",
        },
      ],
      150,
      "Europe/Sofia",
    );

    expect(groups).toEqual([
      {
        dateKey: "2026-08-07",
        expiresAt: "2026-08-07T15:30:05.725Z",
        points: 50,
        value: 0.33,
      },
      {
        dateKey: "2026-08-08",
        expiresAt: "2026-08-08T08:51:39.745Z",
        points: 550,
        value: 3.67,
      },
    ]);
  });
});

describe("formatLoyaltyExpiryDate", () => {
  it("uses an unambiguous long month name in Bulgarian", () => {
    expect(
      formatLoyaltyExpiryDate(
        "2026-08-07T15:30:05.725Z",
        "bg",
        "Europe/Sofia",
      ),
    ).toBe("7 август 2026 г.");
  });
});
