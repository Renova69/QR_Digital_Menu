import { describe, expect, it, vi } from "vitest";
import { configureServiceWorker } from "./serviceWorkerRegistration";

describe("configureServiceWorker", () => {
  it("registers the PWA service worker in production", async () => {
    const register = vi.fn();
    const getRegistrations = vi.fn();
    const deleteCache = vi.fn();
    const logger = { log: vi.fn(), error: vi.fn() };

    await configureServiceWorker({
      serviceWorker: { getRegistrations },
      caches: { keys: vi.fn(), delete: deleteCache },
      isProduction: true,
      register,
      logger,
    });

    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ immediate: true }),
    );
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
  });

  it("unregisters app service workers and clears app caches in development", async () => {
    const unregisterCurrent = vi.fn().mockResolvedValue(true);
    const unregisterOld = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);
    const register = vi.fn();

    await configureServiceWorker({
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([
          { unregister: unregisterCurrent },
          { unregister: unregisterOld },
        ]),
      },
      caches: {
        keys: vi.fn().mockResolvedValue([
          "pos-public-menu-v1",
          "workbox-precache-v2-http://localhost:3001/",
          "other-app-cache",
        ]),
        delete: deleteCache,
      },
      isProduction: false,
      register,
      logger: { log: vi.fn(), error: vi.fn() },
    });

    expect(register).not.toHaveBeenCalled();
    expect(unregisterCurrent).toHaveBeenCalledTimes(1);
    expect(unregisterOld).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith("pos-public-menu-v1");
    expect(deleteCache).toHaveBeenCalledWith(
      "workbox-precache-v2-http://localhost:3001/",
    );
    expect(deleteCache).not.toHaveBeenCalledWith("other-app-cache");
  });
});
