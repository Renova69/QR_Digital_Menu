import { describe, expect, it } from "vitest";
import { revertFailedOrders } from "../orderStatus";

type Order = { id: string; status: string; name?: string };

describe("revertFailedOrders", () => {
  const previous: Order[] = [
    { id: "a", status: "NEW" },
    { id: "b", status: "NEW" },
    { id: "c", status: "NEW" },
  ];

  it("restores only the failed orders to their previous status", () => {
    // optimistic state: all moved to IN_PROGRESS
    const optimistic: Order[] = previous.map((o) => ({
      ...o,
      status: "IN_PROGRESS",
    }));

    const result = revertFailedOrders(optimistic, previous, ["b"]);

    expect(result.find((o) => o.id === "a")?.status).toBe("IN_PROGRESS");
    expect(result.find((o) => o.id === "b")?.status).toBe("NEW");
    expect(result.find((o) => o.id === "c")?.status).toBe("IN_PROGRESS");
  });

  it("returns the current array unchanged when there are no failures", () => {
    const optimistic: Order[] = previous.map((o) => ({
      ...o,
      status: "SERVED",
    }));

    const result = revertFailedOrders(optimistic, previous, []);

    expect(result).toBe(optimistic);
  });

  it("leaves a failed id untouched when it has no previous snapshot", () => {
    const optimistic: Order[] = [{ id: "z", status: "IN_PROGRESS" }];

    const result = revertFailedOrders(optimistic, previous, ["z"]);

    expect(result.find((o) => o.id === "z")?.status).toBe("IN_PROGRESS");
  });

  it("does not mutate the inputs", () => {
    const optimistic: Order[] = previous.map((o) => ({
      ...o,
      status: "IN_PROGRESS",
    }));
    const snapshot = JSON.stringify(optimistic);

    revertFailedOrders(optimistic, previous, ["a"]);

    expect(JSON.stringify(optimistic)).toBe(snapshot);
  });
});
