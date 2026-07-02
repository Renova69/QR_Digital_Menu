import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./clientLogger", () => ({
  logApiError: vi.fn(),
}));

const headerValue = (headers: any, name: string) =>
  headers?.[name] ?? headers?.get?.(name) ?? headers?.get?.(name.toLowerCase());

describe("table-session credential transport (M-PAY-1)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("keeps the bearer-like session token out of every payment request URL", async () => {
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
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
        request: {},
      };
    });

    const token = "cm-session-secret";
    await module.getSessionBill(token, "bg");
    await module.createPaymentIntent(token, 10);
    await module.createCheckout(token, { provider: "STRIPE" });
    await module.createCashPaymentRequest(token, { restaurantId: "rest-1" });
    await module.abandonCheckout(token);
    await module.closeSession(token, "rest-1");
    await module.closeSessionWithCard(token, "rest-1");
    await module.closeSessionWithCash(token, "rest-1");
    await module.settlePartial(token, {
      restaurantId: "rest-1",
      mode: "CUSTOM",
      provider: "CASH",
      amount: 5,
    });

    expect(requests).toHaveLength(9);
    expect(requests.map((request) => request.url)).toEqual([
      "/payments/session/bill",
      "/payments/session/intent",
      "/payments/session/checkout",
      "/payments/session/cash-request",
      "/payments/session/abandon",
      "/payments/session/close",
      "/payments/session/close-card",
      "/payments/session/close-cash",
      "/payments/session/settle-partial",
    ]);
    for (const request of requests) {
      expect(request.url).not.toContain(token);
      expect(headerValue(request.headers, "X-Table-Session-Token")).toBe(token);
    }
  });
});
