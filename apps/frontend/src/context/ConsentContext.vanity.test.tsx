import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsentProvider, useConsent } from "./ConsentContext";
import { setResolvedRestaurantId } from "../lib/tenantResolution";

vi.mock("../lib/api", () => ({
  getPublicLegalSettings: () =>
    Promise.resolve({
      cookieBannerEnabled: true,
      analyticsCookieEnabled: true,
      policyVersion: 1,
    }),
}));

function Probe() {
  const { storageKey } = useConsent();
  return <span data-testid="key">{storageKey}</span>;
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ConsentProvider>
          <Probe />
        </ConsentProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// For tests that need to call accept()/save()/etc directly rather than only
// read storageKey off the DOM.
type ConsentSnapshot = ReturnType<typeof useConsent>;

function Capture({ onRender }: { onRender: (v: ConsentSnapshot) => void }) {
  const ctx = useConsent();
  onRender(ctx);
  return null;
}

function renderCaptureAt(path: string, onRender: (v: ConsentSnapshot) => void) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <ConsentProvider>
          <Capture onRender={onRender} />
        </ConsentProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  setResolvedRestaurantId(null);
  localStorage.clear();
});

describe("ConsentContext on the vanity route", () => {
  it("keys consent on the resolved restaurant ID, not the slug", async () => {
    setResolvedRestaurantId("rest-123");
    renderAt("/m/bistro-oranzh");
    expect(await screen.findByTestId("key")).toHaveTextContent(
      "consent:restaurant:rest-123",
    );
  });

  it("still keys on the id for the legacy path", async () => {
    renderAt("/menu/public/rest-123");
    expect(await screen.findByTestId("key")).toHaveTextContent(
      "consent:restaurant:rest-123",
    );
  });

  it("falls back to the platform key off-menu", async () => {
    renderAt("/pricing");
    expect(await screen.findByTestId("key")).toHaveTextContent(
      "consent:platform",
    );
  });

  it("suppresses the banner and writes nothing under the platform key while resolution is pending", async () => {
    let captured: ConsentSnapshot | undefined;
    renderCaptureAt("/m/bistro-oranzh", (v) => (captured = v));

    // Nothing published setResolvedRestaurantId yet — this is the pending
    // window a real visitor sits in between navigating to /m/<slug> and the
    // route's resolution request completing.
    await waitFor(() => expect(captured?.storageKey).toBe("consent:pending"));
    expect(captured?.categories).toEqual([]);
    expect(captured?.isBannerVisible).toBe(false);

    // Defensive: even if something invokes accept()/save() while the scope
    // is still ambiguous, nothing gets recorded under consent:platform (or
    // anywhere else the UI would read back later).
    await act(async () => captured?.accept());

    expect(localStorage.getItem("consent:platform")).toBeNull();
    expect(localStorage.getItem("consent:pending")).toBeNull();
  });

  it("resumes restaurant-scoped consent once the store resolves, matching the legacy-path key", async () => {
    let captured: ConsentSnapshot | undefined;
    renderCaptureAt("/m/bistro-oranzh", (v) => (captured = v));

    await waitFor(() => expect(captured?.storageKey).toBe("consent:pending"));

    act(() => setResolvedRestaurantId("rest-999"));

    await waitFor(() =>
      expect(captured?.storageKey).toBe("consent:restaurant:rest-999"),
    );
    // Marketing gating for restaurant-scoped consent isn't wired yet
    // (sub-project B) — same invariant as the legacy /menu/public/:id path,
    // unaffected by how long resolution took.
    expect(captured?.categories).toEqual([]);
    expect(captured?.isBannerVisible).toBe(false);

    // save() bypasses the empty-categories gate directly (same technique the
    // pre-existing ConsentContext.test.tsx uses) to prove the key itself is
    // now restaurant-scoped, not platform- or pending-scoped.
    await act(async () => captured?.save({ marketing: true }));

    expect(localStorage.getItem("consent:restaurant:rest-999")).not.toBeNull();
    expect(localStorage.getItem("consent:platform")).toBeNull();
    expect(localStorage.getItem("consent:pending")).toBeNull();
  });
});
