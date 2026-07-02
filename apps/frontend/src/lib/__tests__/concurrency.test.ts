import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "../concurrency";

describe("runWithConcurrency (L-TRANS-3)", () => {
  it("processes every item exactly once", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const seen: number[] = [];
    await runWithConcurrency(items, 3, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  it("never exceeds the concurrency limit in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 12 }, (_, i) => i);
    await runWithConcurrency(items, 4, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1); // actually ran in parallel
  });

  it("does not reject and keeps going when a worker throws", async () => {
    const done: number[] = [];
    await expect(
      runWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        done.push(n);
      }),
    ).resolves.toBeUndefined();
    expect(done.sort((a, b) => a - b)).toEqual([1, 3]);
  });

  it("handles an empty list", async () => {
    let calls = 0;
    await runWithConcurrency([], 4, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});
