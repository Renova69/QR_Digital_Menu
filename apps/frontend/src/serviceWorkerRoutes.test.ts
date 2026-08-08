import { describe, expect, it } from "vitest";

import { SPA_NAVIGATION_DENYLIST } from "./serviceWorkerRoutes";

const isDenied = (path: string) =>
  SPA_NAVIGATION_DENYLIST.some((pattern) => pattern.test(path));

describe("SPA navigation fallback", () => {
  it.each([
    "/docs",
    "/docs/",
    "/docs?source=app",
    "/docs/getting-started",
  ])(
    "does not capture the proxied documentation path %s",
    (path) => {
      expect(isDenied(path)).toBe(true);
    },
  );

  it("continues to handle frontend routes", () => {
    expect(isDenied("/dashboard")).toBe(false);
  });
});
