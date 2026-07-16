import { describe, expect, it } from "vitest";
import { buildMenuReturnUrl, normalizeRestaurantId } from "./menuUrl";

describe("menuUrl", () => {
  it.each([undefined, null, "", "   ", "undefined", "UNDEFINED", "null"])(
    "rejects an invalid restaurant ID: %s",
    (restaurantId) => {
      expect(normalizeRestaurantId(restaurantId)).toBeNull();
      expect(buildMenuReturnUrl(restaurantId)).toBe("/");
    },
  );

  it("builds a table menu URL from a normalized restaurant ID", () => {
    expect(buildMenuReturnUrl(" rest-1 ", "Table 7")).toBe(
      "/menu/public/rest-1?table=Table%207",
    );
  });
});
