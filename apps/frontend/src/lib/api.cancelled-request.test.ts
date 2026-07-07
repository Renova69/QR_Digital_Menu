import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { logApiError } from "./clientLogger";

vi.mock("./clientLogger", () => ({
  logApiError: vi.fn(),
}));

describe("api cancelled requests", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("rejects cancelled requests without logging them as API errors", async () => {
    const { default: api } = await import("./api");
    const cancelled = new axios.CanceledError("request cancelled");
    api.defaults.adapter = vi.fn(async () => Promise.reject(cancelled));

    await expect(api.get("/menu/public/restaurant-1/items")).rejects.toBe(
      cancelled,
    );

    expect(logApiError).not.toHaveBeenCalled();
  });
});
