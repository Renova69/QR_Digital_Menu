import { describe, expect, it } from "vitest";
import {
  buildTableSessionCheckoutUrl,
  findHostedCheckoutToken,
  hostedCheckoutStorageKey,
  isPublicTableSessionCheckout,
  readTableSessionTokenFromHash,
  stripUrlFragment,
} from "./tableSessionCredential";

describe("table-session checkout credential", () => {
  it("encodes the token only in the URL fragment", () => {
    const url = buildTableSessionCheckoutUrl(
      "https://menu.example/",
      "secret +/token",
    );

    expect(url).toBe(
      "https://menu.example/checkout#session=secret+%2B%2Ftoken",
    );
    expect(new URL(url).search).toBe("");
  });

  it("round-trips encoded tokens from the fragment", () => {
    expect(readTableSessionTokenFromHash("#session=secret+%2B%2Ftoken")).toBe(
      "secret +/token",
    );
  });

  it("rejects missing, query-only, and overlong credentials", () => {
    expect(readTableSessionTokenFromHash("")).toBeNull();
    expect(readTableSessionTokenFromHash("?session=leaked")).toBeNull();
    expect(
      readTableSessionTokenFromHash(`#session=${"x".repeat(257)}`),
    ).toBeNull();
  });

  it("recognizes only a checkout route carrying a valid fragment credential", () => {
    expect(isPublicTableSessionCheckout("/checkout", "#session=token")).toBe(
      true,
    );
    expect(isPublicTableSessionCheckout("/checkout", "")).toBe(false);
    expect(isPublicTableSessionCheckout("/checkout", "?session=leaked")).toBe(
      false,
    );
    expect(isPublicTableSessionCheckout("/orders", "#session=token")).toBe(
      false,
    );
  });

  it("removes the bearer fragment before a third-party payment redirect", () => {
    expect(
      stripUrlFragment(
        "https://menu.example/checkout?payment_intent=pi_1#session=secret",
      ),
    ).toBe("https://menu.example/checkout?payment_intent=pi_1");
  });

  it("recovers the newest valid tab-scoped hosted-checkout marker", () => {
    const entries = new Map([
      [
        hostedCheckoutStorageKey("older-token"),
        JSON.stringify({ token: "older-token", startedAt: 100 }),
      ],
      [
        hostedCheckoutStorageKey("newer-token"),
        JSON.stringify({ token: "newer-token", startedAt: 200 }),
      ],
      [
        hostedCheckoutStorageKey("mismatched-token"),
        JSON.stringify({ token: "different-token", startedAt: 300 }),
      ],
    ]);
    const storage = {
      length: entries.size,
      key: (index: number) => [...entries.keys()][index] ?? null,
      getItem: (key: string) => entries.get(key) ?? null,
    };

    expect(findHostedCheckoutToken(storage)).toBe("newer-token");
  });
});
