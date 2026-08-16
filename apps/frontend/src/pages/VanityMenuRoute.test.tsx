import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

// Renders the router's live pathname+search into the DOM so a redirect can
// be asserted against the actual current location instead of
// `window.location`, which MemoryRouter never touches (a check against it
// would be trivially true regardless of what the app actually navigated to).
function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
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

  // ConsentContext keys cookie consent by the id this store publishes. A
  // stale id surviving navigation would key one restaurant's consent under
  // another's, so both directions of "leaves it null" need direct coverage,
  // not just inference from reading the source.
  it("clears the resolved id from the store on unmount", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    const { unmount } = renderAt("/m/bistro-oranzh");
    await waitFor(() => expect(getResolvedRestaurantId()).toBe("r1"));

    unmount();

    expect(getResolvedRestaurantId()).toBeNull();
  });

  it("never publishes an id for an unknown slug", async () => {
    resolveMenuSlug.mockRejectedValue({ response: { status: 404 } });
    renderAt("/m/nope");
    await screen.findByRole("alert");
    expect(getResolvedRestaurantId()).toBeNull();
  });

  it("never publishes an id for a tombstoned slug", async () => {
    resolveMenuSlug.mockRejectedValue({ response: { status: 410 } });
    renderAt("/m/gone");
    await screen.findByRole("alert");
    expect(getResolvedRestaurantId()).toBeNull();
  });

  // A customer scanning a table QR must not lose their table context when
  // an alias or a mis-cased slug gets rewritten to the canonical one —
  // dropping `?table=` here would leave their order with nowhere to go.
  it("preserves the query string when rewriting an alias", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    renderAt("/m/old-name?table=5");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/m/bistro-oranzh?table=5",
      ),
    );
  });

  it("preserves the query string when normalizing an uppercase slug", async () => {
    resolveMenuSlug.mockResolvedValue({
      restaurantId: "r1",
      canonicalSlug: "bistro-oranzh",
    });
    renderAt("/m/BISTRO-ORANZH?table=5");
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/m/bistro-oranzh?table=5",
      ),
    );
  });
});
