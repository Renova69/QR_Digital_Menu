import { describe, expect, it } from "vitest";
import { buildMenuReturnUrl, normalizeRestaurantId } from "./menuUrl";
import { getMenuPath, getMenuUrl, getMenuUrlPrefix } from "./menuUrl";

describe("menuUrl", () => {
  it.each([undefined, null, "", "   ", "undefined", "UNDEFINED", "null"])(
    "rejects an invalid restaurant ID: %s",
    (restaurantId) => {
      expect(normalizeRestaurantId(restaurantId)).toBeNull();
      expect(buildMenuReturnUrl(restaurantId)).toBe("/");
    },
  );

  it("builds a table menu URL from a normalized restaurant ID", () => {
    expect(buildMenuReturnUrl(" rest-1 ", "Table 7")).toBe(
      "/menu/public/rest-1?table=Table%207",
    );
  });

  // Finding #3: buildMenuReturnUrl gained an optional trailing slug param
  // routed through getMenuPath — every existing 3-arg call site above must
  // keep resolving to the legacy path exactly as before.
  it("prefers the vanity path when a slug is supplied", () => {
    expect(buildMenuReturnUrl("rest-1", "Table 7", null, "bistro-oranzh")).toBe(
      "/m/bistro-oranzh?table=Table%207",
    );
  });

  it("falls back to the legacy path when no slug is supplied", () => {
    expect(buildMenuReturnUrl("rest-1", "Table 7", null, null)).toBe(
      "/menu/public/rest-1?table=Table%207",
    );
  });

  it("falls back to the legacy path when slug is simply omitted", () => {
    expect(buildMenuReturnUrl("rest-1", null, "sp-token")).toBe(
      "/menu/public/rest-1?sp=sp-token",
    );
  });
});

describe("getMenuPath", () => {
  const withSlug = { id: "r1", slug: "bistro-oranzh" };
  const withoutSlug = { id: "r1", slug: null };

  it("prefers the vanity path when a slug exists", () => {
    expect(getMenuPath(withSlug)).toBe("/m/bistro-oranzh");
  });

  // Restaurant.slug stays nullable until a later migration, so every consumer
  // must tolerate null.
  it("falls back to the legacy id path when there is no slug", () => {
    expect(getMenuPath(withoutSlug)).toBe("/menu/public/r1");
  });

  it("appends an encoded table name", () => {
    expect(getMenuPath(withSlug, { table: "Table 7" })).toBe(
      "/m/bistro-oranzh?table=Table%207",
    );
  });

  it("appends an encoded service point token", () => {
    expect(getMenuPath(withSlug, { servicePointToken: "tok en" })).toBe(
      "/m/bistro-oranzh?sp=tok%20en",
    );
  });

  // P0-2: the QR must carry the table's publicToken, because the table *name*
  // is guessable and no longer opens a session on its own.
  it("appends the table token alongside the display name", () => {
    expect(
      getMenuPath(withSlug, { table: "Table 7", tableToken: "tok en" }),
    ).toBe("/m/bistro-oranzh?table=Table%207&t=tok%20en");
  });

  it("omits the token for tables that predate the backfill", () => {
    expect(getMenuPath(withSlug, { table: "Table 7", tableToken: null })).toBe(
      "/m/bistro-oranzh?table=Table%207",
    );
  });

  it("prefers table over service point when both are supplied", () => {
    expect(getMenuPath(withSlug, { table: "5", servicePointToken: "t" })).toBe(
      "/m/bistro-oranzh?table=5",
    );
  });

  it("returns / for an unusable restaurant id and no slug", () => {
    expect(getMenuPath({ id: "undefined", slug: null })).toBe("/");
  });
});

describe("getMenuUrl", () => {
  it("builds an absolute URL from an explicit origin", () => {
    expect(
      getMenuUrl(
        { id: "r1", slug: "bistro-oranzh" },
        { table: "3" },
        "https://x.bg",
      ),
    ).toBe("https://x.bg/m/bistro-oranzh?table=3");
  });
});

// The rename dialog in GeneralSettingsTab.tsx shows this as static label
// text next to an editable slug input — it must own the "/m/" literal
// rather than have that composed a second time at the call site.
describe("getMenuUrlPrefix", () => {
  it("composes origin + the branded path prefix with no slug segment", () => {
    expect(getMenuUrlPrefix("https://x.bg")).toBe("https://x.bg/m/");
  });

  it("is consistent with getMenuUrl's own path shape for a given slug", () => {
    const prefix = getMenuUrlPrefix("https://x.bg");
    const full = getMenuUrl(
      { id: "r1", slug: "bistro-oranzh" },
      {},
      "https://x.bg",
    );
    expect(full).toBe(`${prefix}bistro-oranzh`);
  });
});

// TableView.tsx (#M14) treats `restaurant` as possibly null while the
// dashboard context resolves; every deref there uses `?.`. getMenuPath/
// getMenuUrl are called with the whole restaurant object at several call
// sites, so the seam itself must tolerate a null/undefined restaurant
// instead of relying on every caller to guard.
describe("getMenuPath / getMenuUrl with a missing restaurant", () => {
  it("returns / for a null restaurant", () => {
    expect(getMenuPath(null)).toBe("/");
  });

  it("returns / for an undefined restaurant", () => {
    expect(getMenuPath(undefined)).toBe("/");
  });

  it("does not throw and returns a sane absolute URL for a null restaurant", () => {
    expect(() => getMenuUrl(null, {}, "https://x.bg")).not.toThrow();
    expect(getMenuUrl(null, {}, "https://x.bg")).toBe("https://x.bg/");
  });

  it("ignores the target and returns / for a null restaurant with a table", () => {
    expect(getMenuPath(null, { table: "5" })).toBe("/");
  });
});
