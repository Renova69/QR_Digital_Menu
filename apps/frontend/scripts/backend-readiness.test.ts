import { describe, expect, it, vi } from "vitest";
import { getBackendReadinessUrl, waitForBackend } from "./backend-readiness.js";

describe("backend development readiness", () => {
  it("builds the readiness endpoint from the configured API URL", () => {
    expect(getBackendReadinessUrl("http://localhost:3000/api")).toBe(
      "http://localhost:3000/api/v1/platform-settings/public",
    );
    expect(getBackendReadinessUrl("https://api.example.com/api/")).toBe(
      "https://api.example.com/api/v1/platform-settings/public",
    );
  });

  it("keeps startup blocked until the backend returns a successful response", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    let currentTime = 0;
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });

    await expect(
      waitForBackend({
        url: "http://localhost:3000/api/v1/platform-settings/public",
        timeoutMs: 5_000,
        intervalMs: 100,
        requestTimeoutMs: 1_000,
        fetchImpl,
        now: () => currentTime,
        sleep,
      }),
    ).resolves.toEqual({ attempts: 3 });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("fails clearly instead of exposing Vite when readiness never succeeds", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    let currentTime = 0;

    await expect(
      waitForBackend({
        url: "http://localhost:3000/api/v1/platform-settings/public",
        timeoutMs: 250,
        intervalMs: 100,
        requestTimeoutMs: 1_000,
        fetchImpl,
        now: () => currentTime,
        sleep: async (milliseconds: number) => {
          currentTime += milliseconds;
        },
      }),
    ).rejects.toThrow(
      "Backend did not become ready within 250ms (last error: ECONNREFUSED)",
    );
  });
});
