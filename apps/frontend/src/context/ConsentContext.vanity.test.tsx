import { render, screen } from "@testing-library/react";
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

afterEach(() => setResolvedRestaurantId(null));

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
});
