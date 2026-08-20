import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./clientLogger", () => ({
  logApiError: vi.fn(),
}));

// Finding #2 (final-branch review): the 401 interceptor's exempt-path list
// already covered the legacy `/menu/public` route but not the new `/m/:slug`
// vanity route, so a customer who mistyped their OTP on a branded menu URL
// got hard-redirected to `/login` — losing cart and table context — instead
// of seeing the inline error the legacy route already showed.
describe("401 interceptor public-path exemption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  function stubCsrfFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  }

  function make401Adapter() {
    return vi.fn(async (config: any) => {
      const error: any = new Error("Unauthorized");
      error.config = config;
      error.response = { status: 401, data: {} };
      error.isAxiosError = true;
      throw error;
    });
  }

  it("does not hard-redirect off a vanity menu URL on a 401", async () => {
    stubCsrfFetch();
    window.history.pushState({}, "", "/m/bistro-oranzh?table=5");

    const module = await import("./api");
    module.default.defaults.adapter = make401Adapter();

    await expect(
      module.default.post("/auth/otp/verify", { code: "000000" }),
    ).rejects.toBeTruthy();

    // Same guarantee the legacy /menu/public/:id path already had — losing
    // this would eject the customer to the merchant login page mid-order.
    expect(window.location.pathname).toBe("/m/bistro-oranzh");
  });
});
