import { afterEach, describe, expect, it } from "vitest";
import {
  VANITY_MENU_PATH,
  getResolvedRestaurantId,
  setResolvedRestaurantId,
  subscribeForTest,
} from "./tenantResolution";

afterEach(() => setResolvedRestaurantId(null));

describe("tenantResolution", () => {
  it("stores and returns the resolved id", () => {
    setResolvedRestaurantId("r1");
    expect(getResolvedRestaurantId()).toBe("r1");
  });

  it("clears on null", () => {
    setResolvedRestaurantId("r1");
    setResolvedRestaurantId(null);
    expect(getResolvedRestaurantId()).toBeNull();
  });

  it("notifies subscribers on change", () => {
    let calls = 0;
    const unsubscribe = subscribeForTest(() => calls++);
    setResolvedRestaurantId("r1");
    expect(calls).toBe(1);
    unsubscribe();
  });
});

describe("VANITY_MENU_PATH", () => {
  it.each(["/m/bistro-oranzh", "/m/bistro-oranzh/", "/m/x?table=1"])(
    "matches %s",
    (path) => {
      expect(VANITY_MENU_PATH.test(path)).toBe(true);
    },
  );

  it.each(["/menu/public/r1", "/mixed", "/m", "/"])(
    "does not match %s",
    (path) => {
      expect(VANITY_MENU_PATH.test(path)).toBe(false);
    },
  );
});
