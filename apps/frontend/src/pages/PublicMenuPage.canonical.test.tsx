import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicMenuPage from "./PublicMenuPage";

// Behavioral test (not a source scan): renders the real PublicMenuPage tree
// with its data hook mocked, and asserts the actual emitted
// <link rel="canonical"> href — the only thing that matters for a canonical
// tag is that it resolves to the correct URL, which a source-grep cannot
// verify.
// Kept in sync with DEFAULT_SLUG below by hand: vi.hoisted() factories run
// before any other top-level statement, so this can't reference a later
// plain `const` without hitting a temporal-dead-zone ReferenceError.
const menuData = vi.hoisted(() => ({
  menuMeta: {
    restaurant: {
      name: "Test Bistro",
      slug: "test-bistro",
      tier: "FREE",
      features: [] as string[],
      paymentsEnabled: false,
      menuSourceLanguage: "bg",
      targetLanguages: [] as string[],
      defaultTheme: "light",
    },
    categories: [] as any[],
  },
  loadedItemsMap: {} as Record<string, any[] | null>,
  setLoadedItemsMap: vi.fn(),
  loading: false,
  error: null as string | null,
  selectedLang: "bg",
  activeLanguageRef: { current: "bg" },
  changeLanguage: vi.fn(),
  allLoadedItems: [] as any[],
}));
vi.mock("../hooks/usePublicMenuData", () => ({
  usePublicMenuData: () => menuData,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const cartMocks = vi.hoisted(() => ({
  setTableNumber: vi.fn(),
  // P0-2: the page reads the table's publicToken from the QR's `?t=` param
  // and hands it to the cart, which forwards it on order/assistance calls.
  tableToken: null,
  setTableToken: vi.fn(),
  setOrderLocation: vi.fn(),
  orderLocation: null,
  pruneInvalidItems: vi.fn(() => 0),
  clearCart: vi.fn(),
}));
vi.mock("../context/CartContext", () => ({ useCart: () => cartMocks }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, logout: vi.fn() }),
}));
vi.mock("../context/SocketContext", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));

vi.mock("../components/menu/TopBar", () => ({ TopBar: () => null }));
vi.mock("../components/menu/ItemWithOptions", () => ({
  ItemWithOptions: () => null,
}));
vi.mock("../components/menu/FilterPanel", () => ({ FilterPanel: () => null }));
vi.mock("../components/menu/TrendingCarousel", () => ({
  TrendingCarousel: () => null,
}));
vi.mock("../components/menu/CategoryPills", () => ({
  CategoryPills: () => null,
}));
vi.mock("../components/menu/SocialBar", () => ({ default: () => null }));
vi.mock("../components/menu/Footer", () => ({ default: () => null }));
vi.mock("../components/cart/CartIcon", () => ({ default: () => null }));
vi.mock("../components/payment/PaymentModal", () => ({
  PaymentModal: () => null,
}));
vi.mock("../components/auth/CustomerLoginModal", () => ({
  CustomerLoginModal: () => null,
}));

function canonicalLinks() {
  return document.head.querySelectorAll('link[rel="canonical"]');
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/menu/public/:restaurantId" element={<PublicMenuPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // jsdom lacks IntersectionObserver (used for scroll-spy category nav).
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const DEFAULT_SLUG = "test-bistro";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  canonicalLinks().forEach((link) => link.remove());
  // Guaranteed reset — an assertion failure mid-test must not leak a
  // mutated `slug` into whatever test runs next.
  menuData.menuMeta.restaurant.slug = DEFAULT_SLUG;
});

describe("PublicMenuPage canonical tag", () => {
  it("emits a canonical pointing at the slug URL when one exists", async () => {
    renderAt("/menu/public/rest-1");

    await waitFor(() => expect(canonicalLinks()).toHaveLength(1));
    expect(canonicalLinks()[0].getAttribute("href")).toBe(
      `${window.location.origin}/m/${DEFAULT_SLUG}`,
    );
  });

  it("emits no canonical tag when the restaurant has no slug", async () => {
    menuData.menuMeta.restaurant.slug = null as unknown as string;

    renderAt("/menu/public/rest-1");

    await waitFor(() => expect(cartMocks.setTableNumber).toHaveBeenCalled());
    expect(canonicalLinks()).toHaveLength(0);
  });
});
