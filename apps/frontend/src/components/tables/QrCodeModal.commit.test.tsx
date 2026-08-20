import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QrCodeModal from "./QrCodeModal";

const commitRestaurantSlug = vi.fn();
vi.mock("../../lib/api", () => ({
  commitRestaurantSlug: (id: string) => commitRestaurantSlug(id),
}));

// jsdom has no canvas backend (no native `canvas` package installed), so
// letting qrcode.react actually draw would throw "not implemented" from
// inside its render effect. The real drawing logic isn't what this suite is
// testing — the precondition gating is — so replace both exports with cheap
// stand-ins that keep the DOM hooks (data-testid, a real <canvas> element)
// QrCodeModal itself relies on.
vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div>{value}</div>,
  QRCodeCanvas: () => <canvas />,
}));

const restaurant = { id: "r1", name: "Bistro", slug: "bistro-oranzh" } as any;
const target = { name: "5", type: "TABLE" } as any;

function renderModal() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false, gcTime: 0, networkMode: "always" },
          },
        })
      }
    >
      <QrCodeModal
        open
        onOpenChange={() => {}}
        restaurant={restaurant}
        target={target}
        logoDataUrl={null}
      />
    </QueryClientProvider>,
  );
}

// TanStack Query's retryer attaches its own handler to the queryFn's
// rejected promise a tick later than jsdom's unhandledrejection check runs,
// so the rejection scenario below can otherwise fail on a false-positive
// "unhandled rejection" that has nothing to do with the assertions in the
// test. A listener that calls preventDefault() is the standard way to tell
// jsdom "yes, something is handling this" — TanStack Query still gets the
// rejection and QrCodeModal still reaches its real error state.
window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
});

beforeEach(() => {
  commitRestaurantSlug.mockReset();
});

describe("QrCodeModal commit precondition", () => {
  it("commits the slug when opened", async () => {
    commitRestaurantSlug.mockResolvedValue({
      slug: "bistro-oranzh",
      committedAt: "2026-08-15T00:00:00Z",
    });
    renderModal();
    await waitFor(() =>
      expect(commitRestaurantSlug).toHaveBeenCalledWith("r1"),
    );
  });

  it("does not render the QR before commit resolves", () => {
    // A promise that never settles at all (rather than one resolved after
    // the assertions) leaves TanStack Query's retryer permanently in-flight,
    // which hangs this test's teardown until the runner's hook timeout kills
    // it. Resolving after the synchronous assertion below keeps the same
    // "still loading" moment under test while letting the query — and the
    // test — finish cleanly.
    let resolvePending: (value: unknown) => void = () => {};
    commitRestaurantSlug.mockReturnValue(
      new Promise((resolve) => {
        resolvePending = resolve;
      }),
    );
    const { unmount } = renderModal();
    expect(screen.queryByTestId("qr-canvas")).not.toBeInTheDocument();
    unmount();
    resolvePending({
      slug: "bistro-oranzh",
      committedAt: "2026-08-15T00:00:00Z",
    });
  });

  it("renders the QR after commit succeeds", async () => {
    commitRestaurantSlug.mockResolvedValue({
      slug: "bistro-oranzh",
      committedAt: "2026-08-15T00:00:00Z",
    });
    renderModal();
    expect(await screen.findByTestId("qr-canvas")).toBeInTheDocument();
  });

  // The whole point: a QR against the permanent legacy URL is strictly
  // better than no QR at all — that URL carries no slug segment, so it can
  // never go stale.
  it("falls back to the legacy id URL when the deployed backend has no commit endpoint", async () => {
    commitRestaurantSlug.mockRejectedValue({
      message: "Request failed with status code 404",
      response: { status: 404 },
    });
    renderModal();
    // QrCodeModal's query retries once with the library's default backoff
    // (~1s) before settling into the error state, so give findByTestId more
    // headroom than RTL's 1s default.
    expect(
      await screen.findByTestId("qr-canvas", {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    // QRCodeSVG is mocked to render its `value` prop as plain text — assert
    // the fallback is the slug-less legacy URL, never the restaurant's
    // (possibly still-uncommitted) slug off the prop.
    expect(
      screen.getByText((content) =>
        content.includes("/menu/public/r1?table=5"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
