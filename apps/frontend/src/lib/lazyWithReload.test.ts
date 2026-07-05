import { describe, it, expect, beforeEach, vi } from "vitest";

// Fresh module per test so the in-memory `reloadedThisLoad` guard resets.
async function freshModule() {
  vi.resetModules();
  return import("./lazyWithReload");
}

const reloadMock = vi.fn();

beforeEach(() => {
  reloadMock.mockClear();
  window.sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { reload: reloadMock },
  });
});

describe("isChunkLoadError", () => {
  it("matches the stale dynamic-import failure messages", async () => {
    const { isChunkLoadError } = await freshModule();
    expect(
      isChunkLoadError(
        new Error(
          "Failed to fetch dynamically imported module: https://x/assets/BookingConfirmationPage-CeZ4QyIk.js",
        ),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("error loading dynamically imported module")),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("Importing a module script failed.")),
    ).toBe(true);
  });

  it("ignores unrelated errors and non-errors", async () => {
    const { isChunkLoadError } = await freshModule();
    expect(
      isChunkLoadError(new Error("Cannot read properties of undefined")),
    ).toBe(false);
    expect(
      isChunkLoadError("Failed to fetch dynamically imported module"),
    ).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe("reloadOnceForStaleChunk", () => {
  it("reloads once when no recent reload is recorded", async () => {
    const { reloadOnceForStaleChunk } = await freshModule();
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("chunk-reload-ts")).toBeTruthy();
  });

  it("does not reload twice within the same page load (in-memory guard)", async () => {
    const { reloadOnceForStaleChunk } = await freshModule();
    reloadOnceForStaleChunk();
    expect(reloadOnceForStaleChunk()).toBe(false);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("does not reload again within the cooldown across page loads", async () => {
    // Simulate a very recent prior reload persisted in sessionStorage.
    window.sessionStorage.setItem("chunk-reload-ts", String(Date.now()));
    const { reloadOnceForStaleChunk } = await freshModule();
    expect(reloadOnceForStaleChunk()).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("reloads again once the cooldown has elapsed (later deploy)", async () => {
    window.sessionStorage.setItem(
      "chunk-reload-ts",
      String(Date.now() - 60_000),
    );
    const { reloadOnceForStaleChunk } = await freshModule();
    expect(reloadOnceForStaleChunk()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});

describe("withStaleChunkReload", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("passes through a successful import", async () => {
    const { withStaleChunkReload } = await freshModule();
    const mod = { default: () => null };
    const loader = withStaleChunkReload(vi.fn().mockResolvedValue(mod) as any);
    await expect(loader()).resolves.toBe(mod);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("reloads and never resolves on a stale-chunk import failure", async () => {
    const { withStaleChunkReload } = await freshModule();
    const loader = withStaleChunkReload(
      vi
        .fn()
        .mockRejectedValue(
          new Error(
            "Failed to fetch dynamically imported module: /assets/BookingConfirmationPage-CeZ4QyIk.js",
          ),
        ) as any,
    );
    let settled = false;
    void loader().then(
      () => (settled = true),
      () => (settled = true),
    );
    await tick();
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false); // pending until the reload navigates away
  });

  it("propagates a non-chunk error instead of reloading", async () => {
    const { withStaleChunkReload } = await freshModule();
    const loader = withStaleChunkReload(
      vi.fn().mockRejectedValue(new Error("render exploded")) as any,
    );
    await expect(loader()).rejects.toThrow("render exploded");
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("propagates a repeat stale failure inside the cooldown (no loop)", async () => {
    const { withStaleChunkReload } = await freshModule();
    const err = new Error("Failed to fetch dynamically imported module: /x.js");
    const loader = withStaleChunkReload(vi.fn().mockRejectedValue(err) as any);
    // First failure reloads (never resolves); in-memory guard now blocks more.
    void loader();
    await tick();
    expect(reloadMock).toHaveBeenCalledTimes(1);
    // Second failure same page load → guard returns false → error propagates.
    await expect(loader()).rejects.toThrow(
      "Failed to fetch dynamically imported module",
    );
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
