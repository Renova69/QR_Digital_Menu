import { describe, expect, it } from "vitest";
import { treatServerErrorsAsFailures } from "./swCachePlugins";

const respond = (status: number) => ({ status }) as unknown as Response;

describe("treatServerErrorsAsFailures", () => {
  it("rejects 5xx so NetworkFirst falls back to the cached menu", async () => {
    // The bug this exists for: a 500 is a fulfilled response, so without this
    // the cache is skipped and the guest sees an error instead of the menu.
    await expect(
      treatServerErrorsAsFailures.fetchDidSucceed({ response: respond(500) }),
    ).rejects.toThrow("Upstream returned 500");

    await expect(
      treatServerErrorsAsFailures.fetchDidSucceed({ response: respond(503) }),
    ).rejects.toThrow("Upstream returned 503");
  });

  it("passes 4xx through — a deleted or disabled menu is a real answer", async () => {
    await expect(
      treatServerErrorsAsFailures.fetchDidSucceed({ response: respond(404) }),
    ).resolves.toEqual(respond(404));

    await expect(
      treatServerErrorsAsFailures.fetchDidSucceed({ response: respond(403) }),
    ).resolves.toEqual(respond(403));
  });

  it("passes successful responses through untouched", async () => {
    const ok = respond(200);
    await expect(
      treatServerErrorsAsFailures.fetchDidSucceed({ response: ok }),
    ).resolves.toBe(ok);
  });
});
