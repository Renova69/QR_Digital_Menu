import { describe, expect, it, vi } from "vitest";
import { persistDashboardLanguage } from "./dashboardLanguage";

describe("persistDashboardLanguage", () => {
  it("rolls the UI language back and does not refresh when persistence fails", async () => {
    const changeLanguage = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockRejectedValue(new Error("network down"));
    const refresh = vi.fn();

    await expect(
      persistDashboardLanguage({
        restaurantId: "rest-1",
        nextLanguage: "bg",
        previousLanguage: "en",
        changeLanguage,
        update,
        refresh,
      }),
    ).rejects.toThrow("network down");

    expect(changeLanguage.mock.calls).toEqual([["bg"], ["en"]]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes restaurant state after the language is saved", async () => {
    const changeLanguage = vi.fn().mockResolvedValue(undefined);
    const update = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    await persistDashboardLanguage({
      restaurantId: "rest-1",
      nextLanguage: "ro",
      previousLanguage: "en",
      changeLanguage,
      update,
      refresh,
    });

    expect(update).toHaveBeenCalledWith("rest-1", {
      dashboardLanguage: "ro",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
