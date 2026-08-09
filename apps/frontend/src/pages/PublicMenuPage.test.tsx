import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PublicMenuPage from "./PublicMenuPage";

// Characterization tests: they pin the current behaviour of the (large)
// PublicMenuPage before it is decomposed into hooks, so the extraction can be
// proven behaviour-preserving. They intentionally exercise the orchestration
// the hooks will own — meta+items fetch, view recording, language switch, and
// the hosted-checkout payment return — not the child components (those are
// stubbed).

const apiMocks = vi.hoisted(() => ({
  getMenuMeta: vi.fn(),
  getCategoryItems: vi.fn(),
  getAllCategoryItems: vi.fn(),
  createAssistanceRequest: vi.fn(),
  getSessionBill: vi.fn(),
  resolvePublicServicePoint: vi.fn(),
  recordMenuView: vi.fn(),
  abandonCheckout: vi.fn(),
}));

const i18nMock = vi.hoisted(() => ({
  language: "bg",
  changeLanguage: vi.fn().mockResolvedValue(undefined),
}));

// Drivable socket: a test flips `isConnected` on, then invokes a captured
// handler to simulate a server push (payment confirmed, item 86'd).
const socketState = vi.hoisted(() => {
  const handlers: Record<string, (...args: any[]) => void> = {};
  return {
    isConnected: false,
    handlers,
    socket: {
      on: (evt: string, cb: (...args: any[]) => void) => {
        handlers[evt] = cb;
      },
      off: (evt: string) => {
        delete handlers[evt];
      },
      emit: () => {},
    },
  };
});

vi.mock("../lib/api", () => apiMocks);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: i18nMock,
  }),
}));

vi.mock("../lib/visitorId", () => ({ getVisitorId: () => "visitor-1" }));

const cartMocks = vi.hoisted(() => ({
  setTableNumber: vi.fn(),
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
  useSocket: () => ({
    socket: socketState.socket,
    isConnected: socketState.isConnected,
  }),
}));

// Child components — stubbed. TopBar exposes the language switch so a test can
// drive handleLanguageChange; ItemWithOptions echoes the item name so a test can
// assert items resolved into the grid.
vi.mock("../components/menu/TopBar", () => ({
  TopBar: (props: any) => (
    <button
      data-testid="switch-fr"
      onClick={() => props.onLanguageChange("fr")}
    >
      lang:{props.selectedLang}
    </button>
  ),
}));
vi.mock("../components/menu/ItemWithOptions", () => ({
  ItemWithOptions: (props: any) => (
    <div data-testid="menu-item">{props.item.name}</div>
  ),
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
vi.mock("../components/cart/CartIcon", () => ({
  default: () => <div data-testid="cart-icon" />,
}));
vi.mock("../components/payment/PaymentModal", () => ({
  PaymentModal: () => null,
}));
vi.mock("../components/auth/CustomerLoginModal", () => ({
  CustomerLoginModal: () => null,
}));

const META = {
  restaurant: {
    name: "Test Bistro",
    tier: "PROFESSIONAL",
    features: ["orders:receive", "languages:multi"],
    paymentsEnabled: false,
    dashboardLanguage: "en",
    menuSourceLanguage: "bg",
    targetLanguages: ["bg", "en", "fr"],
    defaultTheme: "light",
  },
  categories: [{ id: "cat-1", name: "Starters", translations: {} }],
};

const ITEMS = {
  "cat-1": [
    {
      id: "item-1",
      name: "Soup",
      translations: {},
      allergens: [],
      dietaryTags: [],
    },
  ],
};

function renderMenu(entry = "/menu/rest-1") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/menu/:restaurantId" element={<PublicMenuPage />} />
        <Route
          path="/payment-confirmation"
          element={<div>payment confirmation</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicMenuPage", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((k: string) => values.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => values.set(k, v)),
      removeItem: vi.fn((k: string) => values.delete(k)),
      clear: vi.fn(() => values.clear()),
    });
    // jsdom lacks IntersectionObserver (used for scroll-spy category nav).
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    apiMocks.getMenuMeta.mockResolvedValue(structuredClone(META));
    apiMocks.getAllCategoryItems.mockResolvedValue(structuredClone(ITEMS));
    // Promise-returning endpoints the component chains onto (.catch / await).
    apiMocks.abandonCheckout.mockResolvedValue(undefined);
    apiMocks.createAssistanceRequest.mockResolvedValue({});
    apiMocks.getSessionBill.mockResolvedValue({});
    apiMocks.resolvePublicServicePoint.mockResolvedValue({
      id: "room-301",
      name: "301",
      type: "ROOM",
      publicToken: "room-token",
      fulfillmentModes: ["ROOM_DELIVERY"],
      paymentMethods: ["PAY_ON_DELIVERY"],
    });
    cartMocks.orderLocation = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    socketState.isConnected = false;
    for (const key of Object.keys(socketState.handlers)) {
      delete socketState.handlers[key];
    }
  });

  it("does not fetch or record a view for an invalid restaurant route", async () => {
    renderMenu("/menu/undefined");

    await act(async () => undefined);

    expect(apiMocks.getMenuMeta).not.toHaveBeenCalled();
    expect(apiMocks.getAllCategoryItems).not.toHaveBeenCalled();
    expect(apiMocks.recordMenuView).not.toHaveBeenCalled();
  });

  it("renders category and its items after the batched load resolves", async () => {
    renderMenu();

    expect(await screen.findByText("Starters")).toBeTruthy();
    expect(await screen.findByText("Soup")).toBeTruthy();
    expect(apiMocks.getAllCategoryItems).toHaveBeenCalledWith(
      "rest-1",
      "bg",
      expect.anything(),
    );
  });

  it("records a single menu view with the visitor id and table", async () => {
    renderMenu("/menu/rest-1?table=7");

    await screen.findByText("Starters");
    expect(apiMocks.recordMenuView).toHaveBeenCalledTimes(1);
    expect(apiMocks.recordMenuView).toHaveBeenCalledWith("rest-1", {
      table: "7",
      visitorId: "visitor-1",
    });
  });

  it("clears a previous location before resolving a new service-point token", async () => {
    cartMocks.orderLocation = {
      type: "ROOM",
      label: "Old room",
      token: "old-token",
    } as any;
    let resolvePoint: (value: any) => void = () => {};
    apiMocks.resolvePublicServicePoint.mockReturnValue(
      new Promise((resolve) => {
        resolvePoint = resolve;
      }),
    );

    renderMenu("/menu/rest-1?sp=new-token");

    await waitFor(() =>
      expect(cartMocks.setOrderLocation).toHaveBeenCalledWith(null),
    );
    expect(screen.queryByTestId("cart-icon")).toBeNull();

    resolvePoint({
      id: "room-302",
      name: "302",
      type: "ROOM",
      publicToken: "new-token",
      fulfillmentModes: ["ROOM_DELIVERY"],
      paymentMethods: ["PAY_ON_DELIVERY"],
    });
    await waitFor(() =>
      expect(cartMocks.setOrderLocation).toHaveBeenCalledWith(
        expect.objectContaining({ token: "new-token" }),
      ),
    );
  });

  it("shows an error and disables ordering for an invalid service-point QR", async () => {
    apiMocks.resolvePublicServicePoint.mockRejectedValue(new Error("invalid"));

    renderMenu("/menu/rest-1?sp=rotated-token");

    expect(
      await screen.findByText(
        "This service-point QR is invalid or inactive. Please scan the current QR or ask staff for help.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("cart-icon")).toBeNull();
  });

  it("shows the error state when meta has no restaurant", async () => {
    apiMocks.getMenuMeta.mockResolvedValue({
      restaurant: null,
      categories: [],
    });

    renderMenu();

    expect(await screen.findByText("publicMenu.failedLoad")).toBeTruthy();
  });

  it("refetches items in the new language when the language switches", async () => {
    renderMenu();
    await screen.findByText("Soup");

    await userEvent.click(screen.getByTestId("switch-fr"));

    await waitFor(() =>
      expect(apiMocks.getAllCategoryItems).toHaveBeenCalledWith(
        "rest-1",
        "fr",
        expect.anything(),
      ),
    );
    expect(i18nMock.changeLanguage).toHaveBeenCalledWith("fr");
  });

  it("shows the success banner on a hosted-checkout return", async () => {
    renderMenu("/menu/rest-1?payment=epay-ok&table=5");

    expect(
      await screen.findByText("Payment received successfully"),
    ).toBeTruthy();
  });

  it("opens payment confirmation after a verified hosted-checkout return", async () => {
    localStorage.setItem("session-rest-1-5", "tok-1");
    sessionStorage.setItem(
      "hosted-checkout:tok-1",
      JSON.stringify({
        token: "tok-1",
        startedAt: Date.now(),
        paymentId: "payment-1",
        provider: "EPAY",
        total: 20,
      }),
    );

    renderMenu("/menu/rest-1?payment=epay-ok&table=5");

    expect(await screen.findByText("payment confirmation")).toBeTruthy();
    expect(
      JSON.parse(sessionStorage.getItem("payment-confirmation") ?? "{}"),
    ).toEqual(
      expect.objectContaining({
        paymentId: "payment-1",
        sessionToken: "tok-1",
        provider: "EPAY",
        menuReturnUrl: "/menu/rest-1?table=5",
      }),
    );
  });

  it("opens payment confirmation after a Stripe 3DS return", async () => {
    localStorage.setItem("session-rest-1-5", "tok-1");
    sessionStorage.setItem(
      "hosted-checkout:tok-1",
      JSON.stringify({
        token: "tok-1",
        startedAt: Date.now(),
        paymentId: "payment-stripe",
        provider: "STRIPE",
        total: 20,
      }),
    );

    renderMenu(
      "/menu/rest-1?table=5&payment_intent=pi_1&payment_intent_client_secret=secret&redirect_status=succeeded",
    );

    expect(await screen.findByText("payment confirmation")).toBeTruthy();
    expect(
      JSON.parse(sessionStorage.getItem("payment-confirmation") ?? "{}"),
    ).toEqual(
      expect.objectContaining({
        paymentId: "payment-stripe",
        sessionToken: "tok-1",
        provider: "STRIPE",
        menuReturnUrl: "/menu/rest-1?table=5",
      }),
    );
    expect(apiMocks.abandonCheckout).not.toHaveBeenCalled();
  });

  it("abandons a pending hosted checkout on return when no payment param is present", async () => {
    localStorage.setItem("session-rest-1-5", "tok-1");
    sessionStorage.setItem(
      "hosted-checkout:tok-1",
      JSON.stringify({ token: "tok-1", startedAt: Date.now() }),
    );

    renderMenu("/menu/rest-1?table=5");

    await waitFor(() =>
      expect(apiMocks.abandonCheckout).toHaveBeenCalledWith("tok-1"),
    );
  });

  it("removes an item live when the socket reports it out of stock", async () => {
    socketState.isConnected = true;
    renderMenu();
    await screen.findByText("Soup");

    await waitFor(() =>
      expect(
        typeof socketState.handlers["menu:item-availability-changed"],
      ).toBe("function"),
    );
    act(() => {
      socketState.handlers["menu:item-availability-changed"]({
        itemId: "item-1",
        categoryId: "cat-1",
        isOutOfStock: true,
      });
    });

    await waitFor(() => expect(screen.queryByText("Soup")).toBeNull());
  });

  it("clears the session and shows a banner on a payment:confirmed socket push", async () => {
    localStorage.setItem("session-rest-1-5", "tok-1");
    socketState.isConnected = true;
    renderMenu("/menu/rest-1?table=5");
    await screen.findByText("Starters");

    await waitFor(() =>
      expect(typeof socketState.handlers["payment:confirmed"]).toBe("function"),
    );
    act(() => {
      socketState.handlers["payment:confirmed"]();
    });

    expect(
      await screen.findByText("Payment received successfully"),
    ).toBeTruthy();
  });

  it("clears the cart when opening a different restaurant's menu", async () => {
    localStorage.setItem("cartRestaurantId", "other-rest");

    renderMenu();
    await screen.findByText("Starters");

    expect(cartMocks.clearCart).toHaveBeenCalled();
  });

  it("prunes stale cart items once every category has loaded", async () => {
    renderMenu();
    await screen.findByText("Soup");

    await waitFor(() =>
      expect(cartMocks.pruneInvalidItems).toHaveBeenCalledWith(["item-1"]),
    );
  });

  it("shows the bill button for a stored session and forgets it on a 404", async () => {
    const meta = structuredClone(META);
    meta.restaurant.paymentsEnabled = true;
    apiMocks.getMenuMeta.mockResolvedValue(meta);
    localStorage.setItem("session-rest-1-5", "tok-1");
    apiMocks.getSessionBill.mockRejectedValue({ response: { status: 404 } });

    renderMenu("/menu/rest-1?table=5");

    const billButton = await screen.findByRole("button", {
      name: "payment.requestBill",
    });
    await userEvent.click(billButton);

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "payment.requestBill" }),
      ).toBeNull(),
    );
  });
});
