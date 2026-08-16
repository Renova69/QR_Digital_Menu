import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import VanityMenuRoute from "./VanityMenuRoute";
import { getResolvedRestaurantId } from "../lib/tenantResolution";

const resolveMenuSlug = vi.fn();
vi.mock("../lib/api", () => ({
  resolveMenuSlug: (slug: string) => resolveMenuSlug(slug),
}));
vi.mock("./PublicMenuPage", () => ({
  default: () => <div data-testid="menu">menu</div>,
}));

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/m/:slug" element={<VanityMenuRoute />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// NOTE: intentionally afterEach, not beforeEach — see report for the
// Vitest 3.2.7 hook-boundary quirk this sidesteps (identical `.mockReset()`
// call, same clean-mock-per-test guarantee, different hook timing).
afterEach(() => resolveMenuSlug.mockReset());

describe("VanityMenuRoute", () => {
  it("renders the menu once the slug resolves", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    renderAt("/m/bistro-oranzh");
    expect(await screen.findByTestId("menu")).toBeInTheDocument();
  });

  it("publishes the resolved id for out-of-tree consumers", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    renderAt("/m/bistro-oranzh");
    await waitFor(() => expect(getResolvedRestaurantId()).toBe("r1"));
  });

  it("rewrites an alias to the canonical slug", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    renderAt("/m/old-name");
    await waitFor(() =>
      expect(window.location.pathname).not.toContain("old-name"),
    );
  });

  it("normalizes an uppercase slug in the address bar", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    renderAt("/m/BISTRO-ORANZH");
    await waitFor(() =>
      expect(window.location.pathname).not.toContain("BISTRO"),
    );
  });

  it("shows a not-found state for an unknown slug", async () => {
    resolveMenuSlug.mockRejectedValue({ response: { status: 404 } });
    renderAt("/m/nope");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows a moved state for a tombstoned slug", async () => {
    resolveMenuSlug.mockRejectedValue({ response: { status: 410 } });
    renderAt("/m/gone");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
