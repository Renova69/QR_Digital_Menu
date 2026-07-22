import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./clientLogger", () => ({
  logApiError: vi.fn(),
}));

describe("payment reconciliation API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("uses the persistent queue and resolution endpoints with typed payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const module = await import("./api");
    const requests: any[] = [];
    module.default.defaults.adapter = vi.fn(async (config: any) => {
      requests.push(config);
      return {
        data:
          config.method === "get" ? [] : { id: "issue-1", status: "RESOLVED" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        request: {},
      };
    });

    await module.getPaymentReconciliationIssues("restaurant-1", "OPEN");
    await module.resolvePaymentReconciliationIssue("issue-1", {
      status: "RESOLVED",
      note: "Matched against settlement.",
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      method: "get",
      url: "/payments/reconciliation/restaurant-1",
      params: { status: "OPEN" },
    });
    expect(requests[1]).toMatchObject({
      method: "post",
      url: "/payments/reconciliation/issues/issue-1/resolve",
    });
    expect(JSON.parse(requests[1].data)).toEqual({
      status: "RESOLVED",
      note: "Matched against settlement.",
    });
  });
});
