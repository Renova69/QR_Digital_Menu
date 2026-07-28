import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConsentProvider, useConsent } from "./ConsentContext";

// ConsentProvider calls useQuery(); mock it directly so the test doesn't need
// a real QueryClientProvider (matches AuthContext.test.tsx/TableView.test.tsx
// convention — avoids the monorepo's dual-React resolution issue in jsdom).
let mockSettings: Record<string, unknown> | undefined;
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mockSettings }),
}));

const mockPostConsent = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/api", () => ({
  getPublicLegalSettings: vi.fn(),
  postConsent: (...args: unknown[]) => mockPostConsent(...args),
}));

vi.mock("../lib/visitorId", () => ({
  getVisitorId: () => "visitor-1",
}));

// ── helpers ──────────────────────────────────────────────────────────────────

let store: Record<string, string> = {};
const storageMock = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    store = {};
  },
};

beforeEach(() => {
  store = {};
  mockSettings = undefined;
  mockPostConsent.mockClear();
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
    configurable: true,
  });
});

function ConsentConsumer({
  onRender,
}: {
  onRender: (v: ReturnType<typeof useConsent>) => void;
}) {
  const ctx = useConsent();
  onRender(ctx);
  return null;
}

function renderAt(
  path: string,
  onRender: (v: ReturnType<typeof useConsent>) => void,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ConsentProvider>
        <ConsentConsumer onRender={onRender} />
      </ConsentProvider>
    </MemoryRouter>,
  );
}

// ── ConsentContext ───────────────────────────────────────────────────────────

describe("ConsentContext", () => {
  it("shows no categories and no banner when the cookie banner is disabled", () => {
    mockSettings = { cookieBannerEnabled: false, policyVersion: 1 };
    let captured: any;
    renderAt("/", (v) => (captured = v));

    expect(captured.categories).toEqual([]);
    expect(captured.isBannerVisible).toBe(false);
  });

  it("offers the analytics category on platform pages once enabled", () => {
    mockSettings = {
      cookieBannerEnabled: true,
      analyticsCookieEnabled: true,
      policyVersion: 1,
    };
    let captured: any;
    renderAt("/pricing", (v) => (captured = v));

    expect(captured.categories).toEqual(["analytics"]);
    expect(captured.isBannerVisible).toBe(true);
  });

  it("offers nothing on a restaurant's public menu (marketing gating is sub-project B)", () => {
    mockSettings = {
      cookieBannerEnabled: true,
      analyticsCookieEnabled: true,
      policyVersion: 1,
    };
    let captured: any;
    renderAt("/menu/public/rest-1", (v) => (captured = v));

    expect(captured.restaurantId).toBe("rest-1");
    expect(captured.categories).toEqual([]);
    expect(captured.isBannerVisible).toBe(false);
  });

  it("accept() persists granted state under the platform storage key and logs each category", async () => {
    mockSettings = {
      cookieBannerEnabled: true,
      analyticsCookieEnabled: true,
      policyVersion: 1,
    };
    let captured: any;
    renderAt("/", (v) => (captured = v));

    await act(async () => captured.accept());

    expect(JSON.parse(store["consent:platform"])).toMatchObject({
      analytics: true,
      policyVersion: 1,
    });
    expect(mockPostConsent).toHaveBeenCalledWith({
      restaurantId: undefined,
      visitorId: "visitor-1",
      category: "ANALYTICS",
      granted: true,
      policyVersion: 1,
    });
  });

  it("reject() persists granted:false and hides the banner afterwards", async () => {
    mockSettings = {
      cookieBannerEnabled: true,
      analyticsCookieEnabled: true,
      policyVersion: 1,
    };
    let captured: any;
    renderAt("/", (v) => (captured = v));

    await act(async () => captured.reject());

    expect(JSON.parse(store["consent:platform"])).toMatchObject({
      analytics: false,
      policyVersion: 1,
    });
    expect(captured.isBannerVisible).toBe(false);
  });

  it("re-shows the banner when the stored policy version is stale", () => {
    store["consent:platform"] = JSON.stringify({
      analytics: true,
      policyVersion: 1,
      ts: Date.now(),
    });
    mockSettings = {
      cookieBannerEnabled: true,
      analyticsCookieEnabled: true,
      policyVersion: 2,
    };
    let captured: any;
    renderAt("/", (v) => (captured = v));

    expect(captured.isBannerVisible).toBe(true);
  });

  it("scopes storage keys per restaurant so consent never leaks across restaurants", async () => {
    // Marketing isn't wired yet, so simulate directly via save() to prove the
    // storage key itself is restaurant-scoped.
    mockSettings = { cookieBannerEnabled: true, policyVersion: 1 };
    let captured: any;
    renderAt("/menu/public/rest-1", (v) => (captured = v));

    await act(async () => captured.save({ marketing: true }));

    expect(store["consent:restaurant:rest-1"]).toBeDefined();
    expect(store["consent:platform"]).toBeUndefined();
  });

  it("throws when useConsent is called outside ConsentProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <MemoryRouter>
          <ConsentConsumer onRender={() => {}} />
        </MemoryRouter>,
      ),
    ).toThrow("useConsent must be used within a ConsentProvider");
    spy.mockRestore();
  });
});
