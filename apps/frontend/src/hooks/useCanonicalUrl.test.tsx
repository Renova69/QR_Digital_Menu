import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useCanonicalUrl } from "./useCanonicalUrl";

function canonicalLinks() {
  return document.head.querySelectorAll('link[rel="canonical"]');
}

afterEach(() => {
  canonicalLinks().forEach((link) => link.remove());
});

describe("useCanonicalUrl", () => {
  it("adds a canonical link", () => {
    renderHook(() => useCanonicalUrl("https://x.bg/m/bistro-oranzh"));
    expect(canonicalLinks()).toHaveLength(1);
    expect(canonicalLinks()[0].getAttribute("href")).toBe(
      "https://x.bg/m/bistro-oranzh",
    );
  });

  it("updates in place rather than appending a second link", () => {
    const { rerender } = renderHook(({ url }) => useCanonicalUrl(url), {
      initialProps: { url: "https://x.bg/m/a" },
    });
    rerender({ url: "https://x.bg/m/b" });
    expect(canonicalLinks()).toHaveLength(1);
    expect(canonicalLinks()[0].getAttribute("href")).toBe("https://x.bg/m/b");
  });

  it("removes the link it created on unmount", () => {
    const { unmount } = renderHook(() => useCanonicalUrl("https://x.bg/m/a"));
    unmount();
    expect(canonicalLinks()).toHaveLength(0);
  });

  it("does nothing when given null", () => {
    renderHook(() => useCanonicalUrl(null));
    expect(canonicalLinks()).toHaveLength(0);
  });
});
