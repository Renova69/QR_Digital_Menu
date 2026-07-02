import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type HeaderEntry = { key: string; value: string };

describe("frontend production security headers (M-AUTH-3)", () => {
  const config = JSON.parse(
    readFileSync(resolve(process.cwd(), "../../vercel.json"), "utf8"),
  ) as {
    headers: Array<{ source: string; headers: HeaderEntry[] }>;
  };
  const headers = config.headers.flatMap((entry) => entry.headers);
  const header = (name: string) =>
    headers.find((entry) => entry.key.toLowerCase() === name.toLowerCase())
      ?.value;

  it("enforces CSP, reports violations, and allowlists every supported payment flow", () => {
    expect(header("Content-Security-Policy-Report-Only")).toBeUndefined();

    const policy = header("Content-Security-Policy");
    expect(policy).toBeTruthy();
    expect(policy).toContain("report-uri /api/v1/client-logs/csp");

    // Stripe.js / Payment Element requirements.
    expect(policy).toContain("https://api.stripe.com");
    expect(policy).toContain("https://js.stripe.com");
    expect(policy).toContain("https://*.js.stripe.com");
    expect(policy).toContain("https://hooks.stripe.com");
    expect(policy).toContain("https://link.com");
    expect(policy).toContain("https://*.link.com");

    // Hosted form providers supported by PaymentModal.
    for (const origin of [
      "https://demo.epay.bg",
      "https://www.epay.bg",
      "https://3dsgate-dev.borica.bg",
      "https://3dsgate.borica.bg",
      "https://www.mypos.com",
    ]) {
      expect(policy).toContain(origin);
    }

    // No scheme-wide websocket escape hatch.
    const connectSources =
      policy
        ?.split(";")
        .map((directive) => directive.trim())
        .find((directive) => directive.startsWith("connect-src "))
        ?.split(/\s+/)
        .slice(1) ?? [];
    expect(connectSources).not.toContain("ws:");
    expect(connectSources).not.toContain("wss:");
    expect(policy).toContain(
      "wss://qr-menu-backend-822584248302.europe-west1.run.app",
    );
  });
});
